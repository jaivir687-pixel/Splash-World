import * as THREE from 'three'
import type { Theme } from './themes'

/** Shared GLSL: cheap value noise + the analytic sky used by dome and water. */
export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p, int oct){
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 5; i++) { if (i >= oct) break; s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
  return s;
}
`

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uNight;
vec3 skyGradient(vec3 d){
  float y = d.y;
  float t = clamp(y * 1.35, 0.0, 1.0);
  vec3 c = mix(uSkyHorizon, uSkyTop, pow(t, 0.62));
  c = mix(c, uSkyHorizon * 0.9, clamp(-y * 3.0, 0.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunColor * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.45) * (1.0 - uNight * 0.8);
  return c;
}
`

export function skyUniforms(theme: Theme) {
  const dir = new THREE.Vector3(...theme.sunDir).normalize()
  return {
    uSkyTop: { value: new THREE.Color(theme.skyTop) },
    uSkyHorizon: { value: new THREE.Color(theme.skyHorizon) },
    uSunDir: { value: dir },
    uSunColor: { value: new THREE.Color(theme.sun) },
    uNight: { value: theme.night ? 1 : 0 },
  }
}
