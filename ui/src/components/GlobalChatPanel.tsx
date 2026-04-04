import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { RotateCcw, Send, StopCircle, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useWebSocket } from "../lib/ws.ts";
import type { WsMessage, WsIncomingGlobalChat } from "@zerohand/shared";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface GlobalChatPanelProps {
  onClose: () => void;
}

function getContext(path: string): WsIncomingGlobalChat["context"] {
  const pipelineMatch = path.match(/^\/pipelines\/([^/]+)/);
  const runMatch = path.match(/^\/runs\/([^/]+)/);
  return {
    path,
    pipelineId: pipelineMatch?.[1],
    runId: runMatch?.[1],
  };
}

export default function GlobalChatPanel({ onClose }: GlobalChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { send: wsSend } = useWebSocket((msg: WsMessage) => {
    if (msg.type !== "global_agent_event") return;

    if (msg.eventType === "text_delta" && msg.message) {
      setStreamingText((prev) => prev + msg.message);
    } else if (msg.eventType === "tool_call_start" && msg.message) {
      setActiveToolCall(msg.message);
    } else if (msg.eventType === "tool_call_end") {
      setActiveToolCall(null);
    } else if (msg.eventType === "status_change" && msg.message === "done") {
      setIsStreaming(false);
      setActiveToolCall(null);
      setStreamingText((prev) => {
        if (prev) {
          setMessages((m) => [...m, { role: "assistant", content: prev, timestamp: new Date() }]);
        }
        return "";
      });
    } else if (msg.eventType === "status_change" && msg.message === "reset") {
      setMessages([]);
      setStreamingText("");
      setIsStreaming(false);
      setActiveToolCall(null);
    } else if (msg.eventType === "navigate" && msg.payload?.path) {
      navigate(msg.payload.path as string);
    } else if (msg.eventType === "error" && msg.message) {
      setIsStreaming(false);
      setActiveToolCall(null);
      setStreamingText("");
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${msg.message}`, timestamp: new Date() }]);
    }
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isStreaming) inputRef.current?.focus();
  }, [isStreaming]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setMessages((m) => [...m, { role: "user", content: text, timestamp: new Date() }]);
    wsSend({ type: "global_chat", action: "prompt", message: text, context: getContext(location.pathname) });
    setInput("");
    setIsStreaming(true);
    setStreamingText("");
  };

  const handleReset = () => {
    wsSend({ type: "global_chat", action: "reset" });
  };

  const handleAbort = () => {
    wsSend({ type: "global_chat", action: "abort" });
    setIsStreaming(false);
    setActiveToolCall(null);
    if (streamingText) {
      setMessages((m) => [...m, { role: "assistant", content: streamingText, timestamp: new Date() }]);
      setStreamingText("");
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800/60">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-slate-800/60 flex-shrink-0">
        <span className="text-sm font-semibold text-white flex-1">Agent AI</span>
        <button
          onClick={handleReset}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800/60 active:bg-slate-700 transition-colors mr-1"
          title="Reset conversation"
          aria-label="Reset conversation"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={onClose}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800/60 active:bg-slate-700 transition-colors"
          title="Close agent panel"
          aria-label="Close agent panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && !streamingText && !isStreaming && (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-600 text-sm text-center px-4">
              Ask me about pipelines, runs, skills, or tell me to trigger a run.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`min-w-0 rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "max-w-[90%] bg-sky-500/10 text-white border border-sky-500/20"
                  : "w-full bg-slate-800/60 text-slate-200 border border-slate-700/50"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:my-1 prose-pre:whitespace-pre-wrap prose-pre:break-words prose-ul:my-1 prose-li:my-0 [&_code]:break-words [&_pre]:overflow-x-auto">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {/* Tool call indicator */}
        {activeToolCall && (
          <div className="flex justify-start">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-sky-400 flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />
              {activeToolCall.replace(/_/g, " ")}
            </div>
          </div>
        )}

        {/* Streaming text */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-slate-200 min-w-0">
              <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:my-1 prose-pre:whitespace-pre-wrap prose-pre:break-words prose-ul:my-1 prose-li:my-0 [&_code]:break-words [&_pre]:overflow-x-auto">
                <ReactMarkdown>{streamingText}</ReactMarkdown>
              </div>
              <span className="inline-block w-1 h-3.5 bg-sky-400 ml-0.5 animate-pulse align-middle opacity-70" />
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {isStreaming && !streamingText && !activeToolCall && (
          <div className="flex justify-start">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 text-sm flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 bg-slate-500 rounded-full animate-pulse" />
              <span className="inline-block w-1.5 h-1.5 bg-slate-500 rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="inline-block w-1.5 h-1.5 bg-slate-500 rounded-full animate-pulse [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 flex-shrink-0 border-t border-slate-800/60">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 sm:py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 input-glow"
            placeholder="Ask anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />
          {isStreaming ? (
            <button
              onClick={handleAbort}
              className="px-3 py-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-rose-900/60 hover:bg-rose-800/60 border border-rose-800/50 text-rose-400 rounded-xl active:bg-rose-700/60 transition-colors"
              title="Abort"
              aria-label="Abort agent response"
            >
              <StopCircle size={14} />
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="px-2.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl btn-press disabled:opacity-40"
              title="Send"
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
