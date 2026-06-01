import { FlowInput, FlowNode, FlowBranch, useUpdateFlow, getGetFlowQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save, Flag, Zap, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function FlowEditor({ 
  flow, 
  onChange, 
  activeNodeId,
  serverFlowId 
}: { 
  flow: FlowInput; 
  onChange: (f: FlowInput) => void;
  activeNodeId: string | null;
  serverFlowId?: string;
}) {
  const updateFlow = useUpdateFlow();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const addNode = () => {
    const newNode: FlowNode = {
      id: crypto.randomUUID(),
      question: "New Question",
      branches: [],
    };
    
    onChange({
      ...flow,
      nodes: [...flow.nodes, newNode],
      startNodeId: flow.nodes.length === 0 ? newNode.id : flow.startNodeId
    });
  };

  const removeNode = (id: string) => {
    onChange({
      ...flow,
      nodes: flow.nodes.filter(n => n.id !== id),
      startNodeId: flow.startNodeId === id ? null : flow.startNodeId
    });
  };

  const updateNode = (id: string, updates: Partial<FlowNode>) => {
    onChange({
      ...flow,
      nodes: flow.nodes.map(n => n.id === id ? { ...n, ...updates } : n)
    });
  };

  const addBranch = (nodeId: string) => {
    const node = flow.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const newBranch: FlowBranch = {
      id: crypto.randomUUID(),
      label: "New Branch",
      targetNodeId: null
    };

    updateNode(nodeId, { branches: [...node.branches, newBranch] });
  };

  const updateBranch = (nodeId: string, branchId: string, updates: Partial<FlowBranch>) => {
    const node = flow.nodes.find(n => n.id === nodeId);
    if (!node) return;

    updateNode(nodeId, {
      branches: node.branches.map(b => b.id === branchId ? { ...b, ...updates } : b)
    });
  };

  const removeBranch = (nodeId: string, branchId: string) => {
    const node = flow.nodes.find(n => n.id === nodeId);
    if (!node) return;

    updateNode(nodeId, {
      branches: node.branches.filter(b => b.id !== branchId)
    });
  };

  const handleSave = () => {
    updateFlow.mutate({ data: flow }, {
      onSuccess: () => {
        toast({ title: "Flow saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetFlowQueryKey() });
      },
      onError: (err) => {
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
        <Button onClick={handleSave} disabled={updateFlow.isPending} className="gap-2 shrink-0">
          <Save className="w-4 h-4" /> Save Flow
        </Button>
      </div>

      <div className="flex-1 overflow-auto bg-background/50 p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
          
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold tracking-tight">Nodes</h2>
            <Button onClick={addNode} variant="secondary" className="gap-2">
              <Plus className="w-4 h-4" /> Add Node
            </Button>
          </div>

          {flow.nodes.length === 0 ? (
            <div className="text-center py-12 px-4 border-2 border-dashed border-border rounded-xl text-muted-foreground">
              <p className="mb-4">No nodes yet. Create a node to start building your flow.</p>
              <Button onClick={addNode}>Create First Node</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {flow.nodes.map(node => (
                <Card 
                  key={node.id} 
                  className={`border-l-4 transition-colors ${activeNodeId === node.id ? 'border-l-primary ring-1 ring-primary/50' : 'border-l-transparent'} ${flow.startNodeId === node.id ? 'border-l-green-500' : ''}`}
                >
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="flex-1 mr-4">
                      <Label className="text-xs text-muted-foreground mb-1 block">Question / Message</Label>
                      <Input 
                        value={node.question}
                        onChange={e => updateNode(node.id, { question: e.target.value })}
                        className="font-medium"
                      />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {flow.startNodeId !== node.id ? (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => onChange({ ...flow, startNodeId: node.id })}
                          title="Set as Start Node"
                        >
                          <Flag className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      ) : (
                        <div className="flex items-center gap-1 text-green-500 text-xs font-bold px-2 py-1 bg-green-500/10 rounded-md">
                          <CheckCircle2 className="w-4 h-4" /> Start
                        </div>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => removeNode(node.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <Label className="text-xs text-muted-foreground">Branches (User Answers)</Label>
                      {node.branches.map(branch => (
                        <div key={branch.id} className="flex items-center gap-3 bg-muted/50 p-2 rounded-lg">
                          <Input 
                            value={branch.label}
                            onChange={e => updateBranch(node.id, branch.id, { label: e.target.value })}
                            placeholder="e.g. Yes"
                            className="flex-1 bg-background h-8"
                          />
                          <div className="text-muted-foreground text-sm">→</div>
                          <Select 
                            value={branch.targetNodeId || "end"} 
                            onValueChange={v => updateBranch(node.id, branch.id, { targetNodeId: v === "end" ? null : v })}
                          >
                            <SelectTrigger className="w-[180px] h-8 bg-background">
                              <SelectValue placeholder="End of conversation" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="end">End of conversation</SelectItem>
                              {flow.nodes.filter(n => n.id !== node.id).map(n => (
                                <SelectItem key={n.id} value={n.id}>
                                  {n.question.substring(0, 20)}{n.question.length > 20 ? '...' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeBranch(node.id, branch.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addBranch(node.id)} className="w-full border-dashed h-8">
                        <Plus className="w-3 h-3 mr-2" /> Add Branch
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
