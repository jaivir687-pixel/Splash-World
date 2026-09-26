import * as THREE from 'three'

/**
 * Runtime auto-rig for the supplied (unrigged, mid-stride) contestant GLB.
 *
 * 1. The static mesh is baked into character space (facing +Z, feet at y=0,
 *    pelvis centred on the physics capsule) and scaled to game height.
 * 2. A 17-bone humanoid skeleton is placed on joint positions measured from
 *    the model's own geometry (its stride pose is the bind pose).
 * 3. Skin weights come from a bone-capsule distance falloff, so every vertex
 *    is driven smoothly by up to four bones and the original materials,
 *    textures and silhouette are left untouched.
 * 4. Animation is authored on a neutral "driver" skeleton (straight legs,
 *    arms at the sides) and retargeted per frame with swing alignment, which
 *    removes the bind stride from every animation.
 */

type J = readonly [number, number, number]

/** glTF scene space of the supplied model: +X forward, +Y up, -Z = character's left. */
const MODEL_JOINTS = {
  pelvis: [-0.02, -0.06, 0.03],
  spine: [-0.012, 0.03, 0.03],
  chest: [-0.002, 0.14, 0.035],
  neck: [0.005, 0.235, 0.03],
  head: [0.015, 0.285, 0.03],
  headTop: [0.03, 0.5, 0.03],
  shoulderL: [0.0, 0.2, -0.085],
  elbowL: [0.085, 0.125, -0.175],
  wristL: [0.205, 0.255, -0.212],
  handTipL: [0.235, 0.335, -0.205],
  shoulderR: [-0.02, 0.2, 0.14],
  elbowR: [-0.072, 0.075, 0.196],
  wristR: [-0.1, -0.025, 0.217],
  handTipR: [-0.115, -0.1, 0.224],
  hipL: [0.0, -0.085, -0.055],
  kneeL: [0.05, -0.265, -0.1],
  ankleL: [0.035, -0.425, -0.102],
  toeL: [0.19, -0.485, -0.115],
  hipR: [-0.035, -0.085, 0.085],
  kneeR: [-0.055, -0.25, 0.08],
  ankleR: [-0.18, -0.415, 0.093],
  toeR: [-0.08, -0.488, 0.112],
} as const satisfies Record<string, J>

export type JointKey = keyof typeof MODEL_JOINTS

const MODEL_FLOOR = -0.5
const MODEL_HEIGHT = 1.0
export const CHARACTER_HEIGHT = 1.74

export type BoneName =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'upperArmL' | 'forearmL' | 'handL' | 'upperArmR' | 'forearmR' | 'handR'
  | 'thighL' | 'shinL' | 'footL' | 'thighR' | 'shinR' | 'footR'

const BONES: [BoneName, BoneName | null, JointKey][] = [
  ['hips', null, 'pelvis'],
  ['spine', 'hips', 'spine'],
  ['chest', 'spine', 'chest'],
  ['neck', 'chest', 'neck'],
  ['head', 'neck', 'head'],
  ['upperArmL', 'chest', 'shoulderL'],
  ['forearmL', 'upperArmL', 'elbowL'],
  ['handL', 'forearmL', 'wristL'],
  ['upperArmR', 'chest', 'shoulderR'],
  ['forearmR', 'upperArmR', 'elbowR'],
  ['handR', 'forearmR', 'wristR'],
  ['thighL', 'hips', 'hipL'],
  ['shinL', 'thighL', 'kneeL'],
  ['footL', 'shinL', 'ankleL'],
  ['thighR', 'hips', 'hipR'],
  ['shinR', 'thighR', 'kneeR'],
  ['footR', 'shinR', 'ankleR'],
]

/** Weighting capsules [bone, from, to, radius, gate]. Gates are in model space. */
type Gate = (x: number, y: number, z: number) => boolean
const legGate: Gate = (_x, y) => y < -0.05
const headGate: Gate = (_x, y) => y > 0.215
const SEGMENTS: [BoneName, JointKey, JointKey, number, Gate | null][] = [
  ['hips', 'pelvis', 'spine', 0.1, null],
  ['hips', 'hipL', 'hipR', 0.07, null],
  ['spine', 'spine', 'chest', 0.105, null],
  ['chest', 'chest', 'neck', 0.11, null],
  ['chest', 'shoulderL', 'shoulderR', 0.06, null],
  ['neck', 'neck', 'head', 0.045, null],
  ['head', 'head', 'headTop', 0.12, headGate],
  ['upperArmL', 'shoulderL', 'elbowL', 0.038, null],
  ['forearmL', 'elbowL', 'wristL', 0.032, null],
  ['handL', 'wristL', 'handTipL', 0.042, null],
  ['upperArmR', 'shoulderR', 'elbowR', 0.038, null],
  ['forearmR', 'elbowR', 'wristR', 0.032, null],
  ['handR', 'wristR', 'handTipR', 0.042, null],
  ['thighL', 'hipL', 'kneeL', 0.06, legGate],
  ['shinL', 'kneeL', 'ankleL', 0.048, legGate],
  ['footL', 'ankleL', 'toeL', 0.045, legGate],
  ['thighR', 'hipR', 'kneeR', 0.06, legGate],
  ['shinR', 'kneeR', 'ankleR', 0.048, legGate],
  ['footR', 'ankleR', 'toeR', 0.045, legGate],
]

const SCALE = CHARACTER_HEIGHT / MODEL_HEIGHT
const PELVIS = MODEL_JOINTS.pelvis

/** Model space -> character space (+Z forward, +X = character's left, feet at 0). */
function toChar(x: number, y: number, z: number, out: THREE.Vector3) {
  return out.set((-z + PELVIS[2]) * SCALE, (y - MODEL_FLOOR) * SCALE, (x - PELVIS[0]) * SCALE)
}

export interface BuiltRig {
  mesh: THREE.SkinnedMesh
  bones: Record<BoneName, THREE.Bone>
  rest: Record<JointKey, THREE.Vector3>
}

/** Converts the loaded GLB scene into a skinned, game-ready character. */
export function buildRig(scene: THREE.Object3D): BuiltRig {
  let src: THREE.Mesh | null = null
  scene.updateMatrixWorld(true)
  scene.traverse((o) => {
    if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh
  })
  if (!src) throw new Error('Player GLB contains no mesh')
  const srcMesh = src as THREE.Mesh
  const g = srcMesh.geometry
  const pos = g.getAttribute('position')
  const nor = g.getAttribute('normal')
  const n = pos.count
  const m = srcMesh.matrixWorld
  const nm = new THREE.Matrix3().getNormalMatrix(m)

  const rest = {} as Record<JointKey, THREE.Vector3>
  for (const k of Object.keys(MODEL_JOINTS) as JointKey[]) {
    const j = MODEL_JOINTS[k]
    rest[k] = toChar(j[0], j[1], j[2], new THREE.Vector3())
  }

  const outPos = new Float32Array(n * 3)
  const outNor = new Float32Array(n * 3)
  const skinIndex = new Uint8Array(n * 4)
  const skinWeight = new Uint8Array(n * 4)

  const segCount = SEGMENTS.length
  const boneIndex = new Map<BoneName, number>(BONES.map(([b], i) => [b, i]))
  const sa = new Float32Array(segCount * 3)
  const sd = new Float32Array(segCount * 3)
  const sl2 = new Float32Array(segCount)
  const sr2 = new Float32Array(segCount)
  const sb = new Uint8Array(segCount)
  for (let s = 0; s < segCount; s++) {
    const [bone, a, b, r] = SEGMENTS[s]
    const A = MODEL_JOINTS[a]
    const B = MODEL_JOINTS[b]
    sa.set(A, s * 3)
    sd[s * 3] = B[0] - A[0]
    sd[s * 3 + 1] = B[1] - A[1]
    sd[s * 3 + 2] = B[2] - A[2]
    sl2[s] = sd[s * 3] ** 2 + sd[s * 3 + 1] ** 2 + sd[s * 3 + 2] ** 2
    sr2[s] = r * r
    sb[s] = boneIndex.get(bone)!
  }

  const v = new THREE.Vector3()
  const cv = new THREE.Vector3()
  const perBone = new Float32Array(BONES.length)
  const topI = [0, 0, 0, 0]
  const topW = [0, 0, 0, 0]

  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m)
    const x = v.x
    const y = v.y
    const z = v.z
    toChar(x, y, z, cv)
    outPos[i * 3] = cv.x
    outPos[i * 3 + 1] = cv.y
    outPos[i * 3 + 2] = cv.z
    if (nor) {
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize()
      outNor[i * 3] = -v.z
      outNor[i * 3 + 1] = v.y
      outNor[i * 3 + 2] = v.x
    }

    // Normalised squared distance to each bone capsule; weights fall off
    // exponentially relative to the closest bone, so joints blend smoothly
    // while distant bones contribute nothing.
    perBone.fill(Infinity)
    let qMin = Infinity
    for (let s = 0; s < segCount; s++) {
      const gate = SEGMENTS[s][4]
      if (gate && !gate(x, y, z)) continue
      const ax = sa[s * 3], ay = sa[s * 3 + 1], az = sa[s * 3 + 2]
      const dx = sd[s * 3], dy = sd[s * 3 + 1], dz = sd[s * 3 + 2]
      let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / sl2[s]
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const ex = x - ax - dx * t, ey = y - ay - dy * t, ez = z - az - dz * t
      const q = Math.sqrt((ex * ex + ey * ey + ez * ez) / sr2[s])
      if (q < perBone[sb[s]]) perBone[sb[s]] = q
      if (q < qMin) qMin = q
    }
    for (let b = 0; b < perBone.length; b++) {
      const q = perBone[b]
      perBone[b] = q === Infinity ? 0 : Math.exp(-4 * (q - qMin))
      if (perBone[b] < 0.02) perBone[b] = 0
    }

    topW[0] = topW[1] = topW[2] = topW[3] = 0
    topI[0] = topI[1] = topI[2] = topI[3] = 0
    for (let b = 0; b < perBone.length; b++) {
      const w = perBone[b]
      if (w <= topW[3]) continue
      let k = 3
      while (k > 0 && w > topW[k - 1]) {
        topW[k] = topW[k - 1]
        topI[k] = topI[k - 1]
        k--
      }
      topW[k] = w
      topI[k] = b
    }
    const sum = topW[0] + topW[1] + topW[2] + topW[3] || 1
    let acc = 0
    for (let k = 1; k < 4; k++) {
      const q8 = Math.round((topW[k] / sum) * 255)
      skinWeight[i * 4 + k] = q8
      skinIndex[i * 4 + k] = topI[k]
      acc += q8
    }
    skinIndex[i * 4] = topI[0]
    skinWeight[i * 4] = 255 - acc
  }

  const geo = new THREE.BufferGeometry()
  if (g.index) geo.setIndex(g.index)
  geo.setAttribute('position', new THREE.BufferAttribute(outPos, 3))
  if (nor) geo.setAttribute('normal', new THREE.BufferAttribute(outNor, 3))
  const uv = g.getAttribute('uv')
  if (uv) geo.setAttribute('uv', uv)
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4))
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4, true))
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1.2, -0.6, -1.2), new THREE.Vector3(1.2, 2.6, 1.2))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2)

  const bones = {} as Record<BoneName, THREE.Bone>
  const list: THREE.Bone[] = []
  for (const [name, parent, joint] of BONES) {
    const bone = new THREE.Bone()
    bone.name = name
    const p = rest[joint].clone()
    if (parent) p.sub(rest[BONES.find((b) => b[0] === parent)![2]])
    bone.position.copy(p)
    if (parent) bones[parent].add(bone)
    bones[name] = bone
    list.push(bone)
  }

  const mesh = new THREE.SkinnedMesh(geo, srcMesh.material)
  mesh.name = 'contestant'
  mesh.add(bones.hips)
  mesh.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(list), new THREE.Matrix4())
  mesh.frustumCulled = false
  return { mesh, bones, rest }
}

/** Procedural pose channels (radians / metres), authored on the neutral driver. */
export interface Pose {
  crouch: number
  lean: number
  bank: number
  twist: number
  sway: number
  legL: number
  legR: number
  kneeL: number
  kneeR: number
  ankleL: number
  ankleR: number
  armLx: number
  armRx: number
  armLz: number
  armRz: number
  elbowL: number
  elbowR: number
  wristL: number
  wristR: number
  head: number
  headYaw: number
  splay: number
}

export const zeroPose = (): Pose => ({
  crouch: 0, lean: 0, bank: 0, twist: 0, sway: 0, legL: 0, legR: 0, kneeL: 0.05, kneeR: 0.05, ankleL: 0, ankleR: 0,
  armLx: 0, armRx: 0, armLz: 0.1, armRz: 0.1, elbowL: 0.2, elbowR: 0.2, wristL: 0, wristR: 0, head: 0, headYaw: 0, splay: 0,
})

const dist = (a: THREE.Vector3, b: THREE.Vector3) => a.distanceTo(b)
const avg = (a: number, b: number) => (a + b) / 2

interface Chain {
  bone: THREE.Bone
  parent: BoneName
  restDir: THREE.Vector3
  from: THREE.Object3D
  to: THREE.Object3D
}

/**
 * Neutral driver skeleton + swing retargeter. Pose channels rotate the
 * driver joints; limb segment directions are then copied onto the skinned
 * skeleton so the model reproduces the pose regardless of its bind stride.
 */
export class RigDriver {
  readonly legLength: number
  private root = new THREE.Object3D()
  private body = new THREE.Object3D()
  private torso = new THREE.Object3D()
  private head = new THREE.Object3D()
  private restBodyY: number
  private j: Record<string, THREE.Object3D> = {}
  private chains: Chain[] = []
  private world = new Map<BoneName, THREE.Quaternion>()
  private tq = new THREE.Quaternion()
  private sq = new THREE.Quaternion()
  private half = new THREE.Quaternion()
  private va = new THREE.Vector3()
  private vb = new THREE.Vector3()
  private vd = new THREE.Vector3()

  constructor(private rig: BuiltRig) {
    const r = rig.rest
    const thigh = avg(dist(r.hipL, r.kneeL), dist(r.hipR, r.kneeR))
    const shin = avg(dist(r.kneeL, r.ankleL), dist(r.kneeR, r.ankleR))
    const ankleH = r.ankleL.y
    const footFwd = Math.hypot(r.toeL.x - r.ankleL.x, r.toeL.z - r.ankleL.z)
    const footDrop = r.ankleL.y - r.toeL.y
    const upper = avg(dist(r.shoulderL, r.elbowL), dist(r.shoulderR, r.elbowR))
    const fore = avg(dist(r.elbowL, r.wristL), dist(r.elbowR, r.wristR))
    const hand = avg(dist(r.wristL, r.handTipL), dist(r.wristR, r.handTipR))
    const hipY = avg(r.hipL.y, r.hipR.y) - r.pelvis.y
    const hipX = avg(Math.abs(r.hipL.x - r.pelvis.x), Math.abs(r.hipR.x - r.pelvis.x))
    const shY = avg(r.shoulderL.y, r.shoulderR.y) - r.spine.y
    const shX = avg(Math.abs(r.shoulderL.x - r.spine.x), Math.abs(r.shoulderR.x - r.spine.x))

    this.legLength = thigh + shin + ankleH
    this.restBodyY = this.legLength - hipY
    this.root.add(this.body)
    this.body.position.set(0, this.restBodyY, 0)
    this.body.add(this.torso)
    this.torso.position.set(0, r.spine.y - r.pelvis.y, 0)
    this.torso.add(this.head)
    this.head.position.set(0, r.neck.y - r.spine.y, 0)

    const add = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const o = new THREE.Object3D()
      o.position.set(x, y, z)
      parent.add(o)
      this.j[name] = o
      return o
    }
    for (const [s, side] of [['L', 1], ['R', -1]] as const) {
      const sh = add(`shoulder${s}`, this.torso, side * shX, shY, 0)
      const el = add(`elbow${s}`, sh, 0, -upper, 0)
      const wr = add(`wrist${s}`, el, 0, -fore, 0)
      add(`handTip${s}`, wr, 0, -hand, 0)
      const hp = add(`hip${s}`, this.body, side * hipX, hipY, 0)
      const kn = add(`knee${s}`, hp, 0, -thigh, 0)
      const an = add(`ankle${s}`, kn, 0, -shin, 0)
      add(`toe${s}`, an, 0, -footDrop, footFwd)
    }

    const chain = (bone: BoneName, parent: BoneName, a: JointKey, b: JointKey) => {
      this.chains.push({
        bone: rig.bones[bone],
        parent,
        restDir: r[b].clone().sub(r[a]).normalize(),
        from: this.j[a],
        to: this.j[b],
      })
    }
    for (const s of ['L', 'R'] as const) {
      chain(`upperArm${s}`, 'chest', `shoulder${s}`, `elbow${s}`)
      chain(`forearm${s}`, `upperArm${s}`, `elbow${s}`, `wrist${s}`)
      chain(`hand${s}`, `forearm${s}`, `wrist${s}`, `handTip${s}`)
      chain(`thigh${s}`, 'hips', `hip${s}`, `knee${s}`)
      chain(`shin${s}`, `thigh${s}`, `knee${s}`, `ankle${s}`)
      chain(`foot${s}`, `shin${s}`, `ankle${s}`, `toe${s}`)
    }
    for (const [b] of BONES) this.world.set(b, new THREE.Quaternion())
  }

  apply(p: Pose) {
    const J = this.j
    const legK = this.legLength / 0.9
    this.body.position.set(p.sway * legK, this.restBodyY - p.crouch * 0.55 * legK, 0)
    this.body.rotation.set(p.lean, 0, -p.sway * 1.2 + p.bank)
    this.torso.rotation.set(0, p.twist, 0)
    this.head.rotation.set(p.head, p.headYaw - p.twist * 0.8, 0)
    J.shoulderL.rotation.set(p.armLx, 0, p.armLz)
    J.shoulderR.rotation.set(p.armRx, 0, -p.armRz)
    J.elbowL.rotation.set(-p.elbowL, 0, 0)
    J.elbowR.rotation.set(-p.elbowR, 0, 0)
    J.wristL.rotation.set(p.wristL, 0, 0)
    J.wristR.rotation.set(p.wristR, 0, 0)
    J.hipL.rotation.set(p.legL - p.lean, -p.twist * 0.5, p.splay)
    J.hipR.rotation.set(p.legR - p.lean, -p.twist * 0.5, -p.splay)
    J.kneeL.rotation.set(p.kneeL, 0, 0)
    J.kneeR.rotation.set(p.kneeR, 0, 0)
    J.ankleL.rotation.set(p.ankleL - p.kneeL * 0.35, 0, 0)
    J.ankleR.rotation.set(p.ankleR - p.kneeR * 0.35, 0, 0)
    this.root.updateMatrixWorld(true)

    const B = this.rig.bones
    const W = this.world
    B.hips.position.copy(this.body.position)
    B.hips.quaternion.copy(this.body.quaternion)
    W.get('hips')!.copy(this.body.quaternion)
    this.half.identity().slerp(this.torso.quaternion, 0.5)
    B.spine.quaternion.copy(this.half)
    B.chest.quaternion.copy(this.half)
    W.get('spine')!.copy(W.get('hips')!).multiply(this.half)
    W.get('chest')!.copy(W.get('spine')!).multiply(this.half)
    B.neck.quaternion.identity()
    B.head.quaternion.copy(this.head.quaternion)

    for (const c of this.chains) {
      const wp = W.get(c.parent)!
      c.from.getWorldPosition(this.va)
      c.to.getWorldPosition(this.vb)
      this.vd.subVectors(this.vb, this.va).normalize()
      this.va.copy(c.restDir).applyQuaternion(wp)
      this.sq.setFromUnitVectors(this.va, this.vd)
      const wb = W.get(c.bone.name as BoneName)!
      wb.copy(this.sq).multiply(wp)
      this.tq.copy(wp).invert().multiply(wb)
      c.bone.quaternion.copy(this.tq)
    }
  }
}
