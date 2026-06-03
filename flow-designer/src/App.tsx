import { Switch, Route, Redirect, useLocation } from 'wouter'
import { lazy, Suspense } from 'react'
import Navbar from '@/components/Navbar'
import FlowEditor from '@/pages/FlowEditor'
import PreviewPage from '@/pages/PreviewPage'

// Lazy-loaded so the large onboarding bundle never weighs down the flow designer.
// `/onboarding` is the real end-user experience (the full-screen wizard);
// `/onboarding/editor` is the internal step/copy editor (default export).
const OnboardingApp = lazy(() =>
  import('@/pages/onboarding/OnboardingFlow').then((m) => ({ default: m.OnboardingPreview })),
)
const OnboardingEditor = lazy(() => import('@/pages/onboarding/OnboardingFlow'))

const onbFallback = (
  <div className="flex h-screen items-center justify-center text-gray-400">Carregando…</div>
)

export default function App() {
  const [location] = useLocation()
  // Full-screen experiences that should not show the flow-designer navbar.
  const chromeless = location.startsWith('/preview') || location.startsWith('/onboarding')

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {!chromeless && <Navbar />}
      <Switch>
        <Route path="/" component={() => <Redirect to="/flow-a" />} />
        <Route path="/flow-a" component={() => <FlowEditor flowId="flow-a" />} />
        <Route path="/flow-b" component={() => <FlowEditor flowId="flow-b" />} />
        <Route path="/flow-c" component={() => <FlowEditor flowId="flow-c" />} />
        <Route path="/preview/flow-a" component={() => <PreviewPage flowId="flow-a" />} />
        <Route path="/preview/flow-b" component={() => <PreviewPage flowId="flow-b" />} />
        <Route path="/preview/flow-c" component={() => <PreviewPage flowId="flow-c" />} />

        {/* Internal step/copy editor for the onboarding (kept for the team). */}
        <Route path="/onboarding/editor">
          <Suspense fallback={onbFallback}>
            <OnboardingEditor />
          </Suspense>
        </Route>
        {/* Standalone full-screen onboarding wizard — the real end-user experience. */}
        <Route path="/onboarding">
          <Suspense fallback={onbFallback}>
            <OnboardingApp />
          </Suspense>
        </Route>

        <Route component={() => <Redirect to="/flow-a" />} />
      </Switch>
    </div>
  )
}
