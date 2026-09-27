'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import { engine } from '@/lib/game/engine'
import { LEVELS } from '@/lib/game/levels'
import { useGameStore } from '@/lib/game/store'
import { THEMES } from '@/lib/game/themes'
import { CameraRig } from './camera-rig'
import { Character } from './character'
import { Course } from './course'
import { Effects } from './effects'
import { Environment } from './environment'
import { Obstacles } from './obstacles'

/** Drives the fixed-step simulation from the render loop (priority -1 = before renderers read state). */
function EngineTicker() {
  useFrame((_, dt) => engine.update(Math.min(dt, 0.1)), -1)
  return null
}

/**
 * Dynamic resolution: if frames run long for a sustained period the render
 * scale steps down (and back up when there's headroom) so weak Android GPUs
 * hold a locked 60 FPS without the player touching settings.
 */
function ResolutionGovernor({ min, max }: { min: number; max: number }) {
  const setDpr = useThree((s) => s.setDpr)
  const st = useRef({ acc: 0, frames: 0, dpr: max, cool: 0 })
  useFrame((_, dt) => {
    const s = st.current
    s.acc += dt
    s.frames++
    s.cool -= dt
    if (s.acc < 1.0) return
    const avg = s.acc / s.frames
    s.acc = 0
    s.frames = 0
    if (s.cool > 0) return
    let next = s.dpr
    if (avg > 1 / 55) next = Math.max(min, s.dpr - 0.15)
    else if (avg < 1 / 58) next = Math.min(max, s.dpr + 0.1)
    if (next !== s.dpr) {
      s.dpr = next
      s.cool = 1.5
      setDpr(next)
    }
  })
  return null
}

function World({ hq }: { hq: boolean }) {
  const levelIndex = useGameStore((s) => s.levelIndex)
  const level = LEVELS[levelIndex]
  const theme = THEMES[level.theme]
  return (
    <group key={level.id}>
      <Environment level={level} theme={theme} hq={hq} />
      <Course level={level} theme={theme} hq={hq} />
      <Obstacles level={level} theme={theme} hq={hq} />
      <Suspense fallback={null}>
        <Character hq={hq} />
      </Suspense>
      <Effects theme={theme} hq={hq} />
    </group>
  )
}

function PostFx() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur intensity={0.4} luminanceThreshold={0.92} luminanceSmoothing={0.2} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.32} darkness={0.42} />
    </EffectComposer>
  )
}

export function GameCanvas() {
  const quality = useGameStore((s) => s.save.settings.quality)
  const high = quality === 'high'
  const maxDpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, high ? 1.5 : 1.0)
  return (
    <Canvas
      key={quality}
      className="!absolute inset-0 touch-none"
      shadows={high ? { type: THREE.BasicShadowMap } : false}
      dpr={maxDpr}
      gl={{
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
        precision: 'mediump'
      }}
      camera={{ fov: 50, near: 0.3, far: 600, position: [0, 5, 12] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.0
      }}
    >
      <Suspense fallback={null}>
        <EngineTicker />
        <World hq={high} />
        <CameraRig />
        {high && <PostFx />}
        <ResolutionGovernor min={high ? 0.75 : 0.6} max={maxDpr} />
      </Suspense>
    </Canvas>
  )
}
