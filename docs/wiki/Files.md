# Files

The Files page (`/computer/files`) is a Finder-style file browser for all files produced across every task, plus files you upload directly.

---

## Views

| View | Description |
|---|---|
| **Icon** | Grid of file thumbnails with type icons |
| **List** | Compact table with name, type, size, date, source |
| **Gallery** | Media-only grid — larger thumbnails for images and videos |

---

## File Sources

Every file in the system has a `FileSource` tag indicating its origin:

| Source | Description |
|---|---|
| `upload` | Manually uploaded by the user |
| `chat` | Attached to a task via the chat input |
| `agent` | Created by the agent using the `write_file` tool |
| `playground` | — |
| `dreamscape` | Generated in Dreamscape Video Studio (filenames: `dream-*`) |
| `app-builder` | Exported from the bolt-diy App Builder |
| `gallery` | Generated in Nova Creative Suite or Image Studio (filenames: `nova-*`, `firefly-*`) |
| `api` | Saved via the `/api/files/save-generation` endpoint |
| `unknown` | Source not determined |

---

## Sidebar Filters

| Filter | What it shows |
|---|---|
| All Files | Everything |
| Images | PNG, JPG, JPEG, WEBP, GIF, SVG, BMP, ICO, TIFF |
| Videos | MP4, MOV, WEBM, AVI, MKV, OGG (video) |
| Audio | MP3, WAV, OGG, FLAC, AAC, M4A, OPUS |
| Code | JS, TS, TSX, JSX, PY, HTML, CSS, JSON, YAML, TOML, RS, GO, RB, PHP, SH, SQL, MD |
| Documents | PDF, TXT, MD, DOC, DOCX, PPT, PPTX, XLS, XLSX, CSV, RTF |
| Archives | ZIP, TAR, GZ, 7Z, RAR |
| Dreamscape | Files from Video Studio generation |
| Nova | Files from Nova Creative Suite / Image Studio |
| Uploaded | Files with `source = "upload"` |

---

## Formats Supported

50+ file formats with type-aware preview:

| Category | Formats |
|---|---|
| Images | PNG, JPG, JPEG, WEBP, GIF, SVG, BMP, ICO, TIFF |
| Video | MP4, MOV, WEBM, AVI, MKV |
| Audio | MP3, WAV, OGG, FLAC, AAC, M4A |
| Code | JS, TS, TSX, JSX, PY, HTML, CSS, SCSS, JSON, YAML, TOML, XML, RS, GO, RB, PHP, SH, BASH, SQL, MD, MDX |
| Documents | PDF, TXT, MD, CSV, RTF |
| Data | JSON, CSV, YAML, TOML, XML |
| Archives | ZIP, TAR, GZ, 7Z, RAR |

---

## Preview Pane

Click any file to open a slide-over preview:
- **Images:** inline render
- **Video:** embedded player with controls
- **Audio:** embedded player
- **Code:** syntax-highlighted editor view
- **Markdown:** rendered HTML
- **PDF:** iframe viewer
- **CSV:** formatted table
- **JSON:** collapsible tree view

Preview metadata shows: file size, MIME type, creation date, source task link.

---

## Folders

Create named folders to organize files:
- Right-click → New Folder (or click **+ Folder** button)
- Custom folder color picker
- Nested folders (unlimited depth)
- Drag-and-drop files into folders

Folder structure is stored in the `file_folders` SQLite table. Moving files uses the `organize_files` agent tool (or the UI drag-and-drop).

---

## File Storage

Files are stored on the **local filesystem** at:
```
./task-files/{taskId}/{filename}
```

Served via the API route:
```
GET /api/files/{taskId}/{filename}
```

There is no cloud storage — files live on your machine alongside the database.

---

## Uploading Files to a Task

1. From the home page prompt bar: click the **paperclip** icon
2. From the task detail **Chat** tab: paperclip icon
3. Drag-and-drop onto the prompt bar

Uploaded files are attached to the task and the agent can read them using the `read_file` tool.

---

## File API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/files` | List all files (with filters: taskId, folderId, mimeType, source) |
| `GET` | `/api/files/{taskId}/{filename}` | Serve a file |
| `POST` | `/api/files/save-generation` | Save a generated file (from media APIs) |
