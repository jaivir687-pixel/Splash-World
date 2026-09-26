'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { engine } from '@/lib/game/engine'
import { surface } from '@/lib/game/materials'
import { v3 } from '@/lib/game/math'
import { stripeTexture } from '@/lib/game/textures'
import type { Theme } from '@/lib/game/themes'
import type { BallDef, LevelDef, PendulumDef, PuncherDef, RollerDef, SweeperDef, WindmillDef } from '@/lib/game/types'
import {
  ballY,
  pendulumTheta,
  puncherExtension,
  rollerAngle,
  sweeperAngle,
  windmillAngle,
} from '@/lib/game/world'
import { OccluderMesh } from './course'

interface Shared {
  ball: THREE.Material
  hazard: THREE.Material
  hazardStripe: THREE.Material
  white: THREE.Material
  metal: THREE.Material
  pad: THREE.Material
  sphere: THREE.BufferGeometry
  cyl: THREE.BufferGeometry
}

function useShared(theme: Theme, hq: boolean): Shared {
  return useMemo(() => {
    const stripe = stripeTexture(theme.hazard, theme.hazardB).clone()
    stripe.repeat.set(4, 1)
    stripe.needsUpdate = true
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 14)
    return {
      ball: new THREE.MeshStandardMaterial({ color: theme.ball, roughness: 0.2, metalness: 0.05 }),
      hazard: surface(hq, { color: theme.hazard, roughness: 0.35 }),
      hazardStripe: surface(hq, { map: stripe, roughness: 0.4 }),
      white: surface(hq, { color: theme.hazardB, roughness: 0.4 }),
      metal: surface(hq, { color: '#b3bcc8', roughness: 0.3, metalness: 0.85 }),
      pad: surface(hq, { color: theme.stripeA, roughness: 0.45 }),
      sphere: new THREE.SphereGeometry(1, hq ? 32 : 20, hq ? 20 : 12),
      cyl,
    }
  }, [theme, hq])
}

function Ball({ def, index, s }: { def: BallDef; index: number; s: Shared }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const t = engine.time
    const since = t - (engine.world.ballHit[index] ?? -10)
    const squash = since < 0.6 ? Math.exp(-since * 7) * Math.cos(since * 28) * 0.16 : 0
    m.position.set(def.x, ballY(def, t), def.z)
    m.scale.set(def.r * (1 + squash * 0.5), def.r * (1 - squash), def.r * (1 + squash * 0.5))
  })
  return (
    <group>
      <mesh ref={ref} geometry={s.sphere} material={s.ball} castShadow />
      <mesh position={[def.x, (def.y - def.r) / 2, def.z]} scale={[0.35, Math.max(0.2, def.y - def.r + 0.3), 0.35]} geometry={s.cyl} material={s.metal} />
    </group>
  )
}

function Sweeper({ def, s }: { def: SweeperDef; s: Shared }) {
  const rot = useRef<THREE.Group>(null)
  useFrame(() => {
    // Arm direction in physics is (cos a, 0, sin a); a Y-rotation of -a maps local +X onto it.
    if (rot.current) rot.current.rotation.y = -sweeperAngle(def, engine.time)
  })
  const pylonH = def.armY + 0.5 - def.baseY
  return (
    <group position={[def.x, 0, def.z]}>
      <OccluderMesh position={[0, def.baseY + pylonH / 2, 0]} scale={[0.45, pylonH, 0.45]} geometry={s.cyl} material={s.hazardStripe} castShadow />
      <group ref={rot} position={[0, def.armY, 0]}>
        <mesh position={[0, 0.35, 0]} scale={[0.7, 0.35, 0.7]} geometry={s.cyl} material={s.white} />
        {Array.from({ length: def.arms }).map((_, k) => (
          <group key={k} rotation={[0, (-k * Math.PI * 2) / def.arms, 0]}>
            <mesh position={[def.length / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.3, def.length, 0.3]} geometry={s.cyl} material={s.hazardStripe} castShadow />
            <mesh position={[def.length, 0, 0]} scale={0.42} geometry={s.sphere} material={s.hazard} />
          </group>
        ))}
      </group>
    </group>
  )
}

function Pendulum({ def, s }: { def: PendulumDef; s: Shared }) {
  const swing = useRef<THREE.Group>(null)
  useFrame(() => {
    const th = pendulumTheta(def, engine.time)
    const g = swing.current
    if (!g) return
    // Physics offsets: plane 'x' -> +x = sin(th); plane 'z' -> +z = sin(th).
    if (def.plane === 'x') g.rotation.set(0, 0, th)
    else g.rotation.set(-th, 0, 0)
  })
  const postZ = -4.6
  return (
    <group position={[def.x, 0, def.z]}>
      <mesh position={[0, (def.pivotY + 0.4) / 2, postZ]} scale={[0.3, def.pivotY + 0.4, 0.3]} geometry={s.cyl} material={s.metal} castShadow />
      <mesh position={[0, def.pivotY + 0.25, postZ / 2]} rotation={[Math.PI / 2, 0, 0]} scale={[0.2, -postZ, 0.2]} geometry={s.cyl} material={s.metal} />
      <group ref={swing} position={[0, def.pivotY, 0]}>
        <mesh position={[0, -def.length / 2, 0]} scale={[0.05, def.length, 0.05]} geometry={s.cyl} material={s.white} />
        <mesh position={[0, -def.length, 0]} scale={def.r} geometry={s.sphere} material={s.ball} castShadow />
        <mesh position={[0, -def.length, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[def.r * 1.02, 0.25, def.r * 1.02]} geometry={s.cyl} material={s.white} />
      </group>
    </group>
  )
}

function Windmill({ def, s }: { def: WindmillDef; s: Shared }) {
  const rot = useRef<THREE.Group>(null)
  useFrame(() => {
    if (rot.current) rot.current.rotation.z = windmillAngle(def, engine.time)
  })
  return (
    <group position={[def.x, 0, def.z]}>
      <mesh position={[0, def.y / 2, -2.2]} scale={[0.5, def.y, 0.5]} geometry={s.cyl} material={s.hazardStripe} castShadow />
      <mesh position={[0, def.y, -1.1]} rotation={[Math.PI / 2, 0, 0]} scale={[0.18, 2.2, 0.18]} geometry={s.cyl} material={s.metal} />
      <group ref={rot} position={[0, def.y, def.z]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[0.45, 0.5, 0.45]} geometry={s.cyl} material={s.hazard} />
        {Array.from({ length: def.blades }).map((_, k) => (
          <group key={k} rotation={[0, 0, (k * Math.PI * 2) / def.blades]}>
            <mesh position={[def.length / 2 + 0.1, 0, 0]} castShadow material={k % 2 ? s.white : s.hazard}>
              <boxGeometry args={[def.length, 0.36, 0.3]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

function Puncher({ def, s }: { def: PuncherDef; s: Shared }) {
  const head = useRef<THREE.Group>(null)
  const housing = useRef<THREE.Mesh>(null)
  const isLog = def.variant === 'log'
  useFrame(() => {
    const { ext, warn } = puncherExtension(def, engine.time)
    const tip = def.zBack + def.reach * ext
    if (head.current) head.current.position.z = tip
    if (housing.current) housing.current.position.x = warn > 0 ? Math.sin(engine.time * 60) * 0.04 * warn : 0
  })
  return (
    <group position={[def.x, def.y, 0]}>
      <mesh ref={housing} position={[0, 0, def.zBack - 2.4]} castShadow material={s.pad}>
        <boxGeometry args={[1.6, isLog ? 1.4 : 2.2, 1.6]} />
      </mesh>
      <mesh position={[0, -def.y / 2, def.zBack - 2.4]} scale={[0.4, def.y, 0.4]} geometry={s.cyl} material={s.metal} />
      <group ref={head} position={[0, 0, def.zBack]}>
        {isLog ? (
          <mesh position={[0, 0, -1.5]} rotation={[Math.PI / 2, 0, 0]} scale={[def.r, 3, def.r]} geometry={s.cyl} material={s.hazardStripe} castShadow />
        ) : (
          <>
            <mesh position={[0, 0, -1.4]} rotation={[Math.PI / 2, 0, 0]} scale={[0.16, 2.2, 0.16]} geometry={s.cyl} material={s.metal} />
            <mesh scale={[def.r, def.r * 0.9, def.r * 1.05]} geometry={s.sphere} material={s.hazard} castShadow />
            <mesh position={[0.25, 0.35, 0.2]} scale={0.22} geometry={s.sphere} material={s.hazard} />
            <mesh position={[0, 0, -def.r * 0.95]} rotation={[Math.PI / 2, 0, 0]} scale={[def.r * 0.75, 0.3, def.r * 0.75]} geometry={s.cyl} material={s.white} />
          </>
        )}
      </group>
    </group>
  )
}

function Roller({ def, s }: { def: RollerDef; s: Shared }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = rollerAngle(def, engine.time)
  })
  return (
    <group position={[def.x, def.y, 0]}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh ref={ref} scale={[def.r, def.d, def.r]} geometry={s.cyl} material={s.hazardStripe} castShadow receiveShadow />
      </group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, -def.y / 2, side * (def.d / 2 + 0.15)]} scale={[0.18, def.y, 0.18]} geometry={s.cyl} material={s.metal} />
      ))}
    </group>
  )
}

export function Obstacles({ level, theme, hq }: { level: LevelDef; theme: Theme; hq: boolean }) {
  const s = useShared(theme, hq)
  let ballIndex = -1
  return (
    <group>
      {level.obstacles.map((o) => {
        switch (o.type) {
          case 'ball':
            ballIndex++
            return <Ball key={o.id} def={o} index={ballIndex} s={s} />
          case 'sweeper':
            return <Sweeper key={o.id} def={o} s={s} />
          case 'pendulum':
            return <Pendulum key={o.id} def={o} s={s} />
          case 'windmill':
            return <Windmill key={o.id} def={o} s={s} />
          case 'puncher':
            return <Puncher key={o.id} def={o} s={s} />
          case 'roller':
            return <Roller key={o.id} def={o} s={s} />
        }
      })}
    </group>
  )
}

export const _unused = v3
