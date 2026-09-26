export interface V3 {
  x: number
  y: number
  z: number
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z })

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

export const approach = (cur: number, target: number, delta: number) =>
  cur < target ? Math.min(cur + delta, target) : Math.max(cur - delta, target)

/** Frame-rate independent smoothing factor for lerp. */
export const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Deterministic PRNG so decor & contestant times are stable per level. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SegResult {
  dist2: number
  c1: V3
  c2: V3
}

const segOut: SegResult = { dist2: 0, c1: v3(), c2: v3() }

/**
 * Closest points between segments p1-q1 and p2-q2 (Ericson, RTCD 5.1.9).
 * Returns a shared result object - copy values if you need to keep them.
 */
export function segSeg(p1: V3, q1: V3, p2: V3, q2: V3): SegResult {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z
  const a = d1x * d1x + d1y * d1y + d1z * d1z
  const e = d2x * d2x + d2y * d2y + d2z * d2z
  const f = d2x * rx + d2y * ry + d2z * rz
  const EPS = 1e-8
  let s = 0
  let t = 0
  if (a <= EPS && e <= EPS) {
    s = 0
    t = 0
  } else if (a <= EPS) {
    s = 0
    t = clamp(f / e, 0, 1)
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz
    if (e <= EPS) {
      t = 0
      s = clamp(-c / a, 0, 1)
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z
      const denom = a * e - b * b
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = clamp(-c / a, 0, 1)
      } else if (t > 1) {
        t = 1
        s = clamp((b - c) / a, 0, 1)
      }
    }
  }
  segOut.c1.x = p1.x + d1x * s
  segOut.c1.y = p1.y + d1y * s
  segOut.c1.z = p1.z + d1z * s
  segOut.c2.x = p2.x + d2x * t
  segOut.c2.y = p2.y + d2y * t
  segOut.c2.z = p2.z + d2z * t
  const dx = segOut.c1.x - segOut.c2.x
  const dy = segOut.c1.y - segOut.c2.y
  const dz = segOut.c1.z - segOut.c2.z
  segOut.dist2 = dx * dx + dy * dy + dz * dz
  return segOut
}

const ptOut = v3()
/** Closest point on segment a-b to point p (shared result). */
export function closestOnSeg(p: V3, a: V3, b: V3): V3 {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z
  const len2 = abx * abx + aby * aby + abz * abz
  let t = len2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2 : 0
  t = clamp(t, 0, 1)
  ptOut.x = a.x + abx * t
  ptOut.y = a.y + aby * t
  ptOut.z = a.z + abz * t
  return ptOut
}

export function formatTime(seconds: number) {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.floor((s * 100) % 100)
  return `${m}:${sec.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
}
