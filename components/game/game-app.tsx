'use client'

import { useEffect, useState } from 'react'
import { audio } from '@/lib/game/audio'
import { engine } from '@/lib/game/engine'
import { input } from '@/lib/game/input'
import { levelManager } from '@/lib/game/level-manager'
import { loadSave, writeSave } from '@/lib/game/save'
import { useGameStore } from '@/lib/game/store'
import { GameCanvas } from './scene/game-canvas'
import { Briefing } from './ui/briefing'
import { Hud } from './ui/hud'
import { LevelSelect } from './ui/level-select'
import { MainMenu } from './ui/main-menu'
import { PauseMenu } from './ui/pause-menu'
import { Results } from './ui/results'
import { TouchControls } from './ui/touch-controls'

function useTouchDevice() {
  const [touch, setTouch] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const on = () => setTouch(mq.matches || navigator.maxTouchPoints > 0)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return touch
}

/** UIManager: boots systems, persists settings and routes screens/overlays. */
export function GameApp() {
  const screen = useGameStore((s) => s.screen)
  const paused = useGameStore((s) => s.paused)
  const phase = useGameStore((s) => s.phase)
  const hydrated = useGameStore((s) => s.hydrated)
  const settings = useGameStore((s) => s.save.settings)
  const touch = useTouchDevice()

  useEffect(() => {
    useGameStore.getState().setSave(loadSave())
    engine.load(0)
    input.attach()
    input.onPause = () => levelManager.togglePause()
    input.onRestart = () => {
      if (useGameStore.getState().screen === 'playing') levelManager.retry()
    }
    const onHide = () => {
      if (document.hidden && useGameStore.getState().screen === 'playing') levelManager.pause(true)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      input.detach()
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])

  useEffect(() => {
    audio.setSfx(settings.sfx)
    audio.setMusic(settings.music)
    if (hydrated) writeSave(useGameStore.getState().save)
  }, [settings, hydrated])

  const showTouch =
    screen === 'playing' && !paused && (settings.touchControls === 'on' || (settings.touchControls === 'auto' && touch))
  const controlsActive = phase === 'running' || phase === 'countdown'

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      <GameCanvas />
      <h1 className="sr-only">Splash Dash - 3D obstacle course</h1>

      {screen === 'menu' && <MainMenu />}
      {screen === 'levels' && <LevelSelect />}
      {screen === 'briefing' && <Briefing />}
      {screen === 'playing' && <Hud />}
      {showTouch && controlsActive && <TouchControls />}
      {screen === 'playing' && paused && <PauseMenu />}
      {screen === 'results' && <Results />}

      {touch && (
        <div className="pointer-events-none absolute inset-0 z-50 hidden items-center justify-center bg-ink/90 p-6 text-center portrait:flex">
          <div>
            <p className="font-display text-outline text-4xl text-accent">Rotate your phone</p>
            <p className="mt-2 font-extrabold text-white">Splash Dash plays best in landscape.</p>
          </div>
        </div>
      )}
    </main>
  )
}
