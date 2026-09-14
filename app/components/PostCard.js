"use client";
import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import CreatorAvatar from "./CreatorAvatar";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]);
const PDF_EXTS   = new Set(["pdf"]);
const SHEET_EXTS = new Set(["xls", "xlsx", "csv", "ods", "numbers"]);
const DOC_EXTS   = new Set(["doc", "docx", "odt", "rtf", "txt", "pages"]);

const MD_COMPONENTS = {
  h1: ({ children }) => <h1 className="text-base font-bold mt-2 mb-1 text-ink">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1 text-ink">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mt-1 mb-0.5 text-ink">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
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

function NonImageAttachment({ url }) {
  const ext  = fileExt(url);
  const name = fileName(url);

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

// Accepts up to 10 attachment URLs. Images render as a single full-width
// photo when there's just one, or a clickable grid gallery when there are
// several; non-image files (PDFs/docs/sheets) still render individually.
function PostAttachment({ urls }) {
  const list = (urls || []).filter(Boolean);
  if (list.length === 0) return null;

  const images = list.filter((u) => IMAGE_EXTS.has(fileExt(u)));
  const others = list.filter((u) => !IMAGE_EXTS.has(fileExt(u)));

  return (
    <>
      {images.length === 1 && (
        <div className="mt-3">
          <img
            src={images[0]}
            alt={fileName(images[0])}
            className="max-w-full rounded-lg border border-gray-100 shadow-sm"
          />
        </div>
      )}
      {images.length > 1 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {images.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block aspect-square"
            >
              <img
                src={url}
                alt={fileName(url)}
                className="w-full h-full object-cover rounded-lg border border-gray-100 shadow-sm hover:opacity-90 transition-opacity"
              />
            </a>
          ))}
        </div>
      )}
      {others.map((url) => (
        <NonImageAttachment key={url} url={url} />
      ))}
    </>
  );
}

function postFileUrls(post) {
  return post.file_urls?.length ? post.file_urls : (post.file_url ? [post.file_url] : []);
}

function firstImageUrl(urls) {
  return (urls || []).find((u) => IMAGE_EXTS.has(fileExt(u))) || null;
}

// Plain-text excerpt for the compact card — strips the most common markdown
// syntax rather than rendering it, since this is a short preview, not the
// full body (that still goes through ReactMarkdown in the detail modal).
function stripMarkdown(text) {
  return (text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_`>~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(createdAt) {
  return new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Same overlay+card structure as app/components/PlayerCardModal.js, for
// visual consistency with the rest of the site's modals.
function PostDetailModal({ post, creatorName, creatorLogoUrl, onClose }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="bg-card/95 rounded-3xl border border-card/80 ring-1 ring-white/10 w-full max-w-xl lg:max-w-2xl relative animate-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/30 transition-colors text-lg leading-none font-medium"
        >
          ✕
        </button>
        <div className="max-h-[85vh] overflow-y-auto rounded-3xl p-6">
          {post.tag && (
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded mb-2 inline-block font-medium">
              {post.tag}
            </span>
          )}
          <h3 className="font-bold text-lg text-ink mb-3 pr-8">{post.title}</h3>
          <div className="flex items-center gap-2 mb-4">
            <CreatorAvatar logoUrl={creatorLogoUrl} initials={(creatorName || "?").slice(0, 2).toUpperCase()} colorClass="bg-blue-600" size="sm" />
            <div>
              <p className="text-sm font-medium text-ink">{creatorName}</p>
              <p className="text-xs text-gray-400">{formatDate(post.created_at)}</p>
            </div>
          </div>
          {post.content && (
            <div className="text-gray-500 text-sm mb-1">
              <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={MD_COMPONENTS}>
                {post.content}
              </ReactMarkdown>
            </div>
          )}
          <PostAttachment urls={postFileUrls(post)} />
        </div>
      </div>
    </div>
  );
}

export default function PostCard({ post, isSubscribed, creatorName, creatorLogoUrl }) {
  const [open, setOpen] = useState(false);
  const viewedRef = useRef(false);
  const dateStr = formatDate(post.created_at);
  const thumbnail = firstImageUrl(postFileUrls(post));
  const excerpt = stripMarkdown(post.content);

  function handleOpen() {
    setOpen(true);
    if (!viewedRef.current) {
      viewedRef.current = true;
      fetch(`/api/posts/${post.id}/view`, { method: "POST" }).catch(() => {});
    }
  }

  const thumbnailBlock = thumbnail ? (
    <img src={thumbnail} alt={post.title} className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full bg-gradient-to-br from-blue-600 to-[#1E40AF] flex items-center justify-center">
      <span className="text-3xl opacity-80">📝</span>
    </div>
  );

  const cardInner = (
    <>
      <div className="relative aspect-video rounded-t-xl overflow-hidden">
        {thumbnailBlock}
        {post.tag && (
          <span className="absolute top-2 left-2 text-[11px] bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded font-semibold">
            {post.tag}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-sm text-ink mb-2 line-clamp-2">{post.title}</h3>
        {excerpt && <p className="text-gray-500 text-xs mb-3 line-clamp-2">{excerpt}</p>}
        <div className="flex items-center gap-2">
          <CreatorAvatar logoUrl={creatorLogoUrl} initials={(creatorName || "?").slice(0, 2).toUpperCase()} colorClass="bg-blue-600" size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-ink truncate">{creatorName}</p>
            <p className="text-[11px] text-gray-400">{dateStr}</p>
          </div>
          <span className="text-[11px] text-gray-400 shrink-0 flex items-center gap-1">
            <span>👁</span>{post.views ?? 0}
          </span>
        </div>
      </div>
    </>
  );

  if (!isSubscribed) {
    return (
      <Link
        href="/subscribe"
        className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg overflow-hidden relative block hover:shadow-xl transition-shadow"
      >
        <div className="blur-sm pointer-events-none">{cardInner}</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl">🔒</span>
        </div>
      </Link>
    );
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg overflow-hidden text-left w-full hover:shadow-xl transition-shadow"
      >
        {cardInner}
      </button>
      {open && (
        <PostDetailModal
          post={post}
          creatorName={creatorName}
          creatorLogoUrl={creatorLogoUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
