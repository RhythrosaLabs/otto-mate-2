"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Undo,
  Redo,
  Type,
  Minus,
  Link,
  Image,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  content: string;
  onSave: (content: string) => void;
}

interface ToolbarBtn {
  icon: React.ReactNode;
  command: string;
  value?: string;
  label: string;
  type?: "button" | "separator";
}

export function RichTextEditor({ content, onSave }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const [fontSize, setFontSize] = useState("3");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // Auto-save with debounce
  const triggerSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (editorRef.current) {
        onSave(editorRef.current.innerHTML);
      }
    }, 1000);
  }, [onSave]);

  // Listen for AI insert events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.text && editorRef.current) {
        editorRef.current.focus();
        document.execCommand("insertHTML", false, detail.text.replace(/\n/g, "<br>"));
        triggerSave();
      }
    };
    window.addEventListener("ai-insert", handler);
    return () => window.removeEventListener("ai-insert", handler);
  }, [triggerSave]);

  // Update active format detection
  const updateActiveFormats = useCallback(() => {
    const formats = new Set<string>();
    if (document.queryCommandState("bold")) formats.add("bold");
    if (document.queryCommandState("italic")) formats.add("italic");
    if (document.queryCommandState("underline")) formats.add("underline");
    if (document.queryCommandState("strikeThrough")) formats.add("strikeThrough");
    if (document.queryCommandState("insertUnorderedList")) formats.add("insertUnorderedList");
    if (document.queryCommandState("insertOrderedList")) formats.add("insertOrderedList");
    if (document.queryCommandState("justifyLeft")) formats.add("justifyLeft");
    if (document.queryCommandState("justifyCenter")) formats.add("justifyCenter");
    if (document.queryCommandState("justifyRight")) formats.add("justifyRight");

    // Check block format
    const block = document.queryCommandValue("formatBlock");
    if (block) formats.add(block.toLowerCase());

    setActiveFormats(formats);
  }, []);

  const exec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    updateActiveFormats();
    triggerSave();
  }, [updateActiveFormats, triggerSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Ctrl/Cmd+S to save
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (editorRef.current) onSave(editorRef.current.innerHTML);
    }
    // Tab for indentation
    if (e.key === "Tab") {
      e.preventDefault();
      exec(e.shiftKey ? "outdent" : "indent");
    }
  }, [onSave, exec]);

  const insertLink = useCallback(() => {
    if (linkUrl) {
      exec("createLink", linkUrl);
      setLinkUrl("");
    }
    setShowLinkInput(false);
  }, [linkUrl, exec]);

  const toolbarGroups: (ToolbarBtn | "separator")[][] = [
    [
      { icon: <Undo size={15} />, command: "undo", label: "Undo" },
      { icon: <Redo size={15} />, command: "redo", label: "Redo" },
    ],
    [
      { icon: <Heading1 size={15} />, command: "formatBlock", value: "h1", label: "Heading 1" },
      { icon: <Heading2 size={15} />, command: "formatBlock", value: "h2", label: "Heading 2" },
      { icon: <Heading3 size={15} />, command: "formatBlock", value: "h3", label: "Heading 3" },
      { icon: <Type size={15} />, command: "formatBlock", value: "p", label: "Paragraph" },
    ],
    [
      { icon: <Bold size={15} />, command: "bold", label: "Bold" },
      { icon: <Italic size={15} />, command: "italic", label: "Italic" },
      { icon: <Underline size={15} />, command: "underline", label: "Underline" },
      { icon: <Strikethrough size={15} />, command: "strikeThrough", label: "Strikethrough" },
    ],
    [
      { icon: <AlignLeft size={15} />, command: "justifyLeft", label: "Align Left" },
      { icon: <AlignCenter size={15} />, command: "justifyCenter", label: "Align Center" },
      { icon: <AlignRight size={15} />, command: "justifyRight", label: "Align Right" },
    ],
    [
      { icon: <List size={15} />, command: "insertUnorderedList", label: "Bullet List" },
      { icon: <ListOrdered size={15} />, command: "insertOrderedList", label: "Numbered List" },
    ],
    [
      { icon: <Quote size={15} />, command: "formatBlock", value: "blockquote", label: "Quote" },
      { icon: <Code size={15} />, command: "formatBlock", value: "pre", label: "Code Block" },
      { icon: <Minus size={15} />, command: "insertHorizontalRule", label: "Divider" },
      { icon: <Link size={15} />, command: "__link__", label: "Insert Link" },
    ],
  ];

  const isActive = (command: string, value?: string) => {
    if (value) return activeFormats.has(value.toLowerCase());
    return activeFormats.has(command);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-pplx-border bg-pplx-bg flex flex-wrap items-center gap-1 shrink-0">
        {toolbarGroups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="w-px h-5 bg-pplx-border mx-1" />}
            {group.map((btn, bi) => {
              if (btn === "separator") return <div key={bi} className="w-px h-5 bg-pplx-border mx-1" />;
              const b = btn as ToolbarBtn;
              return (
                <button
                  key={bi}
                  title={b.label}
                  onClick={() => {
                    if (b.command === "__link__") {
                      setShowLinkInput(!showLinkInput);
                      return;
                    }
                    exec(b.command, b.value ? `<${b.value}>` : undefined);
                  }}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    isActive(b.command, b.value)
                      ? "bg-pplx-accent/20 text-pplx-accent"
                      : "text-pplx-muted hover:text-pplx-text hover:bg-pplx-card"
                  )}
                >
                  {b.icon}
                </button>
              );
            })}
          </div>
        ))}

        {/* Font size */}
        <div className="w-px h-5 bg-pplx-border mx-1" />
        <select
          value={fontSize}
          onChange={(e) => {
            setFontSize(e.target.value);
            exec("fontSize", e.target.value);
          }}
          className="bg-pplx-card border border-pplx-border rounded-md text-xs text-pplx-text px-1.5 py-1 outline-none"
        >
          <option value="1">Small</option>
          <option value="2">Normal-</option>
          <option value="3">Normal</option>
          <option value="4">Large</option>
          <option value="5">XL</option>
          <option value="6">XXL</option>
          <option value="7">Huge</option>
        </select>

        {/* Text color */}
        <div className="relative">
          <label className="p-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-pplx-card cursor-pointer block">
            <Palette size={15} />
            <input
              type="color"
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              onChange={(e) => exec("foreColor", e.target.value)}
            />
          </label>
        </div>

        {/* Link input */}
        {showLinkInput && (
          <div className="flex items-center gap-1 ml-2">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") insertLink(); }}
              placeholder="https://..."
              className="px-2 py-1 rounded-md bg-pplx-card border border-pplx-border text-xs text-pplx-text w-48 outline-none focus:border-pplx-accent"
              autoFocus
            />
            <button
              onClick={insertLink}
              className="px-2 py-1 rounded-md bg-pplx-accent text-white text-xs"
            >
              Add
            </button>
          </div>
        )}
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto bg-pplx-bg">
        <div className="max-w-4xl mx-auto py-12 px-8">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              updateActiveFormats();
              triggerSave();
            }}
            onKeyDown={handleKeyDown}
            onMouseUp={updateActiveFormats}
            onKeyUp={updateActiveFormats}
            dangerouslySetInnerHTML={{ __html: content }}
            className="min-h-[500px] outline-none text-pplx-text leading-relaxed editor-content"
            style={{ caretColor: "var(--accent)" }}
          />
        </div>
      </div>

      {/* Editor styles */}
      <style jsx global>{`
        .editor-content h1 { font-size: 2em; font-weight: 700; margin: 0.67em 0; color: var(--text); }
        .editor-content h2 { font-size: 1.5em; font-weight: 600; margin: 0.75em 0; color: var(--text); }
        .editor-content h3 { font-size: 1.25em; font-weight: 600; margin: 0.83em 0; color: var(--text); }
        .editor-content p { margin: 0.5em 0; }
        .editor-content ul, .editor-content ol { padding-left: 1.5em; margin: 0.5em 0; }
        .editor-content li { margin: 0.25em 0; }
        .editor-content blockquote {
          border-left: 3px solid var(--accent);
          padding-left: 1em;
          margin: 1em 0;
          color: var(--muted);
          font-style: italic;
        }
        .editor-content pre {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 0.5em;
          padding: 1em;
          font-family: monospace;
          font-size: 0.9em;
          overflow-x: auto;
          margin: 1em 0;
        }
        .editor-content code {
          background: var(--card);
          padding: 0.15em 0.4em;
          border-radius: 0.25em;
          font-size: 0.9em;
        }
        .editor-content a { color: var(--accent); text-decoration: underline; }
        .editor-content hr {
          border: none;
          border-top: 1px solid var(--border);
          margin: 1.5em 0;
        }
        .editor-content img { max-width: 100%; border-radius: 0.5em; margin: 1em 0; }
        .editor-content [contenteditable]:empty:before {
          content: "Start typing or use AI Assistant to generate content...";
          color: var(--muted);
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
