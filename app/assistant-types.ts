export const PUMPIK_GREETING = "Привет, я - Pump-ик! Есть вопросы по работе приложения? Готов ответить ;)";
export const ASSISTANT_MESSAGE_LIMIT = 4000;
export type AssistantMessage = { role: "user" | "assistant"; content: string };
export type AssistantSource = { id: string; title: string; url: string; kind?: "document" | "data" };
export type AssistantReply = { text: string; sources: AssistantSource[] };
export type AssistantContext = { projectId?: string; beta?: { input: unknown; versions: unknown } };

export function validAssistantSource(source: AssistantSource) {
  return source && typeof source.title === "string" && source.title.length <= 300 &&
    ((/^KB-\d{3}$/.test(source.id) && source.url === `/?view=help&tab=documentation&doc=${source.id}`) ||
     (/^DATA-\d{3}$/.test(source.id) && source.kind === "data" && source.url === ""));
}

export function assistantHistory(messages: AssistantMessage[]): AssistantMessage[] {
  const result: AssistantMessage[] = [];
  let length = 0;
  for (const message of messages.slice(-12).reverse()) {
    if (length + message.content.length > 18000) break;
    result.unshift(message); length += message.content.length;
  }
  while (result[0]?.role === "assistant") result.shift();
  return result;
}
