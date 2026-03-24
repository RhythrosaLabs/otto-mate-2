# Pipelines

Pipelines let you chain tasks together with explicit dependencies, forming a **directed acyclic graph (DAG)** that executes automatically.

---

## What is a Pipeline?

A pipeline is a set of **nodes** (tasks) and **edges** (dependencies). When you run a pipeline:
1. Nodes with no dependencies start immediately (in parallel if multiple)
2. When a node completes, any nodes that depended on it become eligible to run
3. Nodes run in topological order — no node runs before its dependencies finish
4. The pipeline ends when all nodes have completed or if any node fails

---

## Building a Pipeline

Navigate to **Pipelines** (`/computer/pipelines`).

1. **Add Node** — click the button, enter a task prompt for that node
2. **Connect nodes** — drag from one node's output handle to another node's input handle to create a dependency edge
3. **Remove edges** — click an edge to delete it
4. **Run** — click Run Pipeline

The canvas supports:
- Drag nodes to rearrange layout
- Zoom and pan
- Click a node to edit its prompt

---

## Node States

Each node shows live status during execution:

| Status | Indicator |
|---|---|
| Pending | Grey |
| Running | Pulsing blue |
| Completed | Green |
| Failed | Red |

---

## Use Cases

**Content production pipeline:**
```
[Research competitors] → [Write blog post] → [Create featured image] → [Post to WordPress]
```

**Data pipeline:**
```
[Scrape price data] → [Analyze trends]
                    ↘ [Build visualization]
                         ↘ [Email report]
```

**Code review pipeline:**
```
[Write feature code] → [Write tests] → [Security audit]
                                      ↘ [Performance analysis]
```

---

## Pipeline Storage

Pipelines are stored in the `pipelines` SQLite table as JSON:

```json
{
  "id": "pipeline-uuid",
  "name": "My Pipeline",
  "nodes": [
    { "id": "n1", "prompt": "Research topic X", "x": 100, "y": 200 },
    { "id": "n2", "prompt": "Write article about X", "x": 350, "y": 200 }
  ],
  "edges": [
    { "source": "n1", "target": "n2" }
  ]
}
```

---

## Pipeline API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/pipelines` | List all pipelines |
| `POST` | `/api/pipelines` | Create a new pipeline |
| `POST` | `/api/pipelines/{id}/run` | Execute a pipeline |
| `GET` | `/api/pipelines/{id}` | Get pipeline with node statuses |
| `DELETE` | `/api/pipelines/{id}` | Delete a pipeline |
