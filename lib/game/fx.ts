/**
 * Tiny ring-buffer event queue consumed by pooled particle systems in the
 * renderer. Avoids allocating per-effect objects during gameplay.
 */
export type FxKind = 'splash' | 'hit' | 'dust' | 'confetti' | 'bounce'

export interface FxEvent {
  kind: FxKind
  x: number
  y: number
  z: number
  power: number
  seq: number
}

const SIZE = 32
const ring: FxEvent[] = Array.from({ length: SIZE }, () => ({ kind: 'dust', x: 0, y: 0, z: 0, power: 0, seq: -1 }))
let seq = 0

export function emitFx(kind: FxKind, x: number, y: number, z: number, power = 1) {
  const e = ring[seq % SIZE]
  e.kind = kind
  e.x = x
  e.y = y
  e.z = z
  e.power = power
  e.seq = seq
  seq++
}

/** Iterates events newer than `since`, returns the new cursor. */
export function readFx(since: number, cb: (e: FxEvent) => void) {
  const start = Math.max(since, seq - SIZE)
  for (let s = start; s < seq; s++) cb(ring[s % SIZE])
  return seq
}

export const fxCursor = () => seq
