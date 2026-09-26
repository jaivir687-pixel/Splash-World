import * as THREE from 'three'

/**
 * Quality-aware surface material. "Pretty" gets PBR (reacts to the sky
 * environment map and sun specular); "Fast" falls back to per-vertex Lambert
 * which is far cheaper on low-end mobile GPUs.
 */
export function surface(hq: boolean, p: THREE.MeshStandardMaterialParameters) {
  if (hq) return new THREE.MeshStandardMaterial(p)
  const { roughness: _r, metalness: _m, envMapIntensity: _e, roughnessMap: _rm, metalnessMap: _mm, normalMap: _n, ...rest } = p
  return new THREE.MeshLambertMaterial(rest as THREE.MeshLambertMaterialParameters)
}
