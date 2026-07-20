"use client";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]);
const PDF_EXTS   = new Set(["pdf"]);
const SHEET_EXTS = new Set(["xls", "xlsx", "csv", "ods", "numbers"]);
const DOC_EXTS   = new Set(["doc", "docx", "odt", "rtf", "txt", "pages"]);

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
    // Strip leading timestamp prefix added during upload (e.g. "1234567890-realname.pdf")
    return raw.replace(/^\d{10,}-/, "");
  } catch {
    return "Attachment";
  }
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

  if (PDF_EXTS.has(ext)) {
    return (
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
  }

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
            <p className="text-gray-500 text-sm">{post.content}</p>
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
