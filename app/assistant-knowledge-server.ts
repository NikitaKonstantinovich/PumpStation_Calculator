import knowledge from "./assistant-knowledge.json";
import help from "./help-documents.json";
import type { AssistantMessage, AssistantSource } from "./assistant-types";
import type { UserRole } from "./user-types";
import { helpUrl } from "./help-types";

const stopWords = new Set("как что где когда почему можно мне меня это этого этот для или при уже еще быть будет есть работать приложении приложения пожалуйста подскажи расскажи сделать хочу нужно надо через после чтобы какой какие такую такой про".split(" "));
export function assistantSearchWords(text: string) {
  return [...new Set((text.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => word.length > 1 && !stopWords.has(word)).map(word => /[а-я]/.test(word) && word.length > 5 ? word.slice(0, -2) : word))];
}
function matchesWord(word: string, terms: string[]) {
  return terms.some(term => term.startsWith(word) || word.startsWith(term));
}
export function assistantSearchScore(query: string[], terms: string[]) {
  return query.reduce((score, word) => score + Number(matchesWord(word, terms)), 0);
}
const words = assistantSearchWords;
const chunks = knowledge.documents.flatMap(doc => doc.text.split(/\n(?=## )/).flatMap((section, index) => {
  const parts: string[] = [];
  for (let offset = 0; offset < section.length; offset += 1800) parts.push(section.slice(offset, offset + 2100));
  return parts.map(text => ({ doc, text, index, terms: words(`${doc.title} ${text}`), title: words(doc.title) }));
}));

export function retrieveAssistantKnowledge(messages: AssistantMessage[], role: UserRole, profile: "full" | "beta") {
  const query = words(messages.at(-1)?.content ?? "");
  const previous = words(messages.filter(message => message.role === "user").slice(-3, -1).map(message => message.content).join(" "));
  // Apply audience filters before ranking or exposing text to the provider.
  const allowed = chunks.filter(chunk => chunk.doc.roles.includes(role) && chunk.doc.profiles.includes(profile));
  const frequency = (word: string) => allowed.filter(chunk => matchesWord(word, chunk.terms)).length;
  const scores = new Map([...new Set([...query, ...previous])].map(word => [word, Math.log(1 + allowed.length / (1 + frequency(word)))]));
  const ranked = allowed.map(chunk => ({ ...chunk, score: [...new Set([...query, ...previous])].reduce((score, word) => {
    return score + (matchesWord(word, chunk.terms) ? (scores.get(word) ?? 1) * (query.includes(word) ? 3 : .65) * (matchesWord(word, chunk.title) ? 2 : 1) : 0);
  }, 0) })).filter(chunk => chunk.score > 0).sort((a, b) => b.score - a.score);
  const selected = ranked.slice(0, 6);
  const access = allowed.find(chunk => chunk.doc.id === "KB-001" && chunk.index === 1);
  if (access && !selected.some(chunk => chunk.doc.id === access.doc.id && chunk.text === access.text)) selected.push({ ...access, score: 0 });
  const sources: AssistantSource[] = [...new Map(selected.map(chunk => [chunk.doc.id, { id: chunk.doc.id, title: chunk.doc.title, url: helpUrl("documentation", chunk.doc.id) }])).values()];
  return { sources, context: selected.map(chunk => `[${chunk.doc.id}] ${chunk.doc.title}\n${chunk.text}`).join("\n\n---\n\n"), matched: ranked.length > 0 };
}

const administrativeDocs = new Set(["doc-equipment-admin", "doc-user-administration", "doc-item-entry", "doc-component-calculator", "doc-beta-0.1-windows-hosting"]);
const betaReferences = new Set(["doc-ai-assistant", "doc-base-values", "doc-beta-0.1", "doc-equipment-admin", "doc-help-center", "doc-hydraulic-curves", "doc-item-entry", "doc-user-administration", "catalog-readme", "cnp-physical-data"]);
const guidesById = new Map(knowledge.documents.map(doc => [doc.id, doc]));
let references: { doc: typeof help.documents[number]; sections: { text: string; terms: string[] }[]; title: string[] }[] | undefined;

export function searchProgramDocumentation(query: string, document: string, offset: number, role: UserRole, profile: "full" | "beta") {
  const terms = words(query);
  references ??= help.documents.map(doc => ({
    doc, title: words(`${doc.id} ${doc.title}`),
    sections: doc.markdown.split(/\n(?=## )/).flatMap(section => {
      const parts = [];
      for (let start = 0; start < section.length; start += 1500) {
        const text = section.slice(start, start + 1800);
        parts.push({ text, terms: words(text) });
      }
      return parts;
    }),
  }));
  const result = references.flatMap(({ doc, title, sections }) => {
    if (document && doc.id !== document) return [];
    const guide = guidesById.get(doc.id);
    if (guide ? !guide.roles.includes(role) || !guide.profiles.includes(profile) :
      (profile === "beta" && !betaReferences.has(doc.id)) || (role !== "admin" && administrativeDocs.has(doc.id))) return [];
    const titleScore = 3 * assistantSearchScore(terms, title);
    const ranked = sections.map(section => ({ text: section.text, score: titleScore + assistantSearchScore(terms, section.terms) }))
      .sort((a, b) => b.score - a.score);
    return (document ? ranked : ranked.slice(0, 1)).filter(hit => !terms.length || hit.score > 0)
      .map(hit => ({ doc, ...hit, archive: doc.kind === "archive" }));
  }).sort((a, b) => b.score - a.score || Number(a.archive) - Number(b.archive));
  const hits = result.slice(offset, offset + 4);
  return {
    total: result.length,
    nextOffset: offset + 4 < result.length ? offset + 4 : null,
    sources: [...new Map(hits.map(({ doc }) => [doc.id, { id: doc.id, title: doc.title, url: helpUrl("documentation", doc.id) }])).values()],
    items: hits.map(({ doc, text, archive }) => ({ citation: doc.id, title: doc.title, archive, text })),
  };
}

export const assistantInstructions = knowledge.instructions;
export const knowledgeReviewedOn = knowledge.reviewedOn;

export function assistantCitations(text: string, available: AssistantSource[]) {
  const used = new Set<string>();
  const result = text.replace(/\[((?:KB|DATA)-\d{3}|doc-[a-z0-9.-]+|app-readme|catalog-readme|cnp-physical-data)(?:\s*[—–-]\s*[^\]]*)?\](?:\([^)]*\))?/g, (_match, id: string) => {
    const source = available.find(item => item.id === id);
    if (!source) return "";
    used.add(id);
    return source.url ? `[${source.title}](${source.url})` : `**${source.title}**`;
  });
  return { text: result, sources: [...new Map(available.filter(source => used.has(source.id)).map(source => [source.id, source])).values()] };
}
