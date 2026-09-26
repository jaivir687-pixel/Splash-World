/**
 * Save/Progress system. The game is an offline, single-player mobile title,
 * so progress lives on-device (like a native Android save file).
 */
export interface Settings {
  sfx: boolean
  music: boolean
  quality: 'low' | 'high'
  touchControls: 'auto' | 'on' | 'off'
}

export interface SaveData {
  version: 1
  unlocked: number
  best: Record<string, number>
  bestScore: Record<string, number>
  stars: Record<string, number>
  settings: Settings
}

const KEY = 'splash-dash-save-v1'

export function defaultSettings(): Settings {
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  return { sfx: true, music: true, quality: coarse ? 'low' : 'high', touchControls: 'auto' }
}

export function defaultSave(): SaveData {
  return { version: 1, unlocked: 1, best: {}, bestScore: {}, stars: {}, settings: defaultSettings() }
}

export function loadSave(): SaveData {
  if (typeof window === 'undefined') return defaultSave()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return defaultSave()
    const data = JSON.parse(raw) as Partial<SaveData>
    const base = defaultSave()
    return { ...base, ...data, settings: { ...base.settings, ...(data.settings ?? {}) } } as SaveData
  } catch {
    return defaultSave()
  }
}

export function writeSave(data: SaveData) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage may be unavailable (private mode) - progress stays in memory.
  }
}
