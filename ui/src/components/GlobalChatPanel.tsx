import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  RotateCcw,
  Send,
  StopCircle,
  X,
  Search,
  Zap,
  ListChecks,
  Package,
  Play,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useWebSocket } from "../lib/ws.ts";
import type { WsMessage, WsIncomingGlobalChat } from "@pawn/shared";

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    if (inputRef.current) inputRef.current.style.height = "auto";
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

  const suggestions: { icon: typeof Search; label: string; prompt: string; category: "query" | "action" }[] = [
    { icon: ListChecks, label: "List all pipelines", prompt: "List all pipelines", category: "query" },
    { icon: Search, label: "Recent run failures", prompt: "Show me recent run failures", category: "query" },
    { icon: Package, label: "Installed packages", prompt: "What packages are installed?", category: "query" },
    { icon: Zap, label: "Create a web scraping skill", prompt: "Create a new skill for web scraping", category: "action" },
    { icon: Play, label: "Trigger Daily Absurdist", prompt: "Trigger the Daily Absurdist pipeline", category: "action" },
  ];

  const fireSuggestion = (prompt: string) => {
    if (isStreaming) return;
    setMessages((m) => [...m, { role: "user", content: prompt, timestamp: new Date() }]);
    wsSend({ type: "global_chat", action: "prompt", message: prompt, context: getContext(location.pathname) });
    setIsStreaming(true);
    setStreamingText("");
  };

  const showEmptyState = messages.length === 0 && !streamingText && !isStreaming;

  return (
    <div className="flex flex-col h-full bg-pawn-surface-950 border-l border-white/[0.07]">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
        <div className="flex items-center gap-2 flex-1">
          {/* Pawn icon */}
          <span className="text-pawn-gold-400 text-base leading-none" aria-hidden="true">&#9823;</span>
          <span className="text-sm font-semibold text-white tracking-tight">Agent AI</span>
          <span className="text-[10px] text-pawn-surface-500 bg-pawn-surface-800/60 px-1.5 py-0.5 rounded-badge">cmd</span>
        </div>
        <button
          onClick={handleReset}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-pawn-surface-500 hover:text-pawn-surface-300 rounded-button hover:bg-pawn-surface-800/60 active:bg-pawn-surface-700 transition-colors mr-1"
          title="Reset conversation"
          aria-label="Reset conversation"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={onClose}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-pawn-surface-500 hover:text-pawn-surface-300 rounded-button hover:bg-pawn-surface-800/60 active:bg-pawn-surface-700 transition-colors"
          title="Close agent panel"
          aria-label="Close agent panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Empty state — pinned to top, outside scroll area */}
      {showEmptyState && (
        <div className="flex-shrink-0 px-4 pt-4 pb-3">
          <div className="bg-white/[0.02] border border-white/[0.07] rounded-card p-5">
            <p className="text-xs text-pawn-surface-400 leading-relaxed mb-4">
              Query pipelines, trigger runs, manage skills — or ask anything about your workspace.
            </p>

            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-bold text-pawn-surface-500 uppercase tracking-widest mb-1">Query</p>
                <div>
                  {suggestions.filter((s) => s.category === "query").map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.prompt}
                        onClick={() => fireSuggestion(s.prompt)}
                        className="flex items-center gap-2.5 w-full px-2 py-1.5 text-left text-xs text-pawn-surface-400 rounded-button hover:bg-pawn-surface-800/60 hover:text-white transition-colors group"
                      >
                        <Icon size={13} className="text-pawn-surface-600 group-hover:text-pawn-gold-400 transition-colors flex-shrink-0" />
                        <span>{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-pawn-surface-500 uppercase tracking-widest mb-1">Action</p>
                <div>
                  {suggestions.filter((s) => s.category === "action").map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.prompt}
                        onClick={() => fireSuggestion(s.prompt)}
                        className="flex items-center gap-2.5 w-full px-2 py-1.5 text-left text-xs text-pawn-surface-400 rounded-button hover:bg-pawn-surface-800/60 hover:text-white transition-colors group"
                      >
                        <Icon size={13} className="text-pawn-surface-600 group-hover:text-pawn-gold-400 transition-colors flex-shrink-0" />
                        <span>{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conversation messages — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-3 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`min-w-0 rounded-card px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "max-w-[90%] bg-pawn-gold-500/10 text-white border border-pawn-gold-500/20"
                    : "w-full bg-pawn-surface-800/60 text-pawn-surface-200 border border-pawn-surface-700/50"
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
              <div className="bg-pawn-surface-800/60 border border-pawn-surface-700/50 rounded-card px-3 py-2 text-xs text-pawn-gold-400 flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 bg-pawn-gold-400 rounded-full animate-pulse" />
                {activeToolCall.replace(/_/g, " ")}
              </div>
            </div>
          )}

          {/* Streaming text */}
          {streamingText && (
            <div className="flex justify-start">
              <div className="max-w-full bg-pawn-surface-800/60 border border-pawn-surface-700/50 rounded-card px-3 py-2 text-sm text-pawn-surface-200 min-w-0">
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:my-1 prose-pre:whitespace-pre-wrap prose-pre:break-words prose-ul:my-1 prose-li:my-0 [&_code]:break-words [&_pre]:overflow-x-auto">
                  <ReactMarkdown>{streamingText}</ReactMarkdown>
                </div>
                <span className="inline-block w-1 h-3.5 bg-pawn-gold-400 ml-0.5 animate-pulse align-middle opacity-70" />
              </div>
            </div>
          )}

          {/* Typing indicator */}
          {isStreaming && !streamingText && !activeToolCall && (
            <div className="flex justify-start">
              <div className="bg-pawn-surface-800/60 border border-pawn-surface-700/50 rounded-card px-3 py-2 text-sm flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 bg-pawn-surface-500 rounded-full animate-pulse" />
                <span className="inline-block w-1.5 h-1.5 bg-pawn-surface-500 rounded-full animate-pulse [animation-delay:150ms]" />
                <span className="inline-block w-1.5 h-1.5 bg-pawn-surface-500 rounded-full animate-pulse [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 flex-shrink-0 border-t border-white/[0.07]">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            className="flex-1 bg-white/[0.03] border border-white/[0.07] rounded-button px-3 py-2.5 sm:py-2 text-sm text-white placeholder-pawn-surface-500 focus:outline-none focus:border-pawn-gold-500/20 resize-none overflow-hidden"
            placeholder="Ask anything..."
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          {isStreaming ? (
            <button
              onClick={handleAbort}
              className="px-3 py-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-rose-900/60 hover:bg-rose-800/60 border border-rose-800/50 text-rose-400 rounded-button active:bg-rose-700/60 transition-colors"
              title="Abort"
              aria-label="Abort agent response"
            >
              <StopCircle size={14} />
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="px-2.5 py-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-pawn-gold-600 hover:bg-pawn-gold-500 text-white rounded-button btn-press disabled:opacity-40"
              title="Send"
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-pawn-surface-600 mt-1.5 text-center select-none">
          Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
