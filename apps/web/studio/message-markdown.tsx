"use client";

import { Fragment, createElement, type ReactNode } from "react";

function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const INLINE_RE =
  /`([^`\n]+)`|!\[([^\]]*)\]\(([^()\s]*(?:\([^()]*\)[^()\s]*)*)\)|\[([^\]]+)\]\(([^()\s]*(?:\([^()]*\)[^()\s]*)*)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;

function renderInline(text: string, depth = 0): ReactNode[] {
  if (depth > 4) return [text];
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const [full, code, imgAlt, , linkLabel, linkUrl, bold, italic] = match;
    if (code !== undefined) {
      nodes.push(createElement("code", { key: key++ }, code));
    } else if (imgAlt !== undefined) {
      nodes.push(createElement("span", { key: key++ }, imgAlt));
    } else if (linkLabel !== undefined && linkUrl !== undefined) {
      const href = safeHref(linkUrl);
      const children = renderInline(linkLabel, depth + 1);
      nodes.push(
        href
          ? createElement("a", { key: key++, href, target: "_blank", rel: "noopener noreferrer" }, ...children)
          : createElement(Fragment, { key: key++ }, ...children),
      );
    } else if (bold !== undefined) {
      nodes.push(createElement("strong", { key: key++ }, ...renderInline(bold, depth + 1)));
    } else if (italic !== undefined) {
      nodes.push(createElement("em", { key: key++ }, ...renderInline(italic, depth + 1)));
    } else {
      nodes.push(full);
    }
    last = index + full.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

/** Assistant text is Markdown without raw HTML; links open safely and images become their alt text. */
export default function MessageMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(createElement("pre", { key: key++ }, createElement("code", null, codeLines.join("\n"))));
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const tag = HEADING_TAGS[Math.min(heading[1].length, 6) - 1];
      blocks.push(createElement(tag, { key: key++ }, ...renderInline(heading[2].trim())));
      i++;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(createElement("li", { key: items.length }, ...renderInline(lines[i].replace(/^\s*[-*+]\s+/, ""))));
        i++;
      }
      blocks.push(createElement("ul", { key: key++ }, ...items));
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(createElement("li", { key: items.length }, ...renderInline(lines[i].replace(/^\s*\d+\.\s+/, ""))));
        i++;
      }
      blocks.push(createElement("ol", { key: key++ }, ...items));
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      createElement(
        "p",
        { key: key++ },
        ...para.map((part, idx) =>
          createElement(Fragment, { key: idx }, idx > 0 ? createElement("br") : null, ...renderInline(part)),
        ),
      ),
    );
  }
  return createElement(Fragment, null, ...blocks);
}
