import { useState, useRef, useEffect } from "react";
import { FlowInput, ChatMessage, ChatResult, useSendChat } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, RotateCcw, Bot, User, Loader2, PanelRightClose } from "lucide-react";

const RESEARCH_NODE_ID = "companyResearch";
// Last-resort client timeout. The server bounds its own LLM/search calls
// (classifier 25s + research 25s worst case), so this only catches a truly
// stuck request (network/proxy hang) and turns it into a recoverable error.
const REQUEST_TIMEOUT_MS = 60000;

export default function ChatPreview({ 
  flow,
  onActiveNodeChange,
  onCollapse
}: { 
  flow: FlowInput;
  onActiveNodeChange: (nodeId: string | null) => void;
  onCollapse?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendChat = useSendChat();

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    setTimedOut(false);
    timerRef.current = setTimeout(() => {
      // Abandon this request: bump the session so a late response is ignored,
      // stop the spinner, and surface a recoverable error.
      sessionRef.current += 1;
      setError("This is taking longer than expected. Please try again.");
      setTimedOut(true);
    }, REQUEST_TIMEOUT_MS);
  };

  const handleSend = (overrideMessage?: string) => {
    const text = overrideMessage ?? inputValue;
    if (!text.trim() && messages.length > 0) return;

    const session = sessionRef.current;
    const newMessages = [...messages];

    if (messages.length > 0) {
      newMessages.push({ role: "user", content: text });
      setMessages(newMessages);
      setInputValue("");
    }
    setError(null);
    startTimer();

    sendChat.mutate({
      data: {
        flow,
        messages: newMessages,
        currentNodeId
      }
    }, {
      onSuccess: (res: ChatResult) => {
        if (session !== sessionRef.current) return;
        clearTimer();
        setMessages(prev => [...prev, { role: "assistant", content: res.reply }]);
        setCurrentNodeId(res.currentNodeId);
        setIsDone(res.done);
        onActiveNodeChange(res.currentNodeId);
      },
      onError: () => {
        if (session !== sessionRef.current) return;
        clearTimer();
        setError("Something went wrong generating a reply. Try again.");
      }
    });
  };

  const handleRestart = () => {
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setMessages([]);
    setCurrentNodeId(null);
    setIsDone(false);
    setError(null);
    setInputValue("");
    onActiveNodeChange(null);
    startTimer();

    sendChat.mutate({
      data: {
        flow,
        messages: [],
        currentNodeId: null
      }
    }, {
      onSuccess: (res: ChatResult) => {
        if (session !== sessionRef.current) return;
        clearTimer();
        setMessages([{ role: "assistant", content: res.reply }]);
        setCurrentNodeId(res.currentNodeId);
        setIsDone(res.done);
        onActiveNodeChange(res.currentNodeId);
      },
      onError: () => {
        if (session !== sessionRef.current) return;
        clearTimer();
        setError("Couldn't start the conversation. Try again.");
      }
    });
  };

  const busy = sendChat.isPending && !timedOut;

  // The current node's answer leads into the web-research step, which makes an
  // extra (slower) web lookup — surface that so the longer wait reads as
  // intentional rather than frozen.
  const currentNode = flow.nodes?.find((n) => n.id === currentNodeId);
  const isResearchStep =
    currentNode?.branches?.some((b) => b.targetNodeId === RESEARCH_NODE_ID) ?? false;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  useEffect(() => clearTimer, []);

  return (
    <div className="flex flex-col h-full bg-card border-l border-border z-20">
      <div className="p-4 border-b border-border bg-sidebar flex items-center justify-between shrink-0">
        <h3 className="font-bold flex items-center gap-2">
          <span className="w-7 h-7 rounded-full brand-gradient flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </span>
          Preview
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleRestart} disabled={busy} className="h-8 gap-2">
            <RotateCcw className="w-3.5 h-3.5" /> Restart
          </Button>
          {onCollapse && (
            <Button variant="ghost" size="icon" onClick={onCollapse} className="h-8 w-8" title="Collapse preview">
              <PanelRightClose className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
            <Bot className="w-12 h-12 opacity-20" />
            <p className="text-sm text-center max-w-[200px]">Test your flow here.</p>
            <Button onClick={() => handleRestart()}>Start Chat</Button>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-muted' : 'brand-gradient'}`}>
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-white" />}
              </div>
              <div className={`px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
                  : 'bg-secondary text-foreground rounded-r-2xl rounded-bl-2xl border-l-[3px] border-waz'
              }`}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        
        {busy && (
          <div className="flex justify-start">
            <div className="flex gap-3 max-w-[85%]">
              <div className="shrink-0 w-8 h-8 rounded-full brand-gradient flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="px-3.5 py-2.5 text-sm bg-secondary rounded-r-2xl rounded-bl-2xl border-l-[3px] border-waz flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin opacity-50" />
                <span className="opacity-50">
                  {isResearchStep ? "Researching your company… this can take a few seconds" : "Thinking…"}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {error && (
          <div className="text-sm text-destructive text-center py-2">{error}</div>
        )}

        {isDone && (
          <div className="flex flex-col items-center justify-center py-6 space-y-3 border-t border-border mt-4">
            <div className="text-sm text-muted-foreground">Conversation ended</div>
            <Button variant="outline" size="sm" onClick={handleRestart} className="gap-2">
              <RotateCcw className="w-3.5 h-3.5" /> Start Over
            </Button>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border bg-sidebar shrink-0">
        <form 
          onSubmit={e => { e.preventDefault(); handleSend(); }}
          className="flex gap-2"
        >
          <Input 
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Type your answer..."
            disabled={isDone || messages.length === 0 || busy}
            className="bg-background border-border focus-visible:ring-primary"
          />
          <Button 
            type="submit" 
            disabled={isDone || messages.length === 0 || !inputValue.trim() || busy}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
