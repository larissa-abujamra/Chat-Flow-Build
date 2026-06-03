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
        <Route path="/flow-a" component={() => <FlowEditor flowId="flow-a" />} />
        <Route path="/flow-b" component={() => <FlowEditor flowId="flow-b" />} />
        <Route path="/flow-c" component={() => <FlowEditor flowId="flow-c" />} />
        <Route path="/preview/flow-a" component={() => <PreviewPage flowId="flow-a" />} />
        <Route path="/preview/flow-b" component={() => <PreviewPage flowId="flow-b" />} />
        <Route path="/preview/flow-c" component={() => <PreviewPage flowId="flow-c" />} />
        <Route component={() => <Redirect to="/flow-a" />} />
      </Switch>
    </div>
  )
}
