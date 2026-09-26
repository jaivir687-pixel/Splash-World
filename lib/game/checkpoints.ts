import type { Checkpoint } from './types'

/** CheckpointManager: tracks the furthest safe pad reached on the ground. */
export class CheckpointManager {
  private list: Checkpoint[] = []
  index = 0

  load(list: Checkpoint[]) {
    this.list = list
    this.index = 0
  }

  reset() {
    this.index = 0
  }

  /** Returns true when a new checkpoint was activated. */
  update(x: number, grounded: boolean) {
    if (!grounded) return false
    let changed = false
    for (let i = this.index + 1; i < this.list.length; i++) {
      if (x >= this.list[i].x - 1.6) {
        this.index = i
        changed = true
      }
    }
    return changed
  }

  get current() {
    return this.list[this.index] ?? { x: 0, y: 2 }
  }
}
