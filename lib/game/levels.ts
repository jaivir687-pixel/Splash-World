import type {
  Checkpoint,
  Contestant,
  LevelDef,
  Motion,
  ObstacleDef,
  PlatformDef,
  PlatformStyle,
  RoundType,
  Section,
  SeesawMotion,
  ThemeId,
} from './types'

interface PadOptions {
  gap?: number
  top?: number
  style?: PlatformStyle
  d?: number
  h?: number
  motion?: Motion
  seesaw?: SeesawMotion
  slippery?: boolean
}

/**
 * Lays out a course left-to-right. `cursor` tracks the right edge of the
 * last placed element and `top` the current walking height.
 */
class CourseBuilder {
  platforms: PlatformDef[] = []
  obstacles: ObstacleDef[] = []
  sections: Section[] = []
  checkpoints: Checkpoint[] = []
  cursor = 0
  top = 2.2
  private n = 0

  uid(prefix: string) {
    this.n += 1
    return `${prefix}${this.n}`
  }

  pad(w: number, o: PadOptions = {}): PlatformDef {
    const gap = o.gap ?? 0
    const top = o.top ?? this.top
    const x = this.cursor + gap + w / 2
    const def: PlatformDef = {
      type: 'platform',
      id: this.uid('p'),
      x,
      top,
      z: 0,
      w,
      h: o.h ?? 0.9,
      d: o.d ?? 2.8,
      tilt: 0,
      style: o.style ?? 'stripe',
      pillars: !(o.motion || o.seesaw),
      motion: o.motion,
      seesaw: o.seesaw,
      slippery: o.slippery ?? !!o.seesaw,
    }
    this.platforms.push(def)
    this.cursor = x + w / 2
    this.top = top
    return def
  }

  ramp(len: number, rise: number, gap = 0): PlatformDef {
    const w = Math.hypot(len, rise)
    const def: PlatformDef = {
      type: 'platform',
      id: this.uid('r'),
      x: this.cursor + gap + len / 2,
      top: this.top + rise / 2,
      z: 0,
      w,
      h: 0.9,
      d: 2.8,
      tilt: Math.atan2(rise, len),
      style: 'chevron',
      pillars: true,
    }
    this.platforms.push(def)
    this.cursor += gap + len
    this.top += rise
    return def
  }

  checkpoint(p: PlatformDef) {
    this.checkpoints.push({ x: p.x, y: p.top })
  }

  /** Safe landing pad that is also a respawn checkpoint. */
  safe(w = 4.5, gap = 1.8, top?: number) {
    const p = this.pad(w, { gap, top })
    this.checkpoint(p)
    return p
  }

  section(name: string, points: number, hint: string | undefined, build: () => void) {
    const start = this.cursor
    build()
    this.sections.push({ name, start, end: this.cursor, points, hint })
  }

  balls(count: number, spacing: number, r: number, bob = 0) {
    const firstX = this.cursor + 2.9
    for (let i = 0; i < count; i++) {
      this.obstacles.push({
        type: 'ball',
        id: this.uid('b'),
        x: firstX + i * spacing,
        y: this.top - 0.25,
        z: 0,
        r,
        bob: bob > 0 ? { amp: bob, speed: 1.6 + i * 0.25, phase: i * 1.7 } : undefined,
      })
    }
    this.cursor = firstX + (count - 1) * spacing + r * 0.7
  }

  sweeper(p: PlatformDef, armHeight: number, speed: number, arms = 1, phase = 0, length = 7.2) {
    this.obstacles.push({
      type: 'sweeper',
      id: this.uid('s'),
      x: p.x,
      z: -3.4,
      baseY: 0,
      armY: p.top + armHeight,
      length,
      speed,
      phase,
      arms,
    })
  }

  pendulum(x: number, top: number, plane: 'x' | 'z', speed: number, phase: number, amp = 0.95) {
    this.obstacles.push({
      type: 'pendulum',
      id: this.uid('w'),
      x,
      z: 0,
      pivotY: top + 5.4,
      length: 4.4,
      r: 0.72,
      amp,
      speed,
      phase,
      plane,
    })
  }

  windmill(x: number, top: number, speed: number, phase = 0) {
    this.obstacles.push({
      type: 'windmill',
      id: this.uid('m'),
      x,
      y: top + 3.15,
      z: 0,
      blades: 4,
      length: 2.8,
      speed,
      phase,
    })
  }

  puncher(x: number, top: number, period: number, phase: number, variant: 'glove' | 'log' = 'glove') {
    this.obstacles.push({
      type: 'puncher',
      id: this.uid('g'),
      x,
      y: top + (variant === 'log' ? 0.55 : 1.0),
      zBack: -2.4,
      reach: 3.0,
      r: variant === 'log' ? 0.42 : 0.6,
      period,
      phase,
      variant,
    })
  }

  rollers(count: number, spacing: number, r: number, spin: number) {
    const firstX = this.cursor + 1.9
    for (let i = 0; i < count; i++) {
      this.obstacles.push({
        type: 'roller',
        id: this.uid('l'),
        x: firstX + i * spacing,
        y: this.top - r + 0.12,
        r,
        d: 2.8,
        spin,
      })
    }
    this.cursor = firstX + (count - 1) * spacing + r
  }
}

interface Meta {
  id: string
  index: number
  name: string
  subtitle: string
  round: RoundType
  theme: ThemeId
  lives: number | null
  targetTime: number
  qualifySpots: number
  contestants: Contestant[]
  image: string
}

function finalize(b: CourseBuilder, meta: Meta): LevelDef {
  b.ramp(6, 1.6)
  const finish = b.pad(10, { style: 'finish' })
  return {
    ...meta,
    platforms: b.platforms,
    obstacles: b.obstacles,
    sections: b.sections,
    checkpoints: b.checkpoints,
    start: { x: 2.5, y: b.platforms[0].top },
    finishX: finish.x - finish.w / 2 + 2.2,
    finishTop: finish.top,
    endX: b.cursor,
  }
}

function buildQualifier(): LevelDef {
  const b = new CourseBuilder()
  const start = b.pad(9, { style: 'start' })
  b.checkpoints.push({ x: 2.5, y: start.top })

  b.section('Stepping Stones', 10, 'Tap JUMP to leap the gaps', () => {
    b.pad(2.4, { gap: 2.0 })
    b.pad(2.4, { gap: 2.2, top: 2.7 })
    b.pad(2.4, { gap: 2.2, top: 3.2 })
    b.pad(2.4, { gap: 2.2, top: 2.6 })
  })
  b.safe(4.5, 2.0, 2.2)

  b.section('The Sweeper', 15, 'Jump over the spinning arm!', () => {
    const p = b.pad(13, { gap: 1.4 })
    b.sweeper(p, 0.5, 1.45)
  })
  b.safe(4.5, 1.8)

  b.section('Big Balls', 20, 'Tap JUMP right before landing to SUPER BOUNCE', () => {
    b.balls(4, 3.7, 1.25)
  })
  b.safe(5, 2.2)

  b.section('Wrecking Balls', 15, 'Wait for a gap, then run!', () => {
    const p = b.pad(12, { gap: 1.4 })
    b.pendulum(p.x - 3, p.top, 'z', 2.0, 0)
    b.pendulum(p.x + 3, p.top, 'z', 2.0, Math.PI)
  })
  b.safe(3.5, 1.8)

  b.section('Seesaw', 10, 'Keep moving - it is slippery!', () => {
    b.pad(7, { gap: 1.2, seesaw: { maxAngle: 0.26, speed: 1.3, phase: 0 } })
  })
  b.safe(4, 1.2)

  b.section('Duck Sweeper', 15, 'Hold DOWN to duck under the arm', () => {
    const p = b.pad(13, { gap: 1.2 })
    b.sweeper(p, 1.55, 1.25, 1, 1.2)
  })
  b.safe(4, 1.6)

  b.section('Punch Wall', 15, 'Time your run between the gloves', () => {
    const p = b.pad(14, { gap: 1.4 })
    b.puncher(p.x - 4.5, p.top, 2.4, 0)
    b.puncher(p.x, p.top, 2.4, 0.33)
    b.puncher(p.x + 4.5, p.top, 2.4, 0.66)
  })

  return finalize(b, {
    id: 'qualifier',
    index: 0,
    name: 'Sunny Splash',
    subtitle: 'Qualifier',
    round: 'qualifier',
    theme: 'park',
    lives: null,
    targetTime: 55,
    qualifySpots: 3,
    contestants: [
      { name: 'Ben', time: 44.2 },
      { name: 'Rosa', time: 56.8 },
      { name: 'Otto', time: 68.5 },
    ],
    image: '/images/level-park.png',
  })
}

function buildKnockout(): LevelDef {
  const b = new CourseBuilder()
  b.top = 2.4
  const start = b.pad(9, { style: 'start' })
  b.checkpoints.push({ x: 2.5, y: start.top })

  b.section('Slider Pads', 15, 'Jump when the pad comes to you', () => {
    b.pad(3, { gap: 2.2, motion: { axis: 'x', amp: 1.1, speed: 1.4, phase: 0 } })
    b.cursor += 1.1
    b.pad(3, { gap: 1.3, motion: { axis: 'y', amp: 0.8, speed: 1.6, phase: 1 } })
    b.pad(3, { gap: 2.3, motion: { axis: 'x', amp: 1.1, speed: 1.4, phase: Math.PI } })
    b.cursor += 1.1
  })
  b.safe(4.5, 1.6)

  b.section('Windmill', 15, 'Slip through between the paddles', () => {
    const p = b.pad(12, { gap: 1.4 })
    b.windmill(p.x, p.top, 1.15)
  })
  b.safe(4.5, 1.6)

  b.section('Rolling Logs', 15, 'Keep running - the logs push you back!', () => {
    b.rollers(3, 2.3, 0.75, 2.2)
  })
  b.safe(4.5, 1.9)

  b.section('Bouncy Balls', 20, 'The balls bob - watch your timing', () => {
    b.balls(4, 3.7, 1.2, 0.35)
  })
  b.safe(5, 2.3)

  b.section('Swinging Balls', 15, 'Run under them as they swing away', () => {
    const p = b.pad(13, { gap: 1.4 })
    b.pendulum(p.x - 4, p.top, 'x', 2.1, 0, 0.95)
    b.pendulum(p.x, p.top, 'x', 2.1, 2.1, 0.95)
    b.pendulum(p.x + 4, p.top, 'x', 2.1, 4.2, 0.95)
  })
  b.safe(4, 1.6)

  b.section('Log Punchers', 15, 'Jump the logs or wait them out', () => {
    const p = b.pad(13, { gap: 1.4 })
    b.puncher(p.x - 4, p.top, 2.0, 0, 'log')
    b.puncher(p.x, p.top, 2.0, 0.4, 'log')
    b.puncher(p.x + 4, p.top, 2.0, 0.75, 'log')
  })
  b.safe(3.5, 1.6)

  b.section('Double Seesaw', 15, undefined, () => {
    b.pad(6, { gap: 1.2, seesaw: { maxAngle: 0.28, speed: 1.4, phase: 0 } })
    b.pad(2.4, { gap: 1.1 })
    b.pad(6, { gap: 1.1, seesaw: { maxAngle: 0.28, speed: 1.4, phase: Math.PI } })
  })
  b.safe(4, 1.2)

  return finalize(b, {
    id: 'knockout',
    index: 1,
    name: 'Canyon Knockout',
    subtitle: 'Knockout - 5 attempts',
    round: 'knockout',
    theme: 'desert',
    lives: 5,
    targetTime: 75,
    qualifySpots: 3,
    contestants: [
      { name: 'Kai', time: 62.4 },
      { name: 'Marta', time: 77.1 },
      { name: 'Pip', time: 91.6 },
    ],
    image: '/images/level-desert.png',
  })
}

function buildFinal(): LevelDef {
  const b = new CourseBuilder()
  b.top = 2.4
  const start = b.pad(9, { style: 'start' })
  b.checkpoints.push({ x: 2.5, y: start.top })

  b.section('Twin Sweeper', 20, 'Two arms now - stay sharp!', () => {
    const p = b.pad(14, { gap: 1.4 })
    b.sweeper(p, 0.5, 1.3, 2, 0, 7.4)
  })
  b.safe(4.5, 1.8)

  b.section('Giant Balls', 25, 'Chain SUPER BOUNCES to fly across', () => {
    b.balls(5, 3.9, 1.3)
  })
  b.safe(5, 2.3)

  b.section('Pendulum Alley', 20, undefined, () => {
    const p = b.pad(15, { gap: 1.4 })
    b.pendulum(p.x - 4.5, p.top, 'z', 2.2, 0)
    b.pendulum(p.x, p.top, 'z', 2.2, 2.1)
    b.pendulum(p.x + 4.5, p.top, 'z', 2.2, 4.2)
  })
  b.safe(4, 1.6)

  b.section('Windmills', 20, undefined, () => {
    const p = b.pad(16, { gap: 1.4 })
    b.windmill(p.x - 3.8, p.top, 1.25)
    b.windmill(p.x + 3.8, p.top, -1.35, 0.4)
  })
  b.safe(4, 1.6)

  b.section('Elevators & Logs', 20, undefined, () => {
    b.pad(3, { gap: 1.8, motion: { axis: 'y', amp: 1.0, speed: 1.7, phase: 0 } })
    b.pad(3, { gap: 1.8, motion: { axis: 'y', amp: 1.0, speed: 1.7, phase: 2 } })
    b.rollers(2, 2.3, 0.75, 2.6)
  })
  b.safe(4.5, 1.9)

  b.section('Glove Gauntlet', 20, undefined, () => {
    const p = b.pad(16, { gap: 1.4 })
    b.puncher(p.x - 5.4, p.top, 1.9, 0)
    b.puncher(p.x - 1.8, p.top, 1.9, 0.25)
    b.puncher(p.x + 1.8, p.top, 1.9, 0.5)
    b.puncher(p.x + 5.4, p.top, 1.9, 0.75)
  })
  b.safe(4, 1.6)

  b.section('Duck & Run', 20, 'Hold DOWN or DIVE under the arms', () => {
    const p = b.pad(13, { gap: 1.2 })
    b.sweeper(p, 1.55, 1.5, 2, 0.6)
  })
  b.safe(4, 1.6)

  return finalize(b, {
    id: 'final',
    index: 2,
    name: 'Neon Final Zone',
    subtitle: 'The Final - beat everyone',
    round: 'final',
    theme: 'studio',
    lives: null,
    targetTime: 90,
    qualifySpots: 1,
    contestants: [
      { name: 'Rupert', time: 88.4 },
      { name: 'Ed', time: 97.2 },
      { name: 'Lena', time: 108.9 },
    ],
    image: '/images/level-studio.png',
  })
}

export const LEVELS: LevelDef[] = [buildQualifier(), buildKnockout(), buildFinal()]
