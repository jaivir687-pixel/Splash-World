import type { LevelDef } from './types'

export interface PillarSpot {
  x: number
  h: number
  s: number
}

/** Support pillars under platforms (shared by the renderer and water foam). */
export function pillarSpots(level: LevelDef): PillarSpot[] {
  const out: PillarSpot[] = []
  for (const p of level.platforms) {
    if (p.seesaw) {
      out.push({ x: p.x, h: p.top - p.h - 0.15, s: 0.7 })
      continue
    }
    if (!p.pillars) continue
    const halfRun = (p.w / 2) * Math.cos(p.tilt)
    const xs = p.w > 3.2 ? [p.x - halfRun + 0.6, p.x + halfRun - 0.6] : [p.x]
    if (p.w > 11) xs.push(p.x)
    for (const x of xs) {
      const top = p.top + Math.tan(p.tilt) * (x - p.x) - p.h
      out.push({ x, h: Math.max(0.3, top), s: 0.9 })
    }
  }
  return out
}

/** Every object piercing the water surface as (x, z, radius) for foam rings. */
export function waterPosts(level: LevelDef): [number, number, number][] {
  const out: [number, number, number][] = pillarSpots(level).map((p) => [p.x, 0, p.s * 0.62])
  for (const o of level.obstacles) {
    switch (o.type) {
      case 'ball':
        if (o.y - o.r < 6) out.push([o.x, o.z, 0.36])
        break
      case 'pendulum':
        out.push([o.x, o.z - 4.6, 0.32])
        break
      case 'windmill':
        out.push([o.x, o.z - 2.2, 0.52])
        break
      case 'puncher':
        out.push([o.x, o.zBack - 2.4, 0.42])
        break
      case 'roller':
        out.push([o.x, o.d / 2 + 0.15, 0.2], [o.x, -o.d / 2 - 0.15, 0.2])
        break
      case 'sweeper':
        if (o.baseY < 0.5) out.push([o.x, o.z, 0.47])
        break
    }
  }
  return out
}
