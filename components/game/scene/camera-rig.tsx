'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { PHYS, TIMING } from '@/lib/game/constants'
import { engine } from '@/lib/game/engine'
import { clamp, damp, lerp, smoothstep } from '@/lib/game/math'
import { updateOccluders } from '@/lib/game/occluders'

/**
 * CameraController: third-person 3/4 chase camera for a side-scrolling course.
 *
 * - Sits in front of the course (+Z) and trails slightly behind the direction
 *   of travel so the view looks down the course rather than dead side-on.
 * - Vertical follow is anchored to the last ground height while airborne so
 *   jumps read big, but it catches up quickly once a real fall starts.
 * - Registered occluders (arch pillars, pylons) between lens and player fade
 *   out; the lens is also clamped above water and walkable surfaces.
 * - Landing dips, speed/fall FOV kicks and a smooth noise shake add weight.
 */
const DIST = 10.8
const HEIGHT = 3.1
const LOOK_AHEAD = 2.4
const TRAIL = 1.9
const LOOK_Z = -0.6

function noise(t: number, seed: number) {
  return Math.sin(t * 31.7 + seed) * 0.5 + Math.sin(t * 17.3 + seed * 2.1) * 0.35 + Math.sin(t * 7.9 + seed * 3.7) * 0.15
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const pos = useRef(new THREE.Vector3(0, 5, DIST))
  const look = useRef(new THREE.Vector3())
  const lead = useRef(0)
  const dir = useRef(1)
  const shake = useRef(0)
  const dip = useRef(0)
  const fovKick = useRef(0)
  const lastWipe = useRef(0)
  const wasGrounded = useRef(true)
  const orbit = useRef(0)
  const occFrom = useRef(new THREE.Vector3())

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const p = engine.player
    const lv = engine.level
    const phase = engine.phase
    const t = engine.time

    if (engine.wipeouts !== lastWipe.current) {
      lastWipe.current = engine.wipeouts
      shake.current = Math.max(shake.current, 0.45)
    }
    if (p.anim === 'hit' && shake.current < 0.15) shake.current = 0.25
    if (p.grounded && !wasGrounded.current && p.landTimer > 0) {
      dip.current = Math.min(0.35, dip.current + 0.22)
      shake.current = Math.max(shake.current, 0.08)
    }
    wasGrounded.current = p.grounded

    let tx: number
    let ty: number
    let tz: number
    let lx: number
    let ly: number
    let lz = LOOK_Z
    let kx = 4
    let ky = 3.2

    if (phase === 'attract') {
      orbit.current += dt * 3.2
      const span = lv.endX - 8
      const o = orbit.current % (span * 2)
      const x = 4 + (o < span ? o : span * 2 - o)
      tx = x - 3
      ty = 7.5
      tz = 15
      lx = x + 3
      ly = 2.5
      kx = ky = 1.5
    } else if (phase === 'intro') {
      const k = smoothstep(clamp(engine.phaseT / TIMING.intro, 0, 1))
      const x = lerp(lv.endX - 4, p.x + LOOK_AHEAD, k)
      tx = x - TRAIL * k
      ty = lerp(10, p.y + HEIGHT, k)
      tz = lerp(19, DIST, k)
      lx = x
      ly = lerp(3, p.y + 1, k)
      if (engine.phaseT < 0.05) pos.current.set(tx, ty, tz)
      kx = ky = 10
    } else {
      const moving = Math.abs(p.vx) > 0.5
      if (moving) dir.current = Math.sign(p.vx)
      const targetLead = moving ? Math.sign(p.vx) * LOOK_AHEAD : p.facing * LOOK_AHEAD * 0.6
      lead.current = lerp(lead.current, targetLead, damp(1.8, dt))
      const inWater = phase === 'splash' || phase === 'failed'
      const falling = !p.grounded && p.vy < -7
      const groundRef = p.grounded ? p.y : Math.max(p.y - 0.8, p.lastGroundY)
      const baseY = inWater ? 2.2 : falling ? p.y : lerp(groundRef, p.y, 0.45)
      const trail = (lead.current / LOOK_AHEAD) * TRAIL
      tx = p.x + lead.current * 0.55 - trail
      ty = baseY + HEIGHT + (inWater ? 1.6 : 0) - dip.current
      tz = phase === 'finished' ? DIST - 3.8 : inWater ? DIST + 1.5 : DIST
      lx = p.x + lead.current
      ly = (inWater ? 0.8 : baseY) + 1.0 - dip.current * 0.5
      if (phase === 'finished') {
        tx = p.x - 1.2
        lx = p.x
        ly = p.y + 1.2
        lz = 0
      }
      kx = p.grounded ? 5.5 : 3.6
      ky = falling ? 7 : p.grounded ? 4.4 : 2.6
    }

    pos.current.x = lerp(pos.current.x, tx, damp(kx, dt))
    pos.current.y = lerp(pos.current.y, ty, damp(ky, dt))
    pos.current.z = lerp(pos.current.z, tz, damp(2.5, dt))
    look.current.x = lerp(look.current.x, lx, damp(kx * 1.25, dt))
    look.current.y = lerp(look.current.y, ly, damp(ky * 1.2, dt))
    look.current.z = lerp(look.current.z, lz, damp(3, dt))

    // Collision-aware lens: never under water, never inside a walkable surface.
    const floor = Math.max(PHYS.waterY + 0.9, engine.world.surfaceBelow(pos.current.x, pos.current.y + 2, pos.current.z) + 0.7)
    if (pos.current.y < floor) pos.current.y = floor

    dip.current = Math.max(0, dip.current - dt * 1.4)
    shake.current = Math.max(0, shake.current - dt * 1.2)
    const s = shake.current * shake.current * 1.6
    camera.position.set(pos.current.x + noise(t, 1) * s, pos.current.y + noise(t, 7) * s, pos.current.z)
    camera.lookAt(look.current)
    if (s > 0) camera.rotateZ(noise(t, 13) * s * 0.06)

    // FOV: widen on narrow screens, kick a little with run speed and big falls.
    const aspect = size.width / Math.max(1, size.height)
    const base = aspect < 1 ? 62 : aspect < 1.5 ? 50 : 43
    const speedK = phase === 'running' ? clamp(Math.abs(p.vx) / PHYS.runSpeed, 0, 1.4) * 2.5 : 0
    const fallK = !p.grounded && p.vy < -10 ? 3 : 0
    fovKick.current = lerp(fovKick.current, speedK + fallK, damp(3, dt))
    const fov = base + fovKick.current
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    occFrom.current.set(p.x, p.y + 1.0, p.z)
    updateOccluders(occFrom.current, camera.position, dt)
  })

  return null
}
