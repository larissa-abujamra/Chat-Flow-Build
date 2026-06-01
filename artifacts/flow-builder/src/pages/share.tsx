import { useGetFlow, getGetFlowQueryKey } from "@workspace/api-client-react";
import ChatPreview from "@/components/chat-preview";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw } from "lucide-react";

const noop = () => {};

export default function Share() {
  const { data: serverFlow, isLoading, isError, refetch } = useGetFlow({
    query: { queryKey: getGetFlowQueryKey() },
  });

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-muted p-4 md:p-8">
      {/* Phone mockup */}
      <div className="relative w-full max-w-[400px] h-[min(860px,92vh)] rounded-[2.75rem] bg-foreground p-2.5 shadow-2xl ring-1 ring-black/10">
        {/* Dynamic island / notch */}
        <div className="pointer-events-none absolute left-1/2 top-4 z-30 h-6 w-28 -translate-x-1/2 rounded-full bg-foreground" />
        {/* Screen */}
        <div className="relative h-full w-full overflow-hidden rounded-[2.25rem] bg-card">
          {isError ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-muted-foreground">Couldn't load this chat. Please try again.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : isLoading || !serverFlow ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <ChatPreview
              flow={{
                name: serverFlow.name,
                startNodeId: serverFlow.startNodeId,
                nodes: serverFlow.nodes,
              }}
              onActiveNodeChange={noop}
            />
          )}
        </div>
      </div>
    </div>
  );
}
