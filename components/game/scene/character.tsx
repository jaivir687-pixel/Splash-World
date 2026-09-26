'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { PHYS } from '@/lib/game/constants'
import { engine } from '@/lib/game/engine'
import { clamp, damp, lerp, smoothstep } from '@/lib/game/math'
import { gaitAmp } from '@/lib/game/player'
import { buildRig, RigDriver, zeroPose, type Pose } from '@/lib/game/rig'

/**
 * Contestant: the supplied GLB, auto-rigged at load (see lib/game/rig.ts).
 *
 * Every frame a procedural pose is authored from PlayerController state:
 *  - grounded locomotion blends idle -> walk -> run continuously by speed,
 *    with cadence locked to ground speed so feet don't slide
 *  - acceleration/braking lean, turn banking, speed-scaled landing squash
 *  - jump / brace / flail (water-bound) / stumble / hit / splash / victory
 * Poses are critically damped, spring-driven secondary motion (partial
 * ragdoll) is layered on arms/legs/head from the body's real acceleration,
 * and the whole body tumbles by the physics-integrated orientation around
 * its centre of mass. The physics capsule stays upright and authoritative.
 */

const MODEL_URL = '/models/player.glb'
useGLTF.preload(MODEL_URL)

const IDLE = zeroPose()

function idlePose(out: Pose, t: number) {
  const b = Math.sin(t * 1.9)
  const shift = Math.sin(t * 0.45)
  out.armLz = out.armRz = 0.1 + b * 0.02
  out.armLx = out.armRx = 0.04
  out.elbowL = out.elbowR = 0.2 + b * 0.03
  out.head = b * 0.02
  out.headYaw = Math.sin(t * 0.31) * 0.3 * Math.max(0, Math.sin(t * 0.17))
  out.crouch = 0.01 + b * 0.006
  out.sway = shift * 0.02
  out.kneeL = 0.06 + Math.max(0, shift) * 0.08
  out.kneeR = 0.06 + Math.max(0, -shift) * 0.08
}

/** Speed-parameterised gait: short walking steps morph into a full sprint. */
function locomotionPose(out: Pose, phase: number, speedRatio: number) {
  const amp = gaitAmp(speedRatio)
  const run = smoothstep((speedRatio - 0.3) / 0.5)
  const s = Math.sin(phase)
  const c = Math.cos(phase)
  const kneeAmp = lerp(0.75, 1.35, run)
  const kneeBase = lerp(0.08, 0.2, run)
  out.legL = s * amp + 0.06 * run
  out.legR = -s * amp + 0.06 * run
  out.kneeL = kneeBase + kneeAmp * Math.max(0, Math.sin(phase + 1.9))
  out.kneeR = kneeBase + kneeAmp * Math.max(0, Math.sin(phase + 1.9 + Math.PI))
  out.ankleL = -0.3 * Math.max(0, -s) + 0.25 * Math.max(0, s)
  out.ankleR = -0.3 * Math.max(0, s) + 0.25 * Math.max(0, -s)
  const armAmp = lerp(0.32, 0.85, run)
  out.armLx = -s * armAmp
  out.armRx = s * armAmp
  out.armLz = out.armRz = lerp(0.08, 0.12, run)
  const elbow = lerp(0.35, 1.35, run)
  out.elbowL = elbow - s * 0.25 * run
  out.elbowR = elbow + s * 0.25 * run
  out.twist = s * lerp(0.06, 0.14, run)
  out.lean = lerp(0.04, 0.2, run)
  out.head = lerp(-0.02, -0.12, run)
  out.crouch = lerp(0.012, 0.04, run) + Math.abs(c) * lerp(0.018, 0.045, run)
}

interface Frame {
  t: number
  speed: number
  accel: number
}

function targetPose(out: Pose, f: Frame) {
  const p = engine.player
  const at = p.animTime
  const t = f.t
  Object.assign(out, IDLE)
  switch (p.anim) {
    case 'idle':
    case 'run': {
      const sr = clamp(f.speed / PHYS.runSpeed, 0, 1.3)
      const move = smoothstep(f.speed / 1.1)
      idlePose(out, t)
      if (move > 0.001) {
        const loco = LOCO
        Object.assign(loco, IDLE)
        locomotionPose(loco, p.runPhase, sr)
        for (const k of KEYS) out[k] = lerp(out[k], loco[k], move)
      }
      // Starting leans into the push; braking leans back and throws the arms forward.
      const a = clamp(f.accel, -30, 30)
      out.lean += clamp(a * 0.012, -0.28, 0.16)
      const brake = Math.max(0, -a) * 0.012
      out.armLx -= brake
      out.armRx -= brake
      out.kneeL += brake * 0.6
      out.kneeR += brake * 0.6
      break
    }
    case 'jump': {
      const k = Math.min(1, at * 5)
      out.legL = -1.1 * k
      out.kneeL = 1.5 * k
      out.legR = 0.3 * k
      out.kneeR = 0.7 * k
      out.ankleL = out.ankleR = 0.35
      out.armLx = -2.4 * k
      out.armRx = -2.2 * k
      out.armLz = out.armRz = 0.3
      out.elbowL = out.elbowR = 0.35
      out.lean = 0.1
      out.head = -0.2
      break
    }
    case 'fall': {
      const toWater = p.shadowY <= PHYS.waterY + 0.05
      if (toWater) {
        // Lost the platform: arms windmill, legs bicycle, body pitches with momentum.
        const fr = t * 13
        out.armLz = 1.45 + Math.sin(fr) * 0.45
        out.armRz = 1.45 + Math.sin(fr + 1.5) * 0.45
        out.armLx = Math.sin(fr * 0.8) * 0.9
        out.armRx = Math.cos(fr * 0.8) * 0.9
        out.elbowL = out.elbowR = 0.5
        out.wristL = out.wristR = Math.sin(fr * 1.3) * 0.4
        out.legL = Math.sin(fr) * 0.6 - 0.2
        out.legR = -Math.sin(fr) * 0.6 - 0.2
        out.kneeL = out.kneeR = 0.7
        out.head = -0.3
        out.lean = clamp(Math.abs(p.vx) * 0.03, 0, 0.3) - 0.1
      } else {
        // Dropping onto a platform: brace, legs reach down for the landing.
        const w = Math.sin(t * 7)
        out.armLz = out.armRz = 0.9 + w * 0.12
        out.armLx = out.armRx = -0.35
        out.elbowL = out.elbowR = 0.45
        out.legL = -0.35
        out.legR = 0.1
        out.kneeL = 0.55
        out.kneeR = 0.35
        out.ankleL = out.ankleR = 0.15
        out.lean = 0.05
        out.head = -0.2
      }
      break
    }
    case 'duck':
      out.crouch = 0.62
      out.legL = out.legR = -1.35
      out.kneeL = out.kneeR = 2.2
      out.ankleL = out.ankleR = 0.5
      out.lean = 0.7
      out.armLx = out.armRx = -0.9
      out.elbowL = out.elbowR = 1.3
      out.head = -0.35
      break
    case 'dive':
      out.crouch = 0.62
      out.lean = 1.45
      out.armLx = out.armRx = -3.0
      out.armLz = out.armRz = 0.12
      out.elbowL = out.elbowR = 0.1
      out.legL = 0.12
      out.legR = 0.26
      out.kneeL = out.kneeR = 0.3
      out.ankleL = out.ankleR = -0.6
      out.head = -0.9
      break
    case 'stumble': {
      // Unstable catch step: trailing leg drags, arms reach forward to regain balance.
      const k = Math.sin(Math.min(1, at / PHYS.stumbleTime) * Math.PI)
      const fl = Math.sin(t * 16)
      out.lean = 0.35 * k
      out.crouch = 0.12 * k
      out.legL = -0.7 * k
      out.kneeL = 0.9 * k
      out.legR = 0.45 * k
      out.kneeR = 0.6 * k
      out.armLx = -1.3 * k + fl * 0.3
      out.armRx = -0.6 * k - fl * 0.3
      out.armLz = out.armRz = 0.5 * k + 0.1
      out.elbowL = out.elbowR = 0.5
      out.head = 0.15 * k
      out.headYaw = fl * 0.1
      break
    }
    case 'hit': {
      const recoil = Math.exp(-at * 5)
      out.lean = -0.5 * recoil
      out.armLz = out.armRz = 2.1
      out.armLx = Math.sin(t * 18) * 0.5
      out.armRx = Math.cos(t * 18) * 0.5
      out.elbowL = out.elbowR = 0.6
      out.legL = 0.5
      out.legR = -0.6
      out.splay = 0.5
      out.kneeL = out.kneeR = 0.45
      out.head = 0.4 * recoil
      out.headYaw = Math.sin(t * 9) * 0.3
      break
    }
    case 'splash': {
      const impact = Math.exp(-at * 4)
      const fr = t * 5
      if (at < 0.4) {
        // Impact: arms thrown up by the water, legs tuck.
        out.armLx = out.armRx = -2.6
        out.armLz = out.armRz = 0.5
        out.elbowL = out.elbowR = 0.3
        out.legL = out.legR = -0.6 * impact - 0.2
        out.kneeL = out.kneeR = 0.9
        out.head = -0.35
        out.crouch = 0.15
      } else {
        // Treading water: arms scull at the surface, slow scissor kick.
        out.armLz = out.armRz = 1.25 + Math.sin(fr) * 0.25
        out.armLx = -0.5 + Math.cos(fr) * 0.35
        out.armRx = -0.5 - Math.cos(fr) * 0.35
        out.elbowL = out.elbowR = 0.6
        out.wristL = out.wristR = Math.sin(fr) * 0.5
        out.legL = Math.sin(fr * 0.8) * 0.35 - 0.1
        out.legR = -Math.sin(fr * 0.8) * 0.35 - 0.1
        out.kneeL = out.kneeR = 0.6
        out.head = -0.25
      }
      break
    }
    case 'victory': {
      const hop = Math.abs(Math.sin(t * 5))
      const pump = Math.sin(t * 10)
      out.armLx = -2.9 + pump * 0.25
      out.armRx = -2.9 - pump * 0.25
      out.armLz = out.armRz = 0.45
      out.elbowL = out.elbowR = 0.4 + Math.max(0, pump) * 0.6
      out.wristL = out.wristR = -0.3
      out.crouch = -hop * 0.35
      out.legL = -hop * 0.4
      out.kneeL = hop * 0.8
      out.ankleL = out.ankleR = hop * 0.4
      out.head = -0.25
      out.twist = Math.sin(t * 2.5) * 0.2
      break
    }
  }
  // Landing squash scales with the impact velocity.
  if (p.landTimer > 0 && p.anim !== 'dive' && p.anim !== 'splash') {
    const k = Math.sin((p.landTimer / p.landDur) * Math.PI * 0.5) * (0.35 + p.landImpact * 0.9)
    out.crouch += 0.35 * k
    out.kneeL += 1.0 * k
    out.kneeR += 1.0 * k
    out.legL -= 0.5 * k
    out.legR -= 0.5 * k
    out.ankleL += 0.45 * k
    out.ankleR += 0.45 * k
    out.lean += 0.3 * k
    out.armLz += 0.4 * k
    out.armRz += 0.4 * k
  }
}

const LOCO = zeroPose()
const KEYS = Object.keys(IDLE) as (keyof Pose)[]

/** Damped spring used for secondary (ragdoll-like) limb motion. */
class Spring {
  x = 0
  v = 0
  step(input: number, dt: number, k = 60, c = 9) {
    this.v += (-k * this.x - c * this.v + input) * dt
    this.x += this.v * dt
    return this.x
  }
}

export function Character({ hq }: { hq: boolean }) {
  const { scene } = useGLTF(MODEL_URL)
  const rig = useMemo(() => buildRig(scene), [scene])
  const driver = useMemo(() => new RigDriver(rig), [rig])
  const root = useRef<THREE.Group>(null)
  const pivot = useRef<THREE.Group>(null)
  const yawGroup = useRef<THREE.Group>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const pose = useRef<Pose>(zeroPose())
  const target = useRef<Pose>(zeroPose())
  const st = useMemo(
    () => ({
      yaw: Math.PI / 2,
      yawRate: 0,
      pvx: 0,
      pvy: 0,
      speedPrev: 0,
      accel: 0,
      armSwing: new Spring(),
      armSpread: new Spring(),
      legSwing: new Spring(),
      headNod: new Spring(),
      frame: { t: 0, speed: 0, accel: 0 } as Frame,
    }),
    [],
  )
  const shadowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }), [])
  const disc = useMemo(() => new THREE.CircleGeometry(1, 24), [])

  useEffect(() => {
    rig.mesh.castShadow = hq
    rig.mesh.receiveShadow = hq
  }, [rig, hq])

  useEffect(
    () => () => {
      rig.mesh.geometry.dispose()
      rig.mesh.skeleton.dispose()
      shadowMat.dispose()
      disc.dispose()
    },
    [rig, shadowMat, disc],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const p = engine.player
    const t = engine.time
    const r = root.current
    if (!r || dt <= 0) return

    // Ground-relative speed and smoothed forward acceleration (start / stop reactions).
    const speed = Math.abs(p.vx - (p.grounded ? p.groundVx : 0))
    const fwd = (p.vx - (p.grounded ? p.groundVx : 0)) * p.facing
    const rawAccel = (fwd - st.speedPrev) / dt
    st.speedPrev = fwd
    st.accel = lerp(st.accel, p.grounded ? rawAccel : 0, damp(8, dt))
    st.frame.t = t
    st.frame.speed = speed
    st.frame.accel = st.accel

    targetPose(target.current, st.frame)
    const k = damp(p.anim === 'hit' || p.anim === 'stumble' ? 24 : p.anim === 'run' || p.anim === 'idle' ? 18 : 13, dt)
    const cur = pose.current
    const tg = target.current
    for (const key of KEYS) cur[key] = lerp(cur[key], tg[key], k)

    // Secondary motion driven by the body's actual acceleration (stronger once knocked loose).
    const ax = clamp((p.vx - st.pvx) / dt, -80, 80) * p.facing
    const ay = clamp((p.vy - st.pvy) / dt, -80, 80)
    st.pvx = p.vx
    st.pvy = p.vy
    const loose = p.anim === 'hit' || p.anim === 'fall' || p.anim === 'splash' || p.anim === 'stumble' ? 1 : 0.35
    const swing = st.armSwing.step(ax * 0.9 * loose, dt)
    const spread = st.armSpread.step(-ay * 0.55 * loose, dt, 50, 8)
    const legLag = st.legSwing.step(ax * 0.5 * loose, dt, 70, 10)
    const nod = st.headNod.step((-ax * 0.35 + ay * 0.25) * loose, dt, 80, 11)
    const out = LOCO
    Object.assign(out, cur)
    out.armLx += clamp(swing, -0.8, 0.8)
    out.armRx += clamp(swing, -0.8, 0.8)
    out.armLz += clamp(spread, -0.4, 0.9)
    out.armRz += clamp(spread, -0.4, 0.9)
    out.legL += clamp(legLag, -0.4, 0.4)
    out.legR += clamp(legLag, -0.4, 0.4)
    out.head += clamp(nod, -0.35, 0.35)

    // Smooth turn through the camera-facing side, banking into the turn.
    const wantYaw = p.anim === 'victory' ? 0 : p.facing > 0 ? Math.PI / 2 : -Math.PI / 2
    const prevYaw = st.yaw
    if (!p.inWater) st.yaw = lerp(st.yaw, wantYaw, damp(p.grounded ? 9 : 5, dt))
    st.yawRate = lerp(st.yawRate, (st.yaw - prevYaw) / dt, damp(10, dt))
    out.bank = p.grounded ? clamp(-st.yawRate * 0.035, -0.22, 0.22) : 0

    driver.apply(out)

    r.visible = engine.phase !== 'attract'
    r.position.set(p.x, p.y, p.z)
    const pg = pivot.current
    const yg = yawGroup.current
    if (pg && yg) {
      // Tumble around the centre of mass; drop the pivot when lying on the ground.
      const upY = 1 - 2 * (p.tumble.x * p.tumble.x + p.tumble.z * p.tumble.z)
      const drop = p.grounded ? (1 - clamp(upY, 0, 1)) * (PHYS.comHeight - 0.25) : 0
      pg.position.set(0, PHYS.comHeight - drop, 0)
      pg.quaternion.copy(p.tumble)
      yg.position.set(0, -PHYS.comHeight, 0)
      yg.rotation.y = st.yaw
    }

    const sh = shadow.current
    if (sh) {
      const hgt = Math.max(0, p.y - p.shadowY)
      sh.visible = r.visible && !p.inWater && p.shadowY > 0.05 && hgt < 8
      sh.position.set(p.x, p.shadowY + 0.03, p.z)
      const sc = 0.4 / (1 + hgt * 0.25)
      sh.scale.set(sc, sc, sc)
      shadowMat.opacity = (hq ? 0.18 : 0.3) / (1 + hgt * 0.4)
    }
  })

  return (
    <>
      <group ref={root}>
        <group ref={pivot}>
          <group ref={yawGroup}>
            <primitive object={rig.mesh} />
          </group>
        </group>
      </group>
      <mesh ref={shadow} geometry={disc} material={shadowMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} />
    </>
  )
}
