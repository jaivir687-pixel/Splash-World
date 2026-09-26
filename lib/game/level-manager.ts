import { audio } from './audio'
import { engine } from './engine'
import { input } from './input'
import { LEVELS } from './levels'
import { useGameStore } from './store'

/**
 * LevelManager: screen/level transitions invoked by the UI. Keeps the UI
 * components free of engine orchestration details.
 */
export const levelManager = {
  openLevelSelect() {
    audio.unlock()
    audio.play('click')
    useGameStore.getState().setScreen('levels')
  },

  select(index: number) {
    audio.play('click')
    engine.load(index)
    useGameStore.setState({ screen: 'briefing', result: null })
  },

  begin() {
    audio.unlock()
    audio.play('click')
    tryLandscapeFullscreen()
    useGameStore.getState().setScreen('playing')
    engine.start()
  },

  retry() {
    audio.play('click')
    useGameStore.getState().setScreen('playing')
    engine.restart()
  },

  next() {
    const i = useGameStore.getState().levelIndex
    if (i + 1 < LEVELS.length) this.select(i + 1)
    else this.menu()
  },

  menu() {
    audio.play('click')
    engine.attract()
    input.reset()
    useGameStore.setState({ screen: 'menu', result: null, paused: false, banner: null, popups: [], countdown: null })
  },

  pause(p: boolean) {
    engine.setPaused(p)
    if (p) audio.suspend()
    else audio.resume()
  },

  togglePause() {
    const s = useGameStore.getState()
    if (s.screen !== 'playing') return
    this.pause(!s.paused)
  },
}

/** Android: go fullscreen and lock to landscape where the browser allows it. */
function tryLandscapeFullscreen() {
  if (typeof document === 'undefined') return
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  if (!coarse) return
  const el = document.documentElement
  const req = el.requestFullscreen?.bind(el)
  if (!req || document.fullscreenElement) return
  req({ navigationUI: 'hide' })
    .then(() => {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
      return o.lock?.('landscape')
    })
    .catch(() => {})
}
