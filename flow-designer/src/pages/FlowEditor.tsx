import { useState, useRef, lazy, Suspense } from 'react'
import { Download, Upload, Edit2, Check } from 'lucide-react'
import type { FlowId } from '@/types'
import { useFlow } from '@/store/useFlows'
import FlowCanvas from '@/components/FlowCanvas'
import ChatPreview from '@/components/ChatPreview'
import { Button } from '@/components/ui/button'

// Fluxo Stefano previews the real Squad onboarding wizard (live CNPJ/Places/iFood),
// not the scripted node-walker. Lazy so the flow-designer bundle stays lean.
const OnboardingPreview = lazy(() =>
  import('@/pages/onboarding/OnboardingFlow').then((m) => ({ default: m.OnboardingPreview })),
)
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip'

export default function FlowEditor({ flowId }: { flowId: FlowId }) {
  const { flow, update, exportJSON, importJSON } = useFlow(flowId)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(flow.nome)
  const importRef = useRef<HTMLInputElement>(null)

  const handleNameCommit = () => {
    if (draftName.trim()) {
      update({ ...flow, nome: draftName.trim() })
    } else {
      setDraftName(flow.nome)
    }
    setEditingName(false)
  }

  const handleImportClick = () => importRef.current?.click()

  const handleImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) importJSON(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0 z-10">
        {/* Flow name */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {editingName ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => { e.preventDefault(); handleNameCommit() }}
            >
              <Input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={handleNameCommit}
                className="h-7 text-sm font-semibold w-40"
              />
              <Button type="submit" size="icon" variant="ghost" className="h-7 w-7">
                <Check className="w-3.5 h-3.5" />
              </Button>
            </form>
          ) : (
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground/70 transition-colors group"
              onClick={() => { setDraftName(flow.nome); setEditingName(true) }}
            >
              {flow.nome}
              <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          {/* Scraping badge */}
          {flow.scrapingEnabled && (
            <span className="eyebrow ml-1 px-1.5 py-0.5 rounded-full bg-fin/15 text-fin">
              Scraping ON
            </span>
          )}
        </div>

        {/* Node count */}
        <span className="eyebrow">
          {flow.nodes.length} {flow.nodes.length === 1 ? 'nó' : 'nós'}
        </span>

        <div className="w-px h-4 bg-border" />

        <TooltipProvider delayDuration={300}>
          <Tooltip label="Exportar JSON">
            <Button variant="outline" size="sm" onClick={exportJSON} className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
          </Tooltip>

          <Tooltip label="Importar JSON">
            <Button variant="outline" size="sm" onClick={handleImportClick} className="gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Import
            </Button>
          </Tooltip>
        </TooltipProvider>

        <input
          ref={importRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportChange}
        />
      </div>

      {/* Main area: canvas + preview */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 min-w-0 relative">
          <FlowCanvas
            flow={flow}
            onChange={update}
            activeNodeId={activeNodeId}
          />
        </div>

        {/* Right preview. Fluxo Stefano and Flow Final run the real Squad
            onboarding wizard (same polished UI/buttons); every other flow uses
            the scripted node-walker chat preview. */}
        {flowId === 'flow-stefano' || flowId === 'flow-final' ? (
          <div
            className="flex flex-col h-full bg-card border-l border-border shrink-0"
            style={{ width: 460 }}
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Carregando…
                </div>
              }
            >
              <OnboardingPreview embedded />
            </Suspense>
          </div>
        ) : (
          <ChatPreview
            flow={flow}
            flowId={flowId}
            onActiveNodeChange={setActiveNodeId}
            collapsed={chatCollapsed}
            onToggleCollapse={() => setChatCollapsed((v) => !v)}
          />
        )}
      </div>
    </div>
  )
}
