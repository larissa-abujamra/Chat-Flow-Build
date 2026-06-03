import { useState } from 'react'

// Friendly labels for the {placeholder} variables — shown as chips in the canvas
// so the raw braces never appear. The stored text still uses {token} (which the
// live preview fills with real data).
const VAR_LABELS: Record<string, string> = {
  nome: 'nome',
  negocio: 'negócio',
  cidade: 'cidade',
  endereco: 'endereço',
  telefone: 'telefone',
  site: 'site',
  instagram: 'Instagram',
}

function renderWithChips(text: string) {
  return text.split(/(\{[a-z_]+\})/g).map((part, i) => {
    const m = /^\{([a-z_]+)\}$/.exec(part)
    if (m) {
      return (
        <span key={i} className="var-chip" title={`Variável: ${m[1]} (preenchida com dados reais)`}>
          {VAR_LABELS[m[1]] ?? m[1]}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

/**
 * Node text field that shows {variables} as styled chips when idle and a plain
 * textarea while editing (click to edit, blur to commit). Keeps the underlying
 * {token} text so the preview substitution keeps working.
 */
export function VarText({
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        rows={rows}
        placeholder={placeholder}
        className="nodrag nowheel w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    )
  }

  return (
    <div
      role="textbox"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onFocus={() => setEditing(true)}
      title="Clique para editar"
      className={`nodrag w-full text-sm whitespace-pre-wrap break-words cursor-text leading-relaxed ${
        value ? 'text-foreground' : 'text-muted-foreground'
      }`}
    >
      {value ? renderWithChips(value) : placeholder}
    </div>
  )
}
