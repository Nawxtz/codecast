"use client";

import { Fragment, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

export interface FixRecommendationCardProps {
  text: string;
  role?: "user" | "assistant";
}

interface Recommendation {
  summary: string;
  fixes: string;
}

const styles: Record<string, CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    width: "100%",
    maxWidth: 800,
    minWidth: 0,
    color: "#F3F4F6",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSize: 14,
    lineHeight: 1.7,
    overflowWrap: "break-word",
    wordBreak: "normal",
  },
  bubble: {
    boxSizing: "border-box",
    minWidth: 0,
    padding: "18px 20px",
    background: "#141820",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: 16,
  },
  userBubble: {
    background: "#1C2433",
    border: "1px solid #2D3748",
  },
  fixCard: {
    minWidth: 0,
    padding: "18px 20px",
    background: "rgba(251, 191, 36, 0.05)",
    border: "1px solid rgba(251, 191, 36, 0.35)",
    borderRadius: 16,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 14,
    marginBottom: 14,
    borderBottom: "1px solid rgba(251, 191, 36, 0.18)",
  },
  title: {
    margin: 0,
    color: "#FBBF24",
    fontSize: 16,
    fontWeight: 650,
    letterSpacing: "-0.025em",
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 9px",
    borderRadius: 999,
    color: "#FBBF24",
    background: "rgba(251, 191, 36, 0.15)",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.075em",
    whiteSpace: "nowrap",
  },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
  },
  paragraph: {
    margin: 0,
    whiteSpace: "pre-wrap",
  },
  inlineCode: {
    padding: "2px 5px",
    borderRadius: 4,
    color: "#E5E7EB",
    background: "rgba(255, 255, 255, 0.08)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.9em",
  },
  locationBadge: {
    display: "inline",
    padding: "2px 7px",
    borderRadius: 5,
    border: "1px solid rgba(251, 191, 36, 0.22)",
    background: "rgba(251, 191, 36, 0.1)",
    color: "#FBBF24",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "0.85em",
    boxDecorationBreak: "clone",
  },
  codeBox: {
    minWidth: 0,
    overflow: "hidden",
    borderRadius: 10,
    border: "1px solid rgba(255, 255, 255, 0.1)",
    background: "#0B0E14",
  },
  codeToolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
    color: "#9CA3AF",
    fontSize: 11,
  },
  copyButton: {
    cursor: "pointer",
    padding: "4px 9px",
    borderRadius: 5,
    border: "1px solid rgba(255, 255, 255, 0.15)",
    background: "#141820",
    color: "#F3F4F6",
    font: "inherit",
  },
  pre: {
    margin: 0,
    padding: 14,
    overflowX: "auto",
    whiteSpace: "pre",
    overflowWrap: "normal",
    tabSize: 2,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    lineHeight: 1.65,
  },
};

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;

    const timeout = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timeout);
  }, [status]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div style={styles.codeBox}>
      <div style={styles.codeToolbar}>
        <span>{language || "code"}</span>
        <button
          type="button"
          style={styles.copyButton}
          onClick={copyCode}
          aria-label="Copy code to clipboard"
        >
          <span role="status" aria-live="polite">
            {status === "copied"
              ? "Copied!"
              : status === "failed"
                ? "Copy failed — retry"
                : "Copy"}
          </span>
        </button>
      </div>
      <pre style={styles.pre} tabIndex={0} aria-label="Code snippet">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string, badges: boolean): ReactNode[] {
  const tokens =
    /(`[^`\n]+`|\*\*[^*\n]+\*\*|\bLines?\s+\d+(?:\s*[-–]\s*\d+)?\s*:?\b:?|\bFile:\s*(?:`[^`\n]+`|[^\s,;]+))/gi;

  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(tokens)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));

    const token = match[0];
    let node: ReactNode = token;

    if (token.startsWith("`")) {
      node = <code style={styles.inlineCode}>{token.slice(1, -1)}</code>;
    } else if (token.startsWith("**")) {
      node = <strong>{renderInline(token.slice(2, -2), badges)}</strong>;
    } else if (badges) {
      node = <span style={styles.locationBadge}>{token.replace(/`/g, "")}</span>;
    }

    nodes.push(<Fragment key={index}>{node}</Fragment>);
    cursor = index + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function MarkdownBody({
  text,
  badges = false,
}: {
  text: string;
  badges?: boolean;
}) {
  const safeText = typeof text === "string" ? text : "";
  const lines = safeText.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (!line.trim()) {
      index++;
      continue;
    }

    const fence = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    const fenceMarker = fence?.[1];

    if (fenceMarker) {
      const start = index++;
      const codeLines: string[] = [];
      const closingFence = new RegExp(
        `^\\s*${fenceMarker.charAt(0)}{${fenceMarker.length},}\\s*$`,
      );

      while (
        index < lines.length &&
        !closingFence.test(lines[index] ?? "")
      ) {
        codeLines.push(lines[index] ?? "");
        index++;
      }
      if (index < lines.length) index++;

      blocks.push(
        <CodeBlock
          key={start}
          code={codeLines.join("\n")}
          language={fence?.[2]?.trim() ?? ""}
        />,
      );
      continue;
    }

    const heading = line.match(/^\s*#{1,6}\s+(.+)$/);
    if (heading) {
      blocks.push(
        <h3 key={index} style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>
          {renderInline(heading[1] ?? "", badges)}
        </h3>,
      );
      index++;
      continue;
    }

    const listItem = line.match(/^\s*([-+*]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      const start = index;
      const marker = listItem[1] ?? "";
      const ordered = /^\d/.test(marker);
      const items: ReactNode[] = [];

      while (index < lines.length) {
        const item = (lines[index] ?? "").match(
          /^\s*([-+*]|\d+[.)])\s+(.+)$/,
        );
        if (!item || /^\d/.test(item[1] ?? "") !== ordered) break;

        items.push(
          <li key={index} style={{ paddingLeft: 3, marginBottom: 5 }}>
            {renderInline(item[2] ?? "", badges)}
          </li>,
        );
        index++;
      }

      const listStyle: CSSProperties = { margin: 0, paddingLeft: 22 };
      blocks.push(
        ordered ? (
          <ol key={start} start={parseInt(marker, 10)} style={listStyle}>
            {items}
          </ol>
        ) : (
          <ul key={start} style={listStyle}>
            {items}
          </ul>
        ),
      );
      continue;
    }

    const start = index;
    const paragraph = [line];
    index++;

    while (index < lines.length) {
      const nextLine = lines[index] ?? "";

      if (
        !nextLine.trim() ||
        /^\s*(?:`{3,}|~{3,}|#{1,6}\s|[-+*]\s|\d+[.)]\s)/.test(nextLine)
      ) {
        break;
      }

      paragraph.push(nextLine);
      index++;
    }

    blocks.push(
      <p key={start} style={styles.paragraph}>
        {renderInline(paragraph.join("\n"), badges)}
      </p>,
    );
  }

  return <div style={styles.body}>{blocks}</div>;
}

function splitRecommendation(text: string): Recommendation | null {
  if (typeof text !== "string" || !text) return null;

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let activeFence: { character: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const fence = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    const fenceMarker = fence?.[1];

    if (activeFence) {
      if (
        fenceMarker &&
        fenceMarker.charAt(0) === activeFence.character &&
        fenceMarker.length >= activeFence.length &&
        !(fence?.[2] ?? "").trim()
      ) {
        activeFence = null;
      }
      continue;
    }

    if (fenceMarker) {
      activeFence = {
        character: fenceMarker.charAt(0),
        length: fenceMarker.length,
      };
      continue;
    }

    // Require an ATX heading or a complete bold banner at the line start.
    const markdownHeading =
      /^[ ]{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line);
    const content = markdownHeading?.[1] ?? line;

    const boldBanner =
      /^[ ]{0,3}(?:⚠\uFE0F?[ \t]*)?(\*\*|__)(?:⚠\uFE0F?[ \t]*)?What Needs to Be Fixed[ \t]*:?[ \t]*\1(?:[ \t]*:[ \t]*(.*)|[ \t]+(.*)|[ \t]*)$/i.exec(
        content,
      );

    const plainHeading = markdownHeading
      ? /^(?:⚠\uFE0F?[ \t]*)?What Needs to Be Fixed(?:[ \t]*:[ \t]*(.*)|[ \t]*)$/i.exec(
          content,
        )
      : null;

    if (!boldBanner && !plainHeading) continue;

    const remainder = boldBanner
      ? (boldBanner[2] ?? boldBanner[3] ?? "")
      : (plainHeading?.[1] ?? "");

    return {
      summary: lines.slice(0, index).join("\n").trim(),
      fixes: [remainder, ...lines.slice(index + 1)].join("\n").trim(),
    };
  }

  return null;
}

export function FixRecommendationCard({
  text,
  role = "assistant",
}: FixRecommendationCardProps) {
  const isUser = role === "user";
  const recommendation =
    role === "assistant" ? splitRecommendation(text) : null;

  return (
    <div
      data-role={role}
      style={{
        ...styles.root,
        maxWidth: isUser ? "80%" : 800,
        alignSelf: isUser ? "flex-end" : "flex-start",
        marginLeft: isUser ? "auto" : undefined,
        marginRight: role === "assistant" ? "auto" : undefined,
      }}
    >
      {recommendation ? (
        <>
          {recommendation.summary && (
            <div style={styles.bubble}>
              <MarkdownBody text={recommendation.summary} />
            </div>
          )}

          <section style={styles.fixCard} aria-label="What Needs to Be Fixed">
            <header style={styles.header}>
              <h2 style={styles.title}>
                <span aria-hidden="true">⚠️ </span>
                What Needs to Be Fixed
              </h2>
              <span style={styles.pill}>ACTION REQUIRED</span>
            </header>
            <MarkdownBody text={recommendation.fixes} badges />
          </section>
        </>
      ) : (
        <div
          style={
            isUser
              ? { ...styles.bubble, ...styles.userBubble }
              : styles.bubble
          }
        >
          <MarkdownBody text={text} />
        </div>
      )}
    </div>
  );
}

export default FixRecommendationCard;