import { useState, useEffect } from "react";
import { useGetFlow, getGetFlowQueryKey, FlowInput } from "@workspace/api-client-react";
import FlowEditor from "@/components/flow-editor";
import ChatPreview from "@/components/chat-preview";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { data: serverFlow, isLoading } = useGetFlow({ query: { queryKey: getGetFlowQueryKey() } });
  
  const [liveFlow, setLiveFlow] = useState<FlowInput | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (serverFlow && !liveFlow) {
      setLiveFlow({
        name: serverFlow.name,
        startNodeId: serverFlow.startNodeId,
        nodes: serverFlow.nodes,
      });
    }
  }, [serverFlow, liveFlow]);

  if (isLoading || !liveFlow) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-background overflow-hidden">
      <div className="w-full md:w-2/3 border-r border-border flex flex-col h-[50vh] md:h-screen">
        <FlowEditor 
          flow={liveFlow} 
          onChange={setLiveFlow} 
          activeNodeId={activeNodeId} 
        />
      </div>
      <div className="w-full md:w-1/3 flex flex-col h-[50vh] md:h-screen bg-card">
        <ChatPreview 
          flow={liveFlow} 
          onActiveNodeChange={setActiveNodeId}
        />
      </div>
    </div>
  );
}
