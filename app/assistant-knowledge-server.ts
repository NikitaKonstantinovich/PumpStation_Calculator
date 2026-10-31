import knowledge from "./assistant-knowledge.json";
import type { AssistantMessage, AssistantSource } from "./assistant-types";
import type { UserRole } from "./user-types";
import { helpUrl } from "./help-types";

const stopWords = new Set("как что где когда почему можно мне меня это этого этот для или при уже еще быть будет есть работать приложении приложения пожалуйста подскажи расскажи сделать хочу нужно надо через после чтобы какой какие такую такой про".split(" "));
function words(text: string) {
  return [...new Set((text.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").match(/[\p{L}\p{N}]+/gu) ?? []).filter(word => word.length > 1 && !stopWords.has(word)).map(word => /[а-я]/.test(word) && word.length > 5 ? word.slice(0, -2) : word))];
}
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
  const frequency = (word: string) => allowed.filter(chunk => chunk.terms.some(term => term.startsWith(word) || word.startsWith(term))).length;
  const scores = new Map([...new Set([...query, ...previous])].map(word => [word, Math.log(1 + allowed.length / (1 + frequency(word)))]));
  const ranked = allowed.map(chunk => ({ ...chunk, score: [...new Set([...query, ...previous])].reduce((score, word) => {
    const matches = (terms: string[]) => terms.some(term => term.startsWith(word) || word.startsWith(term));
    return score + (matches(chunk.terms) ? (scores.get(word) ?? 1) * (query.includes(word) ? 3 : .65) * (matches(chunk.title) ? 2 : 1) : 0);
  }, 0) })).filter(chunk => chunk.score > 0).sort((a, b) => b.score - a.score);
  const selected = ranked.slice(0, 6);
  const access = allowed.find(chunk => chunk.doc.id === "KB-001" && chunk.index === 1);
  if (access && !selected.some(chunk => chunk.doc.id === access.doc.id && chunk.text === access.text)) selected.push({ ...access, score: 0 });
  const sources: AssistantSource[] = [...new Map(selected.map(chunk => [chunk.doc.id, { id: chunk.doc.id, title: chunk.doc.title, url: helpUrl("documentation", chunk.doc.id) }])).values()];
  return { sources, context: selected.map(chunk => `[${chunk.doc.id}] ${chunk.doc.title}\n${chunk.text}`).join("\n\n---\n\n"), matched: ranked.length > 0 };
}

export const assistantInstructions = knowledge.instructions;
export const knowledgeReviewedOn = knowledge.reviewedOn;

export function assistantCitations(text: string, available: AssistantSource[]) {
  const used = new Set<string>();
  const result = text.replace(/\[((?:KB|DATA)-\d{3})(?:\s*[—–-]\s*[^\]]*)?\](?:\([^)]*\))?/g, (_match, id: string) => {
    const source = available.find(item => item.id === id);
    if (!source) return "";
    used.add(id);
    return source.url ? `[${source.title}](${source.url})` : `**${source.title}**`;
  });
  return { text: result, sources: available.filter(source => used.has(source.id)) };
}
