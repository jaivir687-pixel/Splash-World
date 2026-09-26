import type { Theme } from './themes'

export type Sfx =
  | 'jump'
  | 'land'
  | 'bounce'
  | 'superBounce'
  | 'hit'
  | 'splash'
  | 'beep'
  | 'go'
  | 'checkpoint'
  | 'survivor'
  | 'finish'
  | 'fail'
  | 'click'
  | 'dive'
  | 'whoosh'

/**
 * AudioManager: fully synthesized WebAudio sound effects and a lightweight
 * step-sequenced music loop, so the game ships without audio asset files.
 */
class AudioManager {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private noise: AudioBuffer | null = null
  private musicTimer: ReturnType<typeof setInterval> | null = null
  private nextNoteTime = 0
  private step = 0
  private theme: Theme['music'] = { root: 60, tempo: 128 }
  private lastPlay: Partial<Record<Sfx, number>> = {}
  sfxOn = true
  musicOn = true
  private musicWanted = false

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (typeof window === 'undefined') return
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.8
      this.master.connect(this.ctx.destination)
      this.sfxBus = this.ctx.createGain()
      this.sfxBus.connect(this.master)
      this.musicBus = this.ctx.createGain()
      this.musicBus.gain.value = 0.22
      this.musicBus.connect(this.master)
      const len = this.ctx.sampleRate
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend()
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  setSfx(on: boolean) {
    this.sfxOn = on
  }

  setMusic(on: boolean) {
    this.musicOn = on
    if (!on) this.stopLoop()
    else if (this.musicWanted) this.startLoop()
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    opts: { to?: number; delay?: number; attack?: number; bus?: GainNode | null } = {},
  ) {
    const ctx = this.ctx
    if (!ctx) return
    const t0 = ctx.currentTime + (opts.delay ?? 0)
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur)
    const a = opts.attack ?? 0.005
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(opts.bus ?? this.sfxBus!)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  private burst(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, delay = 0, bus?: GainNode | null) {
    const ctx = this.ctx
    if (!ctx || !this.noise) return
    const t0 = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.7 + Math.random() * 0.6
    const f = ctx.createBiquadFilter()
    f.type = filter
    f.frequency.setValueAtTime(f0, t0)
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(f)
    f.connect(g)
    g.connect(bus ?? this.sfxBus!)
    src.start(t0, Math.random() * 0.5)
    src.stop(t0 + dur + 0.05)
  }

  play(name: Sfx) {
    if (!this.ctx || !this.sfxOn) return
    const now = this.ctx.currentTime
    const last = this.lastPlay[name] ?? -1
    if (now - last < 0.05) return
    this.lastPlay[name] = now
    switch (name) {
      case 'jump':
        this.tone(320, 0.16, 'square', 0.06, { to: 640 })
        break
      case 'land':
        this.burst(0.08, 0.12, 'lowpass', 600, 120)
        break
      case 'dive':
        this.burst(0.3, 0.18, 'bandpass', 1800, 400)
        break
      case 'whoosh':
        this.burst(0.35, 0.1, 'bandpass', 500, 2400)
        break
      case 'bounce':
        this.tone(160, 0.28, 'sine', 0.35, { to: 420 })
        this.tone(90, 0.12, 'triangle', 0.2)
        break
      case 'superBounce':
        this.tone(200, 0.4, 'sine', 0.35, { to: 900 })
        this.tone(600, 0.18, 'square', 0.05, { delay: 0.06, to: 1200 })
        break
      case 'hit':
        this.tone(140, 0.25, 'sine', 0.5, { to: 50 })
        this.burst(0.18, 0.35, 'lowpass', 2000, 200)
        this.tone(900, 0.3, 'triangle', 0.07, { delay: 0.05, to: 300 })
        break
      case 'splash':
        this.burst(0.9, 0.5, 'lowpass', 3000, 250)
        this.burst(0.5, 0.25, 'highpass', 1500, 4000, 0.05)
        this.tone(120, 0.35, 'sine', 0.3, { to: 45 })
        break
      case 'beep':
        this.tone(660, 0.18, 'square', 0.08)
        break
      case 'go':
        this.tone(1320, 0.5, 'square', 0.07)
        this.tone(2400, 0.45, 'sine', 0.08, { to: 2600 })
        this.crowd(1.6, 0.18)
        break
      case 'checkpoint':
        this.tone(880, 0.12, 'triangle', 0.15)
        this.tone(1320, 0.2, 'triangle', 0.15, { delay: 0.1 })
        break
      case 'survivor':
        ;[523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'square', 0.06, { delay: i * 0.07 }))
        this.crowd(1.1, 0.12)
        break
      case 'finish':
        ;[523, 659, 784, 1047, 784, 1047].forEach((f, i) =>
          this.tone(f, i === 5 ? 0.7 : 0.2, 'square', 0.07, { delay: i * 0.12 }),
        )
        this.crowd(2.8, 0.3)
        break
      case 'fail':
        ;[392, 370, 349, 294].forEach((f, i) =>
          this.tone(f, i === 3 ? 0.9 : 0.32, 'sawtooth', 0.06, { delay: i * 0.3, to: i === 3 ? 260 : undefined }),
        )
        this.crowd(1.4, 0.1)
        break
      case 'click':
        this.tone(900, 0.06, 'square', 0.05)
        break
    }
  }

  /** Crowd reaction: band-passed noise swell. */
  crowd(dur: number, vol: number) {
    if (!this.ctx || !this.noise) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1100
    f.Q.value = 0.6
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.15)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(f)
    f.connect(g)
    g.connect(this.sfxBus!)
    src.start(t0)
    src.stop(t0 + dur + 0.1)
  }

  startMusic(theme: Theme['music']) {
    this.theme = theme
    this.musicWanted = true
    if (this.musicOn) this.startLoop()
  }

  stopMusic() {
    this.musicWanted = false
    this.stopLoop()
  }

  private startLoop() {
    if (!this.ctx || this.musicTimer) return
    this.step = 0
    this.nextNoteTime = this.ctx.currentTime + 0.1
    this.musicTimer = setInterval(() => this.schedule(), 50)
  }

  private stopLoop() {
    if (this.musicTimer) clearInterval(this.musicTimer)
    this.musicTimer = null
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx || !this.musicBus) return
    const stepDur = 60 / this.theme.tempo / 2
    const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12)
    const prog = [0, 5, 7, 5]
    const melody = [12, -1, 16, 19, -1, 16, 14, 12, 14, -1, 12, 9, 7, -1, 9, 12]
    while (this.nextNoteTime < ctx.currentTime + 0.2) {
      const delay = this.nextNoteTime - ctx.currentTime
      const s = this.step % 64
      const bar = Math.floor(s / 16)
      const root = this.theme.root - 24 + prog[bar]
      const i = s % 16
      if (i % 4 === 0 || i % 4 === 3) this.tone(mtof(root), stepDur * 0.9, 'triangle', 0.5, { delay, bus: this.musicBus })
      if (i % 4 === 2) this.tone(mtof(root + 12 + 7), stepDur * 0.5, 'square', 0.08, { delay, bus: this.musicBus })
      if (i % 2 === 1) this.burst(0.04, 0.12, 'highpass', 7000, 9000, delay, this.musicBus)
      if (i % 8 === 0) this.tone(120, 0.12, 'sine', 0.55, { delay, to: 45, bus: this.musicBus })
      if (i % 8 === 4) this.burst(0.12, 0.25, 'bandpass', 1800, 900, delay, this.musicBus)
      const m = melody[i]
      if (m >= 0 && bar % 2 === 1) this.tone(mtof(this.theme.root + prog[bar] + m - 12), stepDur * 1.6, 'square', 0.05, { delay, bus: this.musicBus })
      this.nextNoteTime += stepDur
      this.step++
    }
  }
}

export const audio = new AudioManager()
