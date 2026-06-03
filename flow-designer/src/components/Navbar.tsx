import { Link, useLocation } from 'wouter'
import { Plus, Trash2 } from 'lucide-react'
import { useFlowList } from '@/store/useFlows'

export default function Navbar() {
  const [location, navigate] = useLocation()
  const { tabs, addFlow, removeFlow } = useFlowList()

  const handleAdd = () => {
    const id = addFlow()
    navigate(`/${id}`)
  }

  const handleDelete = (id: string, label: string) => {
    if (!window.confirm(`Deletar o fluxo "${label}"? Essa ação não pode ser desfeita.`)) return
    removeFlow(id)
    if (location === `/${id}`) navigate('/flow-a')
  }

  return (
    <nav className="h-12 flex items-center border-b border-border bg-card px-4 shrink-0 gap-4 z-30">
      {/* Brand */}
      <div className="flex items-center gap-2 mr-2">
        <img src="/orbe.png" alt="Orbe" className="w-7 h-7 rounded-full object-cover" />
        <span className="font-bold text-sm tracking-tight">Flow Designer</span>
      </div>

      <div className="h-0.5 flex-none w-px bg-border" />

      {/* Flow tabs */}
      <div className="flex items-center gap-1">
        {tabs.map(({ id, label, custom }) => {
          const href = `/${id}`
          const isActive = location === href || (location === '/' && id === 'flow-a')
          return (
            <div key={id} className="relative flex items-center group">
              <Link
                href={href}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  custom ? 'pr-7' : ''
                } ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {label}
              </Link>
              {custom && (
                <button
                  type="button"
                  onClick={() => handleDelete(id, label)}
                  className={`absolute right-1.5 flex items-center justify-center w-4 h-4 rounded-full transition-opacity opacity-0 group-hover:opacity-100 ${
                    isActive
                      ? 'text-primary-foreground/80 hover:text-primary-foreground'
                      : 'text-muted-foreground hover:text-destructive'
                  }`}
                  title="Deletar fluxo"
                  aria-label={`Deletar ${label}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )
        })}

        <button
          type="button"
          onClick={handleAdd}
          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-0.5"
          title="Criar novo fluxo"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      <Link
        href="/onboarding"
        className="ml-auto flex items-center gap-2 group"
        title="Abrir o onboarding"
      >
        <span className="eyebrow group-hover:text-foreground transition-colors">Onboarding</span>
        <div className="h-4 w-16 rounded-full brand-gradient opacity-60 group-hover:opacity-100 transition-opacity" />
      </Link>
    </nav>
  )
}
