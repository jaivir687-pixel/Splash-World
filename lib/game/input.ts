/**
 * InputManager: merges keyboard (dev/desktop) and on-screen touch controls
 * into a single set of intents consumed by the PlayerController.
 */
class InputManager {
  private keys = new Set<string>()
  touchX = 0
  touchDuck = false
  touchJump = false
  private jumpQueued = false
  private duckQueued = false
  private attached = false
  onPause: (() => void) | null = null
  onRestart: (() => void) | null = null

  private down = (e: KeyboardEvent) => {
    const k = e.code
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'NumpadEnter'].includes(k)) e.preventDefault()
    if (e.repeat) return
    this.keys.add(k)
    if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW' || k === 'KeyK' || k === 'Enter' || k === 'NumpadEnter') this.jumpQueued = true
    if (k === 'ArrowDown' || k === 'KeyS' || k === 'ShiftLeft' || k === 'KeyJ') this.duckQueued = true
    if (k === 'Escape' || k === 'KeyP') this.onPause?.()
    if (k === 'KeyR') this.onRestart?.()
  }

  private up = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private blur = () => {
    this.keys.clear()
    this.reset()
  }

  attach() {
    if (this.attached || typeof window === 'undefined') return
    this.attached = true
    window.addEventListener('keydown', this.down)
    window.addEventListener('keyup', this.up)
    window.addEventListener('blur', this.blur)
  }

  detach() {
    if (!this.attached) return
    this.attached = false
    window.removeEventListener('keydown', this.down)
    window.removeEventListener('keyup', this.up)
    window.removeEventListener('blur', this.blur)
  }

  reset() {
    this.touchX = 0
    this.touchDuck = false
    this.touchJump = false
    this.jumpQueued = false
    this.duckQueued = false
  }

  get moveX() {
    let x = this.touchX
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) x += 1
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) x -= 1
    return Math.max(-1, Math.min(1, x))
  }

  get jumpHeld() {
    return (
      this.touchJump ||
      this.keys.has('Space') ||
      this.keys.has('ArrowUp') ||
      this.keys.has('KeyW') ||
      this.keys.has('KeyK') ||
      this.keys.has('Enter') ||
      this.keys.has('NumpadEnter')
    )
  }

  get duckHeld() {
    return (
      this.touchDuck ||
      this.keys.has('ArrowDown') ||
      this.keys.has('KeyS') ||
      this.keys.has('ShiftLeft') ||
      this.keys.has('KeyJ')
    )
  }

  pressJump() {
    this.jumpQueued = true
  }

  pressDuck() {
    this.duckQueued = true
  }

  consumeJump() {
    const q = this.jumpQueued
    this.jumpQueued = false
    return q
  }

  consumeDuck() {
    const q = this.duckQueued
    this.duckQueued = false
    return q
  }
}

export const input = new InputManager()
