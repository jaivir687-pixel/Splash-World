'use client'

import { ArrowLeft, Flag, Heart, Timer, Trophy } from 'lucide-react'
import { LEVELS } from '@/lib/game/levels'
import { levelManager } from '@/lib/game/level-manager'
import { formatTime } from '@/lib/game/math'
import { useGameStore } from '@/lib/game/store'
import { GameButton, IconButton } from './game-button'

export function Briefing() {
  const idx = useGameStore((s) => s.levelIndex)
  const lv = LEVELS[idx]

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-ink/40 p-4">
      <div className="panel-game animate-pop-in relative flex w-full max-w-2xl flex-col gap-4 rounded-3xl bg-panel p-4 text-ink sm:flex-row sm:p-5">
        <IconButton aria-label="Back to rounds" className="absolute -left-3 -top-3" onClick={() => levelManager.openLevelSelect()}>
          <ArrowLeft className="size-6" />
        </IconButton>
        <img
          src={lv.image || '/placeholder.svg'}
          alt={`${lv.name} course preview`}
          className="hidden aspect-square w-52 shrink-0 rounded-2xl border-4 border-ink object-cover sm:block"
        />
        <div className="flex flex-1 flex-col gap-3">
          <div>
            <p className="font-display text-sm uppercase tracking-widest text-primary">
              Round {lv.index + 1} - {lv.subtitle}
            </p>
            <h2 className="font-display text-3xl leading-tight sm:text-4xl">{lv.name}</h2>
          </div>
          <ul className="grid grid-cols-3 gap-2 text-center">
            <li className="rounded-xl bg-sky/15 p-2">
              <Timer className="mx-auto size-5 text-sky" aria-hidden />
              <p className="text-[10px] font-black uppercase text-muted-foreground">Target</p>
              <p className="font-display text-lg tabular-nums">{formatTime(lv.targetTime)}</p>
            </li>
            <li className="rounded-xl bg-primary/10 p-2">
              <Heart className="mx-auto size-5 text-primary" aria-hidden />
              <p className="text-[10px] font-black uppercase text-muted-foreground">Attempts</p>
              <p className="font-display text-lg">{lv.lives ?? 'Unlimited'}</p>
            </li>
            <li className="rounded-xl bg-accent/25 p-2">
              <Trophy className="mx-auto size-5 text-accent-foreground" aria-hidden />
              <p className="text-[10px] font-black uppercase text-muted-foreground">Qualify</p>
              <p className="font-display text-lg">Top {lv.qualifySpots}</p>
            </li>
          </ul>
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-black uppercase text-muted-foreground">
              <Flag className="size-3.5" aria-hidden /> Obstacles
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {lv.sections.map((s) => (
                <li key={s.name} className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-xs font-extrabold">
                  {s.name}
                </li>
              ))}
            </ul>
          </div>
          <GameButton tone="good" size="lg" className="mt-1 w-full" onClick={() => levelManager.begin()} autoFocus>
            Go!
          </GameButton>
        </div>
      </div>
    </div>
  )
}
