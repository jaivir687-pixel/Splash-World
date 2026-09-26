'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { engine } from '@/lib/game/engine'
import { fxCursor, readFx, type FxEvent } from '@/lib/game/fx'
import type { Theme } from '@/lib/game/themes'

/**
 * Pooled VFX, three draw calls total:
 *  - Chunks: instanced droplets / sparks / confetti (velocity-stretched)
 *  - Puffs: soft camera-facing sprites for mist, dust, flashes, rings
 *  - Motes: ambient drifting pollen / sand / sparkle field around the camera
 * Nothing allocates per effect; every pool recycles round-robin.
 */

const GRAVITY = 16

interface Chunk {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  max: number
  size: number
  grav: number
  spin: number
  kind: 0 | 1 | 2 // droplet, spark, confetti
}

interface Puff {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  max: number
  size: number
  grow: number
  alpha: number
  r: number
  g: number
  b: number
  additive: boolean
}

const CONFETTI = ['#ff4d6d', '#ffd23f', '#3ec1ff', '#6bdc5a', '#b46bff', '#ffffff']

const puffVert = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  uniform float uScale;
  void main(){
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const puffFrag = /* glsl */ `
  varying vec4 vColor;
  void main(){
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    float a = smoothstep(1.0, 0.15, r);
    a *= a;
    if (a * vColor.a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a * vColor.a);
    #include <colorspace_fragment>
  }
`

function usePointScale() {
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const cam = useThree((s) => s.camera) as THREE.PerspectiveCamera
  return (size.height * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov ?? 45) / 2))
}

function makePuffLayer(max: number, blending: THREE.Blending) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage))
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
    vertexShader: puffVert,
    fragmentShader: puffFrag,
    transparent: true,
    depthWrite: false,
    blending,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return pts
}

export function Effects({ theme, hq }: { theme: Theme; hq: boolean }) {
  const MAX_CHUNKS = hq ? 260 : 140
  const MAX_PUFFS = hq ? 160 : 80
  const scale = usePointScale()
  const chunkMesh = useRef<THREE.InstancedMesh>(null)
  const cursor = useRef(fxCursor())
  const st = useMemo(() => ({ nextChunk: 0, nextPuff: 0, runT: 0, fallT: 0, fireT: 0, lastPhase: '' }), [])

  const chunks = useMemo<Chunk[]>(
    () =>
      Array.from({ length: MAX_CHUNKS }, () => ({ x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0, grav: 1, spin: 0, kind: 0 as const })),
    [MAX_CHUNKS],
  )
  const puffs = useMemo<Puff[]>(
    () =>
      Array.from({ length: MAX_PUFFS }, () => ({
        x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0, grow: 0, alpha: 0, r: 1, g: 1, b: 1, additive: false,
      })),
    [MAX_PUFFS],
  )
  const normalLayer = useMemo(() => makePuffLayer(MAX_PUFFS, THREE.NormalBlending), [MAX_PUFFS])
  const addLayer = useMemo(() => makePuffLayer(MAX_PUFFS, THREE.AdditiveBlending), [MAX_PUFFS])
  const dustColor = useMemo(() => new THREE.Color(theme.id === 'desert' ? '#e8c89a' : theme.id === 'studio' ? '#c9c6ff' : '#f2efe6'), [theme])

  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Color(), up: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3() }),
    [],
  )

  useEffect(
    () => () => {
      for (const l of [normalLayer, addLayer]) {
        l.geometry.dispose()
        ;(l.material as THREE.Material).dispose()
      }
    },
    [normalLayer, addLayer],
  )

  const chunk = (x: number, y: number, z: number, vx: number, vy: number, vz: number, max: number, size: number, grav: number, kind: Chunk['kind'], color: string | THREE.Color) => {
    const idx = st.nextChunk
    st.nextChunk = (idx + 1) % MAX_CHUNKS
    const p = chunks[idx]
    Object.assign(p, { x, y, z, vx, vy, vz, life: max, max, size, grav, kind, spin: Math.random() * 6 })
    tmp.c.set(color as THREE.ColorRepresentation)
    chunkMesh.current?.setColorAt(idx, tmp.c)
  }

  const puff = (x: number, y: number, z: number, vx: number, vy: number, vz: number, max: number, size: number, grow: number, alpha: number, color: THREE.Color | string, additive = false) => {
    const idx = st.nextPuff
    st.nextPuff = (idx + 1) % MAX_PUFFS
    const p = puffs[idx]
    tmp.c.set(color as THREE.ColorRepresentation)
    Object.assign(p, { x, y, z, vx, vy, vz, life: max, max, size, grow, alpha, r: tmp.c.r, g: tmp.c.g, b: tmp.c.b, additive })
  }

  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  const q = hq ? 1 : 0.55

  const spawn = (e: FxEvent) => {
    switch (e.kind) {
      case 'splash': {
        // Power follows sampled impact velocity: gentle plops stay low, big falls throw a tall crown.
        const pw = e.power
        const up = 0.45 + pw * 0.55
        const n = Math.round(56 * q * (0.3 + pw * 0.7))
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2
          const sp = rnd(0.8, 4.2) * (0.6 + pw * 0.4)
          chunk(e.x + Math.cos(a) * 0.3, e.y + 0.05, e.z + Math.sin(a) * 0.3, Math.cos(a) * sp, rnd(4, 11) * up, Math.sin(a) * sp, rnd(0.7, 1.3) * (0.6 + pw * 0.4), rnd(0.05, 0.12) * (0.7 + pw * 0.3), 1, 0, i % 3 ? '#e9f8ff' : '#ffffff')
        }
        if (pw > 0.7) {
          const ring = Math.round(22 * q * pw)
          for (let i = 0; i < ring; i++) {
            const a = (i / ring) * Math.PI * 2
            chunk(e.x + Math.cos(a) * 0.55, e.y, e.z + Math.sin(a) * 0.55, Math.cos(a) * 3.2 * pw, rnd(3, 5.5) * pw, Math.sin(a) * 3.2 * pw, 0.8, 0.07, 1, 0, '#ffffff')
          }
        }
        for (let i = 0; i < 14 * q * (0.35 + pw * 0.65); i++) {
          const a = Math.random() * Math.PI * 2
          puff(e.x + Math.cos(a) * 0.4, e.y + rnd(0.1, 1.2) * up, e.z + Math.sin(a) * 0.4, Math.cos(a) * 1.2, rnd(1.5, 4) * up, Math.sin(a) * 1.2, rnd(0.9, 1.6), rnd(0.8, 1.4) * up, 1.8, 0.55, '#f4fbff')
        }
        puff(e.x, e.y + 0.1, e.z, 0, 0, 0, 0.7, 2.2 * (0.5 + pw * 0.5), 5, 0.7, '#ffffff')
        break
      }
      case 'hit': {
        for (let i = 0; i < 18 * q; i++) {
          const a = Math.random() * Math.PI * 2
          const sp = rnd(3, 7.5)
          chunk(e.x, e.y, e.z, Math.cos(a) * sp, Math.sin(a) * sp, rnd(-2, 2), rnd(0.25, 0.5), rnd(0.04, 0.08), 0.35, 1, i % 2 ? '#ffe14a' : '#ffffff')
        }
        puff(e.x, e.y, e.z, 0, 0, 0, 0.22, 2.4, 6, 0.9, '#fff3c0', true)
        puff(e.x, e.y, e.z, 0, 0.3, 0, 0.5, 0.8, 3, 0.45, dustColor)
        break
      }
      case 'bounce': {
        for (let i = 0; i < 10 * q; i++) {
          const a = (i / 10) * Math.PI * 2
          puff(e.x + Math.cos(a) * 0.4, e.y, e.z + Math.sin(a) * 0.4, Math.cos(a) * 2.2, 0.4, Math.sin(a) * 2.2, 0.45, 0.45, 1.5, 0.5, '#ffffff')
        }
        if (e.power > 0.8) puff(e.x, e.y + 0.3, e.z, 0, 0, 0, 0.3, 2, 4, 0.8, '#ffe9a8', true)
        break
      }
      case 'confetti': {
        victoryBurst(e.x, e.y, e.z, 90 * q)
        break
      }
      case 'dust': {
        const n = Math.round((4 + e.power * 10) * q)
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.3
          const sp = rnd(0.8, 2.2) * (0.6 + e.power)
          puff(e.x + Math.cos(a) * 0.25, e.y + 0.08, e.z + Math.sin(a) * 0.25, Math.cos(a) * sp, rnd(0.2, 0.8), Math.sin(a) * sp * 0.6, rnd(0.45, 0.8), rnd(0.35, 0.6), 1.4, 0.5, dustColor)
        }
        break
      }
    }
  }

  const victoryBurst = (x: number, y: number, z: number, n: number) => {
    for (let i = 0; i < n; i++) {
      chunk(x + rnd(-0.5, 0.5), y, z + rnd(-0.5, 0.5), rnd(-4.5, 4.5), rnd(5, 13), rnd(-3, 3), rnd(2, 3.4), rnd(0.1, 0.17), 0.22, 2, CONFETTI[i % CONFETTI.length])
    }
    puff(x, y, z, 0, 0, 0, 0.4, 5, 5, 0.6, '#fff6c8', true)
  }

  const firework = (x: number, y: number, z: number) => {
    const col = CONFETTI[Math.floor(Math.random() * 5)]
    for (let i = 0; i < 26 * q; i++) {
      const u = Math.random() * 2 - 1
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(1 - u * u)
      const sp = rnd(4, 6)
      chunk(x, y, z, Math.cos(a) * r * sp, u * sp, Math.sin(a) * r * sp, rnd(0.8, 1.2), 0.07, 0.15, 1, col)
    }
    puff(x, y, z, 0, 0, 0, 0.35, 4, 3, 0.8, col, true)
  }

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    cursor.current = readFx(cursor.current, spawn)
    const pl = engine.player

    // Running dust at the feet.
    if (pl.grounded && Math.abs(pl.vx) > 3.5 && !pl.frozen) {
      st.runT -= dt
      if (st.runT <= 0) {
        st.runT = hq ? 0.07 : 0.12
        puff(pl.x - Math.sign(pl.vx) * 0.2, pl.y + 0.06, pl.z + rnd(-0.15, 0.15), -pl.vx * 0.12, rnd(0.3, 0.7), rnd(-0.3, 0.3), rnd(0.35, 0.55), rnd(0.22, 0.34), 1.3, 0.32, dustColor)
      }
    }
    // Wind streaks while plummeting.
    if (!pl.grounded && pl.vy < -11 && !pl.frozen) {
      st.fallT -= dt
      if (st.fallT <= 0) {
        st.fallT = 0.05
        chunk(pl.x + rnd(-0.6, 0.6), pl.y + rnd(0.2, 1.8), pl.z + rnd(-0.6, 0.6), 0, -pl.vy * 0.35, 0, 0.25, 0.035, 0, 1, '#ffffff')
      }
    }
    // Fireworks for the finish celebration.
    if (engine.phase === 'finished' && engine.phaseT < 2.6) {
      st.fireT -= dt
      if (st.fireT <= 0) {
        st.fireT = rnd(0.28, 0.45)
        firework(pl.x + rnd(-5, 5), pl.y + rnd(5, 8), rnd(-5, -1))
      }
    } else st.fireT = 0.3

    const m = chunkMesh.current
    if (m) {
      for (let i = 0; i < MAX_CHUNKS; i++) {
        const p = chunks[i]
        let k = 0
        if (p.life > 0) {
          p.life -= dt
          p.vy -= GRAVITY * p.grav * dt
          if (p.kind === 2) {
            p.vx *= 1 - dt * 1.8
            p.vz *= 1 - dt * 1.8
            p.vy = Math.max(p.vy, -2.2)
            p.x += Math.sin(p.spin * 1.3) * dt * 0.6
          } else if (p.kind === 1) {
            p.vx *= 1 - dt * 2.5
            p.vz *= 1 - dt * 2.5
          }
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.z += p.vz * dt
          p.spin += dt * (p.kind === 2 ? 7 : 3)
          if (p.kind === 0 && p.y < 0 && p.vy < 0) p.life = 0
          k = p.life > 0 ? Math.min(1, (p.life / p.max) * 2.5) * p.size : 0
        }
        tmp.p.set(p.x, p.y, p.z)
        if (p.kind === 2) {
          tmp.e.set(p.spin, p.spin * 0.6, p.spin * 0.3)
          tmp.q.setFromEuler(tmp.e)
          tmp.s.set(k * 1.4, k * 0.08, k)
        } else {
          tmp.v.set(p.vx, p.vy, p.vz)
          const sp = tmp.v.length()
          if (sp > 0.01) tmp.q.setFromUnitVectors(tmp.up, tmp.v.multiplyScalar(1 / sp))
          const stretch = 1 + Math.min(sp * (p.kind === 1 ? 0.35 : 0.12), 4)
          tmp.s.set(k, k * stretch, k)
        }
        tmp.m.compose(tmp.p, tmp.q, tmp.s)
        m.setMatrixAt(i, tmp.m)
      }
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }

    const layers = [normalLayer, addLayer]
    const cnt = [0, 0]
    for (const l of layers) (l.material as THREE.ShaderMaterial).uniforms.uScale.value = scale
    for (let i = 0; i < MAX_PUFFS; i++) {
      const p = puffs[i]
      if (p.life <= 0) continue
      p.life -= dt
      if (p.life <= 0) continue
      const drag = 1 - dt * 2.2
      p.vx *= drag
      p.vz *= drag
      p.vy *= 1 - dt * 1.2
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      const t = 1 - p.life / p.max
      const li = p.additive ? 1 : 0
      const l = layers[li]
      const j = cnt[li]++
      ;(l.geometry.attributes.position as THREE.BufferAttribute).setXYZ(j, p.x, p.y, p.z)
      ;(l.geometry.attributes.aSize as THREE.BufferAttribute).setX(j, p.size * (1 + p.grow * t))
      ;(l.geometry.attributes.aColor as THREE.BufferAttribute).setXYZW(j, p.r, p.g, p.b, p.alpha * (1 - t) * Math.min(1, t * 8 + 0.3))
    }
    for (let li = 0; li < 2; li++) {
      const g = layers[li].geometry
      g.setDrawRange(0, cnt[li])
      g.attributes.position.needsUpdate = true
      g.attributes.aSize.needsUpdate = true
      g.attributes.aColor.needsUpdate = true
    }
    void camera
  })

  return (
    <>
      <instancedMesh ref={chunkMesh} args={[undefined, undefined, MAX_CHUNKS]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <primitive object={normalLayer} />
      <primitive object={addLayer} />
      <Motes theme={theme} hq={hq} />
    </>
  )
}

/** Ambient atmosphere: pollen (park), blown sand (desert), sparkles (studio). */
function Motes({ theme, hq }: { theme: Theme; hq: boolean }) {
  const N = hq ? 140 : 50
  const scale = usePointScale()
  const BOX = 22
  const layer = useMemo(() => makePuffLayer(N, theme.night ? THREE.AdditiveBlending : THREE.NormalBlending), [N, theme])
  const seeds = useMemo(() => Array.from({ length: N }, () => [Math.random(), Math.random(), Math.random(), Math.random()]), [N])
  const color = useMemo(() => new THREE.Color(theme.id === 'desert' ? '#f3d9a8' : theme.id === 'studio' ? '#b7a6ff' : '#fffbe0'), [theme])
  useEffect(
    () => () => {
      layer.geometry.dispose()
      ;(layer.material as THREE.Material).dispose()
    },
    [layer],
  )
  useFrame(({ camera }) => {
    const t = engine.time
    const pos = layer.geometry.attributes.position as THREE.BufferAttribute
    const size = layer.geometry.attributes.aSize as THREE.BufferAttribute
    const col = layer.geometry.attributes.aColor as THREE.BufferAttribute
    ;(layer.material as THREE.ShaderMaterial).uniforms.uScale.value = scale
    const wind = theme.id === 'desert' ? 2.2 : 0.35
    const cx = camera.position.x
    for (let i = 0; i < N; i++) {
      const [a, b, c, d] = seeds[i]
      const wrap = (v: number) => ((v % BOX) + BOX) % BOX - BOX / 2
      const x = cx + wrap(a * BOX + t * wind * (0.6 + d) - cx)
      const y = 0.4 + ((b * 9 + Math.sin(t * 0.4 + a * 20) * 0.6) % 9)
      const z = wrap(c * BOX + Math.cos(t * 0.3 + d * 10) * 1.2) * 0.8 - 1
      pos.setXYZ(i, x, y, z)
      size.setX(i, theme.id === 'studio' ? 0.08 : 0.05 + d * 0.05)
      const tw = theme.id === 'studio' ? 0.5 + 0.5 * Math.sin(t * 4 + i) : 1
      col.setXYZW(i, color.r, color.g, color.b, 0.55 * tw)
    }
    pos.needsUpdate = size.needsUpdate = col.needsUpdate = true
  })
  return <primitive object={layer} />
}
