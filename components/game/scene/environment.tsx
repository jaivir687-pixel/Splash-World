'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { POOL } from '@/lib/game/constants'
import { engine } from '@/lib/game/engine'
import { NOISE_GLSL, SKY_GLSL, skyUniforms } from '@/lib/game/shaders'
import { flagTexture } from '@/lib/game/textures'
import type { Theme } from '@/lib/game/themes'
import type { LevelDef } from '@/lib/game/types'
import { Scenery } from './scenery'
import { Water } from './water'

/** Sky dome: gradient, sun disc + glow, drifting fbm clouds, night stars. */
function skyMaterial(theme: Theme, octaves: number, forEnv = false) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      ...skyUniforms(theme),
      uTime: { value: 0 },
      uClouds: { value: theme.clouds },
      uGround: { value: new THREE.Color(forEnv ? theme.hemiGround : theme.skyHorizon) },
      uEnv: { value: forEnv ? 1 : 0 },
    },
    defines: { OCT: octaves },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      ${SKY_GLSL}
      uniform float uTime; uniform float uClouds; uniform vec3 uGround; uniform float uEnv;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 c = skyGradient(d);
        float sd = max(dot(d, uSunDir), 0.0);
        if (uEnv > 0.5) {
          c = mix(c, uGround, smoothstep(0.02, -0.25, d.y));
        } else {
          c += uSunColor * smoothstep(0.99955, 0.9999, sd) * 6.0 * (1.0 - uNight);
        }
        if (uClouds > 0.0 && d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.14) * 0.85 + vec2(uTime * 0.006, uTime * 0.002);
          float n = fbm(uv, OCT);
          float cov = smoothstep(0.62 - uClouds * 0.3, 0.92 - uClouds * 0.25, n) * smoothstep(0.0, 0.2, d.y);
          float lit = 0.78 + 0.35 * pow(sd, 3.0) + 0.12 * fbm(uv * 2.3 + 4.0, OCT);
          vec3 cloud = mix(uSkyHorizon, vec3(1.0), 0.72) * lit;
          c = mix(c, cloud, cov * 0.92);
        }
        if (uNight > 0.5) {
          vec3 q = floor(d * 260.0);
          float s = step(0.9965, hash12(q.xy + q.z * 17.0)) * smoothstep(0.05, 0.4, d.y);
          c += vec3(s) * (0.6 + 0.4 * sin(uTime * 3.0 + q.x));
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
}

function Sky({ theme, hq }: { theme: Theme; hq: boolean }) {
  const mat = useMemo(() => skyMaterial(theme, hq ? 4 : 2), [theme, hq])
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ camera }) => {
    ref.current?.position.copy(camera.position)
    mat.uniforms.uTime.value = engine.time
  })
  useEffect(() => () => mat.dispose(), [mat])
  return (
    <mesh ref={ref} material={mat} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  )
}

/** Bakes the sky into a prefiltered env map so PBR surfaces pick up reflections. */
function SkyEnvironment({ theme }: { theme: Theme }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    const envScene = new THREE.Scene()
    const mat = skyMaterial(theme, 3, true)
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat)
    envScene.add(mesh)
    const rt = pm.fromScene(envScene, 0.035, 0.1, 1000)
    scene.environment = rt.texture
    scene.environmentIntensity = theme.night ? 0.55 : 0.85
    return () => {
      scene.environment = null
      rt.dispose()
      pm.dispose()
      mat.dispose()
      mesh.geometry.dispose()
    }
  }, [gl, scene, theme])
  return null
}

/** Pennant flags on a line above the course. */
function Flags({ level, theme }: { level: LevelDef; theme: Theme }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const n = Math.floor(level.endX / 3)
  const tex = useMemo(() => flagTexture(theme.trim, theme.stripeB), [theme])
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, -1, 0], 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2))
    g.computeVertexNormals()
    return g
  }, [])
  useLayoutEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    for (let i = 0; i < n; i++) {
      const x = i * 3 + 1.5
      m.makeTranslation(x, 9 - Math.sin(((i % 6) / 6) * Math.PI) * 0.8, -POOL.halfDepth + 1)
      ref.current?.setMatrixAt(i, m)
      c.set(i % 3 === 0 ? theme.trim : i % 3 === 1 ? theme.stripeA : '#ffd23f')
      ref.current?.setColorAt(i, c)
    }
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    }
  }, [n, theme])
  return (
    <instancedMesh ref={ref} args={[geo, undefined, n]}>
      <meshLambertMaterial map={tex} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

/** Hemisphere fill + one sun matching the sky's sun direction. Shadows follow the player. */
function Lights({ theme, shadows }: { theme: Theme; shadows: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const dir = useMemo(() => new THREE.Vector3(...theme.sunDir).normalize(), [theme])
  useFrame(() => {
    const p = engine.player
    const l = sun.current
    if (!l) return
    // Snap to shadow texels so the shadow map doesn't shimmer while following.
    const snap = 0.25
    const x = Math.round(p.x / snap) * snap
    target.position.set(x, 0, 0)
    l.position.set(x + dir.x * 40, dir.y * 40, dir.z * 40)
    target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, theme.hemiIntensity * 0.85]} />
      <primitive object={target} />
      <directionalLight
        ref={sun}
        color={theme.sun}
        intensity={theme.sunIntensity * 1.1}
        target={target}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={16}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
    </>
  )
}

export function Environment({ level, theme, hq }: { level: LevelDef; theme: Theme; hq: boolean }) {
  return (
    <>
      <fog attach="fog" args={[theme.fog, theme.fogNear * 1.3, theme.fogFar * 1.6]} />
      <SkyEnvironment theme={theme} />
      <Lights theme={theme} shadows={hq} />
      <Sky theme={theme} hq={hq} />
      <Water level={level} theme={theme} hq={hq} />
      <Scenery level={level} theme={theme} hq={hq} />
      <Flags level={level} theme={theme} />
    </>
  )
}
