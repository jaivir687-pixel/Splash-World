'use client'

import { useFrame, type ThreeElements } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { engine } from '@/lib/game/engine'
import { surface } from '@/lib/game/materials'
import { useOccluder } from '@/lib/game/occluders'
import { pillarSpots } from '@/lib/game/posts'
import { checkerTexture, chevronTexture, courseBox, labelTexture, stripeTexture, topTexture } from '@/lib/game/textures'
import type { Theme } from '@/lib/game/themes'
import type { LevelDef, PlatformDef } from '@/lib/game/types'

type Mats = Record<'stripe' | 'chevron' | 'start' | 'finish', THREE.Material[]>

/** Mesh that fades out when it sits between the camera and the player. */
export function OccluderMesh(props: ThreeElements['mesh']) {
  const ref = useRef<THREE.Mesh>(null)
  useOccluder(ref)
  return <mesh ref={ref} {...props} />
}

function useCourseMaterials(theme: Theme, hq: boolean): Mats {
  return useMemo(() => {
    // Inflatable vinyl: fairly glossy sides, slightly rougher walking surface.
    const side = surface(hq, { map: stripeTexture(theme.stripeA, theme.stripeB), roughness: 0.38, envMapIntensity: 0.8 })
    const bottom = surface(hq, { color: theme.stripeA, roughness: 0.6 })
    const top = surface(hq, { map: topTexture(theme.stripeB, theme.stripeA), roughness: 0.55 })
    const chev = surface(hq, { map: chevronTexture(theme.stripeB, theme.stripeA), roughness: 0.55 })
    const start = surface(hq, { map: checkerTexture(theme.stripeA, theme.stripeB), roughness: 0.5 })
    const finish = surface(hq, { map: checkerTexture(theme.trim, '#ffffff'), roughness: 0.5 })
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    const arr = (t: THREE.Material) => [side, side, t, bottom, side, side]
    return { stripe: arr(top), chevron: arr(chev), start: arr(start), finish: arr(finish) }
  }, [theme, hq])
}

function Platform({ def, index, mats }: { def: PlatformDef; index: number; mats: Mats }) {
  const ref = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => courseBox(def.w, def.h, def.d), [def.w, def.h, def.d])
  const dynamic = !!(def.motion || def.seesaw)

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const s = engine.world.ps[index]
    m.position.set(s.x, s.top, def.z)
    m.rotation.z = s.tilt
  }, [def, index])

  useFrame(() => {
    if (!dynamic || !ref.current) return
    const s = engine.world.ps[index]
    if (!s) return
    ref.current.position.set(s.x, s.top, def.z)
    ref.current.rotation.z = s.tilt
  })

  return <mesh ref={ref} geometry={geo} material={mats[def.style]} castShadow receiveShadow />
}

/** All support pillars in a single instanced draw call. */
function Pillars({ level, theme, hq }: { level: LevelDef; theme: Theme; hq: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const items = useMemo(() => pillarSpots(level), [level])

  const { geo, mat } = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.translate(0, 0.5, 0)
    const tex = stripeTexture(theme.stripeA, theme.stripeB).clone()
    tex.rotation = Math.PI / 2
    tex.repeat.set(3, 1)
    tex.needsUpdate = true
    return { geo: g, mat: surface(hq, { map: tex, roughness: 0.45 }) }
  }, [theme, hq])

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new THREE.Object3D()
    items.forEach((it, i) => {
      o.position.set(it.x, -2.4, 0)
      o.scale.set(it.s, it.h + 2.4, it.s)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [items])

  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow receiveShadow frustumCulled={false} />
}

function Arch({ x, top, label, theme, hq }: { x: number; top: number; label: string; theme: Theme; hq: boolean }) {
  const tex = useMemo(() => labelTexture(label, theme.trim, '#ffffff'), [label, theme])
  const pole = useMemo(() => surface(hq, { color: theme.stripeB, roughness: 0.3, metalness: 0.2 }), [theme, hq])
  const bar = useMemo(() => surface(hq, { color: theme.trim, roughness: 0.4 }), [theme, hq])
  return (
    <group position={[x, top, 0]}>
      {[-1.7, 1.7].map((z) => (
        <OccluderMesh key={z} position={[0, 2.1, z]} castShadow material={pole}>
          <cylinderGeometry args={[0.16, 0.2, 4.2, 12]} />
        </OccluderMesh>
      ))}
      <OccluderMesh position={[0, 4.1, 0]} material={bar}>
        <boxGeometry args={[0.25, 0.9, 3.8]} />
      </OccluderMesh>
      <mesh position={[0.14, 4.1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[3.6, 0.8]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[-0.14, 4.1, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[3.6, 0.8]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Big finish buzzer the contestant slams at the end of the course. */
function Buzzer({ x, top, theme }: { x: number; top: number; theme: Theme }) {
  const cap = useRef<THREE.Mesh>(null)
  const capMat = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    if (!cap.current) return
    const pressed = engine.phase === 'finished'
    cap.current.position.y = THREE.MathUtils.lerp(cap.current.position.y, pressed ? 0.62 : 0.85, 0.2)
    if (capMat.current) capMat.current.emissiveIntensity = pressed ? 1.6 + Math.sin(engine.time * 14) * 0.6 : 0.3
  })
  return (
    <group position={[x, top, -0.6]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.65, 0.6, 20]} />
        <meshStandardMaterial color={theme.stripeB} roughness={0.35} metalness={0.3} />
      </mesh>
      <mesh ref={cap} position={[0, 0.85, 0]} castShadow>
        <sphereGeometry args={[0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial ref={capMat} color={theme.trim} roughness={0.2} emissive={theme.trim} emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
}

export function Course({ level, theme, hq }: { level: LevelDef; theme: Theme; hq: boolean }) {
  const mats = useCourseMaterials(theme, hq)
  const startTop = level.platforms[0].top
  return (
    <group>
      {level.platforms.map((p, i) => (
        <Platform key={p.id} def={p} index={i} mats={mats} />
      ))}
      <Pillars level={level} theme={theme} hq={hq} />
      <Arch x={level.start.x + 1.2} top={startTop} label="START" theme={theme} hq={hq} />
      <Arch x={level.finishX} top={level.finishTop} label="FINISH" theme={theme} hq={hq} />
      <Buzzer x={level.finishX + 2.6} top={level.finishTop} theme={theme} />
    </group>
  )
}
