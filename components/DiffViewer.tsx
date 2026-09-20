"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { PrDiffFile } from "@/lib/types";

export interface DiffViewerProps {
  files: PrDiffFile[];
  activeFile?: string | null;
  onSelectFile?: (filename: string) => void;
  activeLine?: number | null;
  onSelectLine?: (line: number) => void;
  isLoading?: boolean;
}

type DiffLine = {
  oldLine: number | null;
  newLine: number | null;
  type: "hunk" | "add" | "delete" | "context";
  text: string;
};

function parsePatch(patch: string): DiffLine[] {
  const result: DiffLine[] = [];
  const lines = patch.split("\n");
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const raw of lines) {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);

    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      result.push({
        oldLine: null,
        newLine: null,
        type: "hunk",
        text,
      });
      continue;
    }

    if (!inHunk || text.startsWith("\\ No newline at end of file")) {
      continue;
    }

    switch (text[0]) {
      case "+":
        result.push({
          oldLine: null,
          newLine: newLine++,
          type: "add",
          text: text.slice(1),
        });
        break;
      case "-":
        result.push({
          oldLine: oldLine++,
          newLine: null,
          type: "delete",
          text: text.slice(1),
        });
        break;
      case " ":
        result.push({
          oldLine: oldLine++,
          newLine: newLine++,
          type: "context",
          text: text.slice(1),
        });
        break;
      default:
        inHunk = false;
        break;
    }
  }

  return result;
}

function basename(filename: string): string {
  return filename.split(/[\\/]/).pop() || filename;
}

export default function DiffViewer({
  files,
  activeFile,
  onSelectFile,
  activeLine,
  onSelectLine,
  isLoading = false,
}: DiffViewerProps) {
  const [localActiveFile, setLocalActiveFile] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    if (activeFile != null) {
      return;
    }

    const firstFile = files[0];
    setLocalActiveFile(firstFile?.filename ?? null);

    if (firstFile) {
      onSelectFile?.(firstFile.filename);
    }
  }, [files, activeFile, onSelectFile]);

  const selectedFile = useMemo(() => {
    if (activeFile != null) {
      return files.find((file) => file.filename === activeFile) ?? files[0] ?? null;
    }

    return (
      files.find((file) => file.filename === localActiveFile) ??
      files[0] ??
      null
    );
  }, [files, activeFile, localActiveFile]);

  const lines = useMemo(() => {
    if (!selectedFile) return [];
    if (selectedFile.content) {
      return selectedFile.content.split("\n").map((text, i) => ({
        oldLine: null,
        newLine: i + 1,
        type: "context" as const,
        text,
      }));
    }
    const parsed = parsePatch(selectedFile.patch ?? "");
    if (parsed.length === 0 && selectedFile.patch) {
      return selectedFile.patch.split("\n").map((text, i) => ({
        oldLine: null,
        newLine: i + 1,
        type: "context" as const,
        text,
      }));
    }
    return parsed;
  }, [selectedFile]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.type === "add") additions += 1;
      if (line.type === "delete") deletions += 1;
    }

    return {
      additions: selectedFile?.additions ?? additions,
      deletions: selectedFile?.deletions ?? deletions,
    };
  }, [lines, selectedFile]);

  const filteredFiles = useMemo(() => {
    if (!filterQuery.trim()) return files;
    const q = filterQuery.toLowerCase();
    return files.filter((f) => f.filename.toLowerCase().includes(q));
  }, [files, filterQuery]);

  function handleTabClick(filename: string) {
    setLocalActiveFile(filename);
    onSelectFile?.(filename);
  }

  function handleLineClick(line: DiffLine) {
    const lineNumber = line.newLine ?? line.oldLine;

    if (lineNumber != null) {
      onSelectLine?.(lineNumber);
    }

    if (selectedFile) {
      setLocalActiveFile(selectedFile.filename);
      onSelectFile?.(selectedFile.filename);
    }
  }

  if (isLoading) {
    return (
      <div className="diff-viewer loading" aria-busy="true">
        <div className="skeleton-tabs">
          <div className="skeleton-tab" />
          <div className="skeleton-tab" />
        </div>
        <div className="skeleton-canvas" />
        <style jsx>{`
          .diff-viewer.loading {
            height: 100%;
            display: flex;
            flex-direction: column;
            background: #10141b;
            padding: 16px;
            gap: 16px;
          }
          .skeleton-tabs {
            display: flex;
            gap: 8px;
          }
          .skeleton-tab {
            width: 140px;
            height: 32px;
            background: #1e2633;
            border-radius: 6px;
            animation: pulse 1.5s infinite;
          }
          .skeleton-canvas {
            flex: 1;
            background: #161b22;
            border-radius: 6px;
            animation: pulse 1.5s infinite;
          }
          @keyframes pulse {
            0%,
            100% {
              opacity: 0.6;
            }
            50% {
              opacity: 0.3;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .skeleton-tab,
            .skeleton-canvas {
              animation: none;
            }
          }
        `}</style>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="diff-viewer empty" role="region" aria-label="Diff viewer">
        <div className="empty-content">
          <span className="icon" aria-hidden="true">
            📄
          </span>
          <p className="title">No diff loaded</p>
          <p className="subtitle">
            Enter a pull request number to review its changes.
          </p>
        </div>
        <style jsx>{`
          .diff-viewer.empty {
            height: 100%;
            display: grid;
            place-items: center;
            background: #10141b;
            color: #94a3b8;
            font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          }
          .empty-content {
            text-align: center;
          }
          .icon {
            font-size: 32px;
            display: block;
            margin-bottom: 8px;
          }
          .title {
            color: #f3f4f6;
            font-size: 15px;
            font-weight: 600;
            margin: 0 0 4px;
          }
          .subtitle {
            font-size: 13px;
            margin: 0;
          }
        `}</style>
      </div>
    );
  }

  return (
    <section className="diff-viewer" aria-label="Diff viewer" aria-busy={isLoading}>
      <div className="tabs-header-bar">
        {files.length > 3 && (
          <div className="tab-filter-box">
            <input
              type="text"
              className="tab-filter-input"
              placeholder="Filter files…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              aria-label="Filter files"
            />
          </div>
        )}
        <nav className="tabs" aria-label="Diff files">
          {filteredFiles.map((file) => {
            const isSelected = selectedFile?.filename === file.filename;
            const hasStats = file.additions > 0 || file.deletions > 0;

            return (
              <button
                key={file.filename}
                type="button"
                className={`tab ${isSelected ? "selected" : ""}`}
                onClick={() => handleTabClick(file.filename)}
                aria-pressed={isSelected}
                title={file.filename}
              >
                <span className="filename">{basename(file.filename)}</span>
                {hasStats ? (
                  <span className="counts">
                    <span className="add">+{file.additions}</span>
                    <span className="del">-{file.deletions}</span>
                  </span>
                ) : (
                  <span className="file-chip">file</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {selectedFile ? (
        <div className="canvas-wrapper">
          <header className="file-header">
            <span className="path">{selectedFile.filename}</span>
            <span className="file-stats">
              <span className="status-tag">{selectedFile.status}</span>
              <span className="add">+{stats.additions}</span>
              <span className="del">-{stats.deletions}</span>
            </span>
          </header>

          <div
            className="code-viewport"
            tabIndex={0}
            role="region"
            aria-label={`Diff for ${selectedFile.filename}`}
          >
            <table className="diff-table">
              <tbody>
                {lines.map((line, index) => {
                  const lineNumber = line.newLine ?? line.oldLine;
                  const isHighlighted =
                    activeLine != null &&
                    lineNumber != null &&
                    activeLine === lineNumber;

                  return (
                    <tr
                      key={index}
                      className={`diff-row ${line.type} ${
                        isHighlighted ? "highlighted" : ""
                      }`}
                      onClick={() => handleLineClick(line)}
                      tabIndex={lineNumber != null ? 0 : undefined}
                      onKeyDown={(event) => {
                        if (
                          lineNumber != null &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          handleLineClick(line);
                        }
                      }}
                    >
                      <td className="gutter old-gutter" aria-hidden="true">
                        {line.oldLine ?? ""}
                      </td>
                      <td className="gutter new-gutter" aria-hidden="true">
                        {line.newLine ?? ""}
                      </td>
                      <td className="content">
                        <pre>
                          <code>
                            <span className="prefix" aria-hidden="true">
                              {line.type === "add"
                                ? "+"
                                : line.type === "delete"
                                  ? "-"
                                  : line.type === "hunk"
                                    ? "@"
                                    : " "}
                            </span>
                            {line.text}
                          </code>
                        </pre>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-diff">
          <p>Select a file to view its diff.</p>
        </div>
      )}

      <style jsx>{`
        .diff-viewer {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: #10141b;
          color: #f3f4f6;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          min-height: 0;
        }
        .tabs-header-bar {
          display: flex;
          align-items: center;
          background: #090b0f;
          border-bottom: 1px solid #1e2633;
        }
        .tab-filter-box {
          padding: 6px 8px;
          border-right: 1px solid #1e2633;
          flex-shrink: 0;
        }
        .tab-filter-input {
          height: 28px;
          padding: 0 8px;
          font-size: 11px;
          color: #f3f4f6;
          background: #10141b;
          border: 1px solid #1e2633;
          border-radius: 4px;
          width: 120px;
        }
        .tab-filter-input:focus-visible {
          outline: 2px solid #67e8f9;
        }
        .tabs {
          display: flex;
          background: #090b0f;
          overflow-x: auto;
          scrollbar-width: thin;
          flex: 1;
        }
        .file-chip {
          font-size: 10px;
          text-transform: uppercase;
          color: #94a3b8;
          padding: 1px 4px;
          border-radius: 3px;
          background: #161b22;
          border: 1px solid #1e2633;
        }
        .tab {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: #94a3b8;
          font-size: 13px;
          font-family: inherit;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }
        .tab:hover {
          color: #f3f4f6;
          background: #10141b;
        }
        .tab.selected {
          color: #34d399;
          border-bottom-color: #34d399;
          background: #10141b;
          font-weight: 500;
        }
        .tab:focus-visible,
        .code-viewport:focus-visible,
        .diff-row:focus-visible {
          outline: 2px solid #fbbf24;
          outline-offset: -2px;
        }
        .filename {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            monospace;
        }
        .counts {
          font-size: 11px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            monospace;
          display: inline-flex;
          gap: 4px;
        }
        .add {
          color: #34d399;
        }
        .del {
          color: #f87171;
        }
        .canvas-wrapper {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .file-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          background: #0d1117;
          border-bottom: 1px solid #1e2633;
          font-size: 12px;
        }
        .path {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            monospace;
          color: #e2e8f0;
        }
        .file-stats {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            monospace;
          font-size: 11px;
        }
        .status-tag {
          padding: 1px 6px;
          border-radius: 4px;
          background: #1e2633;
          color: #94a3b8;
          text-transform: uppercase;
          font-size: 10px;
        }
        .code-viewport {
          flex: 1;
          overflow: auto;
          background: #10141b;
          outline: none;
        }
        .diff-table {
          width: 100%;
          border-collapse: collapse;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            monospace;
          font-size: 12px;
          line-height: 20px;
        }
        .diff-row {
          cursor: pointer;
        }
        .diff-row:hover {
          filter: brightness(1.15);
        }
        .gutter {
          width: 44px;
          min-width: 44px;
          padding: 0 8px;
          text-align: right;
          color: #475569;
          user-select: none;
          border-right: 1px solid #1e2633;
        }
        .content {
          padding: 0 12px;
          white-space: pre;
        }
        .content pre {
          margin: 0;
          font-family: inherit;
        }
        .content code {
          font-family: inherit;
        }
        .prefix {
          display: inline-block;
          width: 14px;
          user-select: none;
        }
        .diff-row.add {
          background: rgba(52, 211, 153, 0.08);
          color: #34d399;
        }
        .diff-row.delete {
          background: rgba(248, 113, 113, 0.08);
          color: #f87171;
        }
        .diff-row.hunk {
          background: rgba(168, 85, 247, 0.08);
          color: #c084fc;
          cursor: default;
        }
        .diff-row.hunk .gutter {
          color: #a855f7;
        }
        .diff-row.context {
          color: #94a3b8;
        }
        .diff-row.highlighted {
          background: rgba(251, 191, 36, 0.12);
          border-left: 3px solid #FBBF24;
        }
        .empty-diff {
          flex: 1;
          display: grid;
          place-items: center;
          color: #64748b;
          font-size: 13px;
        }
        @media (prefers-reduced-motion: reduce) {
          .tab {
            transition: none;
          }
        }
      `}</style>
    </section>
  );
}