"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useEffect } from "react";
import { POST_FONTS } from "@/lib/fonts";
import { HTML_STYLE_CLASSES } from "./PostContent";

const TOOLBAR_BUTTONS = [
  { key: "bold", label: "B", title: "Bold", cls: "font-bold" },
  { key: "italic", label: "I", title: "Italic", cls: "italic" },
  { key: "underline", label: "U", title: "Underline", cls: "underline" },
  { key: "heading", label: "H", title: "Heading", cls: "font-semibold" },
];

// Real WYSIWYG replacement for the old plain-textarea + markdown-syntax
// toolbar — text actually looks bold/italic/underlined as you type, instead
// of showing literal **/*/`` characters. `content` is only read as the
// editor's *initial* doc (Tiptap is uncontrolled after mount, like any rich-
// text editor); the effect below only exists to clear the editor when the
// parent resets the form back to "" after a successful publish.
export default function PostEditor({ content, onChange, font, onFontChange }) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2] } }), Underline],
    content: content || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: `focus:outline-none min-h-[140px] text-ink text-sm ${HTML_STYLE_CLASSES}`,
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && content === "" && !editor.isEmpty) {
      editor.commands.clearContent();
    }
  }, [content, editor]);

  function toggle(key) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (key === "bold") chain.toggleBold().run();
    else if (key === "italic") chain.toggleItalic().run();
    else if (key === "underline") chain.toggleUnderline().run();
    else if (key === "heading") chain.toggleHeading({ level: 2 }).run();
  }

  function isActive(key) {
    if (!editor) return false;
    if (key === "heading") return editor.isActive("heading", { level: 2 });
    return editor.isActive(key);
  }

  const fontClassName = POST_FONTS[font]?.className || "";

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
        <div className="flex items-center gap-1">
          {TOOLBAR_BUTTONS.map(({ key, label, title, cls }) => (
            <button
              key={key}
              type="button"
              title={title}
              onMouseDown={(e) => { e.preventDefault(); toggle(key); }}
              className={`w-7 h-7 flex items-center justify-center rounded text-sm transition-colors ${cls} ${
                isActive(key) ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:text-ink hover:bg-gray-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={font}
          onChange={(e) => onFontChange(e.target.value)}
          className="bg-card/60 backdrop-blur-sm border border-card/70 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {Object.entries(POST_FONTS).map(([id, f]) => (
            <option key={id} value={id}>{f.label}</option>
          ))}
        </select>
      </div>
      <div
        onClick={() => editor?.chain().focus().run()}
        className={`w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 cursor-text ${fontClassName}`}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
