import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();

  const { send: wsSend } = useWebSocket((msg: WsMessage) => {
    if (msg.type === "data_changed") {
      if (msg.entity === "pipeline") {
        queryClient.invalidateQueries({ queryKey: ["pipelines"] });
        queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      }
      if (msg.entity === "step") queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      return;
    }

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
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-gray-800 flex-shrink-0">
        <span className="text-sm font-semibold text-white flex-1">Agent</span>
        <button
          onClick={handleReset}
          className="p-1.5 text-gray-500 hover:text-gray-300 rounded-md hover:bg-gray-800 transition-colors mr-1"
          title="Reset conversation"
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-500 hover:text-gray-300 rounded-md hover:bg-gray-800 transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && !streamingText && !isStreaming && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-600 text-sm text-center px-4">
              Ask me about pipelines, runs, skills, or tell me to trigger a run.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-gray-700 text-white"
                  : "bg-gray-800 text-gray-200"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:my-1 prose-ul:my-1 prose-li:my-0">
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
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-xs text-indigo-400 flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
              {activeToolCall.replace(/_/g, " ")}
            </div>
          </div>
        )}

        {/* Streaming text */}
        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[90%] bg-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200">
              <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:my-1 prose-ul:my-1 prose-li:my-0">
                <ReactMarkdown>{streamingText}</ReactMarkdown>
              </div>
              <span className="inline-block w-1 h-3.5 bg-gray-400 ml-0.5 animate-pulse align-middle" />
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {isStreaming && !streamingText && !activeToolCall && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-lg px-3 py-2 text-sm flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" />
              <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 flex-shrink-0 border-t border-gray-800">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            placeholder={isStreaming ? "Waiting..." : "Ask anything..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              onClick={handleAbort}
              className="px-2.5 py-2 bg-red-800 hover:bg-red-700 text-white rounded-lg transition-colors"
              title="Abort"
            >
              <StopCircle size={14} />
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="px-2.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
              title="Send"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
