import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

function getOutputType(text: string): "image" | "markdown" | "text" {
  const lower = text.toLowerCase();
  if (lower.match(/\.(png|jpg|jpeg|gif|webp)$/)) return "image";
  if (lower.endsWith(".md")) return "markdown";
  return "text";
}

function fileUrl(serverPath: string): string {
  const filename = serverPath.split("/").pop() ?? serverPath;
  return `/api/files/${encodeURIComponent(filename)}`;
}

const markdownComponents: Components = {
  img({ src, alt }) {
    // Rewrite bare filenames or relative paths through the files API
    const resolved =
      src && !src.startsWith("http") && !src.startsWith("/api/")
        ? `/api/files/${encodeURIComponent(src.split("/").pop() ?? src)}`
        : src;
    return (
      <img
        src={resolved}
        alt={alt ?? ""}
        className="rounded-xl max-w-full border border-slate-700/60 my-4"
      />
    );
  },
};

function MarkdownOutput({ serverPath }: { serverPath: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(fileUrl(serverPath))
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then(setContent)
      .catch(() => setError(true));
  }, [serverPath]);

  if (error) return <p className="text-xs text-rose-400 italic">Could not load file.</p>;
  if (content === null) return <p className="text-xs text-slate-500 italic">Loading...</p>;

  return (
    <div className="prose prose-invert prose-sm max-w-none text-slate-300">
      <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
    </div>
  );
}

interface OutputPreviewProps {
  /** The raw output text from a step run (may be a file path or plain text) */
  text: string;
  /** If true, cap height with scrolling for use inside step cards */
  compact?: boolean;
}

export default function OutputPreview({ text, compact = false }: OutputPreviewProps) {
  const type = getOutputType(text.trim());

  if (type === "image") {
    return (
      <img
        src={fileUrl(text.trim())}
        alt="Pipeline output"
        className="rounded-xl max-w-full border border-slate-700/60"
        style={compact ? { maxHeight: "300px", objectFit: "contain" } : undefined}
      />
    );
  }

  if (type === "markdown") {
    return (
      <div className={compact ? "max-h-96 overflow-y-auto" : ""}>
        <MarkdownOutput serverPath={text.trim()} />
      </div>
    );
  }

  // Plain text fallback
  return (
    <pre
      className={`text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed ${
        compact ? "max-h-96 overflow-y-auto" : ""
      }`}
    >
      {text}
    </pre>
  );
}
