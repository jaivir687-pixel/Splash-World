import type { ButtonHTMLAttributes } from 'react'

type Tone = 'primary' | 'accent' | 'sky' | 'white' | 'good'

const TONES: Record<Tone, string> = {
  primary: 'bg-primary text-primary-foreground',
  accent: 'bg-accent text-accent-foreground',
  sky: 'bg-sky text-white',
  white: 'bg-white text-ink',
  good: 'bg-good text-white',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone
  size?: 'sm' | 'md' | 'lg'
}

export function GameButton({ tone = 'primary', size = 'md', className = '', children, ...rest }: Props) {
  const sizes = {
    sm: 'h-11 px-4 text-base rounded-xl',
    md: 'h-13 px-6 text-xl rounded-2xl',
    lg: 'h-16 px-10 text-3xl rounded-3xl',
  }
  return (
    <button
      type="button"
      className={`btn-game font-display inline-flex select-none items-center justify-center gap-2 uppercase tracking-wide disabled:opacity-50 ${TONES[tone]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({ tone = 'white', className = '', children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`btn-game inline-flex size-12 select-none items-center justify-center rounded-2xl ${TONES[tone]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
