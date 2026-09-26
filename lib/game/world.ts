import type {
  BallDef,
  LevelDef,
  PendulumDef,
  PlatformDef,
  PuncherDef,
  RollerDef,
  SweeperDef,
  WindmillDef,
} from './types'
import type { V3 } from './math'

/**
 * ObstacleController: deterministic, time-based kinematics shared by the
 * physics (collisions) and the renderer (visuals). Keeping both on the same
 * pure functions guarantees what you see is what you collide with.
 */

export interface PlatformState {
  x: number
  top: number
  tilt: number
  vx: number
  vy: number
  omega: number
}

export function samplePlatform(p: PlatformDef, t: number, out: PlatformState) {
  out.x = p.x
  out.top = p.top
  out.tilt = p.tilt
  out.vx = 0
  out.vy = 0
  out.omega = 0
  if (p.motion) {
    const m = p.motion
    const a = m.speed * t + m.phase
    const off = m.amp * Math.sin(a)
    const vel = m.amp * m.speed * Math.cos(a)
    if (m.axis === 'x') {
      out.x += off
      out.vx = vel
    } else if (m.axis === 'y') {
      out.top += off
      out.vy = vel
    }
  }
  if (p.seesaw) {
    const s = p.seesaw
    const a = s.speed * t + s.phase
    out.tilt = s.maxAngle * Math.sin(a)
    out.omega = s.maxAngle * s.speed * Math.cos(a)
  }
  return out
}

export const sweeperAngle = (s: SweeperDef, t: number) => s.phase + s.speed * t

export function pendulumTheta(p: PendulumDef, t: number) {
  return p.amp * Math.sin(p.speed * t + p.phase)
}

export function pendulumBall(p: PendulumDef, t: number, out: V3) {
  const th = pendulumTheta(p, t)
  const s = Math.sin(th) * p.length
  out.y = p.pivotY - Math.cos(th) * p.length
  if (p.plane === 'x') {
    out.x = p.x + s
    out.z = p.z
  } else {
    out.x = p.x
    out.z = p.z + s
  }
  return out
}

export const windmillAngle = (w: WindmillDef, t: number) => w.phase + w.speed * t

/** 0 = retracted, 1 = fully extended. Also reports whether it is actively striking. */
export function puncherExtension(p: PuncherDef, t: number) {
  const c = (((t / p.period + p.phase) % 1) + 1) % 1
  if (c < 0.5) return { ext: 0, striking: false, warn: c > 0.36 ? (c - 0.36) / 0.14 : 0 }
  if (c < 0.6) return { ext: (c - 0.5) / 0.1, striking: true, warn: 0 }
  if (c < 0.76) return { ext: 1, striking: false, warn: 0 }
  return { ext: 1 - (c - 0.76) / 0.24, striking: false, warn: 0 }
}

export const rollerAngle = (r: RollerDef, t: number) => r.spin * t

export function ballY(b: BallDef, t: number) {
  return b.bob ? b.y + b.bob.amp * Math.sin(b.bob.speed * t + b.bob.phase) : b.y
}

/** Per-level runtime container with pre-split obstacle arrays. */
export class World {
  level: LevelDef
  ps: PlatformState[]
  balls: BallDef[]
  sweepers: SweeperDef[]
  pendulums: PendulumDef[]
  windmills: WindmillDef[]
  punchers: PuncherDef[]
  rollers: RollerDef[]
  /** Time of the last impact per ball, used for squash animation. */
  ballHit: number[]

  constructor(level: LevelDef) {
    this.level = level
    this.ps = level.platforms.map(() => ({ x: 0, top: 0, tilt: 0, vx: 0, vy: 0, omega: 0 }))
    this.balls = level.obstacles.filter((o): o is BallDef => o.type === 'ball')
    this.sweepers = level.obstacles.filter((o): o is SweeperDef => o.type === 'sweeper')
    this.pendulums = level.obstacles.filter((o): o is PendulumDef => o.type === 'pendulum')
    this.windmills = level.obstacles.filter((o): o is WindmillDef => o.type === 'windmill')
    this.punchers = level.obstacles.filter((o): o is PuncherDef => o.type === 'puncher')
    this.rollers = level.obstacles.filter((o): o is RollerDef => o.type === 'roller')
    this.ballHit = this.balls.map(() => -10)
    this.update(0)
  }

  update(t: number) {
    const pl = this.level.platforms
    for (let i = 0; i < pl.length; i++) samplePlatform(pl[i], t, this.ps[i])
  }

  /** Highest walkable surface under (x,z) below height y. Used for the blob shadow. */
  surfaceBelow(x: number, y: number, z: number) {
    let best = 0
    const pl = this.level.platforms
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i]
      if (Math.abs(z - p.z) > p.d / 2) continue
      const s = this.ps[i]
      const u = x - s.x
      if (Math.abs(u) > (p.w / 2) * Math.cos(s.tilt)) continue
      const top = s.top + Math.tan(s.tilt) * u
      if (top <= y + 0.05 && top > best) best = top
    }
    for (const r of this.rollers) {
      if (Math.abs(x - r.x) < r.r && r.y + r.r <= y + 0.05) best = Math.max(best, r.y + r.r)
    }
    return best
  }
}
