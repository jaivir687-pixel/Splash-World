'use client'

import { Home, Play, RotateCcw, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { levelManager } from '@/lib/game/level-manager'
import { GameButton } from './game-button'
import { SettingsPanel } from './settings-panel'

export function PauseMenu() {
  const [settings, setSettings] = useState(false)
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/60 p-4" role="dialog" aria-modal aria-label="Paused">
      <div className="panel-game animate-pop-in flex w-full max-w-xs flex-col gap-3 rounded-3xl bg-panel p-5">
        <h2 className="font-display text-outline-thin text-center text-4xl text-accent">Paused</h2>
        <GameButton tone="good" onClick={() => levelManager.pause(false)} autoFocus>
          <Play className="size-5 fill-current" aria-hidden /> Resume
        </GameButton>
        <GameButton
          tone="sky"
          onClick={() => {
            levelManager.pause(false)
            levelManager.retry()
          }}
        >
          <RotateCcw className="size-5" aria-hidden /> Restart
        </GameButton>
        <GameButton tone="white" onClick={() => setSettings(true)}>
          <Settings2 className="size-5" aria-hidden /> Settings
        </GameButton>
        <GameButton
          tone="primary"
          onClick={() => {
            levelManager.pause(false)
            levelManager.menu()
          }}
        >
          <Home className="size-5" aria-hidden /> Quit
        </GameButton>
      </div>
      {settings && <SettingsPanel onClose={() => setSettings(false)} />}
    </div>
  )
}
