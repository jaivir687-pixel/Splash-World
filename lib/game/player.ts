import * as THREE from 'three'
import { PHYS, POOL, WATER } from './constants'
import { approach, clamp, closestOnSeg, lerp, segSeg, smoothstep, v3, type V3 } from './math'
import {
  ballY,
  pendulumBall,
  pendulumTheta,
  puncherExtension,
  sweeperAngle,
  windmillAngle,
  type World,
} from './world'

export type AnimState = 'idle' | 'run' | 'jump' | 'fall' | 'duck' | 'dive' | 'hit' | 'stumble' | 'splash' | 'victory'

export type PlayerEvent =
  | { type: 'jump' }
  | { type: 'land'; impact: number }
  | { type: 'bounce'; super: boolean; ball: number; x: number; y: number }
  | { type: 'hit'; x: number; y: number; z: number; source: string }
  | { type: 'stumble'; x: number; y: number; z: number }
  | { type: 'water'; x: number; z: number; impact: number }
  | { type: 'resurface'; x: number; z: number }
  | { type: 'dive' }

/** Leg swing amplitude for a given speed ratio: short walking steps blend into a full running stride. */
export function gaitAmp(speedRatio: number) {
  return lerp(0.36, 0.88, smoothstep((speedRatio - 0.2) / 0.6))
}

const UP = new THREE.Vector3(0, 1, 0)

export interface Intent {
  moveX: number
  jumpPressed: boolean
  jumpHeld: boolean
  duckPressed: boolean
  duckHeld: boolean
}

const NO_INPUT: Intent = { moveX: 0, jumpPressed: false, jumpHeld: false, duckPressed: false, duckHeld: false }

type Ground = { kind: 'platform'; index: number } | { kind: 'roller'; index: number } | null

/**
 * PlayerController: kinematic character physics for a 2.5D obstacle course.
 * The player runs along X, may be knocked along Z (off the course) by
 * obstacles, and collides against oriented platform boxes, bouncy balls,
 * spinning rollers and moving hazards.
 */
export class PlayerController {
  x = 0
  y = 0
  z = 0
  vx = 0
  vy = 0
  vz = 0
  facing: 1 | -1 = 1
  grounded = false
  ground: Ground = null
  groundVx = 0
  groundVy = 0
  groundTilt = 0
  lastGroundY = 0
  lastGroundTime = -10
  lastJumpPress = -10
  lastBounceTime = -10
  bounceSuper = false
  bounceBall = -1
  stun = 0
  invuln = 0
  ducking = false
  diving = false
  diveTimer = 0
  landTimer = 0
  jumping = false
  frozen = false
  anim: AnimState = 'idle'
  animTime = 0
  runPhase = 0
  hitSpin = 0
  shadowY = 0
  stumble = 0
  landImpact = 0
  landDur = 0.14
  airTime = 0
  /** Visual body orientation (world space) and angular velocity: the partial-ragdoll tumble. */
  tumble = new THREE.Quaternion()
  spin = new THREE.Vector3()
  inWater = false
  waterTime = 0
  waterImpact = 0
  waterX = 0
  waterZ = 0
  private submerged = false
  private surfaced = false
  private wallHit = 0
  private sideHit = 0
  private t = 0
  private tv = new THREE.Vector3()
  private tv2 = new THREE.Vector3()
  private tqd = new THREE.Quaternion()
  private events: PlayerEvent[] = []
  private tmpA = v3()
  private tmpB = v3()
  private tmpC = v3()
  private tmpD = v3()

  reset(x: number, y: number, invuln = 0) {
    this.x = x
    this.y = y + 0.02
    this.z = 0
    this.vx = this.vy = this.vz = 0
    this.facing = 1
    this.grounded = true
    this.ground = null
    this.groundVx = this.groundVy = 0
    this.lastGroundY = y
    this.stun = 0
    this.invuln = invuln
    this.ducking = this.diving = false
    this.diveTimer = 0
    this.landTimer = 0
    this.jumping = false
    this.frozen = false
    this.hitSpin = 0
    this.stumble = 0
    this.landImpact = 0
    this.airTime = 0
    this.tumble.identity()
    this.spin.set(0, 0, 0)
    this.inWater = false
    this.waterTime = 0
    this.submerged = this.surfaced = false
    this.setAnim('idle')
  }

  drainEvents() {
    const e = this.events
    this.events = []
    return e
  }

  private setAnim(a: AnimState) {
    if (this.anim !== a) {
      this.anim = a
      this.animTime = 0
    }
  }

  forceAnim(a: AnimState) {
    this.setAnim(a)
  }

  get height() {
    if (this.diving) return PHYS.diveHeight
    return this.ducking ? PHYS.duckHeight : PHYS.height
  }

  /** Capsule endpoints (bottom / top sphere centers). */
  private capsule(a: V3, b: V3) {
    const r = PHYS.radius
    if (this.diving) {
      a.x = this.x - this.facing * 0.45
      b.x = this.x + this.facing * 0.45
      a.y = b.y = this.y + r
    } else {
      a.x = b.x = this.x
      a.y = this.y + r
      b.y = this.y + Math.max(r, this.height - r)
    }
    a.z = b.z = this.z
  }

  step(dt: number, t: number, world: World, intent: Intent | null) {
    this.t = t
    this.animTime += dt
    if (this.frozen) {
      this.shadowY = world.surfaceBelow(this.x, this.y + 0.2, this.z)
      this.updateTumble(dt)
      return
    }
    if (this.inWater) {
      this.stepWater(dt)
      return
    }
    const inp = intent ?? NO_INPUT
    const canControl = this.stun <= 0
    const prevX = this.x
    const prevY = this.y
    const prevZ = this.z

    this.stun = Math.max(0, this.stun - dt)
    this.invuln = Math.max(0, this.invuln - dt)
    this.landTimer = Math.max(0, this.landTimer - dt)
    this.stumble = Math.max(0, this.stumble - dt)
    if (inp.jumpPressed) this.lastJumpPress = t

    // Carry with the surface we stood on last step (moving pads, rollers).
    if (this.grounded) {
      this.x += this.groundVx * dt
      this.y += this.groundVy * dt
    }

    // --- Duck / dive -------------------------------------------------------
    if (canControl) {
      if (inp.duckPressed && !this.diving) {
        const fast = Math.abs(this.vx) > PHYS.runSpeed * 0.65
        if (fast || !this.grounded) {
          this.diving = true
          this.diveTimer = this.grounded ? 0.55 : 0.9
          this.vx = this.facing * PHYS.diveSpeed
          if (this.grounded) {
            this.vy = PHYS.diveHop
            this.grounded = false
          }
          this.events.push({ type: 'dive' })
        }
      }
      this.ducking = inp.duckHeld && this.grounded && !this.diving
    } else {
      this.ducking = false
      this.diving = false
    }

    if (this.diving) {
      if (this.grounded) this.diveTimer -= dt
      this.vx = approach(this.vx, 0, (this.grounded ? 9 : 1.5) * dt)
      if (this.diveTimer <= 0 || Math.abs(this.vx) < 1.5) this.diving = false
    }

    // --- Horizontal movement ----------------------------------------------
    if (canControl && !this.diving) {
      if (Math.abs(inp.moveX) > 0.15) this.facing = inp.moveX > 0 ? 1 : -1
      let maxV = this.ducking ? PHYS.duckSpeed : PHYS.runSpeed
      // Ground awareness: running uphill on a tilted pad costs speed, downhill adds a little.
      if (this.grounded && this.groundTilt !== 0) maxV *= 1 - clamp(Math.sin(this.groundTilt) * Math.sign(inp.moveX), -0.15, 0.3)
      const target = inp.moveX * maxV
      let accel: number
      if (this.grounded) {
        if (Math.abs(target) < 0.05) accel = PHYS.groundDecel
        else if (Math.sign(target) !== Math.sign(this.vx) && Math.abs(this.vx) > 0.5) accel = PHYS.turnDecel
        else accel = PHYS.groundAccel * (0.55 + 0.9 * (1 - clamp(Math.abs(this.vx) / maxV, 0, 1)))
        if (this.slippery(world)) accel *= 0.35
      } else {
        accel = Math.abs(target) < 0.05 ? PHYS.airDrag : PHYS.airAccel
      }
      if (this.stumble > 0) accel *= 0.3
      this.vx = approach(this.vx, target, accel * dt)
    } else if (!canControl && this.grounded) {
      this.vx = approach(this.vx, 0, 10 * dt)
    }

    // Slide down slippery tilted pads.
    if (this.grounded && this.slippery(world)) {
      this.vx += -Math.sin(this.groundTilt) * PHYS.gravity * 0.6 * dt
    }

    // --- Jump --------------------------------------------------------------
    const coyote = t - this.lastGroundTime <= PHYS.coyoteTime
    const buffered = t - this.lastJumpPress <= PHYS.jumpBuffer
    if (canControl && buffered && (this.grounded || coyote) && !this.jumping && !this.diving) {
      this.vy = PHYS.jumpVel + Math.max(0, this.groundVy)
      this.grounded = false
      this.jumping = true
      this.ducking = false
      this.lastJumpPress = -10
      this.lastGroundTime = -10
      this.events.push({ type: 'jump' })
    }

    // Late super-bounce: jump shortly after a normal ball bounce.
    if (inp.jumpPressed && !this.bounceSuper && t - this.lastBounceTime < 0.14 && this.vy > 0) {
      this.vy = PHYS.superBounceVel
      this.bounceSuper = true
      this.events.push({ type: 'bounce', super: true, ball: this.bounceBall, x: this.x, y: this.y })
    }

    // --- Gravity & integration ---------------------------------------------
    let g = PHYS.gravity
    if (this.vy > 0 && this.jumping && !inp.jumpHeld) g += PHYS.jumpCutGravity
    this.vy = Math.max(-PHYS.maxFall, this.vy - g * dt)

    const wasGrounded = this.grounded
    const fallSpeed = -this.vy
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.z += this.vz * dt

    // Z recovery: once back in control and on the ground, drift to the lane.
    if (this.stun <= 0 && this.grounded) {
      this.vz = 0
      this.z += (0 - this.z) * Math.min(1, 6 * dt)
    } else {
      this.vz *= Math.exp(-0.6 * dt)
    }

    // --- Collisions -------------------------------------------------------
    this.grounded = false
    this.ground = null
    this.groundVx = 0
    this.groundVy = 0
    this.wallHit = 0
    this.sideHit = 0
    this.collidePlatforms(world, dt, wasGrounded)
    this.collideRollers(world, wasGrounded)
    this.collideBalls(world)
    if (this.invuln <= 0) this.collideHazards(world)

    // Running face-first into a wall or glancing off a ball/log: bounce back a little and stumble.
    if (this.wallHit !== 0) {
      this.vx = -Math.sign(this.wallHit) * Math.min(1.6, Math.abs(this.wallHit) * 0.22)
      this.startStumble(PHYS.stumbleTime, Math.sign(this.wallHit), true)
    } else if (this.sideHit > PHYS.stumbleSpeed * 0.75) {
      this.startStumble(PHYS.stumbleTime * 0.8, this.facing, false)
    }

    if (this.grounded) {
      if (!wasGrounded) {
        if (fallSpeed > 3) this.events.push({ type: 'land', impact: fallSpeed })
        this.landImpact = clamp((fallSpeed - 3) / 15, 0, 1)
        this.landDur = 0.12 + 0.22 * this.landImpact
        if (fallSpeed > 4.5) this.landTimer = this.landDur
        // Hard landings at speed carry momentum into a forward stumble.
        if (fallSpeed > 17 && Math.abs(this.vx) > 3) this.startStumble(0.32, Math.sign(this.vx), false)
      }
      this.lastGroundTime = t
      this.lastGroundY = this.y
      this.jumping = false
      this.airTime = 0
    } else {
      // Left the ground without jumping (walked or was pushed off an edge): pitch along the momentum.
      if (wasGrounded && !this.jumping && this.vy <= 0.5 && Math.abs(this.vx) > 2.5) {
        this.spin.z += -Math.sign(this.vx) * Math.min(2.2, Math.abs(this.vx) * 0.22)
      }
      this.airTime += dt
    }

    // Water contact: detect the exact surface crossing between steps.
    if (!this.grounded && this.y < PHYS.waterY && prevY >= PHYS.waterY - 0.5) {
      const f = clamp((prevY - PHYS.waterY) / Math.max(1e-5, prevY - this.y), 0, 1)
      this.enterWater(prevX + (this.x - prevX) * f, prevZ + (this.z - prevZ) * f)
      this.shadowY = PHYS.waterY
      this.updateAnim(dt)
      return
    }
    this.updateTumble(dt)

    this.shadowY = world.surfaceBelow(this.x, this.y + 0.2, this.z)
    this.updateAnim(dt)
  }

  private slippery(world: World) {
    return this.ground?.kind === 'platform' && !!world.level.platforms[this.ground.index].slippery
  }

  private collidePlatforms(world: World, dt: number, wasGrounded: boolean) {
    const plats = world.level.platforms
    const r = PHYS.radius
    const h = this.height
    for (let i = 0; i < plats.length; i++) {
      const p = plats[i]
      const s = world.ps[i]
      if (Math.abs(this.x - s.x) > p.w / 2 + 2) continue
      if (Math.abs(this.z - p.z) > p.d / 2 + 0.05) continue
      const c = Math.cos(s.tilt)
      const sn = Math.sin(s.tilt)
      const rx = this.x - s.x
      const ry = this.y - s.top
      const u = rx * c + ry * sn
      const v = -rx * sn + ry * c
      const half = p.w / 2
      if (v > h + 0.1 || v < -p.h - h - 0.1) continue

      // Surface velocity at the contact point (translation + seesaw rotation).
      const svx = s.vx - u * s.omega * sn
      const svy = s.vy + u * s.omega * c
      const relVy = this.vy - svy
      const onTop = Math.abs(u) <= half + r * 0.4
      const snapDown = wasGrounded ? PHYS.stepUp + 0.18 : PHYS.stepUp
      const depth = Math.max(snapDown, -relVy * dt * 1.6 + 0.04)

      if (onTop && v <= (wasGrounded && !this.jumping ? snapDown : 0.02) && v >= -depth && relVy <= 0.6) {
        this.x = s.x + u * c
        this.y = s.top + u * sn
        this.vy = svy
        this.grounded = true
        this.ground = { kind: 'platform', index: i }
        this.groundVx = svx
        this.groundVy = svy
        this.groundTilt = s.tilt
        continue
      }
      // Side walls.
      if (Math.abs(u) < half + r && v < -0.02 && v > -p.h - h) {
        if (v + h > -p.h) {
          const nu = u < 0 ? -half - r : half + r
          this.x = s.x + nu * c - v * sn
          this.y = s.top + nu * sn + v * c
          if ((u < 0 && this.vx > 0) || (u > 0 && this.vx < 0)) {
            if (Math.abs(this.vx) > PHYS.stumbleSpeed && this.stun <= 0) this.wallHit = this.vx
            this.vx = 0
          }
        }
      }
    }
  }

  private collideRollers(world: World, wasGrounded: boolean) {
    const r = PHYS.radius
    for (let i = 0; i < world.rollers.length; i++) {
      const rl = world.rollers[i]
      if (Math.abs(this.x - rl.x) > rl.r + 1) continue
      if (Math.abs(this.z) > rl.d / 2) continue
      const cx = this.x - rl.x
      const cy = this.y + r - rl.y
      const dist = Math.hypot(cx, cy)
      const R = rl.r + r
      const snap = wasGrounded && !this.jumping ? 0.2 : 0
      if (dist < R + snap && dist > 1e-4) {
        const nx = cx / dist
        const ny = cy / dist
        if (ny > 0.55 && this.vy <= 0.8) {
          this.x = rl.x + nx * R
          this.y = rl.y + ny * R - r
          this.vy = 0
          this.grounded = true
          this.ground = { kind: 'roller', index: i }
          // Top of a log spinning with +spin moves toward -x.
          this.groundVx = -rl.spin * rl.r * ny
          this.groundVy = 0
          this.groundTilt = 0
        } else if (dist < R) {
          this.x = rl.x + nx * R
          this.y = rl.y + ny * R - r
          const vn = this.vx * nx + this.vy * ny
          if (vn < 0) {
            this.sideHit = Math.max(this.sideHit, -vn)
            this.vx -= vn * nx
            this.vy -= vn * ny
          }
        }
      }
    }
  }

  private collideBalls(world: World) {
    const a = this.tmpA
    const b = this.tmpB
    const r = PHYS.radius
    for (let i = 0; i < world.balls.length; i++) {
      const ball = world.balls[i]
      if (Math.abs(this.x - ball.x) > ball.r + 2) continue
      this.capsule(a, b)
      const c = this.tmpC
      c.x = ball.x
      c.y = ballY(ball, this.t)
      c.z = ball.z
      const p = closestOnSeg(c, a, b)
      const dx = p.x - c.x
      const dy = p.y - c.y
      const dz = p.z - c.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const R = ball.r + r
      if (dist >= R || dist < 1e-4) continue
      const nx = dx / dist
      const ny = dy / dist
      const nz = dz / dist
      const push = R - dist
      this.x += nx * push
      this.y += ny * push
      this.z += nz * push
      if (ny > 0.35 && this.vy <= 2) {
        const sup = this.t - this.lastJumpPress <= PHYS.superBounceWindow
        this.vy = sup ? PHYS.superBounceVel : PHYS.bounceVel
        // Landing on the far slope flings you forward, near slope throws you back.
        this.vx = this.vx * 0.85 + nx * 4.5
        this.vz += nz * 3
        this.jumping = true
        this.lastJumpPress = sup ? -10 : this.lastJumpPress
        this.lastBounceTime = this.t
        this.bounceSuper = sup
        this.bounceBall = i
        this.diving = false
        world.ballHit[i] = this.t
        this.events.push({ type: 'bounce', super: sup, ball: i, x: this.x, y: this.y })
      } else {
        const vn = this.vx * nx + this.vy * ny + this.vz * nz
        if (vn < 0) {
          this.sideHit = Math.max(this.sideHit, -vn)
          this.vx -= vn * nx * 1.3
          this.vy -= vn * ny * 1.3
          this.vz -= vn * nz * 1.3
        }
        world.ballHit[i] = Math.max(world.ballHit[i], this.t - 0.15)
      }
    }
  }

  private knock(dx: number, dy: number, dz: number, strength: number, source: string) {
    this.vx = dx * strength
    this.vy = Math.max(this.vy, 4.5 + Math.max(0, dy) * strength * 0.6)
    this.vz = dz * strength
    this.stun = PHYS.hitStun
    this.invuln = 0.7
    this.grounded = false
    this.ducking = false
    this.diving = false
    this.jumping = false
    this.stumble = 0
    this.hitSpin = (dx >= 0 ? -1 : 1) * (6 + Math.random() * 4)
    // The blow lands on the upper body while the feet lag: tip toward the push direction.
    const hl = Math.hypot(dx, dz) || 1
    const kick = 4.5 + strength * 0.38
    this.spin.x += (dz / hl) * kick
    this.spin.z += (-dx / hl) * kick
    this.spin.x += (Math.random() - 0.5) * 2
    this.events.push({ type: 'hit', x: this.x, y: this.y + 1, z: this.z, source })
  }

  private startStumble(dur: number, dir: number, recoil: boolean) {
    if (this.stun > 0 || this.stumble > 0.1 || this.diving) return
    this.stumble = dur
    // Recoil (wall) pitches the body back; momentum stumbles pitch it forward.
    this.spin.z += (recoil ? dir : -dir) * 2.6
    this.events.push({ type: 'stumble', x: this.x, y: this.y, z: this.z })
  }

  /**
   * Integrates the visual body orientation. The upright capsule stays the
   * physics collider; this is the partial ragdoll layered on top: impacts add
   * angular velocity, free falls let it tumble, and footing/buoyancy apply a
   * damped righting torque so the body recovers without snapping.
   */
  private updateTumble(dt: number) {
    const w = this.spin
    let k: number
    let c: number
    const freeFall = !this.grounded && (this.stun > 0 || (this.airTime > 0.2 && this.vy < -3 && this.shadowY <= PHYS.waterY + 0.05))
    if (this.inWater) {
      k = 9
      c = 4.5
    } else if (this.grounded) {
      k = this.stun > 0 ? 14 : this.stumble > 0 ? 55 : 80
      c = this.stun > 0 ? 9 : 2 * Math.sqrt(k)
    } else if (freeFall) {
      k = 0
      c = 0.35
    } else {
      k = 30
      c = 9
    }
    const up = this.tv.copy(UP).applyQuaternion(this.tumble)
    const axis = this.tv2.crossVectors(up, UP)
    const s = axis.length()
    if (s > 1e-5) {
      const ang = Math.atan2(s, up.dot(UP))
      axis.multiplyScalar((ang * k) / s)
    } else axis.set(0, 0, 0)
    w.x += (axis.x - w.x * c) * dt
    w.z += (axis.z - w.z * c) * dt
    w.y = 0
    const mag = w.length()
    if (mag > 14) w.multiplyScalar(14 / mag)
    if (mag > 1e-5) {
      this.tqd.setFromAxisAngle(this.tv.copy(w).multiplyScalar(1 / mag), mag * dt)
      this.tumble.premultiply(this.tqd).normalize()
    }
  }

  private enterWater(cx: number, cz: number) {
    this.inWater = true
    this.waterTime = 0
    this.waterX = cx
    this.waterZ = cz
    this.submerged = this.surfaced = false
    const hs = Math.hypot(this.vx, this.vz)
    const impact = Math.hypot(hs, this.vy)
    this.waterImpact = impact
    // Surface tension slam: faster entries lose more velocity in the first instant.
    const loss = clamp(0.3 + impact * 0.016, 0.3, 0.65)
    this.vy *= 1 - loss
    this.vx *= 1 - loss * 0.55
    this.vz *= 1 - loss * 0.55
    // The body rotates with its momentum on impact.
    if (hs > 0.5) {
      const kick = Math.min(5, hs * 0.45 + impact * 0.08)
      this.spin.x += (this.vz / hs) * kick
      this.spin.z += (-this.vx / hs) * kick
    }
    this.stun = 0
    this.stumble = 0
    this.diving = this.ducking = this.jumping = false
    this.grounded = false
    this.setAnim('splash')
    this.events.push({ type: 'water', x: cx, z: cz, impact })
  }

  /** Water body: gravity, depth-scaled buoyancy, linear + quadratic drag, pool bounds. */
  private stepWater(dt: number) {
    this.waterTime += dt
    const depth = PHYS.waterY - this.y
    const sub = clamp(depth / WATER.floatDepth, 0, 1)
    this.vy += (-PHYS.gravity + PHYS.gravity * WATER.buoyancy * sub) * dt
    this.vy -= this.vy * Math.abs(this.vy) * WATER.quadDrag * sub * dt
    const lin = Math.exp(-(WATER.linearDrag + WATER.submergedDrag * sub) * dt)
    this.vx *= lin
    this.vz *= lin
    this.vy *= Math.exp(-(0.4 + 1.6 * sub) * dt)
    this.x += this.vx * dt
    this.y += this.vy * dt
    this.z += this.vz * dt
    const floor = PHYS.waterY - WATER.poolDepth + 0.05
    if (this.y < floor) {
      this.y = floor
      if (this.vy < 0) this.vy = 0
    }
    const zMax = POOL.halfDepth - 0.4
    if (Math.abs(this.z) > zMax) {
      this.z = Math.sign(this.z) * zMax
      this.vz = 0
    }
    const head = this.y + PHYS.height * 0.9
    if (head < PHYS.waterY) this.submerged = true
    else if (this.submerged && !this.surfaced && this.vy > 0 && this.waterTime > 0.25) {
      this.surfaced = true
      this.events.push({ type: 'resurface', x: this.x, z: this.z })
    }
    this.shadowY = PHYS.waterY
    this.updateTumble(dt)
    this.setAnim('splash')
  }

  private collideHazards(world: World) {
    const a = this.tmpA
    const b = this.tmpB
    const p1 = this.tmpC
    const p2 = this.tmpD
    const r = PHYS.radius
    const t = this.t
    this.capsule(a, b)

    for (const s of world.sweepers) {
      if (Math.abs(this.x - s.x) > s.length + 1) continue
      const base = sweeperAngle(s, t)
      for (let k = 0; k < s.arms; k++) {
        const ang = base + (k * Math.PI * 2) / s.arms
        const ca = Math.cos(ang)
        const sa = Math.sin(ang)
        p1.x = s.x
        p1.y = s.armY
        p1.z = s.z
        p2.x = s.x + ca * s.length
        p2.y = s.armY
        p2.z = s.z + sa * s.length
        const res = segSeg(a, b, p1, p2)
        const rr = r + 0.3
        if (res.dist2 < rr * rr) {
          const sign = Math.sign(s.speed) || 1
          this.knock(-sa * sign, 0.6, ca * sign, 7 + Math.abs(s.speed) * 2.5, 'sweeper')
          return
        }
      }
    }

    for (const pd of world.pendulums) {
      if (Math.abs(this.x - pd.x) > pd.length + 2) continue
      pendulumBall(pd, t, p1)
      const q = closestOnSeg(p1, a, b)
      const dx = q.x - p1.x
      const dy = q.y - p1.y
      const dz = q.z - p1.z
      const rr = pd.r + r
      if (dx * dx + dy * dy + dz * dz < rr * rr) {
        const th = pendulumTheta(pd, t)
        const dth = pd.amp * pd.speed * Math.cos(pd.speed * t + pd.phase)
        const sgn = Math.sign(dth) || 1
        const hx = pd.plane === 'x' ? Math.cos(th) * sgn : Math.sign(dx) * 0.3 || 0.3
        const hz = pd.plane === 'z' ? Math.cos(th) * sgn : 0.8
        this.knock(hx, 0.5, hz, 9, 'pendulum')
        return
      }
    }

    for (const w of world.windmills) {
      if (Math.abs(this.x - w.x) > w.length + 1) continue
      const base = windmillAngle(w, t)
      for (let k = 0; k < w.blades; k++) {
        const ang = base + (k * Math.PI * 2) / w.blades
        p1.x = w.x
        p1.y = w.y
        p1.z = w.z
        p2.x = w.x + Math.cos(ang) * w.length
        p2.y = w.y + Math.sin(ang) * w.length
        p2.z = w.z
        const res = segSeg(a, b, p1, p2)
        const rr = r + 0.2
        if (res.dist2 < rr * rr) {
          const sign = Math.sign(w.speed) || 1
          this.knock(-Math.sin(ang) * sign, Math.cos(ang) * sign, 0.85, 8, 'windmill')
          return
        }
      }
    }

    for (const pu of world.punchers) {
      if (Math.abs(this.x - pu.x) > 2) continue
      const { ext, striking } = puncherExtension(pu, t)
      const tip = pu.zBack + pu.reach * ext
      let hit = false
      if (pu.variant === 'glove') {
        p1.x = pu.x
        p1.y = pu.y
        p1.z = tip
        const q = closestOnSeg(p1, a, b)
        const rr = pu.r + r
        hit = (q.x - p1.x) ** 2 + (q.y - p1.y) ** 2 + (q.z - p1.z) ** 2 < rr * rr
      } else {
        p1.x = p2.x = pu.x
        p1.y = p2.y = pu.y
        p1.z = pu.zBack - 3
        p2.z = tip
        const res = segSeg(a, b, p1, p2)
        const rr = pu.r + r
        hit = res.dist2 < rr * rr
      }
      if (hit) {
        if (striking || ext > 0.85) {
          this.knock(0.15 * this.facing, 0.4, 1, 11, 'puncher')
          return
        }
        // Retracting: just shove the player out of the way.
        this.z = clamp(this.z, tip + pu.r + r, 10)
        this.sideHit = Math.max(this.sideHit, PHYS.stumbleSpeed)
      }
    }
  }

  private updateAnim(dt: number) {
    if (this.inWater) return this.setAnim('splash')
    const speed = Math.abs(this.vx - (this.grounded ? this.groundVx : 0))
    // Cadence locked to ground speed: a stance foot sweeps 2*L*sin(amp) per half cycle.
    if (this.grounded) {
      const amp = gaitAmp(speed / PHYS.runSpeed)
      this.runPhase += dt * ((Math.PI * speed) / (2 * PHYS.legLength * Math.sin(amp)))
    }
    if (this.stun > 0) return this.setAnim('hit')
    if (this.diving) return this.setAnim('dive')
    if (this.stumble > 0) return this.setAnim('stumble')
    if (this.grounded) {
      if (this.ducking) return this.setAnim('duck')
      return this.setAnim(speed > 0.6 ? 'run' : 'idle')
    }
    // Jumps/bounces keep the tuck until the descent gets fast; walking off an edge goes straight to the fall state.
    if (this.jumping && this.vy > -4) return this.setAnim('jump')
    if (this.vy > 0.5) return this.setAnim('jump')
    this.setAnim('fall')
  }
}
