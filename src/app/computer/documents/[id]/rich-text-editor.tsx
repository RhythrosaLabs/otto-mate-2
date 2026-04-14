"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Underline as UnderlineExtension } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Link } from "@tiptap/extension-link";
import { Image as ImageExtension } from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { Typography } from "@tiptap/extension-typography";
import { CharacterCount } from "@tiptap/extension-character-count";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Heading1, Heading2, Heading3, Quote, Code, Code2,
  Undo, Redo, Type, Minus, Link as LinkIcon, Image as ImageIcon,
  Highlighter, CheckSquare, Table as TableIcon, Wand2, CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const lowlight = createLowlight(common);

interface RichTextEditorProps {
  content: string;
  onSave: (content: string) => void;
  onWordCountChange?: (stats: { words: number; chars: number; readingTime: number }) => void;
  focusMode?: boolean;
}

/* ── Slash Commands ──────────────────────────────────────── */

interface SlashItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: Editor) => void;
  category: string;
}

const SLASH_ITEMS: SlashItem[] = [
  { title: "Heading 1", description: "Large heading", icon: <Heading1 size={16} />, category: "Format", command: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { title: "Heading 2", description: "Medium heading", icon: <Heading2 size={16} />, category: "Format", command: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: "Heading 3", description: "Small heading", icon: <Heading3 size={16} />, category: "Format", command: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: "Bullet List", description: "Unordered list", icon: <List size={16} />, category: "Lists", command: (e) => e.chain().focus().toggleBulletList().run() },
  { title: "Numbered List", description: "Ordered list", icon: <ListOrdered size={16} />, category: "Lists", command: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: "Task List", description: "Checklist items", icon: <CheckSquare size={16} />, category: "Lists", command: (e) => e.chain().focus().toggleTaskList().run() },
  { title: "Quote", description: "Block quotation", icon: <Quote size={16} />, category: "Blocks", command: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: "Code Block", description: "Syntax-highlighted code", icon: <Code2 size={16} />, category: "Blocks", command: (e) => e.chain().focus().toggleCodeBlock().run() },
  { title: "Divider", description: "Horizontal rule", icon: <Minus size={16} />, category: "Blocks", command: (e) => e.chain().focus().setHorizontalRule().run() },
  { title: "Table", description: "Insert a 3×3 table", icon: <TableIcon size={16} />, category: "Blocks", command: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: "Image", description: "Insert from URL", icon: <ImageIcon size={16} />, category: "Media", command: () => {} },
];

function SlashCommandMenu({ editor, onClose, position }: { editor: Editor; onClose: () => void; position: { top: number; left: number } }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = SLASH_ITEMS.filter(
    (item) => item.title.toLowerCase().includes(query.toLowerCase()) || item.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const selectItem = useCallback((item: SlashItem) => {
    const { from } = editor.state.selection;
    const slashStart = from - query.length - 1;
    editor.chain().focus().deleteRange({ from: slashStart, to: from }).run();
    if (item.title === "Image") {
      const url = prompt("Image URL:");
      if (url) editor.chain().focus().setImage({ src: url }).run();
    } else {
      item.command(editor);
    }
    onClose();
  }, [editor, query, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => (i + 1) % Math.max(1, filtered.length)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length)); return; }
      if (e.key === "Enter") { e.preventDefault(); if (filtered[selectedIndex]) selectItem(filtered[selectedIndex]); return; }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) setQuery((q) => q + e.key);
      if (e.key === "Backspace") { query.length === 0 ? onClose() : setQuery((q) => q.slice(0, -1)); }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [query, selectedIndex, filtered, selectItem, onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const grouped: Record<string, typeof filtered> = {};
  for (const item of filtered) (grouped[item.category] ||= []).push(item);

  return (
    <div ref={menuRef} className="fixed z-50 bg-pplx-card border border-pplx-border rounded-xl shadow-2xl py-2 w-72 max-h-80 overflow-y-auto" style={{ top: position.top, left: position.left }}>
      {query && <div className="px-3 pb-2 mb-1 border-b border-pplx-border"><span className="text-xs text-pplx-muted">Search: </span><span className="text-xs text-pplx-text font-medium">{query}</span></div>}
      {filtered.length === 0 ? (
        <p className="px-3 py-2 text-xs text-pplx-muted">No matching commands</p>
      ) : Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div className="px-3 py-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-pplx-muted">{cat}</span></div>
          {items.map((item) => {
            const gi = filtered.indexOf(item);
            return (
              <button key={item.title} className={cn("w-full flex items-center gap-3 px-3 py-2 text-left transition-colors", gi === selectedIndex ? "bg-pplx-accent/10 text-pplx-accent" : "text-pplx-text hover:bg-pplx-border/30")} onMouseEnter={() => setSelectedIndex(gi)} onClick={() => selectItem(item)}>
                <div className="w-8 h-8 rounded-lg bg-pplx-bg flex items-center justify-center shrink-0">{item.icon}</div>
                <div><p className="text-sm font-medium">{item.title}</p><p className="text-[11px] text-pplx-muted">{item.description}</p></div>
              </button>
            );
          })}
        </div>
      ))}
      <div className="px-3 pt-2 border-t border-pplx-border mt-1"><p className="text-[10px] text-pplx-muted"><kbd className="px-1 py-0.5 rounded bg-pplx-bg text-[9px]">↑↓</kbd> navigate <kbd className="px-1 py-0.5 rounded bg-pplx-bg text-[9px]">↵</kbd> select <kbd className="px-1 py-0.5 rounded bg-pplx-bg text-[9px]">esc</kbd> close</p></div>
    </div>
  );
}

/* ── Toolbar helpers ─────────────────────────────────────── */

function TBtn({ icon, label, active, onClick, disabled }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button title={label} onClick={onClick} disabled={disabled} className={cn("p-1.5 rounded-md transition-colors", active ? "bg-pplx-accent/20 text-pplx-accent" : "text-pplx-muted hover:text-pplx-text hover:bg-pplx-card", disabled && "opacity-30 cursor-not-allowed")}>
      {icon}
    </button>
  );
}
function TSep() { return <div className="w-px h-5 bg-pplx-border mx-1" />; }

/* ── Main editor ─────────────────────────────────────────── */

export function RichTextEditor({ content, onSave, onWordCountChange, focusMode }: RichTextEditorProps) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slashMenu, setSlashMenu] = useState<{ top: number; left: number } | null>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [bubbleMenu, setBubbleMenu] = useState<{ top: number; left: number } | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const triggerSave = useCallback((html: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => onSave(html), 800);
  }, [onSave]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: "Start writing, or type / for commands..." }),
      UnderlineExtension,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-pplx-accent underline" } }),
      ImageExtension.configure({ inline: false, allowBase64: true }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Typography,
      CharacterCount,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight }),
    ],
    content,
    editorProps: {
      attributes: { class: "min-h-[500px] outline-none text-pplx-text leading-relaxed prose-editor" },
      handleKeyDown: (_view, event) => {
        if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
          setTimeout(() => {
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
              const rect = sel.getRangeAt(0).getBoundingClientRect();
              setSlashMenu({ top: rect.bottom + 8, left: rect.left });
            }
          }, 10);
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "s") {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      triggerSave(e.getHTML());
      const text = e.getText();
      const words = text.split(/\s+/).filter(Boolean).length;
      onWordCountChange?.({ words, chars: text.length, readingTime: Math.max(1, Math.round(words / 200)) });
    },
  });

  // Cmd+S save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (editor) onSave(editor.getHTML()); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editor, onSave]);

  // AI insert events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.text && editor) editor.chain().focus().insertContent(detail.text).run();
    };
    window.addEventListener("ai-insert", handler);
    return () => window.removeEventListener("ai-insert", handler);
  }, [editor]);

  // Initial word count
  useEffect(() => {
    if (editor) {
      const text = editor.getText();
      const words = text.split(/\s+/).filter(Boolean).length;
      onWordCountChange?.({ words, chars: text.length, readingTime: Math.max(1, Math.round(words / 200)) });
    }
  }, [editor, onWordCountChange]);

  const insertLink = useCallback(() => {
    if (linkUrl && editor) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
      setLinkUrl("");
    }
    setShowLinkInput(false);
  }, [linkUrl, editor]);

  // Bubble menu: show on text selection, hide on empty selection
  useEffect(() => {
    if (!editor) return;
    const updateBubble = () => {
      const { empty } = editor.state.selection;
      if (empty) { setBubbleMenu(null); return; }
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setBubbleMenu({ top: rect.top - 50, left: rect.left + rect.width / 2 - 150 });
      }
    };
    editor.on("selectionUpdate", updateBubble);
    return () => { editor.off("selectionUpdate", updateBubble); };
  }, [editor]);

  // Export helpers exposed via ref-like events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!editor || !detail?.format) return;
      if (detail.format === "html") {
        const blob = new Blob([editor.getHTML()], { type: "text/html" });
        downloadBlob(blob, "document.html");
      } else if (detail.format === "markdown") {
        // crude html-to-markdown via text extraction + formatting
        const html = editor.getHTML();
        const md = htmlToMarkdown(html);
        const blob = new Blob([md], { type: "text/markdown" });
        downloadBlob(blob, "document.md");
      } else if (detail.format === "text") {
        const blob = new Blob([editor.getText()], { type: "text/plain" });
        downloadBlob(blob, "document.txt");
      }
    };
    window.addEventListener("doc-export", handler);
    return () => window.removeEventListener("doc-export", handler);
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      {!focusMode && (
        <div className="px-4 py-2 border-b border-pplx-border bg-pplx-bg flex flex-wrap items-center gap-0.5 shrink-0">
          <TBtn icon={<Undo size={15} />} label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} />
          <TBtn icon={<Redo size={15} />} label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} />
          <TSep />
          <TBtn icon={<Heading1 size={15} />} label="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
          <TBtn icon={<Heading2 size={15} />} label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <TBtn icon={<Heading3 size={15} />} label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
          <TBtn icon={<Type size={15} />} label="Paragraph" active={editor.isActive("paragraph") && !editor.isActive("heading")} onClick={() => editor.chain().focus().setParagraph().run()} />
          <TSep />
          <TBtn icon={<Bold size={15} />} label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
          <TBtn icon={<Italic size={15} />} label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <TBtn icon={<Underline size={15} />} label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <TBtn icon={<Strikethrough size={15} />} label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
          <TBtn icon={<Code size={15} />} label="Inline Code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} />
          <TBtn icon={<Highlighter size={15} />} label="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()} />
          <TSep />
          <TBtn icon={<AlignLeft size={15} />} label="Left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} />
          <TBtn icon={<AlignCenter size={15} />} label="Center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} />
          <TBtn icon={<AlignRight size={15} />} label="Right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} />
          <TSep />
          <TBtn icon={<List size={15} />} label="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <TBtn icon={<ListOrdered size={15} />} label="Numbered List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <TBtn icon={<CheckSquare size={15} />} label="Task List" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} />
          <TSep />
          <TBtn icon={<Quote size={15} />} label="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <TBtn icon={<Code2 size={15} />} label="Code Block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
          <TBtn icon={<Minus size={15} />} label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
          <TBtn icon={<TableIcon size={15} />} label="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          <TSep />
          <TBtn icon={<LinkIcon size={15} />} label="Link" active={editor.isActive("link")} onClick={() => { if (editor.isActive("link")) editor.chain().focus().unsetLink().run(); else setShowLinkInput(!showLinkInput); }} />
          <TBtn icon={<ImageIcon size={15} />} label="Image" onClick={() => { const url = prompt("Image URL:"); if (url) editor.chain().focus().setImage({ src: url }).run(); }} />
          {showLinkInput && (
            <div className="flex items-center gap-1 ml-2">
              <input type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") insertLink(); if (e.key === "Escape") setShowLinkInput(false); }} placeholder="https://..." className="px-2 py-1 rounded-md bg-pplx-card border border-pplx-border text-xs text-pplx-text w-48 outline-none focus:border-pplx-accent" autoFocus />
              <button onClick={insertLink} className="px-2 py-1 rounded-md bg-pplx-accent text-white text-xs">Add</button>
            </div>
          )}
        </div>
      )}

      {/* Bubble Menu — appears on text selection */}
      {bubbleMenu && (
        <div ref={bubbleRef} className="fixed z-50" style={{ top: bubbleMenu.top, left: bubbleMenu.left }}>
          <div className="flex items-center gap-0.5 bg-pplx-card border border-pplx-border rounded-xl shadow-2xl p-1">
            <TBtn icon={<Bold size={14} />} label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
            <TBtn icon={<Italic size={14} />} label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
            <TBtn icon={<Underline size={14} />} label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
            <TBtn icon={<Strikethrough size={14} />} label="Strike" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
            <TSep />
            <TBtn icon={<Code size={14} />} label="Code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} />
            <TBtn icon={<Highlighter size={14} />} label="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()} />
            <TSep />
            <TBtn icon={<LinkIcon size={14} />} label="Link" active={editor.isActive("link")} onClick={() => { if (editor.isActive("link")) editor.chain().focus().unsetLink().run(); else { const url = prompt("URL:"); if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run(); } }} />
            <TSep />
            <button title="AI: Improve" onClick={() => { const sel = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to); if (sel) window.dispatchEvent(new CustomEvent("ai-bubble-action", { detail: { action: "improve", text: sel } })); }} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-pplx-accent hover:bg-pplx-accent/10 transition-colors">
              <Wand2 size={13} /> Improve
            </button>
            <button title="AI: Fix Grammar" onClick={() => { const sel = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to); if (sel) window.dispatchEvent(new CustomEvent("ai-bubble-action", { detail: { action: "fix-grammar", text: sel } })); }} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-pplx-accent hover:bg-pplx-accent/10 transition-colors">
              <CheckCheck size={13} /> Fix
            </button>
          </div>
        </div>
      )}

      {/* Editor Content */}
      <div className={cn("flex-1 overflow-y-auto bg-pplx-bg", focusMode && "flex items-start justify-center pt-20")}>
        <div className={cn("max-w-4xl mx-auto py-12 px-8", focusMode && "max-w-2xl")}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Slash command menu */}
      {slashMenu && <SlashCommandMenu editor={editor} position={slashMenu} onClose={() => setSlashMenu(null)} />}

      {/* Editor styles */}
      <style jsx global>{`
        .prose-editor .ProseMirror { min-height: 500px; outline: none; }
        .prose-editor .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: var(--muted); pointer-events: none; height: 0; }
        .prose-editor h1 { font-size: 2em; font-weight: 700; margin: 0.67em 0; color: var(--text); line-height: 1.2; }
        .prose-editor h2 { font-size: 1.5em; font-weight: 600; margin: 0.75em 0; color: var(--text); line-height: 1.3; }
        .prose-editor h3 { font-size: 1.25em; font-weight: 600; margin: 0.83em 0; color: var(--text); line-height: 1.4; }
        .prose-editor p { margin: 0.5em 0; }
        .prose-editor ul, .prose-editor ol { padding-left: 1.5em; margin: 0.5em 0; }
        .prose-editor li { margin: 0.25em 0; }
        .prose-editor li p { margin: 0; }
        .prose-editor ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        .prose-editor ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
        .prose-editor ul[data-type="taskList"] li label { margin-top: 0.15em; }
        .prose-editor ul[data-type="taskList"] li label input[type="checkbox"] { accent-color: var(--accent); width: 16px; height: 16px; cursor: pointer; }
        .prose-editor ul[data-type="taskList"] li div { flex: 1; }
        .prose-editor ul[data-type="taskList"] li[data-checked="true"] > div > p { text-decoration: line-through; color: var(--muted); }
        .prose-editor blockquote { border-left: 3px solid var(--accent); padding-left: 1em; margin: 1em 0; color: var(--muted); font-style: italic; }
        .prose-editor pre { background: var(--card); border: 1px solid var(--border); border-radius: 0.5em; padding: 1em; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.875em; overflow-x: auto; margin: 1em 0; line-height: 1.6; }
        .prose-editor pre code { background: none; padding: 0; border-radius: 0; font-size: inherit; color: inherit; }
        .prose-editor code { background: var(--card); padding: 0.15em 0.4em; border-radius: 0.25em; font-size: 0.9em; font-family: 'SF Mono', 'Fira Code', monospace; color: var(--accent); }
        .prose-editor a { color: var(--accent); text-decoration: underline; cursor: pointer; }
        .prose-editor hr { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }
        .prose-editor img { max-width: 100%; border-radius: 0.5em; margin: 1em 0; }
        .prose-editor mark { background-color: rgba(59, 130, 246, 0.2); border-radius: 0.15em; padding: 0.05em 0.1em; }
        .prose-editor table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        .prose-editor th, .prose-editor td { border: 1px solid var(--border); padding: 0.5em 0.75em; text-align: left; }
        .prose-editor th { background: var(--card); font-weight: 600; }
        .prose-editor tr:hover td { background: var(--card); }
        .prose-editor .hljs-keyword { color: #c678dd; }
        .prose-editor .hljs-string { color: #98c379; }
        .prose-editor .hljs-number { color: #d19a66; }
        .prose-editor .hljs-comment { color: #5c6370; font-style: italic; }
        .prose-editor .hljs-function { color: #61afef; }
        .prose-editor .hljs-title { color: #61afef; }
        .prose-editor .hljs-built_in { color: #e6c07b; }
        .prose-editor .hljs-attr { color: #d19a66; }
        .prose-editor .hljs-type { color: #e6c07b; }
        .prose-editor .hljs-params { color: #e06c75; }
        .prose-editor .selectedCell { background: rgba(59, 130, 246, 0.1); }
        .prose-editor .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: var(--accent); cursor: col-resize; }
      `}</style>
    </div>
  );
}

/* ── Export helpers ───────────────────────────────────────── */

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function htmlToMarkdown(html: string): string {
  let md = html;
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<s[^>]*>(.*?)<\/s>/gi, "~~$1~~");
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "> $1\n\n");
  md = md.replace(/<hr[^>]*\/?>/gi, "---\n\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  md = md.replace(/<\/?(ul|ol|p|div|br)[^>]*\/?>/gi, "\n");
  md = md.replace(/<[^>]+>/g, "");
  md = md.replace(/\n{3,}/g, "\n\n");
  return md.trim();
}