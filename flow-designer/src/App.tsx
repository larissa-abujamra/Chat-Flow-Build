import { Switch, Route, Redirect, useLocation } from 'wouter'
import Navbar from '@/components/Navbar'
import FlowEditor from '@/pages/FlowEditor'
import PreviewPage from '@/pages/PreviewPage'

export default function App() {
  const [location] = useLocation()
  const isPreview = location.startsWith('/preview')

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {!isPreview && <Navbar />}
      <Switch>
        <Route path="/" component={() => <Redirect to="/flow-a" />} />
        <Route path="/preview/:flowId">
          {(params) => {
            const id = params?.flowId ?? 'flow-a'
            return <PreviewPage key={id} flowId={id} />
          }}
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
