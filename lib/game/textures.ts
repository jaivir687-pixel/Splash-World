import * as THREE from 'three'

/** Small procedural canvas textures (no image assets, tiny GPU footprint). */
const cache = new Map<string, THREE.Texture>()

function make(key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  cache.set(key, tex)
  return tex
}

/** Vertical inflatable bands with soft seam shading. */
export function stripeTexture(a: string, b: string) {
  return make(`stripe-${a}-${b}`, 64, 32, (c) => {
    c.fillStyle = a
    c.fillRect(0, 0, 32, 32)
    c.fillStyle = b
    c.fillRect(32, 0, 32, 32)
    const g = c.createLinearGradient(0, 0, 64, 0)
    g.addColorStop(0, 'rgba(0,0,0,0.18)')
    g.addColorStop(0.08, 'rgba(0,0,0,0)')
    g.addColorStop(0.42, 'rgba(0,0,0,0)')
    g.addColorStop(0.5, 'rgba(0,0,0,0.18)')
    g.addColorStop(0.58, 'rgba(0,0,0,0)')
    g.addColorStop(0.92, 'rgba(0,0,0,0)')
    g.addColorStop(1, 'rgba(0,0,0,0.18)')
    c.fillStyle = g
    c.fillRect(0, 0, 64, 32)
  })
}

/** Walking surface: light pad with colored front/back piping. */
export function topTexture(base: string, edge: string) {
  return make(`top-${base}-${edge}`, 64, 64, (c) => {
    c.fillStyle = base
    c.fillRect(0, 0, 64, 64)
    c.fillStyle = edge
    c.fillRect(0, 0, 64, 7)
    c.fillRect(0, 57, 64, 7)
    c.fillStyle = 'rgba(0,0,0,0.07)'
    c.fillRect(0, 7, 2, 50)
    c.fillStyle = 'rgba(255,255,255,0.35)'
    c.fillRect(0, 9, 64, 2)
  })
}

export function chevronTexture(base: string, arrow: string) {
  return make(`chev-${base}-${arrow}`, 64, 64, (c) => {
    c.fillStyle = base
    c.fillRect(0, 0, 64, 64)
    c.fillStyle = arrow
    c.beginPath()
    c.moveTo(8, 8)
    c.lineTo(34, 32)
    c.lineTo(8, 56)
    c.lineTo(24, 56)
    c.lineTo(50, 32)
    c.lineTo(24, 8)
    c.closePath()
    c.fill()
  })
}

export function checkerTexture(a: string, b: string) {
  return make(`check-${a}-${b}`, 64, 64, (c) => {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        c.fillStyle = (x + y) % 2 ? a : b
        c.fillRect(x * 16, y * 16, 16, 16)
      }
  })
}

export function waterTexture(light: string, deep: string) {
  return make(`water-${light}-${deep}`, 256, 256, (c) => {
    c.fillStyle = light
    c.fillRect(0, 0, 256, 256)
    c.strokeStyle = 'rgba(255,255,255,0.35)'
    c.lineWidth = 3
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % 256
      const y = (i * 53) % 256
      c.beginPath()
      c.ellipse(x, y, 22 + (i % 5) * 6, 5, 0, 0, Math.PI * 2)
      c.stroke()
    }
    c.fillStyle = deep
    c.globalAlpha = 0.18
    for (let i = 0; i < 18; i++) {
      c.beginPath()
      c.arc((i * 71) % 256, (i * 131) % 256, 18, 0, Math.PI * 2)
      c.fill()
    }
    c.globalAlpha = 1
  })
}

export function grassTexture(a: string, b: string) {
  return make(`grass-${a}-${b}`, 128, 128, (c) => {
    c.fillStyle = a
    c.fillRect(0, 0, 128, 128)
    c.fillStyle = b
    for (let i = 0; i < 16; i++) c.fillRect(0, i * 8, 128, 4)
    c.globalAlpha = 0.12
    c.fillStyle = '#000'
    for (let i = 0; i < 60; i++) c.fillRect((i * 37) % 128, (i * 61) % 128, 3, 3)
    c.globalAlpha = 1
  })
}

export function labelTexture(text: string, bg: string, fg: string) {
  return make(`label-${text}-${bg}-${fg}`, 512, 128, (c) => {
    c.fillStyle = bg
    c.fillRect(0, 0, 512, 128)
    c.strokeStyle = fg
    c.lineWidth = 10
    c.strokeRect(8, 8, 496, 112)
    c.fillStyle = fg
    c.font = '900 76px system-ui, sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText(text, 256, 68)
  })
}

export function flagTexture(bg: string, dot: string) {
  return make(`flag-${bg}-${dot}`, 64, 64, (c) => {
    c.fillStyle = bg
    c.fillRect(0, 0, 64, 64)
    c.fillStyle = dot
    c.beginPath()
    c.arc(22, 40, 11, 0, Math.PI * 2)
    c.fill()
  })
}

/**
 * Box geometry whose top sits at y=0 and whose UVs are in world units
 * (`period` meters per texture repeat), so one shared material fits any size.
 */
export function courseBox(w: number, h: number, d: number, period = 1.4) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(0, -h / 2, 0)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let face = 0; face < 6; face++) {
    const scale = face < 2 ? d / period : w / period
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i
      uv.setX(idx, uv.getX(idx) * Math.max(1, Math.round(scale)))
    }
  }
  uv.needsUpdate = true
  return g
}

/** Pool deck: large stone tiles with grout and per-tile tone variation. */
export function deckTexture(base: string) {
  return make(`deck-${base}`, 256, 256, (c) => {
    c.fillStyle = base
    c.fillRect(0, 0, 256, 256)
    const n = 4
    const s = 256 / n
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = ((i * 7 + j * 13) % 5) / 5
        c.fillStyle = `rgba(${v > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + (v % 0.5) * 0.08})`
        c.fillRect(i * s, j * s, s, s)
      }
    for (let k = 0; k < 900; k++) {
      c.fillStyle = `rgba(0,0,0,${0.02 + (k % 7) * 0.006})`
      c.fillRect((k * 131) % 256, (k * 197) % 256, 2, 2)
    }
    c.fillStyle = 'rgba(0,0,0,0.22)'
    for (let i = 0; i <= n; i++) {
      c.fillRect(i * s - 1.5, 0, 3, 256)
      c.fillRect(0, i * s - 1.5, 256, 3)
    }
  })
}

/** Neutral detail map multiplied over vertex-coloured terrain. */
export function detailTexture(kind: 'grass' | 'sand' | 'floor') {
  return make(`detail-${kind}`, 256, 256, (c) => {
    c.fillStyle = '#e6e6e6'
    c.fillRect(0, 0, 256, 256)
    let seed = kind === 'grass' ? 7 : kind === 'sand' ? 19 : 31
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    if (kind === 'floor') {
      c.strokeStyle = 'rgba(120,140,255,0.35)'
      c.lineWidth = 2
      for (let i = 0; i <= 8; i++) {
        c.beginPath()
        c.moveTo(i * 32, 0)
        c.lineTo(i * 32, 256)
        c.moveTo(0, i * 32)
        c.lineTo(256, i * 32)
        c.stroke()
      }
      return
    }
    for (let i = 0; i < 2600; i++) {
      const x = r() * 256
      const y = r() * 256
      const l = kind === 'grass' ? 3 + r() * 6 : 1 + r() * 2
      const v = Math.floor(170 + r() * 85)
      c.strokeStyle = `rgba(${v},${v},${v},0.55)`
      c.lineWidth = kind === 'grass' ? 1.2 : 1.6
      c.beginPath()
      c.moveTo(x, y)
      c.lineTo(x + (r() - 0.5) * 2, y - l)
      c.stroke()
    }
  })
}

/** Jersey print: side panels + number on the back, crest on the chest. */
export function jerseyTexture(base: string, trim: string, number: string) {
  return make(`jersey-${base}-${trim}-${number}`, 256, 128, (c) => {
    c.fillStyle = base
    c.fillRect(0, 0, 256, 128)
    const g = c.createLinearGradient(0, 0, 0, 128)
    g.addColorStop(0, 'rgba(255,255,255,0.08)')
    g.addColorStop(1, 'rgba(0,0,0,0.12)')
    c.fillStyle = g
    c.fillRect(0, 0, 256, 128)
    c.fillStyle = trim
    c.fillRect(56, 0, 16, 128)
    c.fillRect(184, 0, 16, 128)
    c.fillRect(0, 0, 256, 7)
    c.fillStyle = '#ffffff'
    c.font = '900 60px sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.lineWidth = 6
    c.strokeStyle = trim
    c.strokeText(number, 128, 62)
    c.fillText(number, 128, 62)
    c.beginPath()
    c.arc(18, 44, 9, 0, Math.PI * 2)
    c.arc(256 - 18, 44, 9, 0, Math.PI * 2)
    c.fill()
    for (let y = 0; y < 128; y += 3) {
      c.fillStyle = 'rgba(0,0,0,0.035)'
      c.fillRect(0, y, 256, 1)
    }
  })
}

const linearCache = new Map<string, THREE.DataTexture>()

/** Tileable water normal map baked from periodic value noise (linear data). */
export function waterNormalTexture() {
  const hit = linearCache.get('water-normal')
  if (hit) return hit
  const N = 256
  const P = 16
  const lattice = new Float32Array(P * P * 4)
  let seed = 1337
  for (let i = 0; i < lattice.length; i++) lattice[i] = (seed = (seed * 16807) % 2147483647) / 2147483647
  const noise = (x: number, y: number, per: number, layer: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)
    const at = (i: number, j: number) => lattice[layer * P * P + (((j % per) + per) % per) * P + (((i % per) + per) % per)]
    const a = at(xi, yi)
    const b = at(xi + 1, yi)
    const c = at(xi, yi + 1)
    const d = at(xi + 1, yi + 1)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
  }
  const h = new Float32Array(N * N)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let v = 0
      let amp = 1
      for (let o = 0; o < 4; o++) {
        const per = 4 << o
        v += amp * noise((x / N) * per, (y / N) * per, Math.min(P, per), o)
        amp *= 0.5
      }
      h[y * N + x] = v
    }
  const data = new Uint8Array(N * N * 4)
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)]
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 6
      const dy = (at(x, y + 1) - at(x, y - 1)) * 6
      const l = Math.hypot(dx, dy, 1)
      const i = (y * N + x) * 4
      data[i] = ((-dx / l) * 0.5 + 0.5) * 255
      data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255
      data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  linearCache.set('water-normal', tex)
  return tex
}

/** Short hair: dense directional strands over a dark base. */
export function hairTexture(base: string) {
  return make(`hair-${base}`, 128, 128, (c) => {
    c.fillStyle = base
    c.fillRect(0, 0, 128, 128)
    let seed = 11
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 1400; i++) {
      const x = r() * 128
      const y = r() * 128
      const l = 4 + r() * 8
      const v = r()
      c.strokeStyle = v > 0.5 ? `rgba(255,235,210,${0.05 + v * 0.08})` : `rgba(0,0,0,${0.12 + v * 0.2})`
      c.lineWidth = 1
      c.beginPath()
      c.moveTo(x, y)
      c.lineTo(x + (r() - 0.5) * 2, y + l)
      c.stroke()
    }
  })
}

/** Subtle skin pores / tone variation (multiplied over skin colour). */
export function skinTexture() {
  return make('skin', 128, 128, (c) => {
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, 128, 128)
    let seed = 5
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 1600; i++) {
      c.fillStyle = r() > 0.5 ? 'rgba(160,70,60,0.05)' : 'rgba(255,255,255,0.05)'
      const s = 1 + r() * 2
      c.fillRect(r() * 128, r() * 128, s, s)
    }
  })
}
