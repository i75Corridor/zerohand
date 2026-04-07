import { useState, useRef, useEffect } from "react";
import { Send, StopCircle } from "lucide-react";
import type { WsIncomingChat } from "@pawn/shared";

interface ChatMessage {
  action: "steer" | "followUp";
  message: string;
  sentAt: Date;
}

interface ChatPanelProps {
  stepRunId: string;
  onSend: (msg: WsIncomingChat) => void;
}

export default function ChatPanel({ stepRunId, onSend }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"steer" | "followUp">("steer");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [stepRunId]);

  const send = () => {
    const msg = input.trim();
    if (!msg) return;
    onSend({ type: "chat", stepRunId, action: mode, message: msg });
    setHistory((h) => [...h, { action: mode, message: msg, sentAt: new Date() }]);
    setInput("");
  };

  const abort = () => {
    onSend({ type: "chat", stepRunId, action: "abort" });
  };

  return (
    <div className="border border-pawn-surface-700/60 rounded-card bg-pawn-surface-900/50 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-pawn-surface-500">
        <span className="font-medium text-pawn-surface-400">Steer agent</span>
        <div className="flex gap-1 ml-auto">
          {(["steer", "followUp"] as const).map((m) => (
            <button
              key={m}
              className={`px-2 py-0.5 rounded-badge text-xs transition-colors ${
                mode === m
                  ? "bg-pawn-gold-500/10 text-pawn-gold-400 border border-pawn-gold-500/30"
                  : "bg-pawn-surface-800 text-pawn-surface-400 hover:bg-pawn-surface-700"
              }`}
              onClick={() => setMode(m)}
            >
              {m === "steer" ? "Interrupt" : "Follow up"}
            </button>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div className="space-y-1 max-h-24 overflow-y-auto">
          {history.map((h, i) => (
            <div key={i} className="text-xs text-pawn-surface-500 flex gap-2">
              <span className={h.action === "steer" ? "text-amber-400" : "text-pawn-gold-400"}>
                [{h.action}]
              </span>
              <span className="text-pawn-surface-400">{h.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          ref={inputRef}
          className="flex-1 bg-pawn-surface-800 border border-pawn-surface-700 rounded-button px-3 py-1.5 text-sm text-white placeholder-pawn-surface-600 focus:outline-none focus:border-pawn-gold-500 focus:ring-1 focus:ring-pawn-gold-500"
          placeholder={mode === "steer" ? "Interrupt with a message..." : "Send a follow-up..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          className="px-2.5 py-1.5 bg-pawn-gold-500 hover:bg-pawn-gold-400 text-pawn-surface-950 rounded-button transition-colors disabled:opacity-40"
          onClick={send}
          disabled={!input.trim()}
          title="Send"
          aria-label="Send message"
        >
          <Send size={14} />
        </button>
        <button
          className="px-2.5 py-1.5 bg-rose-900/60 hover:bg-rose-800/60 border border-rose-800/50 text-rose-400 rounded-button transition-colors"
          onClick={abort}
          title="Abort step"
          aria-label="Abort step"
        >
          <StopCircle size={14} />
        </button>
      </div>
    </div>
  );
}
