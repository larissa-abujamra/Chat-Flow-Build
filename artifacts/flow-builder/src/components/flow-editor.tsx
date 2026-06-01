import { FlowInput, useUpdateFlow, getGetFlowQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FlowChart from "@/components/flow-chart";

export default function FlowEditor({
  flow,
  onChange,
  activeNodeId,
}: {
  flow: FlowInput;
  onChange: (f: FlowInput) => void;
  activeNodeId: string | null;
  serverFlowId?: string;
}) {
  const updateFlow = useUpdateFlow();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSave = () => {
    updateFlow.mutate({ data: flow }, {
      onSuccess: () => {
        toast({ title: "Flow saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetFlowQueryKey() });
      },
      onError: () => {
        toast({ title: "Failed to save flow", variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border bg-card flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4 flex-1">
          <Zap className="text-primary w-6 h-6" />
          <Input
            value={flow.name}
            onChange={e => onChange({ ...flow, name: e.target.value })}
            className="max-w-[300px] text-lg font-bold bg-transparent border-none px-2 focus-visible:ring-1"
            placeholder="Flow Name"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={handleSave} disabled={updateFlow.isPending} className="gap-2">
            <Save className="w-4 h-4" /> Save Flow
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-background/50">
        <FlowChart flow={flow} onChange={onChange} activeNodeId={activeNodeId} />
      </div>
    </div>
  );
}
