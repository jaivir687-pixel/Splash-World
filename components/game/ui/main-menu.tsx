'use client'

import { Music, Settings2, Volume2, VolumeX } from 'lucide-react'
import { useState } from 'react'
import { levelManager } from '@/lib/game/level-manager'
import { useGameStore } from '@/lib/game/store'
import { GameButton, IconButton } from './game-button'
import { SettingsPanel } from './settings-panel'

export function MainMenu() {
  const [showSettings, setShowSettings] = useState(false)
  const sfx = useGameStore((s) => s.save.settings.sfx)
  const updateSettings = useGameStore((s) => s.updateSettings)

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between bg-gradient-to-b from-ink/40 via-transparent to-ink/60 p-4 sm:p-8">
      <div className="flex w-full justify-end gap-3">
        <IconButton
          aria-label={sfx ? 'Mute sound' : 'Unmute sound'}
          onClick={() => updateSettings({ sfx: !sfx, music: !sfx })}
        >
          {sfx ? <Volume2 className="size-6" /> : <VolumeX className="size-6" />}
        </IconButton>
        <IconButton aria-label="Settings" onClick={() => setShowSettings(true)}>
          <Settings2 className="size-6" />
        </IconButton>
      </div>

      <header className="flex flex-col items-center text-center">
        <p className="font-display text-outline-thin mb-1 text-lg tracking-widest text-accent sm:text-2xl">
          {'THE BIG SPLASH SHOW'}
        </p>
        <h1 className="font-display text-outline animate-bob text-6xl leading-none text-white sm:text-8xl">
          Splash<span className="text-primary">Dash</span>
        </h1>
        <p className="mt-3 max-w-md text-balance text-sm font-extrabold text-white drop-shadow sm:text-base">
          Run, jump, duck and super-bounce across the craziest obstacle course on TV. Fall in, and you&apos;re soaked!
        </p>
      </header>

      <div className="flex flex-col items-center gap-3">
        <GameButton tone="accent" size="lg" onClick={() => levelManager.openLevelSelect()} autoFocus>
          Play
        </GameButton>
        <p className="flex items-center gap-2 text-xs font-bold text-white/80">
          <Music className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Keyboard: A/D or arrows to run, Space to jump, S/Down to duck, P to pause</span>
          <span className="sm:hidden">Best played in landscape</span>
        </p>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}
