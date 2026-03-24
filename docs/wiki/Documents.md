# Documents

**URL:** `/computer/documents`

The Documents section lets you create and manage text documents with rich formatting and AI writing assistance.

---

## Document Types

| Type | Description |
|---|---|
| **Rich text** | WYSIWYG document editor with formatting — headings, bold, italic, lists, code blocks, links, tables |
| **Spreadsheet** | Editable data grid — row/column editing, basic formulas, CSV export |

---

## Creating a Document

1. Navigate to **Documents** (`/computer/documents`)
2. Click **New Document**
3. Choose type (rich text or spreadsheet)
4. Give it a name
5. Start writing

---

## Rich Text Editor

Features:
- Toolbar with: Bold, Italic, Underline, Strikethrough, Headings (H1/H2/H3), Bullet list, Numbered list, Code block, Blockquote, Link, Image insert
- Keyboard shortcuts (⌘B bold, ⌘I italic, ⌘K link, etc.)
- Auto-save
- Word count

---

## Spreadsheet Editor

Features:
- Add / remove rows and columns
- Cell editing with text input
- Column header rename
- CSV export
- Basic cell references

---

## AI Writing Assistant

The AI assistant is available as a side panel in any document.

### Modes

| Mode | Description |
|---|---|
| **Draft** | Generate new content based on a prompt |
| **Edit** | Rewrite a selected section |
| **Summarize** | Condense the current document or selection |
| **Translate** | Translate to another language |
| **Change tone** | Formal, casual, persuasive, concise, etc. |
| **Expand** | Add more detail to a section |
| **Condense** | Shorten a section |

The AI assistant uses SSE streaming — changes appear word by word in real time.

### Using the Assistant

1. Open a document
2. Click the **AI** button in the toolbar (or sidebar icon)
3. Select a mode
4. Type instructions if the mode requires them
5. The AI response streams in — accept or discard the changes

---

## Document Storage

Documents are stored in the `documents` SQLite table:

| Column | Description |
|---|---|
| `id` | UUID |
| `name` | Document title |
| `type` | `rich_text` or `spreadsheet` |
| `content` | Document content as JSON |
| `created_at` | — |
| `updated_at` | — |

---

## Documents API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/documents` | List all documents |
| `POST` | `/api/documents` | Create a document |
| `GET` | `/api/documents/{id}` | Get a document |
| `PUT` | `/api/documents/{id}` | Update a document |
| `DELETE` | `/api/documents/{id}` | Delete a document |
| `POST` | `/api/documents/{id}/ai` | AI writing assistance (SSE streaming) |
