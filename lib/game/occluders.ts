import { useEffect, type RefObject } from 'react'
import * as THREE from 'three'

/**
 * Camera occluder registry. Meshes registered here are raycast by the camera
 * rig each frame; any that sit between the lens and the player fade out
 * instead of hiding the character (e.g. the near START/FINISH arch pillar).
 */
interface Entry {
  mesh: THREE.Mesh
  mat: THREE.Material & { opacity: number }
  fade: number
  target: number
}

const entries = new Map<THREE.Object3D, Entry>()

export function registerOccluder(mesh: THREE.Mesh) {
  const src = mesh.material as THREE.Material
  const mat = src.clone() as THREE.Material & { opacity: number }
  mesh.material = mat
  entries.set(mesh, { mesh, mat, fade: 1, target: 1 })
  return () => {
    entries.delete(mesh)
    mesh.material = src
    mat.dispose()
  }
}

export function useOccluder(ref: RefObject<THREE.Mesh | null>) {
  useEffect(() => {
    const m = ref.current
    if (!m) return
    return registerOccluder(m)
  }, [ref])
}

const ray = new THREE.Raycaster()
const dir = new THREE.Vector3()
const hits: THREE.Intersection[] = []
const list: THREE.Object3D[] = []

/** Fades any registered mesh intersecting the segment from `from` to `to`. */
export function updateOccluders(from: THREE.Vector3, to: THREE.Vector3, dt: number) {
  if (entries.size === 0) return
  dir.subVectors(to, from)
  const len = dir.length()
  dir.divideScalar(len || 1)
  ray.set(from, dir)
  ray.far = len
  list.length = 0
  entries.forEach((e) => {
    e.target = 1
    list.push(e.mesh)
  })
  hits.length = 0
  ray.intersectObjects(list, false, hits)
  for (const h of hits) {
    const e = entries.get(h.object)
    if (e) e.target = 0.18
  }
  const k = 1 - Math.exp(-10 * dt)
  entries.forEach((e) => {
    e.fade += (e.target - e.fade) * k
    const faded = e.fade < 0.98
    if (e.mat.transparent !== faded) {
      e.mat.transparent = faded
      e.mat.needsUpdate = true
    }
    e.mat.opacity = e.fade
    e.mat.depthWrite = !faded
    e.mesh.castShadow = e.fade > 0.5
  })
}
