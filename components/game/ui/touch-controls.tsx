'use client'

import { ChevronDown, ChevronsUp } from 'lucide-react'
import { useRef, useState, type PointerEvent as RPE } from 'react'
import { input } from '@/lib/game/input'

const RADIUS = 56

/**
 * Floating analog joystick (left half of the screen, horizontal axis drives
 * running) plus JUMP and DUCK/DIVE buttons on the right. Uses pointer capture
 * so multi-touch (run + jump) works on Android.
 */
function Joystick() {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [knob, setKnob] = useState(0)
  const pid = useRef<number | null>(null)

  const move = (clientX: number, ox: number) => {
    const dx = Math.max(-RADIUS, Math.min(RADIUS, clientX - ox))
    setKnob(dx)
    const v = dx / RADIUS
    input.touchX = Math.abs(v) < 0.18 ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - 0.18) / 0.62)
  }

  const onDown = (e: RPE<HTMLDivElement>) => {
    if (pid.current !== null) return
    pid.current = e.pointerId
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    setOrigin({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setKnob(0)
    input.touchX = 0
  }
  const onMove = (e: RPE<HTMLDivElement>) => {
    if (e.pointerId !== pid.current || !origin) return
    const rect = e.currentTarget.getBoundingClientRect()
    move(e.clientX, origin.x + rect.left)
  }
  const onUp = (e: RPE<HTMLDivElement>) => {
    if (e.pointerId !== pid.current) return
    pid.current = null
    setOrigin(null)
    setKnob(0)
    input.touchX = 0
  }

  const o = origin ?? { x: 110, y: -1 }
  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 top-1/4 w-1/2 touch-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="slider"
      aria-label="Move left or right"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={Math.round((knob / RADIUS) * 100) / 100}
    >
      <div
        className={`absolute flex h-24 w-40 -translate-x-1/2 -translate-y-1/2 items-center justify-between rounded-full border-4 border-white/70 bg-ink/35 px-2 transition-opacity ${origin ? 'opacity-100' : 'opacity-70'}`}
        style={origin ? { left: o.x, top: o.y } : { left: 110, bottom: 20, top: 'auto', transform: 'translate(-50%, 0)' }}
      >
        <span className="font-display text-2xl text-white/70" aria-hidden>
          {'<'}
        </span>
        <span className="font-display text-2xl text-white/70" aria-hidden>
          {'>'}
        </span>
        <div
          className="absolute left-1/2 top-1/2 size-16 rounded-full border-4 border-ink bg-accent shadow-[inset_0_-5px_0_rgba(0,0,0,0.2)]"
          style={{ transform: `translate(calc(-50% + ${knob}px), -50%)` }}
        />
      </div>
    </div>
  )
}

function HoldButton({
  label,
  className,
  onPress,
  onHold,
  children,
}: {
  label: string
  className: string
  onPress: () => void
  onHold: (held: boolean) => void
  children: React.ReactNode
}) {
  const [down, setDown] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      className={`btn-game pointer-events-auto flex touch-none select-none flex-col items-center justify-center rounded-full ${down ? 'translate-y-1' : ''} ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDown(true)
        onPress()
        onHold(true)
      }}
      onPointerUp={() => {
        setDown(false)
        onHold(false)
      }}
      onPointerCancel={() => {
        setDown(false)
        onHold(false)
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

export function TouchControls() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <Joystick />
      <div className="absolute bottom-5 right-5 flex items-end gap-4 sm:bottom-8 sm:right-8">
        <HoldButton
          label="Duck or dive"
          className="size-18 bg-sky text-white"
          onPress={() => input.pressDuck()}
          onHold={(h) => (input.touchDuck = h)}
        >
          <ChevronDown className="size-8" aria-hidden />
          <span className="font-display -mt-1 text-xs">DUCK</span>
        </HoldButton>
        <HoldButton
          label="Jump"
          className="mb-6 size-24 bg-primary text-white"
          onPress={() => input.pressJump()}
          onHold={(h) => (input.touchJump = h)}
        >
          <ChevronsUp className="size-10" aria-hidden />
          <span className="font-display -mt-1 text-sm">JUMP</span>
        </HoldButton>
      </div>
    </div>
  )
}
