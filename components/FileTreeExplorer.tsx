"use client";

import React, { useState, useMemo, useCallback } from "react";

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  children?: FileTreeNode[];
}

export interface FileTreeExplorerProps {
  files: Array<{ filename: string } | string>;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  rootName?: string;
  className?: string;
  onClose?: () => void;
}

export function buildFileTree(
  fileList: Array<{ filename: string } | string>,
  rootName = "ecolog",
): FileTreeNode {
  const root: FileTreeNode = {
    id: "root",
    name: rootName,
    path: "",
    isFolder: true,
    children: [],
  };

  for (const item of fileList) {
    const rawPath = typeof item === "string" ? item : item.filename;
    if (!rawPath) continue;

    const parts = rawPath.replace(/^[\\/]+/, "").split(/[\\/]+/).filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join("/");

      if (!current.children) {
        current.children = [];
      }

      let existing = current.children.find((child) => child.name === part);
      if (!existing) {
        existing = {
          id: currentPath,
          name: part,
          path: currentPath,
          isFolder: !isFile,
          children: isFile ? undefined : [],
        };
        current.children.push(existing);
      }

      current = existing;
    }
  }

  // Sort recursively: folders first, then alphabetical
  function sortNode(node: FileTreeNode): void {
    if (!node.children || node.children.length === 0) return;

    node.children.sort((a, b) => {
      if (a.isFolder === b.isFolder) {
        return a.name.localeCompare(b.name);
      }
      return a.isFolder ? -1 : 1;
    });

    for (const child of node.children) {
      sortNode(child);
    }
  }

  sortNode(root);
  return root;
}

function getFileBadge(filename: string): { label: string; color: string } {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
      return { label: "TS", color: "#38bdf8" };
    case "tsx":
      return { label: "TSX", color: "#60a5fa" };
    case "js":
    case "mjs":
      return { label: "JS", color: "#facc15" };
    case "json":
      return { label: "{}", color: "#fbbf24" };
    case "prisma":
      return { label: "DB", color: "#34d399" };
    case "css":
      return { label: "#", color: "#a78bfa" };
    case "md":
      return { label: "MD", color: "#94a3b8" };
    case "sql":
      return { label: "SQL", color: "#f87171" };
    default:
      return { label: "FILE", color: "#64748b" };
  }
}

export default function FileTreeExplorer({
  files,
  activeFile,
  onSelectFile,
  rootName = "project",
  className = "",
  onClose,
}: FileTreeExplorerProps) {
  const [filterQuery, setFilterQuery] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildFileTree(files, rootName), [files, rootName]);
  const normalizedActiveFile = useMemo(() => {
    return activeFile ? activeFile.replace(/^[\\/]+/, "") : null;
  }, [activeFile]);

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedFolders(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    const allFolderIds = new Set<string>();
    function collectFolders(node: FileTreeNode) {
      if (node.isFolder && node.id !== "root") {
        allFolderIds.add(node.id);
      }
      node.children?.forEach(collectFolders);
    }
    collectFolders(tree);
    setCollapsedFolders(allFolderIds);
  }, [tree]);

  function renderTreeNodes(
    nodes: FileTreeNode[],
    depth = 0,
    parentPrefix = "",
  ): React.ReactNode {
    return nodes.map((node, index) => {
      const isLast = index === nodes.length - 1;
      const isCollapsed = collapsedFolders.has(node.id);
      const isSelected = normalizedActiveFile === node.path;
      const matchesFilter =
        !filterQuery ||
        node.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
        node.path.toLowerCase().includes(filterQuery.toLowerCase());

      if (filterQuery && !matchesFilter && !node.isFolder) {
        return null;
      }

      const branchGuide = isLast ? "└── " : "├── ";
      const nextPrefix = parentPrefix + (isLast ? "    " : "│   ");

      if (node.isFolder) {
        return (
          <div key={node.id} className="tree-group">
            <button
              type="button"
              className="tree-node folder-node"
              onClick={() => toggleFolder(node.id)}
              aria-expanded={!isCollapsed}
              title={node.path || node.name}
            >
              <span className="tree-guide" aria-hidden="true">
                {parentPrefix}
                {branchGuide}
              </span>
              <span className="folder-caret" aria-hidden="true">
                {isCollapsed ? "▶" : "▼"}
              </span>
              <span className="folder-icon" aria-hidden="true">
                {isCollapsed ? "📁" : "📂"}
              </span>
              <span className="node-name folder-name">{node.name}/</span>
            </button>

            {!isCollapsed && node.children && node.children.length > 0 && (
              <div className="folder-children">
                {renderTreeNodes(node.children, depth + 1, nextPrefix)}
              </div>
            )}
          </div>
        );
      }

      const badge = getFileBadge(node.name);

      return (
        <div key={node.id} className="tree-leaf">
          <button
            type="button"
            className={`tree-node file-node ${isSelected ? "selected" : ""}`}
            onClick={() => onSelectFile(node.path)}
            title={node.path}
            aria-selected={isSelected}
          >
            <span className="tree-guide" aria-hidden="true">
              {parentPrefix}
              {branchGuide}
            </span>
            <span
              className="file-badge"
              style={{ color: badge.color, borderColor: `${badge.color}40` }}
              aria-hidden="true"
            >
              {badge.label}
            </span>
            <span className="node-name file-name">{node.name}</span>
          </button>
        </div>
      );
    });
  }

  const totalFilesCount = useMemo(() => {
    return files.length;
  }, [files]);

  return (
    <aside className={`file-tree-explorer ${className}`} aria-label="Project file explorer">
      <div className="explorer-header">
        <div className="title-row">
          <span className="explorer-title">
            <span className="icon" aria-hidden="true">🌲</span> EXPLORER
          </span>
          <div className="explorer-actions">
            <button
              type="button"
              onClick={expandAll}
              className="mini-btn"
              title="Expand all folders"
            >
              +
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="mini-btn"
              title="Collapse all folders"
            >
              -
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="mini-btn close-btn"
                title="Collapse file tree"
                aria-label="Collapse file tree"
              >
                ◀
              </button>
            )}
          </div>
        </div>

        <div className="search-box">
          <input
            type="text"
            placeholder="Search files…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="search-input"
            aria-label="Search files"
          />
          {filterQuery && (
            <button
              type="button"
              className="clear-search"
              onClick={() => setFilterQuery("")}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="tree-viewport" tabIndex={0} role="tree">
        <div className="root-label">
          <span className="root-icon" aria-hidden="true">📦</span>
          <span className="root-name">{rootName}/</span>
          <span className="file-count" title={`${totalFilesCount} files total`}>
            {totalFilesCount}
          </span>
        </div>

        <div className="tree-content">
          {tree.children && tree.children.length > 0 ? (
            renderTreeNodes(tree.children)
          ) : (
            <p className="empty-tree">No files found.</p>
          )}
        </div>
      </div>

      <style jsx>{`
        .file-tree-explorer {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #090b0f;
          border-right: 1px solid #1e2633;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          user-select: none;
          width: 100%;
          min-width: 0;
        }
        .explorer-header {
          padding: 8px 10px;
          border-bottom: 1px solid #1e2633;
          background: #10141b;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .explorer-title {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .explorer-actions {
          display: flex;
          gap: 4px;
        }
        button.mini-btn,
        .mini-btn {
          padding: 1px 5px !important;
          font-size: 10px !important;
          height: 18px !important;
          min-width: 18px !important;
          background: #161b22 !important;
          border: 1px solid #1e2633 !important;
          border-radius: 3px !important;
          color: #94a3b8 !important;
          cursor: pointer !important;
          line-height: 1 !important;
        }
        button.mini-btn:hover,
        .mini-btn:hover {
          color: #f3f4f6 !important;
          border-color: #67e8f9 !important;
        }
        .search-box {
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-input {
          width: 100%;
          height: 24px;
          padding: 0 20px 0 6px;
          font-size: 11px;
          color: #f3f4f6;
          background: #090b0f;
          border: 1px solid #1e2633;
          border-radius: 4px;
        }
        .search-input:focus-visible {
          outline: 2px solid #67e8f9;
        }
        .clear-search {
          position: absolute;
          right: 4px;
          background: transparent !important;
          border: none !important;
          color: #94a3b8 !important;
          font-size: 12px;
          padding: 0 !important;
          cursor: pointer;
        }
        .tree-viewport {
          flex: 1;
          overflow-y: auto;
          overflow-x: auto;
          padding: 6px 4px;
          scrollbar-width: thin;
        }
        .root-label {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 6px;
          color: #67e8f9;
          font-weight: 700;
          font-size: 12px;
          border-bottom: 1px solid #1e263333;
          margin-bottom: 4px;
        }
        .root-name {
          flex: 1;
        }
        .file-count {
          font-size: 9px;
          color: #94a3b8;
          background: #161b22;
          padding: 1px 5px;
          border-radius: 10px;
          border: 1px solid #1e2633;
        }
        .tree-content {
          display: flex;
          flex-direction: column;
        }
        button.tree-node,
        .tree-node {
          width: 100% !important;
          display: flex !important;
          align-items: center !important;
          gap: 4px !important;
          padding: 2px 4px !important;
          background: transparent !important;
          border: 1px solid transparent !important;
          border-radius: 4px !important;
          text-align: left !important;
          cursor: pointer !important;
          white-space: nowrap !important;
          color: #cbd5e1 !important;
          font-size: 11px !important;
          line-height: 1.4 !important;
          font-family: inherit !important;
          height: auto !important;
          min-height: unset !important;
          box-shadow: none !important;
        }
        button.tree-node:hover,
        .tree-node:hover {
          background: #161b22 !important;
          color: #f3f4f6 !important;
        }
        button.tree-node.selected,
        .tree-node.selected {
          background: #34d39914 !important;
          border-color: #34d39950 !important;
          color: #34d399 !important;
          font-weight: 600 !important;
        }
        .tree-guide {
          color: #475569;
          white-space: pre;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .folder-caret {
          font-size: 8px;
          color: #64748b;
          width: 10px;
          display: inline-block;
        }
        .folder-icon {
          font-size: 11px;
        }
        .folder-name {
          color: #93c5fd;
          font-weight: 600;
        }
        .file-badge {
          font-size: 8px;
          font-weight: 700;
          padding: 0 3px;
          border-radius: 2px;
          border: 1px solid;
          line-height: 1.2;
          display: inline-block;
        }
        .file-name {
          color: #e2e8f0;
        }
        .empty-tree {
          color: #64748b;
          padding: 12px;
          text-align: center;
        }
      `}</style>
    </aside>
  );
}
