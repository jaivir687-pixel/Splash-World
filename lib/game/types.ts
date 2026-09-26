export type ThemeId = 'park' | 'desert' | 'studio'
export type PlatformStyle = 'stripe' | 'chevron' | 'start' | 'finish'
export type RoundType = 'qualifier' | 'knockout' | 'final'

/** Sinusoidal offset applied to a platform along one axis. */
export interface Motion {
  axis: 'x' | 'y' | 'z'
  amp: number
  speed: number
  phase: number
}

/** Time-driven tilt around the Z axis (seesaw). */
export interface SeesawMotion {
  maxAngle: number
  speed: number
  phase: number
}

/** Solid box collider. `x`/`top` describe the center of the top face. */
export interface PlatformDef {
  type: 'platform'
  id: string
  x: number
  top: number
  z: number
  w: number
  h: number
  d: number
  tilt: number
  style: PlatformStyle
  pillars: boolean
  motion?: Motion
  seesaw?: SeesawMotion
  slippery?: boolean
}

export interface BallDef {
  type: 'ball'
  id: string
  x: number
  y: number
  z: number
  r: number
  bob?: { amp: number; speed: number; phase: number }
}

/** Arm rotating around a vertical pylon. */
export interface SweeperDef {
  type: 'sweeper'
  id: string
  x: number
  z: number
  baseY: number
  armY: number
  length: number
  speed: number
  phase: number
  arms: number
}

/** Wrecking ball swinging in the X/Y plane or Z/Y plane. */
export interface PendulumDef {
  type: 'pendulum'
  id: string
  x: number
  z: number
  pivotY: number
  length: number
  r: number
  amp: number
  speed: number
  phase: number
  plane: 'x' | 'z'
}

/** Paddles rotating in the X/Y plane over the path. */
export interface WindmillDef {
  type: 'windmill'
  id: string
  x: number
  y: number
  z: number
  blades: number
  length: number
  speed: number
  phase: number
}

/** Piston that shoots out from behind the course along +Z. */
export interface PuncherDef {
  type: 'puncher'
  id: string
  x: number
  y: number
  zBack: number
  reach: number
  r: number
  period: number
  phase: number
  variant: 'glove' | 'log'
}

/** Spinning log (axis along Z) acting as a treadmill. */
export interface RollerDef {
  type: 'roller'
  id: string
  x: number
  y: number
  r: number
  d: number
  spin: number
}

export type ObstacleDef = BallDef | SweeperDef | PendulumDef | WindmillDef | PuncherDef | RollerDef

export interface Section {
  name: string
  start: number
  end: number
  points: number
  hint?: string
}

export interface Checkpoint {
  x: number
  y: number
}

export interface Contestant {
  name: string
  time: number
}

export interface LevelDef {
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
  platforms: PlatformDef[]
  obstacles: ObstacleDef[]
  sections: Section[]
  checkpoints: Checkpoint[]
  start: { x: number; y: number }
  finishX: number
  finishTop: number
  endX: number
  image: string
}
