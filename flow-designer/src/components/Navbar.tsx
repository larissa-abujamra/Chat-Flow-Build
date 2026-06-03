import { Link, useLocation } from 'wouter'
import type { FlowId } from '@/types'

const FLOWS: { id: FlowId; label: string }[] = [
  { id: 'flow-a', label: 'Fluxo A' },
  { id: 'flow-b', label: 'Fluxo B' },
  { id: 'flow-c', label: 'Fluxo C' },
]

export default function Navbar() {
  const [location] = useLocation()

  return (
    <nav className="h-12 flex items-center border-b border-border bg-card px-4 shrink-0 gap-4 z-30">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-2">
        <span
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ background: 'hsl(var(--waz))' }}
        >
          W
        </span>
        <span className="font-bold text-sm tracking-tight">Flow Designer</span>
      </div>

      {/* Brand gradient bar */}
      <div className="h-0.5 flex-none w-px bg-border" />

      {/* Flow tabs */}
      <div className="flex items-center gap-1">
        {FLOWS.map(({ id, label }) => {
          const href = `/${id}`
          const isActive = location === href || (location === '/' && id === 'flow-a')
          return (
            <Link
              key={id}
              href={href}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Right: link to the standalone onboarding wizard */}
      <Link
        href="/onboarding"
        className="ml-auto flex items-center gap-2 group"
        title="Abrir o onboarding"
      >
        <span className="eyebrow group-hover:text-foreground transition-colors">Waz Onboarding</span>
        <div className="h-4 w-16 rounded-full brand-gradient opacity-60 group-hover:opacity-100 transition-opacity" />
      </Link>
    </nav>
  )
}
