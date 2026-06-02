import { useState } from "react";
import {
  FlowInput,
  FlowVersion,
  useListFlowVersions,
  useUpdateFlowVersion,
  useDeleteFlowVersion,
  getListFlowVersionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Pencil, Check, X, Trash2, RotateCcw, StickyNote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function VersionHistory({
  onLoad,
}: {
  onLoad: (flow: FlowInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [notesId, setNotesId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: versions, isLoading, isError } = useListFlowVersions({
    query: { queryKey: getListFlowVersionsQueryKey(), enabled: open },
  });
  const updateVersion = useUpdateFlowVersion();
  const deleteVersion = useDeleteFlowVersion();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListFlowVersionsQueryKey() });

  const startEdit = (v: FlowVersion) => {
    setEditingId(v.id);
    setDraftName(v.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftName("");
  };

  const saveEdit = (id: string) => {
    const name = draftName.trim();
    if (!name) return;
    updateVersion.mutate(
      { id, data: { name } },
      {
        onSuccess: () => {
          cancelEdit();
          invalidate();
        },
        onError: () => toast({ title: "Failed to rename version", variant: "destructive" }),
      },
    );
  };

  const startNotes = (v: FlowVersion) => {
    setNotesId(v.id);
    setDraftNotes(v.notes ?? "");
  };

  const cancelNotes = () => {
    setNotesId(null);
    setDraftNotes("");
  };

  const saveNotes = (id: string) => {
    updateVersion.mutate(
      { id, data: { notes: draftNotes.trim() || null } },
      {
        onSuccess: () => {
          cancelNotes();
          invalidate();
        },
        onError: () => toast({ title: "Failed to save notes", variant: "destructive" }),
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteVersion.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Version deleted" });
          invalidate();
        },
        onError: () => toast({ title: "Failed to delete version", variant: "destructive" }),
      },
    );
  };

  const handleLoad = (v: FlowVersion) => {
    onLoad({ name: v.name, startNodeId: v.startNodeId, nodes: v.nodes });
    setOpen(false);
    toast({ title: `Loaded "${v.name}"`, description: "Save to persist it as the live flow." });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <History className="w-4 h-4" /> History
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Version History</SheetTitle>
          <SheetDescription>
            Each saved version is a snapshot. Load one to edit it, then save to make it live.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6 mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : isError ? (
            <p className="text-sm text-destructive py-8 text-center">Failed to load versions.</p>
          ) : !versions || versions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No versions yet. Click “Save Flow” to create one.
            </p>
          ) : (
            <div className="space-y-3 pb-6">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2"
                >
                  {editingId === v.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(v.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        autoFocus
                        className="h-8"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => saveEdit(v.id)}
                        disabled={updateVersion.isPending}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={cancelEdit}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{v.name}</p>
                        <p className="eyebrow mt-0.5">{formatDate(v.createdAt)}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => startEdit(v)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  )}

                  {notesId === v.id ? (
                    <div className="flex flex-col gap-1.5">
                      <Textarea
                        value={draftNotes}
                        onChange={(e) => setDraftNotes(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNotes(v.id);
                          if (e.key === "Escape") cancelNotes();
                        }}
                        autoFocus
                        rows={3}
                        placeholder="Add any notes about this version…"
                        className="text-sm resize-none"
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="ghost" className="h-7" onClick={cancelNotes}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 gap-1.5"
                          onClick={() => saveNotes(v.id)}
                          disabled={updateVersion.isPending}
                        >
                          <Check className="w-3.5 h-3.5" /> Save
                        </Button>
                      </div>
                    </div>
                  ) : v.notes ? (
                    <button
                      type="button"
                      onClick={() => startNotes(v)}
                      className="text-left text-sm text-muted-foreground whitespace-pre-wrap rounded-md hover:bg-muted/60 px-1.5 py-1 -mx-1.5 transition-colors"
                    >
                      {v.notes}
                    </button>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1.5 flex-1"
                      onClick={() => handleLoad(v)}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Load
                    </Button>
                    {notesId !== v.id && !v.notes && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5 text-muted-foreground"
                        onClick={() => startNotes(v)}
                      >
                        <StickyNote className="w-3.5 h-3.5" /> Add notes
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{v.name}”?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes this version. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(v.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
