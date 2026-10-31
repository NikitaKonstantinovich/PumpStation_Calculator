"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";
import Markdown from "react-markdown";
import { assistantChatStore } from "./assistant-chat-store";
import { ASSISTANT_MESSAGE_LIMIT, PUMPIK_GREETING, type AssistantContext } from "./assistant-types";
import "./ai-assistant.css";

export function PumpikAvatar() {
  return <svg className="pumpik-avatar" viewBox="0 0 64 64" role="img" aria-label="Pump-ик — насосик">
    <rect x="1" y="1" width="62" height="62" rx="19" fill="var(--pumpik-avatar-bg,#e6f2fc)"/>
    <path d="M42 31V17h10v14M39 14h16v5H39" fill="#4da1dc" stroke="#18517c" strokeWidth="2.3" strokeLinejoin="round"/>
    <rect x="30" y="27" width="25" height="20" rx="6" fill="#398bc6" stroke="#18517c" strokeWidth="2.3"/>
    <path d="M40 32v10m5-10v10m5-10v10M15 49l-2 5h38l-2-5" stroke="#18517c" strokeWidth="2.5" strokeLinecap="round" fill="#6daed9"/>
    <circle cx="25" cy="37" r="16" fill="#62b6ec" stroke="#18517c" strokeWidth="2.5"/>
    <path d="M9 33H5v9h5" fill="#84c9f3" stroke="#18517c" strokeWidth="2.3" strokeLinejoin="round"/>
    <ellipse cx="20" cy="35" rx="2.3" ry="3.1" fill="#153c5a"/><ellipse cx="30" cy="35" rx="2.3" ry="3.1" fill="#153c5a"/>
    <path d="M21 42q4 4 8 0" fill="none" stroke="#153c5a" strokeWidth="2.3" strokeLinecap="round"/>
    <path d="M17 27q4-3 8-3" fill="none" stroke="#c7e9ff" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>;
}
const starters = ["С чего начать работу?", "Почему насос не подбирается?", "Как проверить спецификацию?"];
export function AIAssistant({ userId, context }: { userId: string; context?: AssistantContext }) {
  const store = assistantChatStore(userId, context?.projectId ?? (context?.beta ? "beta" : "general"));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const transcript = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { void store.check(); }, [store]);
  useEffect(() => { const node = transcript.current; if (node) node.scrollTop = node.scrollHeight; }, [state.messages, state.pending, state.error]);
  const send = () => { void store.send(undefined, false, context); input.current?.focus(); };
  return <section className="assistant-chat" aria-label="Чат с Pump-иком">
    <header className="assistant-chat__header"><PumpikAvatar/><div><b>Pump-ик</b><span>Документация · базовые значения · каталоги</span></div><button className="assistant-chat__reset" type="button" onClick={() => { store.reset(); input.current?.focus(); }} title="Начать новый диалог" aria-label="Новый диалог"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1.6 7M4 4v6h6" strokeLinecap="round" strokeLinejoin="round"/></svg></button></header>
    <div className="assistant-chat__messages" ref={transcript} role="log" aria-label="Сообщения" aria-live="polite" aria-relevant="additions text">
      <div className="assistant-message assistant-message--bot"><PumpikAvatar/><div className="assistant-message__bubble"><p>{PUMPIK_GREETING}</p></div></div>
      {!state.messages.length && <div className="assistant-chat__starters"><span>Можно спросить, например:</span>{starters.map(question => <button key={question} disabled={state.pending || state.enabled === false} onClick={() => void store.send(question, false, context)}>{question}<span aria-hidden="true">↗</span></button>)}</div>}
      {state.messages.map(message => <div key={message.id} className={`assistant-message assistant-message--${message.role === "user" ? "user" : "bot"}`}>
        {message.role === "assistant" && <PumpikAvatar/>}<div className="assistant-message__body"><div className="assistant-message__bubble">{message.role === "user" ? <p>{message.content}</p> : <Markdown skipHtml disallowedElements={["img"]} urlTransform={url => message.sources?.some(source => source.url === url) ? url : ""} components={{ a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span> }}>{message.content}</Markdown>}</div>
          {!!message.sources?.length && <div className="assistant-message__sources"><span>Источники:</span>{message.sources.map(source => source.url ? <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<span aria-hidden="true">↗</span></a> : <span key={source.id} className="assistant-message__data-source">{source.title}</span>)}</div>}</div>
      </div>)}
      {state.pending && <div className="assistant-message assistant-message--bot"><PumpikAvatar/><div className="assistant-message__bubble assistant-chat__thinking"><span className="assistant-chat__dots" aria-hidden="true"><i/><i/><i/></span>Проверяю документацию и данные…</div></div>}
    </div>
    {state.enabled === false && <p className="assistant-chat__notice" role="status">Pump-ик пока не подключён. Поддержка: <a href="mailto:bnk@wenard.ru">bnk@wenard.ru</a></p>}
    {state.error && <div className="assistant-chat__error" role="alert"><p>{state.error}</p><button onClick={() => void store.send(undefined, true, context)} disabled={state.pending}>Повторить вопрос</button></div>}
    <form className="assistant-chat__composer" onSubmit={event => { event.preventDefault(); send(); }}>
      <div className="assistant-chat__input"><textarea ref={input} aria-label="Вопрос Pump-ику" placeholder="Спросите о работе приложения…" rows={2} maxLength={ASSISTANT_MESSAGE_LIMIT} value={state.draft} disabled={state.enabled === false} onChange={event => store.setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!state.pending) send(); } }}/>
        {state.pending ? <button type="button" onClick={store.stop} title="Остановить ответ" aria-label="Остановить ответ"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg></button> : <button type="submit" disabled={!state.draft.trim() || state.enabled === false} title="Отправить вопрос" aria-label="Отправить вопрос"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" strokeLinecap="round" strokeLinejoin="round"/></svg></button>}
      </div><div className="assistant-chat__hint"><span>Enter — отправить · Shift+Enter — новая строка</span>{state.draft.length > 3500 && <span>{state.draft.length}/{ASSISTANT_MESSAGE_LIMIT}</span>}</div>
    </form>
  </section>;
}
