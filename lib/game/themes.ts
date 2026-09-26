import type { ThemeId } from './types'

export interface Theme {
  id: ThemeId
  skyTop: string
  skyHorizon: string
  fog: string
  fogNear: number
  fogFar: number
  ground: string
  groundDark: string
  water: string
  waterDeep: string
  stripeA: string
  stripeB: string
  trim: string
  ball: string
  hazard: string
  hazardB: string
  sun: string
  sunIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  night: boolean
  /** Pool deck tiles, near terrain, far terrain, distant mountains. */
  deck: string
  terrainA: string
  terrainB: string
  mountain: string
  /** 0..1 sky cloud coverage. */
  clouds: number
  /** Direction *towards* the sun (normalized in the renderer). */
  sunDir: [number, number, number]
  music: { root: number; tempo: number }
}

export const THEMES: Record<ThemeId, Theme> = {
  park: {
    id: 'park',
    skyTop: '#3b8ee6',
    skyHorizon: '#cfeaff',
    fog: '#cfeaff',
    fogNear: 45,
    fogFar: 140,
    ground: '#6cc04a',
    groundDark: '#4fa032',
    water: '#46c2ec',
    waterDeep: '#1d8fc9',
    stripeA: '#1ea1e6',
    stripeB: '#ffffff',
    trim: '#e8322f',
    ball: '#ee2b2b',
    hazard: '#e8322f',
    hazardB: '#ffffff',
    sun: '#fff6e0',
    sunIntensity: 2.3,
    hemiSky: '#cfe8ff',
    hemiGround: '#6aa84a',
    hemiIntensity: 1.25,
    night: false,
    deck: '#e9e4d8',
    terrainA: '#5aae3c',
    terrainB: '#3f8a2c',
    mountain: '#6f9fb8',
    clouds: 0.5,
    sunDir: [-0.45, 0.75, 0.55],
    music: { root: 60, tempo: 128 },
  },
  desert: {
    id: 'desert',
    skyTop: '#e27b58',
    skyHorizon: '#f9d8ae',
    fog: '#f5c79a',
    fogNear: 45,
    fogFar: 150,
    ground: '#d89a5a',
    groundDark: '#b97a42',
    water: '#4fd0cf',
    waterDeep: '#2a9fae',
    stripeA: '#f0b93a',
    stripeB: '#fbeecb',
    trim: '#c8472e',
    ball: '#e53a3a',
    hazard: '#d2452c',
    hazardB: '#fbeecb',
    sun: '#ffd9a8',
    sunIntensity: 2.4,
    hemiSky: '#ffd7b0',
    hemiGround: '#b8784a',
    hemiIntensity: 1.2,
    night: false,
    deck: '#ecd7b4',
    terrainA: '#d9a066',
    terrainB: '#b6733f',
    mountain: '#c77a58',
    clouds: 0.25,
    sunDir: [-0.6, 0.42, 0.45],
    music: { root: 57, tempo: 116 },
  },
  studio: {
    id: 'studio',
    skyTop: '#060a22',
    skyHorizon: '#2a1f55',
    fog: '#1a1438',
    fogNear: 40,
    fogFar: 120,
    ground: '#23233a',
    groundDark: '#15152a',
    water: '#2f86e0',
    waterDeep: '#154a9c',
    stripeA: '#1ea1e6',
    stripeB: '#f2f6ff',
    trim: '#e8322f',
    ball: '#ff2f4a',
    hazard: '#ff3a3a',
    hazardB: '#ffffff',
    sun: '#dfe6ff',
    sunIntensity: 2.0,
    hemiSky: '#8a8cff',
    hemiGround: '#2a1f55',
    hemiIntensity: 0.9,
    night: true,
    deck: '#2c2c48',
    terrainA: '#1c1c33',
    terrainB: '#121226',
    mountain: '#2a2150',
    clouds: 0,
    sunDir: [-0.35, 0.85, 0.5],
    music: { root: 62, tempo: 140 },
  },
}
