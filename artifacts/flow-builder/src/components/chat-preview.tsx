import { useState, useRef, useEffect } from "react";
import { FlowInput, ChatMessage, ChatResult, useSendChat } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, RotateCcw, PanelRightClose, ExternalLink } from "lucide-react";
import oddyAvatar from "@assets/image_1780408993323.png";

// Last-resort client timeout. The server bounds its own LLM/search calls
// (classifier 25s + research 25s worst case), so this only catches a truly
// stuck request (network/proxy hang) and turns it into a recoverable error.
const REQUEST_TIMEOUT_MS = 60000;

// Authors split one reply into several human-feeling bubbles by putting a line
// containing only "---" where they want a break. Each chunk is sent in sequence
// with a short typing pause between, so it reads like someone typing.
function splitIntoBubbles(text: string): string[] {
  const groups: string[] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "---") {
      groups.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  groups.push(current.join("\n"));
  const parts = groups.map((g) => g.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

// Pause before the next bubble, scaled to its length so longer lines "take
// longer to type". Bounded so the conversation never drags.
function typingDelayFor(text: string): number {
  return Math.min(1600, 450 + text.length * 14);
}

export default function ChatPreview({ 
  flow,
  onActiveNodeChange,
  onCollapse,
  previewHref
}: { 
  flow: FlowInput;
  onActiveNodeChange: (nodeId: string | null) => void;
  onCollapse?: () => void;
  previewHref?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendChat = useSendChat();

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearReveal = () => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  };

  // Reveal an assistant reply as one or more bubbles, one after another, with a
  // typing pause between. `finalize` runs once every bubble is shown, so node
  // highlight / done state only update when the conversation is ready for input.
  const revealReply = (reply: string, session: number, finalize: () => void) => {
    clearReveal();
    const parts = splitIntoBubbles(reply);
    setMessages((prev) => [...prev, { role: "assistant", content: parts[0] }]);

    if (parts.length === 1) {
      finalize();
      return;
    }

    setRevealing(true);
    // Reveal the remaining bubbles one at a time. The index is passed as an
    // argument (not a mutable closure var) and the content is captured into a
    // const, so the deferred setMessages updater can't read a stale/advanced
    // index and push `undefined` content.
    const revealFrom = (idx: number) => {
      if (session !== sessionRef.current) {
        setRevealing(false);
        return;
      }
      const content = parts[idx];
      setMessages((prev) => [...prev, { role: "assistant", content }]);
      const next = idx + 1;
      if (next < parts.length) {
        revealTimerRef.current = setTimeout(() => revealFrom(next), typingDelayFor(parts[next]));
      } else {
        setRevealing(false);
        finalize();
      }
    };
    revealTimerRef.current = setTimeout(() => revealFrom(1), typingDelayFor(parts[1]));
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
        revealReply(res.reply, session, () => {
          if (session !== sessionRef.current) return;
          setCurrentNodeId(res.currentNodeId);
          setIsDone(res.done);
          onActiveNodeChange(res.currentNodeId);
        });
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
    clearReveal();
    setRevealing(false);
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
        revealReply(res.reply, session, () => {
          if (session !== sessionRef.current) return;
          setCurrentNodeId(res.currentNodeId);
          setIsDone(res.done);
          onActiveNodeChange(res.currentNodeId);
        });
      },
      onError: () => {
        if (session !== sessionRef.current) return;
        clearTimer();
        setError("Couldn't start the conversation. Try again.");
      }
    });
  };

  const busy = (sendChat.isPending || revealing) && !timedOut;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  useEffect(() => {
    return () => {
      clearTimer();
      clearReveal();
    };
  }, []);

  return (
    <div className="relative flex flex-col h-full bg-card border-l border-border z-20">
      {/* Subtle yellow gradient washing down from the top of the screen */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-56 z-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(250,204,21,0.20), rgba(250,204,21,0))",
        }}
      />

      <div className="relative z-10 px-4 pt-12 pb-3 flex flex-col items-center shrink-0">
        <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-white/70 shadow-sm bg-card">
          <img src={oddyAvatar} alt="Oddy" className="w-full h-full object-cover object-top" />
        </div>
        <span className="mt-1.5 font-bold text-sm text-foreground">Oddy</span>

        <div className="absolute right-3 top-4 flex items-center gap-1">
          {previewHref && (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Open shareable preview in a new tab"
              aria-label="Open shareable preview in a new tab"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <Button variant="ghost" size="icon" onClick={handleRestart} disabled={busy} className="h-8 w-8" title="Restart" aria-label="Restart conversation">
            <RotateCcw className="w-4 h-4" />
          </Button>
          {onCollapse && (
            <Button variant="ghost" size="icon" onClick={onCollapse} className="h-8 w-8" title="Collapse preview" aria-label="Collapse preview">
              <PanelRightClose className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
            <div className="w-16 h-16 rounded-full overflow-hidden opacity-80 ring-2 ring-white/70 shadow-sm">
              <img src={oddyAvatar} alt="Oddy" className="w-full h-full object-cover object-top" />
            </div>
            <p className="text-sm text-center max-w-[200px]">Test your flow here.</p>
            <Button onClick={() => handleRestart()}>Start Chat</Button>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`px-3.5 py-2.5 text-sm whitespace-pre-wrap max-w-[85%] ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
                : 'bg-secondary text-foreground rounded-2xl rounded-tl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        
        {busy && (
          <div className="flex justify-start">
            <div className="px-4 py-3 bg-secondary rounded-2xl rounded-tl-sm flex items-center gap-1.5">
              <span className="sr-only" aria-live="polite">Oddy está digitando</span>
              <span className="typing-dot" aria-hidden="true" />
              <span className="typing-dot" aria-hidden="true" />
              <span className="typing-dot" aria-hidden="true" />
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
