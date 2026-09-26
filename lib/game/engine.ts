import { audio } from './audio'
import { CheckpointManager } from './checkpoints'
import { PHYS, TIMING } from './constants'
import { emitFx } from './fx'
import { input } from './input'
import { LEVELS } from './levels'
import { clamp, mulberry32 } from './math'
import { PlayerController, type Intent } from './player'
import { writeSave } from './save'
import { useGameStore, type BoardRow, type Phase, type ResultData } from './store'
import { THEMES } from './themes'
import type { LevelDef } from './types'
import { World } from './world'

const FIXED = 1 / 120

/**
 * GameManager: owns the simulation clock, phase state machine (intro ->
 * countdown -> running -> finished/failed), scoring, lives, checkpoints and
 * bridges gameplay events to the UI store and the AudioManager.
 */
class GameEngine {
  level: LevelDef = LEVELS[0]
  world: World = new World(LEVELS[0])
  player = new PlayerController()
  checkpoints = new CheckpointManager()
  phase: Phase = 'attract'
  phaseT = 0
  time = 0
  raceTime = 0
  score = 0
  wipeouts = 0
  lives: number | null = null
  paused = false
  private acc = 0
  private hudT = 0
  private sectionIdx = -1
  private sectionWiped: boolean[] = []
  private sectionDone: boolean[] = []
  private countdownShown = -1
  private rivals: { name: string; time: number }[] = []
  private intent: Intent = { moveX: 0, jumpPressed: false, jumpHeld: false, duckPressed: false, duckHeld: false }
  private idleTimer = 0

  load(index: number) {
    const level = LEVELS[index]
    this.level = level
    this.world = new World(level)
    this.checkpoints.load(level.checkpoints)
    this.time = 0
    this.setPhase('attract')
    this.resetRun()
    useGameStore.getState().setLevelIndex(index)
  }

  private resetRun() {
    this.raceTime = 0
    this.score = 0
    this.wipeouts = 0
    this.lives = this.level.lives
    this.acc = 0
    this.sectionIdx = -1
    this.sectionWiped = this.level.sections.map(() => false)
    this.sectionDone = this.level.sections.map(() => false)
    this.countdownShown = -1
    this.checkpoints.reset()
    this.player.reset(this.level.start.x, this.level.start.y)
    const rand = mulberry32(Math.floor(Math.random() * 1e9))
    this.rivals = this.level.contestants.map((c) => ({ name: c.name, time: c.time + (rand() - 0.5) * 5 }))
    input.reset()
    this.pushHud()
  }

  private setPhase(p: Phase) {
    this.phase = p
    this.phaseT = 0
    useGameStore.getState().setPhase(p)
  }

  /** Start the run from the briefing: intro flyover, then countdown. */
  start(skipIntro = false) {
    this.resetRun()
    this.paused = false
    useGameStore.setState({ paused: false, result: null, banner: null, popups: [], countdown: null })
    this.setPhase(skipIntro ? 'countdown' : 'intro')
    audio.startMusic(THEMES[this.level.theme].music)
    if (!skipIntro) audio.play('whoosh')
  }

  skipIntro() {
    if (this.phase === 'intro') this.setPhase('countdown')
  }

  restart() {
    this.start(true)
  }

  attract() {
    this.paused = false
    this.resetRun()
    this.setPhase('attract')
    audio.stopMusic()
  }

  setPaused(p: boolean) {
    if (this.phase === 'attract' || this.phase === 'finished') return
    this.paused = p
    useGameStore.getState().setPaused(p)
    if (p) input.reset()
  }

  update(dt: number) {
    if (this.paused) return
    this.phaseT += dt
    this.acc += dt
    let steps = 0
    while (this.acc >= FIXED && steps < 12) {
      this.acc -= FIXED
      steps++
      this.fixedStep(FIXED)
    }
    if (steps === 12) this.acc = 0
    this.hudT += dt
    if (this.hudT > 0.1) {
      this.hudT = 0
      this.pushHud()
    }
  }

  private readIntent(enabled: boolean): Intent | null {
    if (!enabled) {
      input.consumeJump()
      input.consumeDuck()
      return null
    }
    const i = this.intent
    i.moveX = input.moveX
    i.jumpPressed = input.consumeJump()
    i.duckPressed = input.consumeDuck()
    i.jumpHeld = input.jumpHeld
    i.duckHeld = input.duckHeld
    return i
  }

  private fixedStep(dt: number) {
    this.time += dt
    this.world.update(this.time)
    const store = useGameStore.getState()

    switch (this.phase) {
      case 'attract':
        this.player.step(dt, this.time, this.world, null)
        return
      case 'intro':
        this.player.step(dt, this.time, this.world, this.readIntent(false))
        if (this.phaseT >= TIMING.intro) this.setPhase('countdown')
        return
      case 'countdown': {
        this.player.step(dt, this.time, this.world, this.readIntent(false))
        const n = Math.floor(this.phaseT / TIMING.countdownStep)
        if (n !== this.countdownShown) {
          this.countdownShown = n
          if (n < 3) {
            store.setCountdown(String(3 - n))
            audio.play('beep')
          } else {
            store.setCountdown('GO!')
            audio.play('go')
            this.setPhase('running')
            setTimeout(() => useGameStore.getState().setCountdown(null), 700)
          }
        }
        return
      }
      case 'running':
      case 'splash':
        this.raceTime += dt
        break
      case 'finished':
        this.player.step(dt, this.time, this.world, null)
        if (this.phaseT >= TIMING.finishDelay && !store.result) this.showResults(true)
        return
      case 'failed':
        this.player.step(dt, this.time, this.world, null)
        this.player.drainEvents()
        if (this.phaseT >= 1.6 && !store.result) this.showResults(false)
        return
    }

    if (this.phase === 'splash') {
      this.player.step(dt, this.time, this.world, null)
      for (const e of this.player.drainEvents()) this.onPlayerEvent(e)
      if (this.phaseT >= TIMING.splash) {
        if (this.lives !== null && this.lives <= 0) {
          this.setPhase('failed')
          audio.play('fail')
          return
        }
        const cp = this.checkpoints.current
        this.player.reset(cp.x, cp.y, PHYS.respawnInvuln)
        this.setPhase('running')
        input.reset()
      }
      return
    }

    const p = this.player
    const intent = this.readIntent(true)
    p.step(dt, this.time, this.world, intent)
    for (const e of p.drainEvents()) this.onPlayerEvent(e)

    if (intent && (intent.moveX !== 0 || intent.jumpHeld)) this.idleTimer = 0
    else this.idleTimer += dt

    if (this.checkpoints.update(p.x, p.grounded) && this.checkpoints.index > 0) audio.play('checkpoint')
    this.trackSections()

    if (p.inWater) {
      this.wipeout()
      return
    }
    if (p.grounded && p.x >= this.level.finishX && Math.abs(p.z) < 1.6) this.finish()
  }

  private onPlayerEvent(e: ReturnType<PlayerController['drainEvents']>[number]) {
    const store = useGameStore.getState()
    switch (e.type) {
      case 'jump':
        audio.play('jump')
        break
      case 'land':
        audio.play('land')
        emitFx('dust', this.player.x, this.player.y, this.player.z, Math.min(1, e.impact / 14))
        break
      case 'dive':
        audio.play('dive')
        this.score += 2
        break
      case 'bounce':
        if (e.super) {
          audio.play('superBounce')
          this.score += 5
          store.pushPopup('SUPER BOUNCE +5', 'good')
        } else audio.play('bounce')
        emitFx('bounce', e.x, e.y, 0, e.super ? 1 : 0.6)
        break
      case 'hit':
        audio.play('hit')
        emitFx('hit', e.x, e.y, e.z, 1)
        break
      case 'stumble':
        audio.play('land')
        emitFx('dust', e.x, e.y, e.z, 0.6)
        break
      case 'resurface':
        emitFx('splash', e.x, PHYS.waterY, e.z, 0.28)
        break
    }
  }

  private trackSections() {
    const p = this.player
    const secs = this.level.sections
    for (let i = 0; i < secs.length; i++) {
      const s = secs[i]
      if (i > this.sectionIdx && p.x >= s.start - 1) {
        this.sectionIdx = i
        useGameStore.getState().showBanner(s.name, s.hint)
      }
      if (!this.sectionDone[i] && p.grounded && p.x > s.end + 0.3) {
        this.sectionDone[i] = true
        if (!this.sectionWiped[i]) {
          this.score += s.points
          useGameStore.getState().pushPopup(`SURVIVOR +${s.points}`, 'good')
          audio.play('survivor')
        } else {
          useGameStore.getState().pushPopup('CLEARED', 'info')
        }
      }
    }
  }

  private wipeout() {
    const p = this.player
    // Splash spawns at the exact surface crossing, scaled by the sampled impact velocity.
    emitFx('splash', p.waterX, PHYS.waterY, p.waterZ, clamp(0.35 + p.waterImpact / 16, 0.35, 1.6))
    audio.play('splash')
    this.wipeouts++
    const secs = this.level.sections
    for (let i = 0; i < secs.length; i++) {
      if (!this.sectionDone[i] && p.x < secs[i].end + 0.3) {
        this.sectionWiped[i] = true
        break
      }
    }
    const store = useGameStore.getState()
    store.flashWipeout()
    if (this.lives !== null) {
      this.lives--
      store.pushPopup(this.lives > 0 ? `${this.lives} ATTEMPT${this.lives === 1 ? '' : 'S'} LEFT` : 'OUT OF ATTEMPTS', 'bad')
    }
    this.setPhase('splash')
    this.pushHud()
  }

  private finish() {
    const p = this.player
    p.frozen = true
    p.vx = p.vy = p.vz = 0
    p.forceAnim('victory')
    this.setPhase('finished')
    audio.play('finish')
    emitFx('confetti', p.x, p.y + 2, 0, 1)
    this.pushHud()
  }

  private showResults(finished: boolean) {
    const store = useGameStore.getState()
    const lv = this.level
    const time = this.raceTime
    const timeBonus = finished ? Math.max(0, Math.round((lv.targetTime - time) * 10)) : 0
    const total = this.score + timeBonus
    const rows: BoardRow[] = this.rivals.map((r) => ({ name: r.name, time: r.time, you: false, out: false }))
    rows.push({ name: 'You', time: finished ? time : null, you: true, out: false })
    rows.sort((a, b) => (a.time ?? 1e9) - (b.time ?? 1e9))
    rows.forEach((r, i) => (r.out = i >= lv.qualifySpots || r.time === null))
    const rank = rows.findIndex((r) => r.you) + 1
    const passed = finished && rank <= lv.qualifySpots
    let stars = 0
    if (passed) {
      stars = 1
      if (time <= lv.targetTime) stars = 2
      if (time <= lv.targetTime && this.wipeouts === 0) stars = 3
    }

    const save = { ...store.save, best: { ...store.save.best }, bestScore: { ...store.save.bestScore }, stars: { ...store.save.stars } }
    const prevBest = save.best[lv.id]
    const newBest = finished && (prevBest === undefined || time < prevBest)
    if (newBest) save.best[lv.id] = time
    if (passed) {
      save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, lv.index + 2))
      save.stars[lv.id] = Math.max(save.stars[lv.id] ?? 0, stars)
      save.bestScore[lv.id] = Math.max(save.bestScore[lv.id] ?? 0, total)
    }
    store.setSave(save)
    writeSave(save)

    const result: ResultData = {
      levelIndex: lv.index,
      passed,
      reason: finished ? 'finished' : 'lives',
      time,
      score: this.score,
      timeBonus,
      total,
      rank,
      board: rows,
      newBest,
      stars,
      wipeouts: this.wipeouts,
      isLast: lv.index === LEVELS.length - 1,
    }
    store.setResult(result)
    store.setScreen('results')
    audio.stopMusic()
    if (finished && !passed) audio.play('fail')
  }

  private pushHud() {
    const lv = this.level
    const start = lv.start.x
    const progress = Math.max(0, Math.min(1, (this.player.x - start) / (lv.finishX - start)))
    useGameStore.getState().setHud({
      time: this.raceTime,
      score: this.score,
      lives: this.lives,
      progress,
    })
  }
}

export const engine = new GameEngine()
