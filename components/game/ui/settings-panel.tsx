'use client'

import { X } from 'lucide-react'
import { useGameStore } from '@/lib/game/store'
import type { Settings } from '@/lib/game/save'
import { IconButton } from './game-button'

function Row<K extends keyof Settings>({
  label,
  k,
  options,
}: {
  label: string
  k: K
  options: { value: Settings[K]; label: string }[]
}) {
  const value = useGameStore((s) => s.save.settings[k])
  const update = useGameStore((s) => s.updateSettings)
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-display text-lg text-ink">{label}</span>
      <div className="flex rounded-xl border-3 border-ink bg-ink/10 p-0.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => update({ [k]: o.value } as Partial<Settings>)}
            className={`font-display rounded-lg px-3 py-1 text-sm uppercase ${
              value === o.value ? 'bg-sky text-white' : 'text-ink/70'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/60 p-4" role="dialog" aria-modal aria-label="Settings">
      <div className="panel-game animate-pop-in relative w-full max-w-sm rounded-3xl bg-panel p-5">
        <h2 className="font-display text-outline-thin mb-4 text-center text-3xl text-accent">Settings</h2>
        <IconButton aria-label="Close settings" tone="primary" className="absolute -right-3 -top-3" onClick={onClose}>
          <X className="size-6" />
        </IconButton>
        <div className="flex flex-col gap-3">
          <Row label="Sound FX" k="sfx" options={[{ value: true, label: 'On' }, { value: false, label: 'Off' }]} />
          <Row label="Music" k="music" options={[{ value: true, label: 'On' }, { value: false, label: 'Off' }]} />
          <Row
            label="Graphics"
            k="quality"
            options={[
              { value: 'low', label: 'Fast' },
              { value: 'high', label: 'Pretty' },
            ]}
          />
          <Row
            label="Touch pad"
            k="touchControls"
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
