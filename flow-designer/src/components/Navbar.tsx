import { Link, useLocation } from 'wouter'
import { Plus } from 'lucide-react'
import { useFlowList } from '@/store/useFlows'

export default function Navbar() {
  const [location, navigate] = useLocation()
  const { tabs, addFlow } = useFlowList()

  const handleAdd = () => {
    const id = addFlow()
    navigate(`/${id}`)
  }

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

      <div className="h-0.5 flex-none w-px bg-border" />

      {/* Flow tabs */}
      <div className="flex items-center gap-1">
        {tabs.map(({ id, label }) => {
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

        {/* Add flow button */}
        <button
          type="button"
          onClick={handleAdd}
          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-0.5"
          title="Criar novo fluxo"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="eyebrow">Waz Onboarding</span>
        <div className="h-4 w-16 rounded-full brand-gradient opacity-60" />
      </div>
    </nav>
  )
}
