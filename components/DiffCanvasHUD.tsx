"use client";

import React, { useState, useEffect, useRef } from "react";
import { useCastStore } from "@/lib/stores/useCastStore";
import { useVoiceSession } from "@/lib/voice/useVoiceSession";
import type { PrDiffFile } from "@/lib/types";
import VoiceOrb from "./VoiceOrb";
import FixRecommendationCard from "./FixRecommendationCard";
import DiffViewer from "./DiffViewer";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? "";
  } catch {
    return "[Unable to display data]";
  }
}

function extractDiffFiles(value: unknown, depth = 0): PrDiffFile[] | null {
  if (depth > 6) return null;

  if (typeof value === "string") {
    try {
      return extractDiffFiles(JSON.parse(value), depth + 1);
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    const containsFiles = value.every((item) => {
      const file = asRecord(item);
      return (
        typeof file.filename === "string" ||
        typeof file.path === "string" ||
        typeof file.filePath === "string"
      );
    });

    if (containsFiles) return value as PrDiffFile[];

    for (const item of value) {
      const block = asRecord(item);
      if (block.type === "text") {
        const files = extractDiffFiles(block.text, depth + 1);
        if (files !== null) return files;
      }
    }

    return null;
  }

  const record = asRecord(value);
  for (const key of ["files", "diffFiles", "result", "data", "output", "content"]) {
    if (record[key] !== undefined) {
      const files = extractDiffFiles(record[key], depth + 1);
      if (files !== null) return files;
    }
  }

  return null;
}

function toolName(tool: UnknownRecord): string {
  return asText(tool.name ?? tool.tool ?? tool.toolName) || "Unknown tool";
}

function formatTimestamp(value: unknown): string {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    !(value instanceof Date)
  ) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
}

function safeCommentUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export default function DiffCanvasHUD() {
  const voice = useVoiceSession();
  const store = useCastStore();

  const [diffFiles, setDiffFiles] = useState<PrDiffFile[]>([]);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [prInput, setPrInput] = useState(String(store.activePrNumber || 1));
  const [message, setMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"transcript" | "audit">("transcript");

  const initialPr = useRef(store.activePrNumber || 1);
  const diffFilesRef = useRef<PrDiffFile[]>([]);
  const requestRef = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const lastSyncedTool = useRef("");
  const transcriptEnd = useRef<HTMLDivElement | null>(null);
  const transcriptPanelRef = useRef<HTMLDivElement | null>(null);
  const sendingRef = useRef(false);
  const transcriptTabId = React.useId();
  const auditTabId = React.useId();
  const transcriptPanelId = React.useId();
  const auditPanelId = React.useId();

  const loadDiff = React.useCallback(async (pullNumber: number) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    const version = ++requestVersion.current;
    requestRef.current = controller;

    setLoadingDiff(true);
    setDiffError(null);

    try {
      const response = await fetch("/api/tools/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: "get_pr_diff",
          args: {
            owner: "Nawxtz",
            repo: "codecast-demo",
            pull_number: pullNumber,
          },
        }),
        signal: controller.signal,
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        const result = asRecord(payload);
        throw new Error(
          asText(asRecord(result.error).message) ||
            asText(result.error ?? result.message) ||
            `Unable to load diff (${response.status}).`,
        );
      }

      const files = extractDiffFiles(payload);
      if (files === null) {
        throw new Error("The tool response did not contain valid diff files.");
      }

      if (controller.signal.aborted || version !== requestVersion.current) return;

      diffFilesRef.current = files;
      setDiffFiles(files);
    } catch (error: unknown) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setDiffError(
        error instanceof Error ? error.message : "Unable to load the PR diff.",
      );
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) {
        requestRef.current = null;
        setLoadingDiff(false);
      }
    }
  }, []);

  useEffect(() => {
    for (let index = store.toolCalls.length - 1; index >= 0; index -= 1) {
      const tool = asRecord(store.toolCalls[index]);
      if (toolName(tool) !== "get_pr_diff" || tool.status !== "success") continue;

      const signature = serialize(tool);
      if (signature === lastSyncedTool.current) return;

      const files = extractDiffFiles(tool.result ?? tool.output ?? tool.response);
      if (files === null) continue;

      lastSyncedTool.current = signature;
      requestRef.current?.abort();
      requestRef.current = null;
      requestVersion.current += 1;

      diffFilesRef.current = files;
      setDiffFiles(files);
      setLoadingDiff(false);
      setDiffError(null);
      return;
    }
  }, [store.toolCalls]);

  useEffect(() => {
    if (diffFilesRef.current.length === 0) {
      void loadDiff(initialPr.current);
    }

    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
      requestVersion.current += 1;
    };
  }, [loadDiff]);

  useEffect(() => {
    setPrInput(String(store.activePrNumber || 1));
  }, [store.activePrNumber]);

  useEffect(() => {
    if (activeTab !== "transcript") return;

    const scope: ParentNode = transcriptPanelRef.current ?? document;
    const fixCards = scope.querySelectorAll<HTMLElement>(
      '[aria-label="What Needs to Be Fixed"], .fix-card',
    );

    if (fixCards.length > 0) {
      const latest = fixCards[fixCards.length - 1];
      latest.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }

    transcriptEnd.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [store.transcript, activeTab]);

  function handleLoadDiff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = prInput.trim();
    const pullNumber = Number(value);

    if (!/^\d+$/.test(value) || !Number.isSafeInteger(pullNumber) || pullNumber < 1) {
      setDiffError("Enter a valid positive PR number.");
      return;
    }

    store.setActivePr(pullNumber);
    diffFilesRef.current = [];
    setDiffFiles([]);
    void loadDiff(pullNumber);
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || sendingRef.current) return;

    sendingRef.current = true;
    setSendingMessage(true);
    setMessageError(null);
    setMessage("");

    try {
      await voice.sendTextMessage(text);
    } catch (error: unknown) {
      setMessage(text);
      setMessageError(
        error instanceof Error ? error.message : "Unable to send your message.",
      );
    } finally {
      sendingRef.current = false;
      setSendingMessage(false);
    }
  }

  const connectionValue =
    typeof store.connection === "string"
      ? store.connection
      : asText(asRecord(store.connection).status);

  const connectionStatus = connectionValue.toLowerCase();
  const connectionLabel =
    connectionStatus === "connected"
      ? "Connected"
      : connectionStatus === "connecting"
        ? "Connecting"
        : connectionStatus === "error"
          ? "Error"
          : "Idle";

  const voiceState = voice.isSpeaking
    ? "speaking"
    : voice.isListening
      ? "listening"
      : "idle";

  const selectedVoiceExists = voice.availableVoices.some(
    (availableVoice) => availableVoice.voiceURI === voice.selectedVoiceURI,
  );

  const testButtonDisabled = !voice.isSupported || voice.isSpeaking;

  return (
    <main className="hud">
      <header className="hud-header">
        <div className="brand-group">
          <span className="brand">Code<span>Cast</span></span>
          <span className="badge pr-badge">#{store.activePrNumber || 1}</span>
        </div>

        <div className="header-controls">
          <form className="pr-form" onSubmit={handleLoadDiff}>
            <label className="sr-only" htmlFor="codecast-pr">PR number</label>
            <span className="muted" aria-hidden="true">PR #</span>
            <input
              id="codecast-pr"
              type="number"
              min={1}
              step={1}
              value={prInput}
              onChange={(event) => setPrInput(event.target.value)}
              required
            />
            <button type="submit" className="primary" disabled={loadingDiff}>
              {loadingDiff ? "Loading…" : "Load Diff"}
            </button>
          </form>

          <label className="sr-only" htmlFor="codecast-language">Language</label>
          <select
            id="codecast-language"
            value={voice.language}
            onChange={(event) => voice.setLanguage(event.target.value)}
            aria-label="Language"
          >
            <option value="en-US">English 🇺🇸</option>
            <option value="th-TH">ภาษาไทย (Thai) 🇹🇭</option>
            <option value="ja-JP">日本語 (Japanese) 🇯🇵</option>
            <option value="es-ES">Español (Spanish) 🇪🇸</option>
          </select>

          <label className="sr-only" htmlFor="codecast-voice">Voice sound</label>
          <select
            id="codecast-voice"
            className="voice-select"
            value={voice.selectedVoiceURI || ""}
            onChange={(event) => voice.setSelectedVoiceURI(event.target.value)}
            disabled={voice.availableVoices.length === 0}
          >
            {voice.availableVoices.length === 0 ? (
              <option value="">System Default</option>
            ) : (
              <option value="">Default voice</option>
            )}
            {voice.selectedVoiceURI && !selectedVoiceExists && (
              <option value={voice.selectedVoiceURI}>Selected voice (unavailable)</option>
            )}
            {voice.availableVoices.map((availableVoice) => (
              <option key={availableVoice.voiceURI} value={availableVoice.voiceURI}>
                {availableVoice.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => voice.previewVoice()}
            disabled={testButtonDisabled}
            aria-label="Preview selected voice"
          >
            🔊 Test
          </button>
        </div>

        <div className="header-status">
          <span
            className={`badge connection ${connectionLabel.toLowerCase()}`}
            role="status"
          >
            <span className="status-dot" aria-hidden="true" />
            {connectionLabel}
          </span>
          <span className={`badge ptt-badge ${voice.isPttActive ? "active" : ""}`}>
            🎙️ {voice.isPttActive ? "Mic Active · Release Space" : "Hold Space to Talk"}
          </span>
        </div>
      </header>

      <div className="workspace">
        <aside className="panel controls-panel" aria-label="Voice and review controls">
          <h2 className="eyebrow">Voice Review</h2>

          <div className="orb-container">
            <VoiceOrb
              state={voiceState}
              isPttActive={voice.isPttActive}
              onClick={voice.toggleSession}
            />
            <p className={`voice-status ${voiceState}`} role="status">
              {voice.isSpeaking
                ? "Assistant is speaking"
                : voice.isListening
                  ? "Listening to you"
                  : "Ready when you are"}
            </p>
            <p className="muted hint">Click the orb to start or stop your session.</p>
          </div>

          {!voice.isSupported && (
            <p className="notice">
              Voice input is not supported in this browser. You can still type a query.
            </p>
          )}

          <div className={`ptt-banner ${voice.isPttActive ? "active" : ""}`}>
            <span>🎙️ Hold Space to Talk</span>
            <kbd>Space</kbd>
          </div>
          <p className="muted hint shortcut-hint">
            Use the shortcut outside text fields. Release to finish speaking.
          </p>

          <form className="message-form" onSubmit={handleSendMessage}>
            <label htmlFor="codecast-message">Ask about this review</label>
            <textarea
              id="codecast-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (message.trim() && !sendingMessage) {
                    const form = e.currentTarget.form;
                    if (form && typeof form.requestSubmit === "function") {
                      form.requestSubmit();
                    } else {
                      void handleSendMessage(e as unknown as React.FormEvent<HTMLFormElement>);
                    }
                  }
                }
              }}
              placeholder="Explain this change, find a bug, or suggest a fix…"
              rows={5}
            />
            <p className="muted hint send-hint">Press Enter to send, Shift+Enter for newline</p>
            <button
              type="submit"
              className="primary"
              disabled={!message.trim() || sendingMessage}
            >
              {sendingMessage ? "Sending…" : "Send"}
            </button>
            {messageError && <p className="error-message" role="alert">{messageError}</p>}
          </form>

          <details className="comments-drawer" open>
            <summary>
              Posted Comments
              <span className="count">{store.postedComments.length}</span>
            </summary>
            {store.postedComments.length === 0 ? (
              <p className="empty-state">Comments posted during this review appear here.</p>
            ) : (
              <ul className="comment-list">
                {store.postedComments.map((comment, index) => {
                  const item = asRecord(comment);
                  const body =
                    typeof comment === "string"
                      ? comment
                      : asText(item.body ?? item.text ?? item.content);
                  const path = asText(item.path ?? item.file ?? item.filename);
                  const line = asText(item.line);
                  const url = safeCommentUrl(item.html_url ?? item.url);

                  return (
                    <li key={asText(item.id) || `comment-${index}`} className="comment">
                      {path && (
                        <div className="comment-location">
                          {path}{line ? `:${line}` : ""}
                        </div>
                      )}
                      <p>{body || "Comment posted."}</p>
                      {url && (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          View comment ↗
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </details>
        </aside>

        <section className="panel diff-panel" aria-label="Pull request diff canvas">
          {diffError && (
            <div className="diff-error error-message" role="alert">
              {diffError}
            </div>
          )}
          <div className="diff-content" aria-busy={loadingDiff}>
            <DiffViewer
              files={diffFiles}
              activeFile={store.activeFile}
              onSelectFile={(file) => store.setActiveLocation(file, store.activeLine)}
              activeLine={store.activeLine}
              onSelectLine={(line) => store.setActiveLocation(store.activeFile, line)}
              isLoading={loadingDiff}
            />
          </div>
        </section>

        <aside className="panel intelligence-panel" aria-label="Review intelligence">
          <div className="tabs" role="tablist" aria-label="Review activity">
            <button
              type="button"
              id={transcriptTabId}
              role="tab"
              aria-selected={activeTab === "transcript"}
              aria-controls={transcriptPanelId}
              tabIndex={activeTab === "transcript" ? 0 : -1}
              className={activeTab === "transcript" ? "selected" : ""}
              onClick={() => setActiveTab("transcript")}
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight", "End"].includes(event.key)) {
                  event.preventDefault();
                  setActiveTab("audit");
                  document.getElementById(auditTabId)?.focus();
                }
              }}
            >
              Transcript <span className="count">{store.transcript.length}</span>
            </button>
            <button
              type="button"
              id={auditTabId}
              role="tab"
              aria-selected={activeTab === "audit"}
              aria-controls={auditPanelId}
              tabIndex={activeTab === "audit" ? 0 : -1}
              className={activeTab === "audit" ? "selected" : ""}
              onClick={() => setActiveTab("audit")}
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) {
                  event.preventDefault();
                  setActiveTab("transcript");
                  document.getElementById(transcriptTabId)?.focus();
                }
              }}
            >
              Audit Log <span className="count">{store.toolCalls.length}</span>
            </button>
          </div>

          <div
            id={transcriptPanelId}
            ref={transcriptPanelRef}
            role="tabpanel"
            aria-labelledby={transcriptTabId}
            hidden={activeTab !== "transcript"}
            className="activity-scroll"
            tabIndex={0}
          >
            <div className="transcript-list" role="log" aria-live="polite">
              {store.transcript.length === 0 && (
                <p className="empty-state">
                  Start a voice session or send a message to begin your review.
                </p>
              )}
              {store.transcript.map((msg, index) => (
                <FixRecommendationCard
                  key={asText(asRecord(msg).id) || `message-${index}`}
                  text={msg.text}
                  role={msg.role}
                />
              ))}
              <div ref={transcriptEnd} />
            </div>
          </div>

          <div
            id={auditPanelId}
            role="tabpanel"
            aria-labelledby={auditTabId}
            hidden={activeTab !== "audit"}
            className="activity-scroll"
            tabIndex={0}
          >
            {store.toolCalls.length === 0 ? (
              <p className="empty-state">Tool activity will appear here as the review progresses.</p>
            ) : (
              <ol className="audit-list">
                {store.toolCalls.map((call, index) => {
                  const tool = asRecord(call);
                  const status = asText(tool.status) || "pending";
                  const statusClass =
                    status === "success"
                      ? "success"
                      : status === "rejected" || status === "error"
                        ? "rejected"
                        : "pending";

                  return (
                    <li key={asText(tool.id) || `tool-${index}`} className="audit-item">
                      <div className="audit-item-header">
                        <code>{toolName(tool)}</code>
                        <span className={`badge tool-status ${statusClass}`}>{status}</span>
                      </div>
                      <span className="timestamp">
                        {formatTimestamp(tool.timestamp ?? tool.createdAt ?? tool.startedAt)}
                      </span>
                      <pre aria-label="Tool arguments">
                        {serialize(tool.args ?? tool.arguments ?? tool.input ?? {})}
                      </pre>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </aside>
      </div>

      <style jsx>{`
        .hud {
          color: #f3f4f6;
          background: #090b0f;
          min-height: 100vh;
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          font-size: 13px;
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
        }
        .hud *, .hud *::before, .hud *::after { box-sizing: border-box; }
        .hud-header {
          min-height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 10px 20px;
          background: #10141b;
          border-bottom: 1px solid #1e2633;
        }
        .brand-group, .header-controls, .header-status, .pr-form {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .brand-group, .header-status { flex-shrink: 0; }
        .header-controls { flex-wrap: wrap; justify-content: center; }
        .brand { font-size: 21px; font-weight: 800; letter-spacing: -0.8px; }
        .brand > span { color: #34d399; }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 8px;
          border: 1px solid #1e2633;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
        }
        .pr-badge { color: #67e8f9; background: #67e8f90d; }
        .connection { color: #94a3b8; }
        .connected, .success { color: #34d399; }
        .connecting, .pending { color: #fbbf24; }
        .error, .rejected { color: #fca5a5; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .ptt-badge { color: #94a3b8; }
        .ptt-badge.active, .ptt-banner.active {
          color: #34d399;
          border-color: #34d399;
          background: #34d39914;
        }
        button, input, select, textarea {
          font: inherit;
          color: #f3f4f6;
          border: 1px solid #1e2633;
          border-radius: 6px;
          background: #090b0f;
        }
        button { padding: 8px 11px; cursor: pointer; white-space: nowrap; }
        button:hover:not(:disabled) { border-color: #67e8f9; background: #17212c; }
        button:disabled { cursor: not-allowed; opacity: 0.45; }
        button:focus-visible, input:focus-visible, select:focus-visible,
        textarea:focus-visible, summary:focus-visible, a:focus-visible,
        [role="tabpanel"]:focus-visible {
          outline: 2px solid #67e8f9;
          outline-offset: 3px;
        }
        input, select { height: 34px; padding: 0 8px; }
        input[type="number"] { width: 66px; }
        select { max-width: 180px; }
        .voice-select { width: 150px; }
        button.primary { color: #090b0f; background: #34d399; border-color: #34d399; font-weight: 700; }
        button.primary:hover:not(:disabled) { background: #6ee7b7; border-color: #6ee7b7; }
        .workspace {
          display: grid;
          grid-template-columns: 320px 1fr 380px;
          gap: 16px;
          height: calc(100vh - 64px);
          padding: 16px;
          background: #090b0f;
        }
        .panel { min-width: 0; min-height: 0; background: #10141b; border: 1px solid #1e2633; border-radius: 8px; }
        .controls-panel { padding: 20px; overflow-y: auto; }
        .diff-panel, .intelligence-panel { display: flex; flex-direction: column; overflow: hidden; }
        .diff-content { flex: 1; min-height: 0; min-width: 0; overflow: auto; }
        .eyebrow { margin: 0 0 20px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; }
        .orb-container { display: flex; flex-direction: column; align-items: center; padding: 8px 0 20px; text-align: center; }
        .voice-status { margin: 18px 0 6px; font-weight: 600; }
        .voice-status.speaking { color: #67e8f9; }
        .voice-status.listening { color: #34d399; }
        .muted, .timestamp { color: #94a3b8; }
        .hint { margin: 0; font-size: 12px; line-height: 1.6; }
        .send-hint { margin: -2px 0 0; font-size: 11px; color: #738196; }
        .ptt-banner { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; border: 1px solid #1e2633; border-radius: 6px; }
        kbd { padding: 3px 5px; border: 1px solid #334155; border-bottom-width: 2px; border-radius: 4px; font-size: 10px; }
        .shortcut-hint { margin: 8px 0 22px; }
        .message-form { display: flex; flex-direction: column; gap: 10px; }
        .message-form label { font-weight: 600; }
        textarea { width: 100%; min-height: 112px; padding: 12px; resize: vertical; line-height: 1.6; }
        textarea::placeholder { color: #738196; }
        .notice { color: #fbbf24; background: #fbbf240d; padding: 12px; border-radius: 6px; line-height: 1.6; }
        .error-message { color: #fca5a5; font-size: 12px; line-height: 1.6; overflow-wrap: break-word; }
        .diff-error { padding: 12px 16px; background: #f871710d; border-bottom: 1px solid #1e2633; }
        .comments-drawer { margin-top: 28px; border-top: 1px solid #1e2633; padding-top: 18px; }
        summary { cursor: pointer; font-weight: 600; }
        summary .count { margin-left: 8px; }
        .count { color: #94a3b8; background: #1e2633; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; }
        .comment-list, .audit-list { list-style: none; padding: 0; margin: 14px 0 0; }
        .comment { padding: 12px; margin-bottom: 10px; background: #090b0f; border: 1px solid #1e2633; border-radius: 6px; }
        .comment p { margin: 6px 0; white-space: pre-wrap; overflow-wrap: break-word; line-height: 1.6; }
        .comment-location { color: #67e8f9; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; overflow-wrap: break-word; }
        a { color: #34d399; text-decoration: none; font-size: 12px; }
        a:hover { text-decoration: underline; }
        .tabs { display: flex; flex-shrink: 0; border-bottom: 1px solid #1e2633; padding: 0 8px; }
        .tabs button {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 14px;
          border: 0;
          border-bottom: 2px solid transparent;
          border-radius: 0;
          background: transparent;
          color: #94a3b8;
          font-weight: 500;
          letter-spacing: -0.1px;
          transition: color 120ms ease, border-color 120ms ease;
        }
        .tabs button:hover:not(.selected) { color: #e2e8f0; background: transparent; }
        .tabs button.selected { color: #67e8f9; border-bottom-color: #67e8f9; }
        .activity-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; overscroll-behavior: contain; scroll-behavior: smooth; }
        .activity-scroll[hidden] { display: none; }
        .transcript-list { display: flex; flex-direction: column; gap: 12px; }
        .empty-state { margin: 16px 0; color: #94a3b8; line-height: 1.7; font-size: 12px; }
        .audit-list { margin: 0; display: flex; flex-direction: column; gap: 12px; }
        .audit-item { padding: 12px; border: 1px solid #1e2633; border-radius: 6px; background: #090b0f; }
        .audit-item-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .audit-item-header code {
          color: #67e8f9;
          font-size: 12px;
          font-weight: 500;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          overflow-wrap: break-word;
        }
        .tool-status { padding: 3px 6px; font-size: 10px; }
        .timestamp { display: block; margin-top: 8px; font-size: 10px; }
        pre {
          margin: 10px 0 0;
          padding: 10px 12px;
          max-height: 180px;
          overflow: auto;
          border-radius: 4px;
          background: #10141b;
          border: 1px solid #1a212b;
          color: #cbd5e1;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          line-height: 1.6;
          white-space: pre-wrap;
          overflow-wrap: break-word;
          tab-size: 2;
        }
        pre::-webkit-scrollbar, .activity-scroll::-webkit-scrollbar, .controls-panel::-webkit-scrollbar, .diff-content::-webkit-scrollbar { width: 10px; height: 10px; }
        pre::-webkit-scrollbar-thumb, .activity-scroll::-webkit-scrollbar-thumb, .controls-panel::-webkit-scrollbar-thumb, .diff-content::-webkit-scrollbar-thumb { background: #1e2633; border-radius: 6px; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
        @media (max-width: 1400px) {
          .hud-header { flex-wrap: wrap; }
          .workspace { height: calc(100vh - 112px); grid-template-columns: 280px minmax(0, 1fr) 320px; }
        }
        @media (max-width: 1050px) {
          .workspace { height: auto; min-height: calc(100vh - 112px); grid-template-columns: 280px minmax(0, 1fr); }
          .diff-panel { min-height: 620px; }
          .intelligence-panel { grid-column: 1 / -1; height: 440px; }
          .header-controls { order: 3; width: 100%; justify-content: flex-start; }
        }
        @media (max-width: 680px) {
          .hud-header { padding: 12px; }
          .header-status { flex-wrap: wrap; }
          .workspace { grid-template-columns: minmax(0, 1fr); padding: 12px; gap: 12px; }
          .controls-panel { max-height: none; }
          .diff-panel { height: 65vh; min-height: 400px; }
          .intelligence-panel { grid-column: auto; height: 480px; }
          .voice-select { width: 140px; }
        }
      `}</style>
    </main>
  );
}