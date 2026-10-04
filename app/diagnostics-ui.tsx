"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PanelKind, ProjectConfig, SettingsEntity } from "./project-config";
import { diagnosticScope, filterIssues, issueToolEnabled, sortIssues, type IssueFilters, type IssueSeverity, type ToolIssue } from "./diagnostics";
import { ENTITY_BY_TOOL, PANEL_INFO } from "./tool-registry";

type Navigation = { issue: ToolIssue; panelId: string; token: number; projectId: string };
type RuntimeIssue = { issue: ToolIssue; projectId: string; scope: string };
export function useDiagnosticRegistry(project: ProjectConfig, derived: ToolIssue[]) {
  const [runtime, setRuntime] = useState<Record<string, RuntimeIssue>>({});
  const [filters, setFilters] = useState<IssueFilters>({ errors: true, warnings: true, tool: "all" });
  const [pendingNavigation, setNavigation] = useState<Navigation | null>(null);
  const projectId = project.project.id;
  const report = useCallback((id: string, issue: ToolIssue | null, scope: string) => {
    setRuntime(current => {
      if (!issue) {
        if (!current[id]) return current;
        const next = { ...current }; delete next[id]; return next;
      }
      const value = { issue, projectId, scope };
      if (JSON.stringify(current[id]) === JSON.stringify(value)) return current;
      return { ...current, [id]: value };
    });
  }, [projectId]);
  const issues = useMemo(() => {
    const settings = project.entities["station-settings"] as SettingsEntity;
    const reported = Object.values(runtime).filter(item => item.projectId === projectId && item.scope === diagnosticScope(project, item.issue.tool) && issueToolEnabled(item.issue.tool, settings)).map(item => item.issue);
    return sortIssues([...derived, ...reported]);
  }, [derived, runtime, project, projectId]);
  const navigation = useMemo(() => {
    if (pendingNavigation?.projectId !== projectId) return null;
    const panel = project.workspace.windows.find(item => item.id === pendingNavigation.panelId);
    if (!panel || (panel.activeTool ? panel.activeTool !== pendingNavigation.issue.tool : panel.entityId !== ENTITY_BY_TOOL[pendingNavigation.issue.tool])) return null;
    const issue = issues.find(item => item.id === pendingNavigation.issue.id);
    return issue ? { ...pendingNavigation, issue } : null;
  }, [pendingNavigation, projectId, issues, project]);
  return { issues, filters, setFilters, navigation, setNavigation, report, scope: (tool: PanelKind) => diagnosticScope(project, tool) };
}

type DiagnosticsValue = ReturnType<typeof useDiagnosticRegistry> & { onNavigate: (issue: ToolIssue) => void };
const DiagnosticsContext = createContext<DiagnosticsValue | null>(null);
const PanelContext = createContext<string | null>(null);
export const DiagnosticsProvider = ({ value, children }: { value: DiagnosticsValue; children: ReactNode }) => <DiagnosticsContext.Provider value={value}>{children}</DiagnosticsContext.Provider>;

export function useIssueNavigation() {
  const context = useContext(DiagnosticsContext), panelId = useContext(PanelContext);
  return context?.navigation?.panelId === panelId ? context.navigation : null;
}

export function useStoredDiagnostic(tool: PanelKind, suffix: string) {
  const context = useContext(DiagnosticsContext);
  return context?.issues.find(issue => issue.id === `${tool}/${suffix}`);
}

export function useRuntimeDiagnostic(tool: PanelKind, suffix: string, message: string, severity: IssueSeverity = "error", ready = true) {
  const context = useContext(DiagnosticsContext);
  const report = context?.report, scope = context?.scope(tool) ?? "", id = `${tool}/${suffix}`;
  useEffect(() => { if (ready) report?.(id, message ? { id, tool, message, severity } : null, scope); }, [report, id, tool, message, severity, scope, ready]);
}

export function IssueBadge({ severity }: { severity: IssueSeverity }) {
  return <span className={`issue-badge issue-badge--${severity}`} aria-label={severity === "error" ? "Ошибка" : "Предупреждение"}>!</span>;
}

export function IssueNotice({ id }: { id: string }) {
  const context = useContext(DiagnosticsContext), issue = context?.issues.find(item => item.id === id);
  if (!issue) return null;
  return <p data-issue-id={id} className={`issue-notice issue-notice--${issue.severity}`}><IssueBadge severity={issue.severity}/><span>{issue.message}</span></p>;
}

export function IssueMessages({ tool, prefix }: { tool: PanelKind; prefix?: string }) {
  const context = useContext(DiagnosticsContext);
  return <>{context?.issues.filter(issue => issue.tool === tool && (!prefix || issue.id.startsWith(prefix))).map(issue => <IssueNotice key={issue.id} id={issue.id}/>)}</>;
}

export function IssueNavigationMessage({ id }: { id: string }) {
  const context = useContext(DiagnosticsContext), panelId = useContext(PanelContext);
  const navigation = context?.navigation;
  if (!navigation || navigation.panelId !== panelId || navigation.issue.id !== id) return null;
  return <div className={`issue-navigation-message issue-notice--${navigation.issue.severity}`}><IssueBadge severity={navigation.issue.severity}/><span>{navigation.issue.message}</span></div>;
}

export function DiagnosticSurface({ panelId, children }: { panelId: string; children: ReactNode }) {
  const context = useContext(DiagnosticsContext), surface = useRef<HTMLDivElement>(null);
  const navigation = context?.navigation?.panelId === panelId ? context.navigation : null;
  const issueId = navigation?.issue.id, severity = navigation?.issue.severity, token = navigation?.token;
  useEffect(() => {
    if (!issueId || !severity || token === undefined || !surface.current) return;
    const container = surface.current;
    container.closest("[data-panel-id]")?.scrollIntoView({ block: "start", inline: "nearest" });
    let target: HTMLElement | undefined;
    const center = () => {
      const previousTarget = target;
      target = [...container.querySelectorAll<HTMLElement>("[data-issue-id]")].find(element => element.dataset.issueId === issueId);
      if (!target) return;
      for (let parent = target.parentElement; parent && parent !== container; parent = parent.parentElement) if (parent instanceof HTMLDetailsElement) parent.open = true;
      target.dataset.diagnosticSelected = severity;
      const bounds = target.getBoundingClientRect(), viewport = container.getBoundingClientRect();
      let visibleTop = Math.max(0, viewport.top), visibleBottom = Math.min(window.innerHeight, viewport.top + container.clientHeight);
      for (let parent = container.parentElement; parent; parent = parent.parentElement) {
        if (!/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) continue;
        const clip = parent.getBoundingClientRect();
        visibleTop = Math.max(visibleTop, clip.top + parent.clientTop);
        visibleBottom = Math.min(visibleBottom, clip.top + parent.clientTop + parent.clientHeight);
      }
      container.scrollTop += bounds.top + bounds.height / 2 - (visibleTop + visibleBottom) / 2;
      target.setAttribute("tabindex", "-1");
      if (target !== previousTarget) { target.focus({ preventScroll: true }); resize.observe(target); }
      observer.disconnect();
    };
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(center); };
    const observer = new MutationObserver(schedule);
    observer.observe(container, { childList: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    schedule();
    const timeout = window.setTimeout(() => observer.disconnect(), 8000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timeout); observer.disconnect(); resize.disconnect(); if (target) { delete target.dataset.diagnosticSelected; target.removeAttribute("tabindex"); } };
  }, [issueId, severity, token]);
  return <PanelContext.Provider value={panelId}><div ref={surface} className={`diagnostic-surface ${navigation ? "diagnostic-surface--focus" : ""}`}>
    {navigation && <div className="diagnostic-surface__bar"><IssueBadge severity={navigation.issue.severity}/><span>Переход к сообщению</span><button type="button" onClick={() => context?.setNavigation(null)}>Обычный вид</button></div>}
    <div className="diagnostic-surface__content">{children}</div>
  </div></PanelContext.Provider>;
}

export function IssuesTool() {
  const context = useContext(DiagnosticsContext);
  const [selected, setSelected] = useState<string | null>(null);
  if (!context) return null;
  const { issues, filters, setFilters } = context;
  const visible = filterIssues(issues, filters);
  const available = issues.filter(issue => filters.tool === "all" || issue.tool === filters.tool);
  const errors = available.filter(issue => issue.severity === "error").length, warnings = available.length - errors;
  return <div className="issues-tool">
    <div className="issues-tool__filters">
      <fieldset><legend>Показывать</legend>
        <label><input type="checkbox" checked={filters.errors} onChange={event => setFilters({ ...filters, errors: event.target.checked })}/><IssueBadge severity="error"/><span>Ошибки</span><b>{errors}</b></label>
        <label><input type="checkbox" checked={filters.warnings} onChange={event => setFilters({ ...filters, warnings: event.target.checked })}/><IssueBadge severity="warning"/><span>Предупреждения</span><b>{warnings}</b></label>
      </fieldset>
      <label className="issues-tool__tool-filter"><span>Инструмент</span><select aria-label="Фильтр по инструменту" value={filters.tool} onPointerDown={event => event.stopPropagation()} onChange={event => setFilters({ ...filters, tool: event.target.value as IssueFilters["tool"] })}><option value="all">Все инструменты</option>{(Object.keys(PANEL_INFO) as PanelKind[]).filter(tool => tool !== "issues").map(tool => <option key={tool} value={tool}>{PANEL_INFO[tool].title}</option>)}</select></label>
    </div>
    <div className="issues-tool__list" aria-label="Список ошибок и предупреждений">
      {visible.length ? <ul>{visible.map(issue => <li key={issue.id}><button type="button" className={`issues-tool__row ${selected === issue.id ? "issues-tool__row--selected" : ""}`} onClick={() => setSelected(issue.id)} onDoubleClick={() => context.onNavigate(issue)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); context.onNavigate(issue); } }}>
        <IssueBadge severity={issue.severity}/><span className="issues-tool__source"><b>{PANEL_INFO[issue.tool].title}</b><small>{issue.severity === "error" ? "Ошибка" : "Предупреждение"}</small></span><span className="issues-tool__message">{issue.subject && <b>{issue.subject}</b>}<span>{issue.message}</span></span>
      </button></li>)}</ul> : <div className="issues-tool__empty"><b>{!issues.length ? "Ошибок и предупреждений нет" : "Нет сообщений по выбранным фильтрам"}</b><p>{!filters.errors && !filters.warnings ? "Включите отображение ошибок или предупреждений." : "Список обновляется при изменении параметров проекта."}</p></div>}
    </div>
    <footer><span>Показано {visible.length} из {available.length}</span><span>Двойной клик или Enter — перейти к сообщению</span></footer>
  </div>;
}
