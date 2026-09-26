'use client'

import { ArrowRight, Home, RotateCcw } from 'lucide-react'
import { LEVELS } from '@/lib/game/levels'
import { levelManager } from '@/lib/game/level-manager'
import { formatTime } from '@/lib/game/math'
import { useGameStore } from '@/lib/game/store'
import { GameButton } from './game-button'
import { Stars } from './level-select'

export function Results() {
  const r = useGameStore((s) => s.result)
  if (!r) return null
  const lv = LEVELS[r.levelIndex]
  const champion = r.passed && r.isLast
  const title = champion ? 'Champion!' : r.passed ? 'Qualified!' : r.reason === 'lives' ? 'Eliminated!' : 'Too Slow!'

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-ink/55 p-3">
      <div className="panel-game animate-pop-in flex w-full max-w-2xl flex-col gap-3 rounded-3xl bg-panel p-4 text-ink sm:flex-row sm:gap-5 sm:p-5">
        <div className="flex flex-1 flex-col items-center gap-2 text-center">
          <p className="font-display text-sm uppercase tracking-widest text-muted-foreground">{lv.name}</p>
          <h2 className={`font-display text-outline-thin text-5xl ${r.passed ? 'text-accent' : 'text-primary'}`}>{title}</h2>
          <Stars n={r.stars} size="size-9" />
          <dl className="grid w-full grid-cols-2 gap-x-4 gap-y-1 text-left text-sm font-extrabold">
            <dt className="text-muted-foreground">Time</dt>
            <dd className="text-right tabular-nums">
              {r.reason === 'finished' ? formatTime(r.time) : '--'}
              {r.newBest && <span className="ml-1 rounded bg-good px-1 text-xs text-white">BEST</span>}
            </dd>
            <dt className="text-muted-foreground">Obstacle points</dt>
            <dd className="text-right tabular-nums">{r.score}</dd>
            <dt className="text-muted-foreground">Time bonus</dt>
            <dd className="text-right tabular-nums">{r.timeBonus}</dd>
            <dt className="text-muted-foreground">Wipeouts</dt>
            <dd className="text-right tabular-nums">{r.wipeouts}</dd>
            <dt className="font-display border-t-2 border-ink/20 pt-1 text-lg">Total</dt>
            <dd className="font-display border-t-2 border-ink/20 pt-1 text-right text-lg tabular-nums">{r.total}</dd>
          </dl>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <div>
            <p className="font-display mb-1 text-sm uppercase text-muted-foreground">
              Leaderboard - top {lv.qualifySpots} go through
            </p>
            <ol className="flex flex-col gap-1">
              {r.board.map((row, i) => (
                <li
                  key={row.name}
                  className={`flex items-center gap-2 rounded-xl border-2 px-2 py-1 text-sm font-extrabold ${
                    row.you ? 'border-ink bg-accent' : 'border-transparent bg-ink/5'
                  } ${row.out ? 'opacity-60' : ''}`}
                >
                  <span className="font-display w-5 text-center">{i + 1}</span>
                  <span className="flex-1">{row.name}</span>
                  <span className="tabular-nums">{row.time === null ? 'DNF' : formatTime(row.time)}</span>
                  <span className={`w-10 text-right text-[10px] uppercase ${row.out ? 'text-primary' : 'text-good'}`}>
                    {row.out ? 'Out' : 'Thru'}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            {r.passed && !r.isLast ? (
              <GameButton tone="good" className="flex-1" onClick={() => levelManager.next()} autoFocus>
                Next round <ArrowRight className="size-5" aria-hidden />
              </GameButton>
            ) : (
              <GameButton tone="accent" className="flex-1" onClick={() => levelManager.retry()} autoFocus>
                <RotateCcw className="size-5" aria-hidden /> Try again
              </GameButton>
            )}
            {r.passed && !r.isLast && (
              <GameButton tone="sky" size="md" onClick={() => levelManager.retry()} aria-label="Replay round">
                <RotateCcw className="size-5" aria-hidden />
              </GameButton>
            )}
            <GameButton tone="white" onClick={() => levelManager.menu()} aria-label="Main menu">
              <Home className="size-5" aria-hidden />
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  )
}
