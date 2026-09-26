'use client'

import { Heart, Pause } from 'lucide-react'
import { engine } from '@/lib/game/engine'
import { LEVELS } from '@/lib/game/levels'
import { levelManager } from '@/lib/game/level-manager'
import { formatTime } from '@/lib/game/math'
import { useGameStore } from '@/lib/game/store'
import { IconButton } from './game-button'

function ProgressBar({ progress }: { progress: number }) {
  const idx = useGameStore((s) => s.levelIndex)
  const lv = LEVELS[idx]
  const span = lv.finishX - lv.start.x
  return (
    <div
      className="relative h-4 w-full max-w-md rounded-full border-3 border-ink bg-white/85"
      role="progressbar"
      aria-label="Course progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div className="h-full rounded-full bg-sky transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
      {lv.checkpoints.slice(1).map((c, i) => (
        <span
          key={i}
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
          style={{ left: `${((c.x - lv.start.x) / span) * 100}%` }}
          aria-hidden
        />
      ))}
      <span
        className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-3 border-ink bg-primary"
        style={{ left: `${progress * 100}%` }}
        aria-hidden
      />
      <span className="font-display text-outline-thin absolute -right-1 top-1/2 -translate-y-1/2 translate-x-full pl-1 text-sm text-accent">
        {'FINISH'}
      </span>
    </div>
  )
}

function Banner() {
  const banner = useGameStore((s) => s.banner)
  if (!banner) return null
  return (
    <div key={banner.id} className="animate-banner pointer-events-none absolute inset-x-0 top-24 flex justify-center">
      <div className="flex flex-col items-center rounded-2xl border-4 border-ink bg-accent px-6 py-1.5 shadow-[0_5px_0_var(--ink)]">
        <p className="font-display text-2xl uppercase leading-tight text-accent-foreground sm:text-3xl">{banner.title}</p>
        {banner.hint && <p className="text-xs font-black uppercase text-accent-foreground/80">{banner.hint}</p>}
      </div>
    </div>
  )
}

function Popups() {
  const popups = useGameStore((s) => s.popups)
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-1" aria-live="polite">
      {popups.map((p) => (
        <p
          key={p.id}
          className={`font-display text-outline animate-rise-fade text-3xl sm:text-4xl ${
            p.tone === 'good' ? 'text-accent' : p.tone === 'bad' ? 'text-primary' : 'text-white'
          }`}
        >
          {p.text}
        </p>
      ))}
    </div>
  )
}

function Countdown() {
  const c = useGameStore((s) => s.countdown)
  if (!c) return null
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-live="assertive">
      <p
        key={c}
        className={`font-display text-outline animate-pop-in text-[8rem] leading-none sm:text-[11rem] ${c === 'GO!' ? 'text-good' : 'text-accent'}`}
      >
        {c}
      </p>
    </div>
  )
}

function WipeoutFlash() {
  const n = useGameStore((s) => s.wipeoutFlash)
  const phase = useGameStore((s) => s.phase)
  if (!n || (phase !== 'splash' && phase !== 'failed')) return null
  return (
    <div key={n} className="animate-wipe pointer-events-none absolute inset-0 flex items-center justify-center bg-sky/25">
      <p className="font-display text-outline animate-pop-in -rotate-6 text-7xl text-white sm:text-9xl">
        {phase === 'failed' ? 'ELIMINATED!' : 'WIPEOUT!'}
      </p>
    </div>
  )
}

export function Hud() {
  const hud = useGameStore((s) => s.hud)
  const phase = useGameStore((s) => s.phase)
  const idx = useGameStore((s) => s.levelIndex)
  const lv = LEVELS[idx]
  const intro = phase === 'intro'

  return (
    <div className="pointer-events-none absolute inset-0 z-20" style={{ padding: 'env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)' }}>
      <div className="flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-1">
          <div className="rounded-2xl border-3 border-ink bg-ink/70 px-3 py-1">
            <p className="text-[10px] font-black uppercase leading-none text-white/70">Time</p>
            <p className="font-display text-2xl leading-tight tabular-nums text-white sm:text-3xl">{formatTime(hud.time)}</p>
          </div>
          {hud.lives !== null && (
            <div className="flex gap-0.5" aria-label={`${hud.lives} attempts left`}>
              {Array.from({ length: lv.lives ?? 0 }, (_, i) => (
                <Heart key={i} aria-hidden className={`size-5 stroke-ink stroke-[2.5] ${i < hud.lives! ? 'fill-primary' : 'fill-white/40'}`} />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center gap-1 pt-1">
          <p className="font-display text-outline-thin text-lg leading-none text-white">{lv.name}</p>
          <ProgressBar progress={hud.progress} />
        </div>

        <div className="flex items-start gap-2">
          <div className="rounded-2xl border-3 border-ink bg-accent px-3 py-1 text-right">
            <p className="text-[10px] font-black uppercase leading-none text-accent-foreground/70">Score</p>
            <p className="font-display text-2xl leading-tight tabular-nums text-accent-foreground sm:text-3xl">{hud.score}</p>
          </div>
          <IconButton aria-label="Pause" className="pointer-events-auto" onClick={() => levelManager.pause(true)}>
            <Pause className="size-6 fill-current" />
          </IconButton>
        </div>
      </div>

      {intro && (
        <div className="absolute inset-x-0 bottom-6 flex justify-center">
          <button
            type="button"
            className="font-display pointer-events-auto rounded-full border-3 border-ink bg-white/85 px-4 py-1 text-sm uppercase text-ink"
            onClick={() => engine.skipIntro()}
          >
            Skip intro
          </button>
        </div>
      )}

      <Banner />
      <Popups />
      <Countdown />
      <WipeoutFlash />
    </div>
  )
}
