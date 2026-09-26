/** Tunable player physics. Units: meters / seconds. */
export const PHYS = {
  gravity: 26,
  maxFall: 28,
  runSpeed: 7.2,
  duckSpeed: 2.4,
  /** Momentum model: ~0.5 s to full speed, ~0.4 s to stop, quicker when reversing. */
  groundAccel: 16,
  groundDecel: 19,
  turnDecel: 30,
  airAccel: 9,
  airDrag: 2.5,
  jumpVel: 10,
  jumpCutGravity: 18,
  coyoteTime: 0.12,
  jumpBuffer: 0.16,
  superBounceWindow: 0.32,
  bounceVel: 9.2,
  superBounceVel: 13.5,
  diveSpeed: 10.5,
  diveHop: 4.2,
  radius: 0.32,
  height: 1.7,
  duckHeight: 1.0,
  diveHeight: 0.7,
  stepUp: 0.32,
  waterY: 0,
  hitStun: 0.85,
  respawnInvuln: 1.4,
  stumbleTime: 0.45,
  /** Wall / side impacts above this relative speed trigger a stumble. */
  stumbleSpeed: 4,
  /** Visual pivot for body tumbling (approx. centre of mass). */
  comHeight: 0.95,
  /** Leg length used to sync gait cadence with ground speed (no foot sliding). */
  legLength: 0.86,
}

/** Water body: buoyancy balances gravity with shoulders at the surface. */
export const WATER = {
  poolDepth: 1.7,
  buoyancy: 1.22,
  floatDepth: 1.6,
  linearDrag: 0.6,
  submergedDrag: 2.6,
  quadDrag: 0.5,
}

export const TIMING = {
  intro: 3.6,
  countdownStep: 0.8,
  splash: 2.4,
  finishDelay: 2.8,
}

export const POOL = { halfDepth: 7 }
