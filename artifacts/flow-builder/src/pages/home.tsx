import { useState, useEffect } from "react";
import { useGetFlow, getGetFlowQueryKey, FlowInput } from "@workspace/api-client-react";
import FlowEditor from "@/components/flow-editor";
import ChatPreview from "@/components/chat-preview";
import { Loader2, PanelRightOpen } from "lucide-react";

export default function Home() {
  const { data: serverFlow, isLoading } = useGetFlow({ query: { queryKey: getGetFlowQueryKey() } });
  
  const [liveFlow, setLiveFlow] = useState<FlowInput | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [previewCollapsed, setPreviewCollapsed] = useState(false);

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
      <div className={`relative w-full border-r border-border flex flex-col h-[50vh] md:h-screen transition-all ${previewCollapsed ? "md:w-full" : "md:w-2/3"}`}>
        <FlowEditor 
          flow={liveFlow} 
          onChange={setLiveFlow} 
          activeNodeId={activeNodeId} 
        />
        {previewCollapsed && (
          <button
            type="button"
            onClick={() => setPreviewCollapsed(false)}
            className="absolute top-4 right-4 z-20 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-muted transition-colors"
            title="Show preview"
          >
            <PanelRightOpen className="w-4 h-4" /> Preview
          </button>
        )}
      </div>
      {!previewCollapsed && (
        <div className="w-full md:w-1/3 flex flex-col h-[50vh] md:h-screen bg-card">
          <ChatPreview 
            flow={liveFlow} 
            onActiveNodeChange={setActiveNodeId}
            onCollapse={() => setPreviewCollapsed(true)}
          />
        </div>
      )}
    </div>
  );
}
