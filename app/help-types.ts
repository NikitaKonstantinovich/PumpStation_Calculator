export type HelpSection = { id: string; title: string; description: string };
export type HelpDocument = { id: string; path: string; section: string; kind: string; title: string; markdown: string; sha256: string };
export type HelpSummary = Omit<HelpDocument, "markdown" | "sha256"> & { excerpt: string };
export type HelpIndex = { sections: HelpSection[]; documents: HelpSummary[]; total: number; links: Record<string, string> };
export type HelpLocation = { tab: "documentation" | "support"; documentId: string | null; anchor: string };

export function helpLocation(search: string, hash = ""): HelpLocation {
  const params = new URLSearchParams(search);
  let anchor = "";
  try { anchor = decodeURIComponent(hash.replace(/^#/, "")); } catch { /* Ignore malformed external fragment. */ }
  return { tab: params.get("tab") === "support" ? "support" : "documentation", documentId: params.get("doc"), anchor };
}

export function helpUrl(tab: HelpLocation["tab"], documentId?: string | null, anchor = "") {
  const params = new URLSearchParams({ view: "help", tab });
  if (tab === "documentation" && documentId) params.set("doc", documentId);
  return `/?${params}${anchor ? `#${encodeURIComponent(anchor)}` : ""}`;
}

export function headingAnchor(text: string) {
  return text.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s/g, "-");
}

export function resolveHelpLink(href: string, documentPath: string, links: Record<string, string>): string | null {
  if (/^https?:\/\//i.test(href)) return href;
  if (/^mailto:[^\s]+$/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return null;
  const [rawPath, rawAnchor = ""] = href.split("#");
  let path: string, anchor: string;
  try {
    path = decodeURIComponent(rawPath);
    anchor = decodeURIComponent(rawAnchor);
  } catch { return null; }
  if (!path) return links[documentPath] ? helpUrl("documentation", links[documentPath], anchor) : null;
  const parts = documentPath.split("/").slice(0, -1);
  for (const part of path.split("/")) {
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  const id = links[parts.join("/")];
  return id ? helpUrl("documentation", id, anchor) : null;
}
