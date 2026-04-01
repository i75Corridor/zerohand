import { useState, useRef, useEffect } from "react";
import { Send, StopCircle } from "lucide-react";
import type { WsIncomingChat } from "@zerohand/shared";

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
    <div className="border border-gray-700 rounded-lg bg-gray-900/50 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="font-medium text-gray-400">Steer agent</span>
        <div className="flex gap-1 ml-auto">
          {(["steer", "followUp"] as const).map((m) => (
            <button
              key={m}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                mode === m
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
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
            <div key={i} className="text-xs text-gray-500 flex gap-2">
              <span className={h.action === "steer" ? "text-orange-400" : "text-blue-400"}>
                [{h.action}]
              </span>
              <span className="text-gray-400">{h.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          ref={inputRef}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          placeholder={mode === "steer" ? "Interrupt with a message..." : "Send a follow-up..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors disabled:opacity-50"
          onClick={send}
          disabled={!input.trim()}
          title="Send"
        >
          <Send size={14} />
        </button>
        <button
          className="px-2.5 py-1.5 bg-red-800 hover:bg-red-700 text-white rounded-md transition-colors"
          onClick={abort}
          title="Abort step"
        >
          <StopCircle size={14} />
        </button>
      </div>
    </div>
  );
}
