"use client";
import { useRef, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]);
const PDF_EXTS   = new Set(["pdf"]);
const SHEET_EXTS = new Set(["xls", "xlsx", "csv", "ods", "numbers"]);
const DOC_EXTS   = new Set(["doc", "docx", "odt", "rtf", "txt", "pages"]);

const MD_COMPONENTS = {
  h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1 text-[#0F172A]">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1 text-[#0F172A]">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-1 mb-0.5 text-[#0F172A]">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-[#0F172A]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="text-sm">{children}</li>,
  code: ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">{children}</code>,
};

function fileExt(url) {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split(".").pop().toLowerCase().split("?")[0];
  } catch {
    return "";
  }
}

function fileName(url) {
  try {
    const pathname = new URL(url).pathname;
    const raw = decodeURIComponent(pathname.split("/").pop());
    return raw.replace(/^\d{10,}-/, "");
  } catch {
    return "Attachment";
  }
}

function PdfThumbnail({ url, name }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjsLib.getDocument({ url }).promise;
        const page = await pdf.getPage(1);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = 400 / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        if (!cancelled) setStatus("done");
      } catch {
        if (!cancelled) setStatus("failed");
      }
    }
    render();
    return () => { cancelled = true; };
  }, [url]);

  const fallback = (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-center gap-2 text-sm text-red-600 hover:text-red-700 font-medium"
      onClick={(e) => e.stopPropagation()}
    >
      <span>📄</span>
      <span className="underline underline-offset-2">{name}</span>
    </a>
  );

  if (status === "failed") return fallback;

  return (
    <div className="mt-3">
      {status === "loading" && (
        <div className="h-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs animate-pulse">
          Loading preview…
        </div>
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`block group ${status === "loading" ? "hidden" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <canvas
          ref={canvasRef}
          className="max-w-full rounded-lg border border-gray-100 shadow-sm group-hover:opacity-90 transition-opacity"
        />
        <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-medium">
          <span>📄</span>{name}
        </p>
      </a>
    </div>
  );
}

function PostAttachment({ url }) {
  if (!url) return null;
  const ext  = fileExt(url);
  const name = fileName(url);

  if (IMAGE_EXTS.has(ext)) {
    return (
      <div className="mt-3">
        <img
          src={url}
          alt={name}
          className="max-w-full rounded-lg border border-gray-100 shadow-sm"
        />
      </div>
    );
  }

  if (PDF_EXTS.has(ext)) return <PdfThumbnail url={url} name={name} />;

  if (SHEET_EXTS.has(ext)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        <span>📊</span>
        <span className="underline underline-offset-2">{name}</span>
      </a>
    );
  }

  if (DOC_EXTS.has(ext)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        <span>📝</span>
        <span className="underline underline-offset-2">{name}</span>
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
      onClick={(e) => e.stopPropagation()}
    >
      <span>📎</span>
      <span className="underline underline-offset-2">{name}</span>
    </a>
  );
}

export default function PostCard({ post, isSubscribed }) {
  const dateStr = new Date(post.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-xl p-5 border border-white/80 shadow-lg relative overflow-hidden">
      {isSubscribed ? (
        <>
          {post.tag && (
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded mb-2 inline-block font-medium">
              {post.tag}
            </span>
          )}
          <h3 className="font-semibold mb-2">{post.title}</h3>
          {post.content && (
            <div className="text-gray-500 text-sm mb-1">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={MD_COMPONENTS}>
                {post.content}
              </ReactMarkdown>
            </div>
          )}
          <PostAttachment url={post.file_url} />
          <p className="text-gray-400 text-xs mt-3">{dateStr}</p>
        </>
      ) : (
        <>
          <div className="blur-sm pointer-events-none">
            {post.tag && (
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded mb-2 inline-block font-medium">
                {post.tag}
              </span>
            )}
            <h3 className="font-semibold mb-1">{post.title}</h3>
            <p className="text-gray-400 text-xs">{dateStr}</p>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl">🔒</span>
          </div>
        </>
      )}
    </div>
  );
}
