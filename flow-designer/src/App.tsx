import { Switch, Route, Redirect, useLocation } from 'wouter'
import { lazy, Suspense } from 'react'
import Navbar from '@/components/Navbar'
import FlowEditor from '@/pages/FlowEditor'
import PreviewPage from '@/pages/PreviewPage'

const OnboardingApp = lazy(() =>
  import('@/pages/onboarding/OnboardingFlow').then((m) => ({ default: m.OnboardingPreview })),
)
const OnboardingEditor = lazy(() => import('@/pages/onboarding/OnboardingFlow'))

const onbFallback = (
  <div className="flex h-screen items-center justify-center text-gray-400">Carregando…</div>
)

export default function App() {
  const [location] = useLocation()
  const chromeless = location.startsWith('/preview') || location.startsWith('/onboarding')

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {!chromeless && <Navbar />}
      <Switch>
        <Route path="/" component={() => <Redirect to="/flow-a" />} />

        <Route path="/preview/:flowId">
          {(params) => {
            const id = params?.flowId ?? 'flow-a'
            return <PreviewPage key={id} flowId={id} />
          }}
        </Route>

        <Route path="/onboarding/editor">
          <Suspense fallback={onbFallback}>
            <OnboardingEditor />
          </Suspense>
        </Route>
        <Route path="/onboarding">
          <Suspense fallback={onbFallback}>
            <OnboardingApp />
          </Suspense>
        </Route>

        <Route path="/:flowId">
          {(params) => {
            const id = params?.flowId ?? 'flow-a'
            return <FlowEditor key={id} flowId={id} />
          }}
        </Route>

        <Route component={() => <Redirect to="/flow-a" />} />
      </Switch>
    </div>
  )
}
