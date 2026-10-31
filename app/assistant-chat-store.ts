import { assistantHistory, validAssistantSource, type AssistantContext, type AssistantMessage, type AssistantReply, type AssistantSource } from "./assistant-types";
type ChatMessage = AssistantMessage & { id: string; sources?: AssistantSource[] };
export type ChatState = { messages: ChatMessage[]; draft: string; pending: boolean; error: string; enabled: boolean | null };
const stores = new Map<string, ReturnType<typeof createChatStore>>();
function createChatStore(userId: string, scope: string) {
  const key = `psc:assistant:v1:${userId}${scope === "general" ? "" : `:${scope}`}`;
  let messages: ChatMessage[] = [];
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (Array.isArray(value)) messages = value.slice(-30).filter(item => item && typeof item.id === "string" && ["user", "assistant"].includes(item.role) && typeof item.content === "string" && item.content.length <= 10000).map(item => ({ id: item.id, role: item.role, content: item.content, sources: Array.isArray(item.sources) ? item.sources.filter(validAssistantSource) : [] }));
  } catch { /* Storage may be unavailable; the chat still works in memory. */ }
  let state: ChatState = { messages, draft: "", pending: false, error: "", enabled: null };
  let controller: AbortController | undefined;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<ChatState>) => {
    state = { ...state, ...patch };
    if (patch.messages) { try { sessionStorage.setItem(key, JSON.stringify(state.messages.slice(-30))); } catch { /* Optional session persistence. */ } }
    listeners.forEach(listener => listener());
  };
  const send = async (question?: string, retry = false, context?: AssistantContext) => {
    if (state.pending) return;
    const content = (question ?? state.draft).trim();
    if (!retry && (!content || content.length > 4000)) return;
    const next = retry ? state.messages : [...state.messages, { id: crypto.randomUUID(), role: "user" as const, content }];
    const request = new AbortController(); controller = request;
    update({ messages: next, draft: "", pending: true, error: "" });
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: assistantHistory(next.map(({ role, content }) => ({ role, content }))), context }), signal: request.signal });
      const result = await response.json() as AssistantReply & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Не удалось получить ответ.");
      if (!result.text || !Array.isArray(result.sources)) throw new Error("Не удалось прочитать ответ.");
      if (!request.signal.aborted) update({ messages: [...next, { id: crypto.randomUUID(), role: "assistant" as const, content: result.text, sources: result.sources.filter(validAssistantSource) }].slice(-30), error: "" });
    } catch (error) {
      if (!request.signal.aborted) update({ error: error instanceof Error ? error.message : "Соединение прервано. Попробуйте ещё раз." });
    } finally { if (controller === request) { controller = undefined; update({ pending: false }); } }
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setDraft: (draft: string) => update({ draft }), send,
    stop: () => { controller?.abort(); controller = undefined; update({ pending: false, error: "Ответ остановлен. Можно повторить вопрос." }); },
    reset: () => { controller?.abort(); controller = undefined; update({ messages: [], draft: "", pending: false, error: "" }); },
    async check() {
      try { const response = await fetch("/api/assistant", { cache: "no-store" }); const result = await response.json(); if (response.ok) update({ enabled: result.enabled === true }); }
      catch { /* Sending a question reports a recoverable connection error. */ }
    },
  };
}
export function assistantChatStore(userId: string, scope = "general") {
  const key = `${userId}:${scope}`;
  if (!stores.has(key)) stores.set(key, createChatStore(userId, scope));
  return stores.get(key)!;
}
