'use client'

import { ArrowLeft, Lock, Star } from 'lucide-react'
import { LEVELS } from '@/lib/game/levels'
import { levelManager } from '@/lib/game/level-manager'
import { formatTime } from '@/lib/game/math'
import { useGameStore } from '@/lib/game/store'
import { IconButton } from './game-button'

export function Stars({ n, size = 'size-5' }: { n: number; size?: string }) {
  return (
    <div className="flex gap-0.5" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <Star
          key={i}
          aria-hidden
          className={`${size} stroke-ink stroke-[2.5] ${i < n ? 'fill-accent' : 'fill-white/50'}`}
        />
      ))}
    </div>
  )
}

export function LevelSelect() {
  const save = useGameStore((s) => s.save)

  return (
    <div className="bg-stripes absolute inset-0 flex flex-col overflow-y-auto p-4 sm:p-6">
      <div className="mb-3 flex items-center gap-3">
        <IconButton aria-label="Back to menu" onClick={() => levelManager.menu()}>
          <ArrowLeft className="size-6" />
        </IconButton>
        <h2 className="font-display text-outline text-3xl text-white sm:text-4xl">Choose your round</h2>
      </div>

      <ul className="grid flex-1 grid-cols-1 content-center gap-4 sm:grid-cols-3">
        {LEVELS.map((lv) => {
          const locked = lv.index + 1 > save.unlocked
          const best = save.best[lv.id]
          return (
            <li key={lv.id}>
              <button
                type="button"
                disabled={locked}
                onClick={() => levelManager.select(lv.index)}
                className="btn-game group flex w-full overflow-hidden rounded-3xl bg-panel text-left text-ink disabled:cursor-not-allowed sm:flex-col"
              >
                <div className="relative aspect-[16/10] w-2/5 shrink-0 overflow-hidden sm:w-full">
                  <img
                    src={lv.image || '/placeholder.svg'}
                    alt={`${lv.name} course preview`}
                    className={`size-full object-cover transition-transform group-hover:scale-105 ${locked ? 'grayscale' : ''}`}
                  />
                  <span className="font-display absolute left-2 top-2 rounded-lg border-2 border-ink bg-accent px-2 text-sm uppercase text-accent-foreground">
                    Round {lv.index + 1}
                  </span>
                  {locked && (
                    <div className="absolute inset-0 flex items-center justify-center bg-ink/50">
                      <Lock className="size-10 text-white" aria-label="Locked" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-center gap-1 p-3">
                  <h3 className="font-display text-xl leading-tight sm:text-2xl">{lv.name}</h3>
                  <p className="text-xs font-extrabold uppercase text-muted-foreground">{lv.subtitle}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <Stars n={save.stars[lv.id] ?? 0} />
                    <span className="text-sm font-black tabular-nums">
                      {locked ? 'Qualify to unlock' : best !== undefined ? `Best ${formatTime(best)}` : 'Not played'}
                    </span>
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
