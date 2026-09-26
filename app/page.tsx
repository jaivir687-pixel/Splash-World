'use client'

import dynamic from 'next/dynamic'

const GameApp = dynamic(() => import('@/components/game/game-app').then((m) => m.GameApp), {
  ssr: false,
  loading: () => (
    <main className="bg-stripes fixed inset-0 flex items-center justify-center">
      <p className="font-display text-outline animate-bob text-5xl text-white">Splash Dash</p>
    </main>
  ),
})

export default function Page() {
  return <GameApp />
}
