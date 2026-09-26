import { create } from 'zustand'
import { defaultSave, type SaveData, type Settings } from './save'

export type Screen = 'menu' | 'levels' | 'briefing' | 'playing' | 'results'
export type Phase = 'attract' | 'intro' | 'countdown' | 'running' | 'splash' | 'finished' | 'failed'

export interface Banner {
  id: number
  title: string
  hint?: string
}

export interface Popup {
  id: number
  text: string
  tone: 'good' | 'bad' | 'info'
}

export interface BoardRow {
  name: string
  time: number | null
  you: boolean
  out: boolean
}

export interface ResultData {
  levelIndex: number
  passed: boolean
  reason: 'finished' | 'lives'
  time: number
  score: number
  timeBonus: number
  total: number
  rank: number
  board: BoardRow[]
  newBest: boolean
  stars: number
  wipeouts: number
  isLast: boolean
}

export interface Hud {
  time: number
  score: number
  lives: number | null
  progress: number
}

interface GameStore {
  screen: Screen
  phase: Phase
  levelIndex: number
  paused: boolean
  countdown: string | null
  hud: Hud
  banner: Banner | null
  popups: Popup[]
  wipeoutFlash: number
  result: ResultData | null
  save: SaveData
  hydrated: boolean
  setScreen: (s: Screen) => void
  setPhase: (p: Phase) => void
  setLevelIndex: (i: number) => void
  setPaused: (p: boolean) => void
  setCountdown: (c: string | null) => void
  setHud: (h: Hud) => void
  showBanner: (title: string, hint?: string) => void
  pushPopup: (text: string, tone?: Popup['tone']) => void
  flashWipeout: () => void
  setResult: (r: ResultData | null) => void
  setSave: (s: SaveData) => void
  updateSettings: (s: Partial<Settings>) => void
}

let uid = 1

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'menu',
  phase: 'attract',
  levelIndex: 0,
  paused: false,
  countdown: null,
  hud: { time: 0, score: 0, lives: null, progress: 0 },
  banner: null,
  popups: [],
  wipeoutFlash: 0,
  result: null,
  save: defaultSave(),
  hydrated: false,
  setScreen: (screen) => set({ screen }),
  setPhase: (phase) => set({ phase }),
  setLevelIndex: (levelIndex) => set({ levelIndex }),
  setPaused: (paused) => set({ paused }),
  setCountdown: (countdown) => set({ countdown }),
  setHud: (hud) => set({ hud }),
  showBanner: (title, hint) => set({ banner: { id: uid++, title, hint } }),
  pushPopup: (text, tone = 'good') => {
    const id = uid++
    set({ popups: [...get().popups.slice(-3), { id, text, tone }] })
    setTimeout(() => set({ popups: get().popups.filter((p) => p.id !== id) }), 1600)
  },
  flashWipeout: () => set({ wipeoutFlash: uid++ }),
  setResult: (result) => set({ result }),
  setSave: (save) => set({ save, hydrated: true }),
  updateSettings: (s) => set({ save: { ...get().save, settings: { ...get().save.settings, ...s } } }),
}))
