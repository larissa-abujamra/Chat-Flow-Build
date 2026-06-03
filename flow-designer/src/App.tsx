import { Switch, Route, Redirect } from 'wouter'
import { lazy, Suspense } from 'react'
import Navbar from '@/components/Navbar'
import FlowEditor from '@/pages/FlowEditor'
import type { FlowId } from '@/types'

// Lazy-loaded so the large onboarding bundle never weighs down the flow designer.
// `/onboarding` is the real end-user experience (the full-screen wizard).
// `/onboarding/editor` is the internal step/copy editor (named export OnboardingPreview
// lives in the same module; the default export is the editor).
const OnboardingApp = lazy(() =>
  import('@/pages/onboarding/OnboardingFlow').then((m) => ({ default: m.OnboardingPreview })),
)
const OnboardingEditor = lazy(() => import('@/pages/onboarding/OnboardingFlow'))

// The flow designer keeps its original chrome (top Navbar + editor).
function FlowLayout({ flowId }: { flowId: FlowId }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Navbar />
      <FlowEditor flowId={flowId} />
    </div>
  )
}

export default function App() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/flow-a" />} />

      {/* Internal step/copy editor for the onboarding (kept for the team). */}
      <Route path="/onboarding/editor">
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center text-gray-400">
              Carregando…
            </div>
          }
        >
          <OnboardingEditor />
        </Suspense>
      </Route>

      {/* Standalone full-screen onboarding wizard — the real end-user experience. */}
      <Route path="/onboarding">
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center text-gray-400">
              Carregando…
            </div>
          }
        >
          <OnboardingApp />
        </Suspense>
      </Route>

      <Route path="/flow-a" component={() => <FlowLayout flowId="flow-a" />} />
      <Route path="/flow-b" component={() => <FlowLayout flowId="flow-b" />} />
      <Route path="/flow-c" component={() => <FlowLayout flowId="flow-c" />} />
      <Route component={() => <Redirect to="/flow-a" />} />
    </Switch>
  )
}
