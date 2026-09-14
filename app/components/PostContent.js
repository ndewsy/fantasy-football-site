"use client";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import DOMPurify from "isomorphic-dompurify";
import { POST_FONTS } from "@/lib/fonts";

export const MD_COMPONENTS = {
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

// Same visual result as MD_COMPONENTS above, but for raw HTML (Tiptap
// output) rendered via dangerouslySetInnerHTML — Tailwind's arbitrary-
// variant selectors, same convention already used for the dashboard's
// post-preview list, so markdown-format and html-format posts look
// identical regardless of which renderer handles them.
export const HTML_STYLE_CLASSES =
  "[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1 " +
  "[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1 " +
  "[&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through " +
  "[&_p]:mb-1.5 last:[&_p]:mb-0 " +
  "[&_ul]:list-disc [&_ul]:list-inside [&_ul]:mb-1.5 [&_ol]:list-decimal [&_ol]:list-inside [&_ol]:mb-1.5 " +
  "[&_li]:text-sm " +
  "[&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-gray-200 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500";

// The one place that decides how to render a post body — every post is
// either 'markdown' (all posts before the rich-text editor existed) or
// 'html' (authored with app/components/PostEditor.js). `font` is a key
// into POST_FONTS (lib/fonts.js); unrecognized/missing falls through to
// the site's default body font.
export function PostContent({ content, format, font, className = "" }) {
  const fontClass = POST_FONTS[font]?.className || "";

  if (format === "html") {
    return (
      <div
        className={`${className} ${fontClass} ${HTML_STYLE_CLASSES}`}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content || "") }}
      />
    );
  }

  return (
    <div className={`${className} ${fontClass}`}>
      <ReactMarkdown rehypePlugins={[rehypeSanitize]} components={MD_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

// Plain-text excerpt for the compact post card — strips formatting rather
// than rendering it, since it's a short preview, not the full body.
export function excerptText(content, format) {
  if (!content) return "";
  if (format === "html") {
    return content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  return content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_`>~]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
