'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { POOL } from '@/lib/game/constants'
import { engine } from '@/lib/game/engine'
import { fxCursor, readFx } from '@/lib/game/fx'
import { surface } from '@/lib/game/materials'
import { waterPosts } from '@/lib/game/posts'
import { NOISE_GLSL, SKY_GLSL, skyUniforms } from '@/lib/game/shaders'
import { waterNormalTexture } from '@/lib/game/textures'
import type { Theme } from '@/lib/game/themes'
import type { LevelDef } from '@/lib/game/types'

/**
 * Pool water as a single opaque shader pass (no render targets, so it stays
 * cheap on low-end Android):
 *  - two scrolling normal maps + gerstner-ish vertex swell
 *  - analytic refraction: the refracted view ray is traced into the pool box
 *    and shades tiled floor/walls with animated caustics
 *  - depth-based absorption from the traced path length
 *  - Schlick fresnel between refraction and the analytic sky reflection
 *  - sharp sun glints, baked shoreline / post foam, splash ripples
 */

const POOL_DEPTH = 1.7
const FOAM_RES = 4
const RIPPLES = 4

function bakeFoam(level: LevelDef, x0: number, x1: number) {
  const hd = POOL.halfDepth
  const W = Math.ceil((x1 - x0) * FOAM_RES)
  const H = Math.ceil(hd * 2 * FOAM_RES)
  const f = new Float32Array(W * H)
  for (let j = 0; j < H; j++) {
    const z = -hd + (j + 0.5) / FOAM_RES
    for (let i = 0; i < W; i++) {
      const x = x0 + (i + 0.5) / FOAM_RES
      const e = Math.min(hd - Math.abs(z), x - x0, x1 - x)
      f[j * W + i] = Math.exp(-Math.max(0, e) * 3.2) * 0.85
    }
  }
  for (const [px, pz, r] of waterPosts(level)) {
    const reach = r + 1.4
    const i0 = Math.max(0, Math.floor((px - reach - x0) * FOAM_RES))
    const i1 = Math.min(W - 1, Math.ceil((px + reach - x0) * FOAM_RES))
    const j0 = Math.max(0, Math.floor((pz - reach + hd) * FOAM_RES))
    const j1 = Math.min(H - 1, Math.ceil((pz + reach + hd) * FOAM_RES))
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) / FOAM_RES
        const z = -hd + (j + 0.5) / FOAM_RES
        const d = Math.hypot(x - px, z - pz) - r
        const v = Math.exp(-Math.max(0, d) * 3.6)
        const k = j * W + i
        if (v > f[k]) f[k] = v
      }
  }
  const data = new Uint8Array(W * H * 4)
  for (let k = 0; k < W * H; k++) {
    const v = Math.round(Math.min(1, f[k]) * 255)
    data[k * 4] = v
    data[k * 4 + 1] = v
    data[k * 4 + 2] = v
    data[k * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

const vertexShader = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform float uSwell;
  varying vec3 vWorld;
  varying vec2 vSlope;
  void main(){
    vec3 transformed = position;
    vec4 wp = modelMatrix * vec4(transformed, 1.0);
    float a1 = wp.x * 0.55 + wp.z * 0.25 + uTime * 1.3;
    float a2 = wp.x * -0.31 + wp.z * 0.62 + uTime * 1.05;
    float a3 = wp.x * 0.9 - wp.z * 0.4 + uTime * 1.9;
    wp.y += (sin(a1) * 0.035 + sin(a2) * 0.025 + sin(a3) * 0.012) * uSwell;
    vSlope = vec2(
      cos(a1) * 0.55 * 0.035 - cos(a2) * 0.31 * 0.025 + cos(a3) * 0.9 * 0.012,
      cos(a1) * 0.25 * 0.035 + cos(a2) * 0.62 * 0.025 - cos(a3) * 0.4 * 0.012
    ) * uSwell;
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  ${NOISE_GLSL}
  ${SKY_GLSL}
  uniform float uTime;
  uniform sampler2D uNormal;
  uniform sampler2D uFoam;
  uniform vec4 uFoamRect;
  uniform vec4 uPool;        // x0, x1, halfDepth, depth
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uTile;
  uniform vec4 uRipples[${RIPPLES}];
  uniform float uHq;
  varying vec3 vWorld;
  varying vec2 vSlope;

  vec3 tileColor(vec2 p, vec3 base){
    vec2 g = abs(fract(p * 2.0) - 0.5);
    float grout = smoothstep(0.47, 0.5, max(g.x, g.y));
    vec3 c = base * (0.93 + 0.07 * hash12(floor(p * 2.0)));
    return mix(c, base * 0.72, grout);
  }

  void main(){
    vec3 P = vWorld;
    vec2 uv = P.xz;

    vec3 n1 = texture2D(uNormal, uv * 0.12 + vec2(uTime * 0.021, uTime * 0.013)).xyz * 2.0 - 1.0;
    vec3 n2 = texture2D(uNormal, uv * 0.047 + vec2(-uTime * 0.011, uTime * 0.017)).xyz * 2.0 - 1.0;
    vec2 slope = (n1.xy + n2.xy) * 0.26 - vSlope;

    float rippleFoam = 0.0;
    for (int i = 0; i < ${RIPPLES}; i++) {
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      if (r.w <= 0.0 || age < 0.0 || age > 3.0) continue;
      vec2 dv = uv - r.xy;
      float d = length(dv) + 1e-4;
      float front = age * 2.6;
      float env = exp(-pow((d - front) * 2.2, 2.0)) * exp(-age * 1.3) * r.w;
      slope += (dv / d) * env * sin((d - front) * 9.0) * 0.55;
      rippleFoam += env * smoothstep(1.2, 0.0, age) * 0.7;
    }

    vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 V = normalize(cameraPosition - P);
    float NoV = max(dot(N, V), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);

    vec3 R = reflect(-V, N);
    R.y = abs(R.y) + 0.02;
    vec3 refl = skyGradient(normalize(R));

    // Trace the refracted ray into the pool box.
    vec3 rd = refract(-V, N, 1.0 / 1.333);
    float tF = uPool.w / max(-rd.y, 1e-3);
    float tZ = rd.z > 0.0 ? (uPool.z - P.z) / rd.z : (-uPool.z - P.z) / min(rd.z, -1e-4);
    float tX = rd.x > 0.0 ? (uPool.y - P.x) / rd.x : (uPool.x - P.x) / min(rd.x, -1e-4);
    float t = min(tF, min(tZ, tX));
    vec3 H = P + rd * t;
    vec3 floorCol;
    if (t == tF) {
      floorCol = tileColor(H.xz, uTile);
      float lane = abs(fract((H.z + uPool.z) / 2.5) - 0.5);
      floorCol = mix(floorCol, uDeep * 0.55, (1.0 - smoothstep(0.02, 0.04, lane)) * float(abs(H.z) < uPool.z - 1.0));
    } else if (t == tZ) {
      floorCol = tileColor(vec2(H.x, H.y), uTile) * 0.9;
    } else {
      floorCol = tileColor(vec2(H.z, H.y), uTile) * 0.9;
    }
    vec2 cp = H.xz * 1.7 + slope * 0.6;
    float c1 = vnoise(cp + vec2(uTime * 0.45, uTime * 0.2));
    float c2 = vnoise(cp * 1.63 + vec2(-uTime * 0.31, uTime * 0.38) + 7.0);
    float caust = pow(max(0.0, 1.0 - abs(c1 - c2) * 3.2), 6.0) * (1.0 - uNight * 0.6);
    floorCol *= 0.82 + caust * 0.9 * uHq + caust * 0.45 * (1.0 - uHq);

    float absorb = 1.0 - exp(-t * 0.62);
    vec3 refr = mix(floorCol * uShallow * 1.35, uDeep, absorb);

    vec3 col = mix(refr, refl, fres);

    vec3 Hh = normalize(uSunDir + V);
    float NoH = max(dot(N, Hh), 0.0);
    float glint = pow(NoH, 900.0) * 9.0 + pow(NoH, 90.0) * 0.35;
    col += uSunColor * glint * (1.0 - uNight * 0.7);

    vec2 fuv = (uv - uFoamRect.xy) / uFoamRect.zw;
    float foam = texture2D(uFoam, fuv).r;
    float breakup = vnoise(uv * 3.1 + vec2(uTime * 0.35, -uTime * 0.22)) * 0.6 + vnoise(uv * 7.3 - uTime * 0.4) * 0.4;
    float foamMask = smoothstep(0.55, 0.95, foam * 0.85 + breakup * 0.45 * foam + foam * 0.2);
    foamMask = max(foamMask, smoothstep(0.2, 0.7, rippleFoam * (0.6 + breakup)));
    col = mix(col, vec3(0.94, 0.97, 1.0) * (0.85 + 0.15 * NoV), foamMask * 0.85);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export function Water({ level, theme, hq }: { level: LevelDef; theme: Theme; hq: boolean }) {
  const len = level.endX + 24
  const cx = level.endX / 2
  const x0 = cx - len / 2
  const x1 = cx + len / 2
  const hd = POOL.halfDepth

  const geo = useMemo(() => {
    const perM = hq ? 1 : 0.5
    const g = new THREE.PlaneGeometry(len, hd * 2, Math.ceil(len * perM), Math.ceil(hd * 2 * perM))
    g.rotateX(-Math.PI / 2)
    g.translate(cx, 0, 0)
    return g
  }, [len, hd, cx, hq])

  const foamTex = useMemo(() => bakeFoam(level, x0, x1), [level, x0, x1])

  const mat = useMemo(() => {
    const ripples = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0))
    return new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          ...skyUniforms(theme),
          uTime: { value: 0 },
          uSwell: { value: hq ? 1 : 0.6 },
          uNormal: { value: null },
          uFoam: { value: null },
          uFoamRect: { value: new THREE.Vector4(x0, -hd, x1 - x0, hd * 2) },
          uPool: { value: new THREE.Vector4(x0, x1, hd, POOL_DEPTH) },
          uShallow: { value: new THREE.Color(theme.water) },
          uDeep: { value: new THREE.Color(theme.waterDeep).multiplyScalar(0.7) },
          uTile: { value: new THREE.Color('#e9f6fb') },
          uRipples: { value: ripples },
          uHq: { value: hq ? 1 : 0 },
        },
      ]),
      vertexShader,
      fragmentShader,
    })
  }, [theme, hq, x0, x1, hd])

  // UniformsUtils.merge clones textures, so assign shared ones afterwards.
  useEffect(() => {
    mat.uniforms.uNormal.value = waterNormalTexture()
    mat.uniforms.uFoam.value = foamTex
  }, [mat, foamTex])

  const ripple = useMemo(() => ({ cursor: fxCursor(), slot: 0 }), [])
  useFrame(() => {
    const u = mat.uniforms
    u.uTime.value = engine.time
    ripple.cursor = readFx(ripple.cursor, (e) => {
      if (e.kind !== 'splash' && !(e.kind === 'bounce' && e.y < 0.6)) return
      const v = u.uRipples.value[ripple.slot % RIPPLES] as THREE.Vector4
      v.set(e.x, e.z, engine.time, Math.min(1.2, e.power))
      ripple.slot++
    })
  })

  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
      foamTex.dispose()
    },
    [geo, mat, foamTex],
  )

  const coping = useMemo(() => surface(hq, { color: '#f3efe6', roughness: 0.55 }), [hq])
  const lip = useMemo(() => surface(hq, { color: '#2d6f9a', roughness: 0.4 }), [hq])

  return (
    <group>
      <mesh geometry={geo} material={mat} />
      {[hd + 0.4, -hd - 0.4].map((z) => (
        <mesh key={z} position={[cx, 0.12, z]} material={coping} receiveShadow castShadow={hq}>
          <boxGeometry args={[len + 1.6, 0.35, 0.8]} />
        </mesh>
      ))}
      {[x0 - 0.4, x1 + 0.4].map((x) => (
        <mesh key={x} position={[x, 0.12, 0]} material={coping} receiveShadow>
          <boxGeometry args={[0.8, 0.35, hd * 2]} />
        </mesh>
      ))}
      {[hd + 0.02, -hd - 0.02].map((z) => (
        <mesh key={`l${z}`} position={[cx, 0.0, z]} material={lip}>
          <boxGeometry args={[len, 0.06, 0.04]} />
        </mesh>
      ))}
    </group>
  )
}
