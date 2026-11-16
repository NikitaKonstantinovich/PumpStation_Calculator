import data from "./help-documents.json";
import type { HelpDocument, HelpIndex } from "./help-types";

const documents: HelpDocument[] = data.documents;
const normalize = (value: string) => value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
const plain = (value: string) => value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`#*_|>]/g, "").replace(/\s+/g, " ").trim();
const indexed = documents.map((doc) => ({ doc, title: normalize(doc.title), text: normalize(plain(doc.markdown)), plain: plain(doc.markdown.replace(/^# .+\n/, "")) }));
const links = Object.fromEntries(documents.map((doc) => [doc.path, doc.id]));

export function helpDocument(id: string) { return documents.find((doc) => doc.id === id) ?? null; }

export function helpIndex(query = ""): HelpIndex {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const found = indexed.map((item, order) => ({ ...item, order, score: words.reduce((score, word) => score + (item.title.includes(word) ? 10 : item.text.includes(word) ? 1 : 0), 0) }))
    .filter((item) => words.every((word) => item.text.includes(word) || item.title.includes(word)))
    .sort((a, b) => words.length ? b.score - a.score || a.order - b.order : a.order - b.order);
  return {
    sections: data.sections,
    documents: found.map(({ doc, plain: text }) => {
      const position = words.length ? normalize(text).indexOf(words[0]) : 0;
      const start = Math.max(0, position - 60);
      return { id: doc.id, path: doc.path, section: doc.section, kind: doc.kind, title: doc.title, excerpt: `${start ? "…" : ""}${text.slice(start, start + 180)}${text.length > start + 180 ? "…" : ""}` };
    }),
    total: documents.length,
    links,
  };
}
