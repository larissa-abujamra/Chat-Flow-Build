import { ArrowLeft } from 'lucide-react'
import { Link } from 'wouter'
import type { FlowId } from '@/types'
import { useFlow } from '@/store/useFlows'
import ChatPreview from '@/components/ChatPreview'

export default function PreviewPage({ flowId }: { flowId: FlowId }) {
  const { flow } = useFlow(flowId)

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{
        background:
          'linear-gradient(135deg, rgba(251,113,133,0.12) 0%, rgba(34,197,94,0.08) 40%, rgba(59,130,246,0.10) 80%)',
        backgroundColor: 'hsl(var(--background))',
      }}
    >
      {/* Back button */}
      <div className="w-full max-w-sm mb-6 flex items-center gap-2">
        <Link href={`/${flowId}`}>
          <span
            role="button"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao editor
          </span>
        </Link>
        <span className="ml-auto text-xs text-muted-foreground">{flow.nome}</span>
      </div>

      {/* iPhone frame */}
      <div
        style={{
          width: 375,
          borderRadius: 50,
          background: '#111',
          padding: 10,
          boxShadow: [
            '0 40px 100px rgba(0,0,0,0.35)',
            '0 0 0 1px rgba(255,255,255,0.07)',
            'inset 0 1px 0 rgba(255,255,255,0.1)',
          ].join(', '),
          position: 'relative',
        }}
      >
        {/* Side buttons */}
        <div style={{ position: 'absolute', left: -3, top: 100, width: 3, height: 32, background: '#222', borderRadius: '2px 0 0 2px' }} />
        <div style={{ position: 'absolute', left: -3, top: 144, width: 3, height: 60, background: '#222', borderRadius: '2px 0 0 2px' }} />
        <div style={{ position: 'absolute', left: -3, top: 216, width: 3, height: 60, background: '#222', borderRadius: '2px 0 0 2px' }} />
        <div style={{ position: 'absolute', right: -3, top: 152, width: 3, height: 80, background: '#222', borderRadius: '0 2px 2px 0' }} />

        {/* Screen */}
        <div
          style={{
            borderRadius: 42,
            overflow: 'hidden',
            background: 'white',
            display: 'flex',
            flexDirection: 'column',
            height: 760,
          }}
        >
          {/* Status bar */}
          <div
            style={{
              height: 50,
              background: 'white',
              display: 'flex',
              alignItems: 'flex-end',
              paddingBottom: 6,
              paddingLeft: 24,
              paddingRight: 24,
              justifyContent: 'space-between',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.3 }}>9:41</span>
            {/* Dynamic island */}
            <div
              style={{
                width: 116,
                height: 34,
                background: '#000',
                borderRadius: 20,
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                top: 8,
              }}
            />
            {/* Battery + signal icons (simple) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
                <rect x="0.5" y="0.5" width="14" height="11" rx="3.5" stroke="black" strokeOpacity="0.35" />
                <rect x="2" y="2" width="10" height="8" rx="2" fill="black" />
                <path d="M15.5 4.5V7.5" stroke="black" strokeOpacity="0.4" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          {/* Chat */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ChatPreview
              flow={flow}
              standalone
              flowId={flowId}
            />
          </div>

          {/* Home indicator */}
          <div
            style={{
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ width: 120, height: 5, background: '#000', borderRadius: 3, opacity: 0.18 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
