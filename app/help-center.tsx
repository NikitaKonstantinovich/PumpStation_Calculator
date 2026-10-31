"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingAnchor, helpLocation, helpUrl, resolveHelpLink, type HelpDocument, type HelpIndex, type HelpLocation } from "./help-types";
import "./help-center.css";

type HeadingNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HeadingNode[] };
function headingIds() {
  return (tree: HeadingNode) => {
    const counts = new Map<string, number>();
    const text = (node: HeadingNode): string => node.value ?? node.children?.map(text).join("") ?? "";
    const visit = (node: HeadingNode) => {
      if (node.type === "element" && /^h[1-6]$/.test(node.tagName ?? "")) {
        const slug = headingAnchor(text(node));
        const duplicate = counts.get(slug) ?? 0;
        counts.set(slug, duplicate + 1);
        node.properties = { ...node.properties, id: `help-${slug}${duplicate ? `-${duplicate}` : ""}` };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

const currentLocation = () => typeof window === "undefined" ? helpLocation("") : helpLocation(window.location.search, window.location.hash);
const kindLabel = (kind: string) => kind === "guide" ? "Руководство" : kind === "archive" ? "История и планы" : "Подробная инструкция";

export function HelpCenter({ onBack }: { onBack: () => void }) {
  const [location, setLocation] = useState<HelpLocation>(currentLocation);
  const [index, setIndex] = useState<HelpIndex | null>(null);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("all");
  const [article, setArticle] = useState<HelpDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [articleLoading, setArticleLoading] = useState(false);
  const [error, setError] = useState("");
  const [articleError, setArticleError] = useState("");
  const [retry, setRetry] = useState(0);
  const articleHeading = useRef<HTMLHeadingElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const navigate = (tab: HelpLocation["tab"], id?: string | null, anchor = "") => {
    window.history.pushState({}, "", helpUrl(tab, id, anchor));
    setLocation({ tab, documentId: id ?? null, anchor });
  };
  useEffect(() => {
    const update = () => setLocation(currentLocation());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    if (location.tab !== "documentation") return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch(`/api/help?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить документацию.");
        if (!controller.signal.aborted) setIndex(result);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Не удалось загрузить документацию.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, query ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, retry, location.tab]);
  useEffect(() => {
    if (!location.documentId || location.tab !== "documentation") return;
    const controller = new AbortController();
    const load = async () => {
      setArticleLoading(true); setArticleError("");
      try {
        const response = await fetch(`/api/help?document=${encodeURIComponent(location.documentId!)}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Не удалось открыть документ.");
        if (!controller.signal.aborted) setArticle(result.document);
      } catch (reason) {
        if (!controller.signal.aborted) setArticleError(reason instanceof Error ? reason.message : "Не удалось открыть документ.");
      } finally { if (!controller.signal.aborted) setArticleLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [location.documentId, location.tab, retry]);
  useEffect(() => {
    if (location.tab !== "documentation" || !article || article.id !== location.documentId || articleLoading) return;
    const frame = requestAnimationFrame(() => {
      const target = location.anchor ? document.getElementById(`help-${location.anchor}`) : articleHeading.current;
      target?.scrollIntoView({ block: "start" });
      if (!location.anchor) articleHeading.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [article, articleLoading, location]);

  const filtered = index?.documents.filter((doc) => section === "all" || doc.section === section) ?? [];
  const activeSection = index?.sections.find((item) => item.id === section);
  const chooseSection = (id: string) => { setSection(id); navigate("documentation"); requestAnimationFrame(() => resultsHeading.current?.focus()); };
  const tabKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tab = event.key === "Home" ? "documentation" : event.key === "End" ? "support" : location.tab === "support" ? "documentation" : "support";
    navigate(tab, tab === "documentation" ? location.documentId : null);
    document.getElementById(`help-tab-${tab}`)?.focus();
  };
  return <main className="help-center">
    <header className="help-center__header">
      <button className="help-center__back" onClick={onBack}><span aria-hidden="true">←</span> В рабочее пространство</button>
      <div className="help-center__heading"><span className="help-center__mark" aria-hidden="true">?</span><div><span className="help-center__brand">PUMP STATION</span><h1>Центр помощи</h1></div></div>
      <div className="help-center__tabs" role="tablist" aria-label="Центр помощи">
        {(["documentation", "support"] as const).map((tab) => <button key={tab} id={`help-tab-${tab}`} role="tab" aria-selected={location.tab === tab} aria-controls={`help-panel-${tab}`} tabIndex={location.tab === tab ? 0 : -1} onKeyDown={tabKeyboard} onClick={() => navigate(tab, tab === "documentation" ? location.documentId : null)}>{tab === "documentation" ? "Документация" : "Поддержка"}</button>)}
      </div>
    </header>
    <section id="help-panel-support" role="tabpanel" aria-labelledby="help-tab-support" hidden={location.tab !== "support"} className="help-center__support"><a href="mailto:bnk@wenard.ru">bnk@wenard.ru</a></section>
    <section id="help-panel-documentation" role="tabpanel" aria-labelledby="help-tab-documentation" hidden={location.tab !== "documentation"}>
      <div className="help-center__layout">
        <aside className="help-center__sidebar">
          <label className="help-center__search"><span>Поиск по документации</span><input type="search" value={query} maxLength={200} placeholder="Насос, давление, спецификация…" onChange={(event) => { setQuery(event.target.value); if (location.documentId) navigate("documentation"); }}/></label>
          <nav aria-label="Разделы документации">
            <button className={section === "all" ? "is-active" : ""} aria-current={section === "all" ? "true" : undefined} onClick={() => chooseSection("all")}><span>Все разделы</span><small>{index?.total ?? "—"}</small></button>
            {index?.sections.map((item) => <button key={item.id} className={section === item.id ? "is-active" : ""} aria-current={section === item.id ? "true" : undefined} onClick={() => chooseSection(item.id)}>{item.title}</button>)}
          </nav>
        </aside>
        <div className="help-center__content">
          {error && <div className="help-center__notice" role="alert"><p>{error}</p><button className="button" onClick={() => setRetry((value) => value + 1)}>Повторить загрузку</button></div>}
          {location.documentId ? <>
            <button className="help-center__back" onClick={() => navigate("documentation")}>← К списку документов</button>
            {articleLoading || (!articleError && article?.id !== location.documentId) ? <p role="status">Загрузка документа…</p> : articleError ? <div className="help-center__notice" role="alert"><p>{articleError}</p><button className="button" onClick={() => setRetry((value) => value + 1)}>Повторить загрузку</button></div> : article && <article className="help-article">
              <div className="help-article__meta">{index?.sections.find((item) => item.id === article.section)?.title}<span>·</span>{kindLabel(article.kind)}</div>
              <h2 ref={articleHeading} tabIndex={-1} id={`help-${headingAnchor(article.title)}`}>{article.title}</h2>
              {article.kind === "archive" && <p className="help-center__notice">Исторический материал или план. Он описывает состояние на указанную дату и может отличаться от текущей версии приложения.</p>}
              <div className="help-markdown"><Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[headingIds]} skipHtml disallowedElements={["img"]} urlTransform={(url) => resolveHelpLink(url, article.path, index?.links ?? {}) ?? ""} components={{
                a: ({ href, children }) => !href ? <span>{children}</span> : <a href={href} target={/^https?:/.test(href) ? "_blank" : undefined} rel={/^https?:/.test(href) ? "noreferrer noopener" : undefined} onClick={(event) => { if (!href.startsWith("/?view=help") || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); const target = new URL(href, window.location.origin); const next = helpLocation(target.search, target.hash); navigate(next.tab, next.documentId, next.anchor); }}>{children}</a>,
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Wide tables need a keyboard-accessible horizontal scroll area.
                table: ({ children }) => <div className="help-markdown__table" tabIndex={0} role="region" aria-label="Таблица документа"><table>{children}</table></div>,
              }}>{article.markdown.replace(/^# .+\n/, "")}</Markdown></div>
            </article>}
          </> : <>
            <div className="help-center__intro"><span className="help-center__eyebrow">СПРАВОЧНИК ПОЛЬЗОВАТЕЛЯ</span><h2 ref={resultsHeading} tabIndex={-1}>{query ? "Результаты поиска" : activeSection?.title ?? "Документация"}</h2><p>{query ? `По запросу «${query}»` : activeSection?.description ?? "Инструкции по работе с калькулятором, расчётам и оборудованию."}</p></div>
            {loading ? <p role="status">Поиск документов…</p> : <p className="help-center__count" role="status">Найдено документов: {filtered.length}</p>}
            {!loading && !error && !filtered.length && <div className="help-center__empty"><h3>Документы не найдены</h3><p>Измените запрос или выберите другой раздел.</p><button className="button" onClick={() => { setQuery(""); setSection("all"); }}>Сбросить поиск</button></div>}
            <div className="help-center__cards" aria-busy={loading}>{filtered.map((doc) => <a key={doc.id} className="help-document-card" href={helpUrl("documentation", doc.id)} onClick={(event) => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return; event.preventDefault(); navigate("documentation", doc.id); }}><span className="help-document-card__kind">{kindLabel(doc.kind)}</span><h3>{doc.title}</h3><p>{doc.excerpt}</p><span className="help-document-card__read">Читать <span aria-hidden="true">↗</span></span></a>)}</div>
          </>}
        </div>
      </div>
    </section>
  </main>;
}
