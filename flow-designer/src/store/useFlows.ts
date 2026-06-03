import { useState, useCallback } from 'react'
import type { FlowDefinition, FlowId } from '../types'

function makeDefaultFlow(id: FlowId, nome: string, scrapingEnabled: boolean): FlowDefinition {
  return {
    id,
    nome,
    scrapingEnabled,
    nodes: [
      {
        id: `${id}-start`,
        type: 'start',
        position: { x: 200, y: 60 },
        data: { type: 'start' },
      },
    ],
    edges: [],
  }
}

const DEFAULTS: Record<FlowId, FlowDefinition> = {
  'flow-a': makeDefaultFlow('flow-a', 'Fluxo A', true),
  'flow-b': makeDefaultFlow('flow-b', 'Fluxo B', true),
  'flow-c': makeDefaultFlow('flow-c', 'Fluxo C', false),
}

function loadFlow(id: FlowId): FlowDefinition {
  try {
    const raw = localStorage.getItem(`waz-flow-${id}`)
    if (raw) {
      const parsed = JSON.parse(raw) as FlowDefinition
      // Ensure scrapingEnabled matches the default when loading older saves
      return { ...parsed, id }
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULTS[id]
}

function persistFlow(flow: FlowDefinition) {
  try {
    localStorage.setItem(`waz-flow-${flow.id}`, JSON.stringify(flow))
  } catch {
    // ignore storage errors (quota, private mode)
  }
}

export function useFlow(id: FlowId) {
  const [flow, setFlow] = useState<FlowDefinition>(() => loadFlow(id))

  const update = useCallback((f: FlowDefinition) => {
    setFlow(f)
    persistFlow(f)
  }, [])

  const reset = useCallback(() => {
    const fresh = DEFAULTS[id]
    setFlow(fresh)
    persistFlow(fresh)
  }, [id])

  const exportJSON = useCallback(() => {
    const json = JSON.stringify(flow, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const slug = flow.nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/, '') || flow.id
    a.href = url
    a.download = `${slug}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [flow])

  const importJSON = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as FlowDefinition
        // Force the id to match this flow slot
        update({ ...parsed, id })
      } catch {
        alert('Arquivo JSON inválido.')
      }
    }
    reader.readAsText(file)
  }, [id, update])

  return { flow, update, reset, exportJSON, importJSON }
}
