'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { POOL } from '@/lib/game/constants'
import { engine } from '@/lib/game/engine'
import { surface } from '@/lib/game/materials'
import { mulberry32 } from '@/lib/game/math'
import { deckTexture, detailTexture } from '@/lib/game/textures'
import type { Theme } from '@/lib/game/themes'
import type { LevelDef } from '@/lib/game/types'

/**
 * Static scenery around the pool: vertex-coloured terrain, stone pool deck,
 * grandstands with an instanced cheering crowd, trees/cacti, rocks, light
 * towers and distant mountains. Nearly everything is instanced or merged so
 * the whole set costs roughly a dozen draw calls.
 */

const DECK_W = 5
const RIM = 0.8

interface Layout {
  x0: number
  x1: number
  cx: number
  len: number
  stands: { x: number; len: number }[]
  height: (x: number, z: number) => number
}

function hash(i: number, j: number, seed: number) {
  let n = (i * 374761393 + j * 668265263 + seed * 982451653) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  n ^= n >>> 16
  return (n >>> 0) / 4294967295
}

function valueNoise(x: number, z: number, seed: number) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const fx = x - xi
  const fz = z - zi
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = hash(xi, zi, seed)
  const b = hash(xi + 1, zi, seed)
  const c = hash(xi, zi + 1, seed)
  const d = hash(xi + 1, zi + 1, seed)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

function fbm(x: number, z: number, seed: number) {
  return valueNoise(x, z, seed) * 0.55 + valueNoise(x * 2.1, z * 2.1, seed + 1) * 0.3 + valueNoise(x * 4.3, z * 4.3, seed + 2) * 0.15
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function useLayout(level: LevelDef, theme: Theme): Layout {
  return useMemo(() => {
    const len = level.endX + 24
    const cx = level.endX / 2
    const x0 = cx - len / 2
    const x1 = cx + len / 2
    const standLen = 26
    const stands: Layout['stands'] = []
    for (let x = x0 + 16; x + standLen < x1 - 4; x += standLen + 14) stands.push({ x: x + standLen / 2, len: standLen })
    const seed = level.index * 13 + 3
    const flatZ = POOL.halfDepth + RIM + DECK_W + 1
    const height = (x: number, z: number) => {
      if (theme.id === 'studio') return 0
      const dz = Math.max(0, Math.abs(z) - flatZ)
      const dx = Math.max(0, x - (x1 + DECK_W + 1), x0 - DECK_W - 1 - x)
      const d = Math.hypot(dx, dz)
      const front = z > 0 ? 0.25 : 1
      if (theme.id === 'desert') {
        const dune = Math.sin(x * 0.045 + z * 0.02) * 0.5 + 0.5
        return smooth(4, 45, d) * front * (dune * 7 + fbm(x * 0.03, z * 0.03, seed) * 10)
      }
      return smooth(8, 55, d) * front * (fbm(x * 0.022, z * 0.022, seed) * 20 + d * 0.06)
    }
    return { x0, x1, cx, len, stands, height }
  }, [level, theme])
}

function Terrain({ lay, theme, hq }: { lay: Layout; theme: Theme; hq: boolean }) {
  const geo = useMemo(() => {
    const W = lay.len + 440
    const D = 420
    const g = new THREE.PlaneGeometry(W, D, hq ? 140 : 90, hq ? 90 : 56)
    g.rotateX(-Math.PI / 2)
    g.translate(lay.cx, 0, 0)
    const pos = g.attributes.position as THREE.BufferAttribute
    const uv = g.attributes.uv as THREE.BufferAttribute
    const col = new Float32Array(pos.count * 3)
    const a = new THREE.Color(theme.terrainA)
    const b = new THREE.Color(theme.terrainB)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = lay.height(x, z)
      pos.setY(i, h - 0.06)
      uv.setXY(i, x / 6, z / 6)
      const n = valueNoise(x * 0.08, z * 0.08, 99)
      c.copy(a).lerp(b, Math.min(1, n * 0.9 + h * 0.015))
      c.multiplyScalar(0.92 + valueNoise(x * 0.5, z * 0.5, 7) * 0.16)
      col.set([c.r, c.g, c.b], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.computeVertexNormals()
    return g
  }, [lay, theme, hq])
  const mat = useMemo(() => {
    const kind = theme.id === 'studio' ? 'floor' : theme.id === 'desert' ? 'sand' : 'grass'
    return surface(hq, { vertexColors: true, map: detailTexture(kind), roughness: 0.95 })
  }, [theme, hq])
  useEffect(() => () => geo.dispose(), [geo])
  return <mesh geometry={geo} material={mat} receiveShadow />
}

/** Stone deck ring around the pool, world-space UVs so tiles never stretch. */
function Deck({ lay, theme, hq }: { lay: Layout; theme: Theme; hq: boolean }) {
  const geo = useMemo(() => {
    const zIn = POOL.halfDepth + RIM
    const zOut = zIn + DECK_W
    const xo0 = lay.x0 - RIM - DECK_W
    const xo1 = lay.x1 + RIM + DECK_W
    const strips = [
      [xo0, xo1, zIn, zOut],
      [xo0, xo1, -zOut, -zIn],
      [xo0, lay.x0 - RIM, -zIn, zIn],
      [lay.x1 + RIM, xo1, -zIn, zIn],
    ].map(([ax, bx, az, bz]) => {
      const g = new THREE.BoxGeometry(bx - ax, 0.24, bz - az)
      g.translate((ax + bx) / 2, 0.0, (az + bz) / 2)
      const p = g.attributes.position as THREE.BufferAttribute
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4 + p.getY(i))
      return g
    })
    return mergeGeometries(strips)
  }, [lay])
  const mat = useMemo(() => surface(hq, { map: deckTexture(theme.deck), roughness: 0.8 }), [theme, hq])
  useEffect(() => () => geo.dispose(), [geo])
  return <mesh geometry={geo} material={mat} receiveShadow />
}

/** Crowd bob driven entirely on the GPU via gl_InstanceID. */
function crowdMaterial(hq: boolean, color: string | undefined, cheer: { value: number }, time: { value: number }) {
  const m = surface(hq, { color: color ?? '#ffffff', roughness: 0.8 })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCheer = cheer
    sh.uniforms.uTime = time
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCheer;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float fid = float(gl_InstanceID);
        float ph = uTime * (5.0 + mod(fid, 5.0)) + fid * 1.37;
        transformed.y += max(0.0, sin(ph)) * (0.02 + 0.2 * uCheer);`,
      )
  }
  return m
}

function Grandstands({ lay, theme, hq }: { lay: Layout; theme: Theme; hq: boolean }) {
  const bodies = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const cheer = useMemo(() => ({ value: 0 }), [])
  const time = useMemo(() => ({ value: 0 }), [])
  const zFront = -(POOL.halfDepth + RIM + DECK_W + 0.2)
  const TIERS = 7
  const STEP_D = 0.95
  const STEP_H = 0.5

  const standGeo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    for (const s of lay.stands) {
      for (let t = 0; t < TIERS; t++) {
        const g = new THREE.BoxGeometry(s.len, STEP_H * (t + 1), STEP_D)
        g.translate(s.x, (STEP_H * (t + 1)) / 2, zFront - STEP_D * (t + 0.5))
        parts.push(g)
      }
      const back = new THREE.BoxGeometry(s.len + 0.6, STEP_H * TIERS + 3.2, 0.4)
      back.translate(s.x, (STEP_H * TIERS + 3.2) / 2, zFront - STEP_D * TIERS - 0.2)
      parts.push(back)
      const roof = new THREE.BoxGeometry(s.len + 1.2, 0.25, STEP_D * TIERS + 1.6)
      roof.rotateX(-0.12)
      roof.translate(s.x, STEP_H * TIERS + 3.4, zFront - (STEP_D * TIERS) / 2 + 0.3)
      parts.push(roof)
      for (const side of [-1, 1]) {
        const post = new THREE.BoxGeometry(0.25, STEP_H * TIERS + 3.3, 0.25)
        post.translate(s.x + side * (s.len / 2 + 0.3), (STEP_H * TIERS + 3.3) / 2, zFront + 0.5)
        parts.push(post)
      }
    }
    return parts.length ? mergeGeometries(parts.map((p) => p.toNonIndexed())) : null
  }, [lay, zFront])

  const seats = useMemo(() => {
    const rand = mulberry32(lay.stands.length * 71 + 5)
    const out: { x: number; y: number; z: number; c: number; skin: number }[] = []
    for (const s of lay.stands)
      for (let t = 0; t < TIERS; t++)
        for (let x = -s.len / 2 + 0.5; x < s.len / 2 - 0.3; x += 0.72) {
          if (rand() < 0.22) continue
          out.push({
            x: s.x + x + (rand() - 0.5) * 0.15,
            y: STEP_H * (t + 1),
            z: zFront - STEP_D * (t + 0.5) - 0.1,
            c: Math.floor(rand() * 8),
            skin: Math.floor(rand() * 4),
          })
        }
    return out
  }, [lay, zFront])

  const mats = useMemo(() => {
    const standMat = surface(hq, { color: theme.id === 'studio' ? '#34345a' : '#d9dde6', roughness: 0.7 })
    return {
      stand: standMat,
      body: crowdMaterial(hq, undefined, cheer, time),
      head: crowdMaterial(hq, undefined, cheer, time),
    }
  }, [hq, theme, cheer, time])

  const { bodyGeo, headGeo } = useMemo(() => {
    const b = new THREE.CapsuleGeometry(0.2, 0.34, 2, 6)
    b.translate(0, 0.38, 0)
    const h = new THREE.SphereGeometry(0.13, 8, 6)
    h.translate(0, 0.86, 0)
    return { bodyGeo: b, headGeo: h }
  }, [])

  useLayoutEffect(() => {
    const shirts = [theme.trim, theme.stripeA, '#ffd23f', '#ffffff', '#3a3f58', '#6bdc5a', '#ff7a1a', '#b46bff'].map((c) => new THREE.Color(c))
    const skins = ['#f1c7a5', '#d9a07a', '#a86b48', '#6e4630'].map((c) => new THREE.Color(c))
    const m = new THREE.Matrix4()
    seats.forEach((s, i) => {
      m.makeTranslation(s.x, s.y, s.z)
      bodies.current?.setMatrixAt(i, m)
      heads.current?.setMatrixAt(i, m)
      bodies.current?.setColorAt(i, shirts[s.c])
      heads.current?.setColorAt(i, skins[s.skin])
    })
    for (const r of [bodies.current, heads.current]) {
      if (!r) continue
      r.instanceMatrix.needsUpdate = true
      if (r.instanceColor) r.instanceColor.needsUpdate = true
      r.computeBoundingSphere()
    }
  }, [seats, theme])

  useFrame((_, dt) => {
    time.value = engine.time
    const ph = engine.phase
    const want = ph === 'finished' ? 1 : ph === 'splash' ? 0.7 : ph === 'countdown' || ph === 'intro' ? 0.35 : 0.08
    cheer.value += (want - cheer.value) * Math.min(1, dt * 3)
  })

  if (!standGeo || seats.length === 0) return null
  return (
    <group>
      <mesh geometry={standGeo} material={mats.stand} receiveShadow castShadow={false} />
      <instancedMesh ref={bodies} args={[bodyGeo, mats.body, seats.length]} />
      <instancedMesh ref={heads} args={[headGeo, mats.head, seats.length]} />
    </group>
  )
}

/** Merged, vertex-coloured tree / cactus model drawn with a single instanced call. */
function plantGeometry(kind: 'tree' | 'cactus') {
  const parts: THREE.BufferGeometry[] = []
  const paint = (g: THREE.BufferGeometry, hex: string, jitter = 0) => {
    const c = new THREE.Color(hex)
    const n = g.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const k = 1 - jitter + Math.random() * jitter * 2
      arr.set([c.r * k, c.g * k, c.b * k], i * 3)
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
    return g
  }
  if (kind === 'tree') {
    const trunk = new THREE.CylinderGeometry(0.16, 0.3, 2.6, 7)
    trunk.translate(0, 1.3, 0)
    parts.push(paint(trunk.toNonIndexed(), '#6b4a2f', 0.08))
    const blobs: [number, number, number, number, string][] = [
      [0, 3.2, 0, 1.55, '#3f8f35'],
      [0.8, 2.7, 0.3, 1.1, '#4a9c3b'],
      [-0.7, 2.8, -0.2, 1.15, '#357f2e'],
      [0.1, 4.1, -0.1, 1.05, '#4ea541'],
    ]
    for (const [x, y, z, r, col] of blobs) {
      const g = new THREE.IcosahedronGeometry(r, 1)
      const p = g.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) {
        const f = 1 + (hash(Math.round(p.getX(i) * 50), Math.round(p.getY(i) * 50 + p.getZ(i) * 31), 3) - 0.5) * 0.22
        p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f)
      }
      g.translate(x, y, z)
      parts.push(paint(g.toNonIndexed(), col, 0.12))
    }
  } else {
    const col = '#5c9a48'
    const main = new THREE.CapsuleGeometry(0.34, 3.2, 3, 10)
    main.translate(0, 1.9, 0)
    parts.push(paint(main.toNonIndexed(), col, 0.08))
    for (const [side, y, h] of [
      [1, 1.8, 1.1],
      [-1, 2.4, 0.9],
    ] as const) {
      const elbow = new THREE.CapsuleGeometry(0.22, 0.6, 3, 8)
      elbow.rotateZ(Math.PI / 2)
      elbow.translate(side * 0.6, y, 0)
      const up = new THREE.CapsuleGeometry(0.22, h, 3, 8)
      up.translate(side * 1.0, y + h / 2 + 0.1, 0)
      parts.push(paint(elbow.toNonIndexed(), col, 0.08), paint(up.toNonIndexed(), col, 0.08))
    }
  }
  const merged = mergeGeometries(parts)!
  merged.computeVertexNormals()
  return merged
}

function Plants({ lay, theme, hq }: { lay: Layout; theme: Theme; hq: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const kind = theme.id === 'desert' ? 'cactus' : 'tree'
  const geo = useMemo(() => plantGeometry(kind), [kind])
  const mat = useMemo(() => surface(hq, { vertexColors: true, roughness: 0.85, flatShading: kind === 'tree' }), [hq, kind])
  const spots = useMemo(() => {
    const rand = mulberry32(lay.len * 7 + 1)
    const out: { x: number; z: number; s: number; r: number }[] = []
    const zStandBack = -(POOL.halfDepth + RIM + DECK_W + 8)
    for (let i = 0; i < (hq ? 90 : 55); i++) {
      const front = i % 4 === 0
      const x = lay.x0 - 50 + rand() * (lay.len + 100)
      const z = front ? POOL.halfDepth + RIM + DECK_W + 12 + rand() * 40 : zStandBack - 3 - rand() * 70
      out.push({ x, z, s: 0.75 + rand() * 0.8, r: rand() * Math.PI * 2 })
    }
    return out
  }, [lay, hq])
  useLayoutEffect(() => {
    const o = new THREE.Object3D()
    spots.forEach((p, i) => {
      o.position.set(p.x, lay.height(p.x, p.z) - 0.1, p.z)
      o.rotation.set(0, p.r, 0)
      o.scale.setScalar(p.s * (kind === 'cactus' ? 0.9 : 1.15))
      o.updateMatrix()
      ref.current?.setMatrixAt(i, o.matrix)
    })
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true
      ref.current.computeBoundingSphere()
    }
  }, [spots, lay, kind])
  useEffect(() => () => geo.dispose(), [geo])
  if (theme.id === 'studio') return null
  return <instancedMesh ref={ref} args={[geo, mat, spots.length]} castShadow={false} />
}

function Rocks({ lay, theme, hq }: { lay: Layout; theme: Theme; hq: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = theme.id === 'desert' ? 40 : 24
  const geo = useMemo(() => {
    const g = new THREE.DodecahedronGeometry(1, 0)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.6)
    g.computeVertexNormals()
    return g
  }, [])
  const mat = useMemo(
    () => surface(hq, { color: theme.id === 'desert' ? '#b0714a' : '#8d918f', roughness: 0.9, flatShading: true }),
    [theme, hq],
  )
  useLayoutEffect(() => {
    const rand = mulberry32(count * 17 + lay.len)
    const o = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const back = rand() < 0.75
      const x = lay.x0 - 30 + rand() * (lay.len + 60)
      const z = back ? -(POOL.halfDepth + RIM + DECK_W + 10 + rand() * 50) : POOL.halfDepth + RIM + DECK_W + 3 + rand() * 30
      const s = 0.4 + rand() * (theme.id === 'desert' ? 2.4 : 1.2)
      o.position.set(x, lay.height(x, z) + s * 0.15, z)
      o.rotation.set(rand(), rand() * 6, rand())
      o.scale.set(s * (1 + rand() * 0.5), s, s)
      o.updateMatrix()
      ref.current?.setMatrixAt(i, o.matrix)
    }
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true
      ref.current.computeBoundingSphere()
    }
  }, [lay, count, theme])
  if (theme.id === 'studio') return null
  return <instancedMesh ref={ref} args={[geo, mat, count]} />
}

/** Broadcast light rigs. In the studio they also throw animated volumetric beams. */
function LightTowers({ lay, theme, hq }: { lay: Layout; theme: Theme; hq: boolean }) {
  const beams = useRef<THREE.Group>(null)
  const xs = useMemo(() => {
    const out: number[] = []
    const n = theme.id === 'studio' ? 7 : 4
    for (let i = 0; i < n; i++) out.push(lay.x0 + 8 + (i / (n - 1)) * (lay.len - 16))
    return out
  }, [lay, theme])
  const z = -(POOL.halfDepth + RIM + DECK_W + 9.5)
  const H = 16
  const metal = useMemo(() => surface(hq, { color: '#9aa3ae', roughness: 0.35, metalness: 0.8 }), [hq])
  const lamp = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.night ? '#e6ecff' : '#fff8e6').multiplyScalar(theme.night ? 3 : 1.4), toneMapped: false }),
    [theme],
  )
  const beamMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#9fb4ff',
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [],
  )
  const beamGeo = useMemo(() => {
    const g = new THREE.ConeGeometry(3.2, 26, 20, 1, true)
    g.translate(0, -13, 0)
    return g
  }, [])
  useFrame(() => {
    const g = beams.current
    if (!g) return
    const t = engine.time
    g.children.forEach((b, i) => {
      b.rotation.set(0.75 + Math.sin(t * 0.5 + i) * 0.18, 0, Math.sin(t * 0.37 + i * 1.7) * 0.35)
    })
  })
  return (
    <group>
      {xs.map((x) => (
        <group key={x} position={[x, 0, z]}>
          <mesh position={[0, H / 2, 0]} material={metal}>
            <boxGeometry args={[0.45, H, 0.45]} />
          </mesh>
          <mesh position={[0, H + 0.6, 0]} material={metal}>
            <boxGeometry args={[3.4, 1.6, 0.35]} />
          </mesh>
          {[-1.1, 0, 1.1].map((dx) =>
            [0.3, -0.3].map((dy) => (
              <mesh key={`${dx}-${dy}`} position={[dx, H + 0.6 + dy, 0.2]} material={lamp}>
                <planeGeometry args={[0.8, 0.45]} />
              </mesh>
            )),
          )}
        </group>
      ))}
      {theme.id === 'studio' && (
        <group ref={beams}>
          {xs.map((x) => (
            <mesh key={x} position={[x, H + 0.6, z + 0.4]} geometry={beamGeo} material={beamMat} />
          ))}
        </group>
      )}
    </group>
  )
}

/** Animated LED wall behind the studio stands. */
function LedWall({ lay }: { lay: Layout }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        fog: false,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv;
          void main(){
            vec2 g = fract(vUv * vec2(260.0, 22.0));
            float px = smoothstep(0.0, 0.2, g.x) * smoothstep(1.0, 0.8, g.x) * smoothstep(0.0, 0.2, g.y) * smoothstep(1.0, 0.8, g.y);
            float w = sin(vUv.x * 40.0 - uTime * 2.0) * 0.5 + 0.5;
            vec3 c = mix(vec3(0.35, 0.08, 0.6), vec3(0.95, 0.2, 0.55), w);
            c = mix(c, vec3(0.1, 0.6, 1.0), smoothstep(0.6, 1.0, sin(vUv.y * 6.0 + uTime) * 0.5 + 0.5) * 0.5);
            gl_FragColor = vec4(c * (0.35 + px * 0.9), 1.0);
          }`,
      }),
    [],
  )
  useFrame(() => {
    mat.uniforms.uTime.value = engine.time
  })
  return (
    <mesh position={[lay.cx, 11, -(POOL.halfDepth + RIM + DECK_W + 14)]} material={mat}>
      <planeGeometry args={[lay.len + 60, 18]} />
    </mesh>
  )
}

/** Distant mountains / mesas, pre-hazed toward the horizon colour (fog-free). */
function Mountains({ lay, theme }: { lay: Layout; theme: Theme }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const count = 16
  const desert = theme.id === 'desert'
  const geo = useMemo(() => (desert ? new THREE.CylinderGeometry(0.75, 1, 1, 8) : new THREE.ConeGeometry(1, 1, 7, 1)), [desert])
  const mat = useMemo(() => {
    const c = new THREE.Color(theme.mountain).lerp(new THREE.Color(theme.skyHorizon), 0.35)
    return new THREE.MeshLambertMaterial({ color: c, fog: false, flatShading: true })
  }, [theme])
  useLayoutEffect(() => {
    const rand = mulberry32(lay.len * 3 + 11)
    const o = new THREE.Object3D()
    for (let i = 0; i < count; i++) {
      const x = lay.x0 - 160 + (i / (count - 1)) * (lay.len + 320) + (rand() - 0.5) * 20
      const h = desert ? 18 + rand() * 22 : 38 + rand() * 50
      const r = desert ? 22 + rand() * 26 : 45 + rand() * 45
      o.position.set(x, h / 2 - 2, -190 - rand() * 40)
      o.rotation.set(0, rand() * 6, 0)
      o.scale.set(r, h, r * 0.7)
      o.updateMatrix()
      ref.current?.setMatrixAt(i, o.matrix)
    }
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true
      ref.current.computeBoundingSphere()
    }
  }, [lay, desert])
  if (theme.id === 'studio') return null
  return <instancedMesh ref={ref} args={[geo, mat, count]} />
}

export function Scenery({ level, theme, hq }: { level: LevelDef; theme: Theme; hq: boolean }) {
  const lay = useLayout(level, theme)
  return (
    <group>
      <Terrain lay={lay} theme={theme} hq={hq} />
      <Deck lay={lay} theme={theme} hq={hq} />
      <Grandstands lay={lay} theme={theme} hq={hq} />
      <Plants lay={lay} theme={theme} hq={hq} />
      <Rocks lay={lay} theme={theme} hq={hq} />
      <LightTowers lay={lay} theme={theme} hq={hq} />
      {theme.id === 'studio' && <LedWall lay={lay} />}
      <Mountains lay={lay} theme={theme} />
    </group>
  )
}
