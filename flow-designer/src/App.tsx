import { Switch, Route, Redirect } from 'wouter'
import Navbar from '@/components/Navbar'
import FlowEditor from '@/pages/FlowEditor'

export default function App() {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <Navbar />
      <Switch>
        <Route path="/" component={() => <Redirect to="/flow-a" />} />
        <Route path="/flow-a" component={() => <FlowEditor flowId="flow-a" />} />
        <Route path="/flow-b" component={() => <FlowEditor flowId="flow-b" />} />
        <Route path="/flow-c" component={() => <FlowEditor flowId="flow-c" />} />
        <Route component={() => <Redirect to="/flow-a" />} />
      </Switch>
    </div>
  )
}
