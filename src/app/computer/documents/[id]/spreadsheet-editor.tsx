"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Plus,
  Trash2,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SpreadsheetEditorProps {
  content: string;
  onSave: (content: string) => void;
}

interface CellData {
  value: string;
  formula?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  bg?: string;
  color?: string;
}

interface SpreadsheetData {
  cells: Record<string, CellData>;
  colWidths: Record<number, number>;
  rowHeights: Record<number, number>;
}

const DEFAULT_COLS = 26;
const DEFAULT_ROWS = 50;
const DEFAULT_COL_WIDTH = 120;
const DEFAULT_ROW_HEIGHT = 32;

function colLabel(i: number): string {
  let label = "";
  let n = i;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

function cellRef(row: number, col: number): string {
  return `${colLabel(col)}${row + 1}`;
}

function parseCellRef(ref: string): { row: number; col: number } | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  let col = 0;
  for (let i = 0; i < match[1].length; i++) {
    col = col * 26 + (match[1].charCodeAt(i) - 64);
  }
  return { row: parseInt(match[2]) - 1, col: col - 1 };
}

// Safe formula evaluator for basic operations
function evaluateFormula(formula: string, cells: Record<string, CellData>): string {
  if (!formula.startsWith("=")) return formula;
  const expr = formula.slice(1).trim().toUpperCase();

  // SUM(A1:A10)
  const sumMatch = expr.match(/^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (sumMatch) {
    const start = parseCellRef(sumMatch[1]);
    const end = parseCellRef(sumMatch[2]);
    if (!start || !end) return "#REF!";
    let sum = 0;
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        const ref = cellRef(r, c);
        const val = parseFloat(cells[ref]?.value || "0");
        if (!isNaN(val)) sum += val;
      }
    }
    return sum.toString();
  }

  // AVERAGE(A1:A10)
  const avgMatch = expr.match(/^AVERAGE\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (avgMatch) {
    const start = parseCellRef(avgMatch[1]);
    const end = parseCellRef(avgMatch[2]);
    if (!start || !end) return "#REF!";
    let sum = 0;
    let count = 0;
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        const ref = cellRef(r, c);
        const val = parseFloat(cells[ref]?.value || "0");
        if (!isNaN(val)) { sum += val; count++; }
      }
    }
    return count > 0 ? (sum / count).toString() : "0";
  }

  // COUNT(A1:A10)
  const countMatch = expr.match(/^COUNT\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (countMatch) {
    const start = parseCellRef(countMatch[1]);
    const end = parseCellRef(countMatch[2]);
    if (!start || !end) return "#REF!";
    let count = 0;
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        const ref = cellRef(r, c);
        if (cells[ref]?.value) count++;
      }
    }
    return count.toString();
  }

  // MAX(A1:A10)
  const maxMatch = expr.match(/^MAX\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (maxMatch) {
    const start = parseCellRef(maxMatch[1]);
    const end = parseCellRef(maxMatch[2]);
    if (!start || !end) return "#REF!";
    let max = -Infinity;
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        const ref = cellRef(r, c);
        const val = parseFloat(cells[ref]?.value || "");
        if (!isNaN(val)) max = Math.max(max, val);
      }
    }
    return max === -Infinity ? "0" : max.toString();
  }

  // MIN(A1:A10)
  const minMatch = expr.match(/^MIN\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (minMatch) {
    const start = parseCellRef(minMatch[1]);
    const end = parseCellRef(minMatch[2]);
    if (!start || !end) return "#REF!";
    let min = Infinity;
    for (let r = start.row; r <= end.row; r++) {
      for (let c = start.col; c <= end.col; c++) {
        const ref = cellRef(r, c);
        const val = parseFloat(cells[ref]?.value || "");
        if (!isNaN(val)) min = Math.min(min, val);
      }
    }
    return min === Infinity ? "0" : min.toString();
  }

  // Simple cell reference: =A1
  const refMatch = expr.match(/^([A-Z]+\d+)$/);
  if (refMatch) {
    return cells[refMatch[1]]?.value || "0";
  }

  // Basic arithmetic with cell refs: =A1+B1, =A1*2, etc.
  try {
    const resolved = expr.replace(/[A-Z]+\d+/g, (ref) => {
      const val = cells[ref]?.value || "0";
      const num = parseFloat(val);
      return isNaN(num) ? "0" : num.toString();
    });
    // Only allow safe characters in arithmetic expressions
    if (/^[\d\s+\-*/().]+$/.test(resolved)) {
      const result = new Function(`"use strict"; return (${resolved})`)();
      return typeof result === "number" && isFinite(result) ? result.toString() : "#ERROR!";
    }
  } catch {
    return "#ERROR!";
  }

  return "#ERROR!";
}

export function SpreadsheetEditor({ content, onSave }: SpreadsheetEditorProps) {
  const [data, setData] = useState<SpreadsheetData>(() => {
    try {
      return JSON.parse(content) as SpreadsheetData;
    } catch {
      return { cells: {}, colWidths: {}, rowHeights: {} };
    }
  });
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [numRows, setNumRows] = useState(DEFAULT_ROWS);
  const [numCols, setNumCols] = useState(DEFAULT_COLS);
  const [selection, setSelection] = useState<{ start: string; end: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-save
  const triggerSave = useCallback((newData: SpreadsheetData) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onSave(JSON.stringify(newData));
    }, 800);
  }, [onSave]);

  // Listen for AI insert events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.text) {
        // Try to parse AI response as cell data
        const lines = detail.text.split("\n");
        const newData = { ...data };
        let row = selectedCell ? (parseCellRef(selectedCell)?.row ?? 0) : 0;
        const startCol = selectedCell ? (parseCellRef(selectedCell)?.col ?? 0) : 0;
        for (const line of lines) {
          if (!line.trim()) continue;
          const values = line.split("\t").length > 1 ? line.split("\t") : line.split(",");
          values.forEach((v: string, ci: number) => {
            const ref = cellRef(row, startCol + ci);
            newData.cells[ref] = { ...newData.cells[ref], value: v.trim() };
          });
          row++;
        }
        setData(newData);
        triggerSave(newData);
      }
    };
    window.addEventListener("ai-insert", handler);
    return () => window.removeEventListener("ai-insert", handler);
  }, [data, selectedCell, triggerSave]);

  const getCellDisplay = useCallback((ref: string): string => {
    const cell = data.cells[ref];
    if (!cell) return "";
    if (cell.formula) return evaluateFormula(cell.formula, data.cells);
    return cell.value || "";
  }, [data.cells]);

  const setCellValue = useCallback((ref: string, value: string) => {
    const newData = { ...data };
    const isFormula = value.startsWith("=");
    newData.cells[ref] = {
      ...newData.cells[ref],
      value: isFormula ? "" : value,
      formula: isFormula ? value : undefined,
    };
    if (isFormula) {
      newData.cells[ref].value = evaluateFormula(value, newData.cells);
    }
    setData(newData);
    triggerSave(newData);
  }, [data, triggerSave]);

  const setCellFormat = useCallback((format: Partial<CellData>) => {
    if (!selectedCell) return;
    const newData = { ...data };
    newData.cells[selectedCell] = { ...newData.cells[selectedCell], value: newData.cells[selectedCell]?.value || "", ...format };
    setData(newData);
    triggerSave(newData);
  }, [data, selectedCell, triggerSave]);

  const startEdit = useCallback((ref: string) => {
    setEditingCell(ref);
    const cell = data.cells[ref];
    setEditValue(cell?.formula || cell?.value || "");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [data.cells]);

  const commitEdit = useCallback(() => {
    if (editingCell) {
      setCellValue(editingCell, editValue);
      setEditingCell(null);
    }
  }, [editingCell, editValue, setCellValue]);

  const handleCellKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editingCell) {
      if (selectedCell && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        startEdit(selectedCell);
        return;
      }
      // Arrow key navigation
      if (selectedCell && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const parsed = parseCellRef(selectedCell);
        if (!parsed) return;
        let { row, col } = parsed;
        if (e.key === "ArrowUp") row = Math.max(0, row - 1);
        if (e.key === "ArrowDown") row = Math.min(numRows - 1, row + 1);
        if (e.key === "ArrowLeft") col = Math.max(0, col - 1);
        if (e.key === "ArrowRight") col = Math.min(numCols - 1, col + 1);
        setSelectedCell(cellRef(row, col));
      }
      if (selectedCell && e.key === "Enter") {
        e.preventDefault();
        startEdit(selectedCell);
      }
      if (selectedCell && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        setCellValue(selectedCell, "");
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
      // Move down
      const parsed = parseCellRef(editingCell);
      if (parsed) {
        const next = cellRef(Math.min(numRows - 1, parsed.row + 1), parsed.col);
        setSelectedCell(next);
      }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      commitEdit();
      // Move right
      const parsed = parseCellRef(editingCell);
      if (parsed) {
        const next = cellRef(parsed.row, Math.min(numCols - 1, parsed.col + (e.shiftKey ? -1 : 1)));
        setSelectedCell(next);
      }
    }
    if (e.key === "Escape") {
      setEditingCell(null);
    }
  }, [editingCell, selectedCell, startEdit, commitEdit, setCellValue, numRows, numCols]);

  // Export to CSV
  const exportCSV = useCallback(() => {
    let maxRow = 0;
    let maxCol = 0;
    Object.keys(data.cells).forEach((ref) => {
      const parsed = parseCellRef(ref);
      if (parsed) {
        maxRow = Math.max(maxRow, parsed.row);
        maxCol = Math.max(maxCol, parsed.col);
      }
    });

    const rows: string[] = [];
    for (let r = 0; r <= maxRow; r++) {
      const cols: string[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const val = getCellDisplay(cellRef(r, c));
        cols.push(val.includes(",") ? `"${val}"` : val);
      }
      rows.push(cols.join(","));
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spreadsheet.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [data.cells, getCellDisplay]);

  const selectedCellData = selectedCell ? data.cells[selectedCell] : null;

  return (
    <div className="flex flex-col h-full" onKeyDown={handleCellKeyDown} tabIndex={0}>
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-pplx-border bg-pplx-bg flex items-center gap-2 shrink-0">
        {/* Formula bar */}
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs font-mono text-pplx-accent bg-pplx-card px-2 py-1 rounded-md w-12 text-center">
            {selectedCell || "—"}
          </span>
          <span className="text-pplx-muted text-xs">ƒx</span>
          <input
            ref={inputRef}
            type="text"
            value={editingCell ? editValue : (selectedCellData?.formula || selectedCellData?.value || "")}
            onChange={(e) => {
              if (editingCell) setEditValue(e.target.value);
              else if (selectedCell) {
                startEdit(selectedCell);
                setEditValue(e.target.value);
              }
            }}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { commitEdit(); }
            }}
            className="flex-1 bg-pplx-card border border-pplx-border rounded-md text-sm text-pplx-text px-2 py-1 outline-none focus:border-pplx-accent font-mono"
            placeholder="Enter value or formula (=SUM, =AVERAGE, etc.)"
          />
        </div>

        <div className="w-px h-5 bg-pplx-border" />

        {/* Format buttons */}
        <button
          title="Bold"
          onClick={() => setCellFormat({ bold: !selectedCellData?.bold })}
          className={cn("p-1.5 rounded-md transition-colors", selectedCellData?.bold ? "bg-pplx-accent/20 text-pplx-accent" : "text-pplx-muted hover:text-pplx-text hover:bg-pplx-card")}
        >
          <Bold size={14} />
        </button>
        <button
          title="Italic"
          onClick={() => setCellFormat({ italic: !selectedCellData?.italic })}
          className={cn("p-1.5 rounded-md transition-colors", selectedCellData?.italic ? "bg-pplx-accent/20 text-pplx-accent" : "text-pplx-muted hover:text-pplx-text hover:bg-pplx-card")}
        >
          <Italic size={14} />
        </button>

        <div className="w-px h-5 bg-pplx-border" />

        <button title="Align Left" onClick={() => setCellFormat({ align: "left" })} className={cn("p-1.5 rounded-md transition-colors", selectedCellData?.align === "left" ? "bg-pplx-accent/20 text-pplx-accent" : "text-pplx-muted hover:text-pplx-text hover:bg-pplx-card")}>
          <AlignLeft size={14} />
        </button>
        <button title="Align Center" onClick={() => setCellFormat({ align: "center" })} className={cn("p-1.5 rounded-md transition-colors", selectedCellData?.align === "center" ? "bg-pplx-accent/20 text-pplx-accent" : "text-pplx-muted hover:text-pplx-text hover:bg-pplx-card")}>
          <AlignCenter size={14} />
        </button>
        <button title="Align Right" onClick={() => setCellFormat({ align: "right" })} className={cn("p-1.5 rounded-md transition-colors", selectedCellData?.align === "right" ? "bg-pplx-accent/20 text-pplx-accent" : "text-pplx-muted hover:text-pplx-text hover:bg-pplx-card")}>
          <AlignRight size={14} />
        </button>

        <div className="w-px h-5 bg-pplx-border" />

        {/* Cell background color */}
        <div className="relative">
          <label className="p-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-pplx-card cursor-pointer block" title="Background Color">
            <Palette size={14} />
            <input
              type="color"
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              onChange={(e) => setCellFormat({ bg: e.target.value })}
            />
          </label>
        </div>

        <div className="w-px h-5 bg-pplx-border" />

        <button
          title="Add Row"
          onClick={() => setNumRows((r) => r + 1)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-pplx-card text-xs transition-colors"
        >
          <Plus size={12} /> Row
        </button>
        <button
          title="Add Column"
          onClick={() => setNumCols((c) => c + 1)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-pplx-card text-xs transition-colors"
        >
          <Plus size={12} /> Col
        </button>
        <button
          title="Export CSV"
          onClick={exportCSV}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md text-pplx-muted hover:text-pplx-text hover:bg-pplx-card text-xs transition-colors"
        >
          <Download size={12} /> CSV
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: "100%" }}>
          <thead>
            <tr>
              {/* Row number header */}
              <th className="sticky top-0 left-0 z-20 bg-pplx-card border-b border-r border-pplx-border w-12 min-w-[48px] text-xs text-pplx-muted" />
              {Array.from({ length: numCols }, (_, ci) => (
                <th
                  key={ci}
                  className="sticky top-0 z-10 bg-pplx-card border-b border-r border-pplx-border text-xs text-pplx-muted font-medium px-2 py-1.5 select-none"
                  style={{ width: data.colWidths[ci] || DEFAULT_COL_WIDTH, minWidth: 60 }}
                >
                  {colLabel(ci)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: numRows }, (_, ri) => (
              <tr key={ri}>
                {/* Row number */}
                <td className="sticky left-0 z-10 bg-pplx-card border-b border-r border-pplx-border text-xs text-pplx-muted text-center select-none py-1">
                  {ri + 1}
                </td>
                {Array.from({ length: numCols }, (_, ci) => {
                  const ref = cellRef(ri, ci);
                  const cell = data.cells[ref];
                  const isSelected = selectedCell === ref;
                  const isEditing = editingCell === ref;
                  const display = getCellDisplay(ref);

                  return (
                    <td
                      key={ci}
                      onClick={() => {
                        if (editingCell && editingCell !== ref) commitEdit();
                        setSelectedCell(ref);
                      }}
                      onDoubleClick={() => startEdit(ref)}
                      className={cn(
                        "border-b border-r border-pplx-border text-sm relative",
                        isSelected && "ring-2 ring-pplx-accent ring-inset",
                        !isEditing && "cursor-cell"
                      )}
                      style={{
                        backgroundColor: cell?.bg || "transparent",
                        height: data.rowHeights[ri] || DEFAULT_ROW_HEIGHT,
                        minWidth: 60,
                      }}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="absolute inset-0 w-full h-full bg-pplx-bg border-0 outline-none px-2 text-sm text-pplx-text font-mono z-10"
                          autoFocus
                        />
                      ) : (
                        <div
                          className={cn(
                            "px-2 py-1 truncate",
                            cell?.bold && "font-bold",
                            cell?.italic && "italic"
                          )}
                          style={{
                            textAlign: cell?.align || "left",
                            color: cell?.color || "var(--text)",
                          }}
                        >
                          {display}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div className="px-4 py-1.5 border-t border-pplx-border bg-pplx-bg flex items-center justify-between text-xs text-pplx-muted shrink-0">
        <span>{Object.keys(data.cells).filter((k) => data.cells[k]?.value || data.cells[k]?.formula).length} cells with data</span>
        <div className="flex items-center gap-4">
          {selectedCell && (
            <>
              <span>Selected: {selectedCell}</span>
              {getCellDisplay(selectedCell) && !isNaN(parseFloat(getCellDisplay(selectedCell))) && (
                <span>Value: {getCellDisplay(selectedCell)}</span>
              )}
            </>
          )}
          <span>{numRows} rows × {numCols} cols</span>
        </div>
      </div>
    </div>
  );
}
