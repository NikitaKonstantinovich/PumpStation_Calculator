"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { AccountUser } from "./user-types";
import "./app-navigation.css";

export type AppView = "workspace" | "projects" | "workspace2" | "node-editor" | "geometry-nodes" | "equipment-admin" | "component-calculator" | "item-entry" | "base-values" | "users" | "help";
const destinations: { view: AppView; icon: string; label: string; admin?: boolean; full?: boolean }[] = [
  { view: "workspace", icon: "▦", label: "Рабочее пространство" },
  { view: "projects", icon: "▤", label: "Мои проекты", full: true },
  { view: "workspace2", icon: "▦", label: "Рабочее пространство 2", full: true },
  { view: "node-editor", icon: "⌘", label: "Нодовый редактор", admin: true, full: true },
  { view: "geometry-nodes", icon: "⌘", label: "Алгоритм станции", admin: true, full: true },
  { view: "equipment-admin", icon: "⌁", label: "База комплектующих", admin: true },
  { view: "component-calculator", icon: "⌗", label: "Расчёт комплектующих", admin: true, full: true },
  { view: "item-entry", icon: "＋", label: "Заведение позиций", admin: true },
  { view: "base-values", icon: "⚙", label: "Базовые значения", admin: true },
  { view: "users", icon: "♙", label: "Список пользователей", admin: true },
];
const subscribe = () => () => {};
const browserSnapshot = () => true;
const serverSnapshot = () => false;
const NavigationGuard = createContext<((message: string) => () => void) | null>(null);

/** Keep existing unsaved-edit protection when switching through the shared menu. */
export function useAppNavigationGuard(dirty: boolean, message = "Есть несохранённые изменения. Перейти в другой раздел без сохранения?") {
  const register = useContext(NavigationGuard);
  useEffect(() => dirty && register ? register(message) : undefined, [dirty, message, register]);
}

function LeaveConfirmation({ message, cancel, proceed }: { message: string; cancel: () => void; proceed: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="app-navigation-confirm" aria-labelledby="navigation-confirm-title" onCancel={event => { event.preventDefault(); cancel(); }}>
    <h2 id="navigation-confirm-title">Несохранённые изменения</h2><p>{message}</p>
    <footer><button className="button" onClick={cancel}>Остаться</button><button className="button" onClick={proceed}>Перейти без сохранения</button></footer>
  </dialog>;
}

export function AppNavigation({ account, view, open, setOpen, buttonRef, header, children, navigate, settings, logout, projectCount, beta = false }: {
  account: AccountUser; view: AppView; open: boolean; setOpen: (open: boolean) => void;
  buttonRef: RefObject<HTMLButtonElement | null>; header: ReactNode; children: ReactNode;
  navigate: (view: AppView) => void; settings: () => void; logout: () => void;
  projectCount?: number; beta?: boolean;
}) {
  const mounted = useSyncExternalStore(subscribe, browserSnapshot, serverSnapshot);
  const panel = useRef<HTMLElement>(null), guards = useRef(new Map<symbol, string>());
  const [pending, setPending] = useState<{ message: string; action: () => void } | null>(null);
  const registerGuard = useCallback((message: string) => {
    const id = Symbol(); guards.current.set(id, message);
    return () => { guards.current.delete(id); };
  }, []);
  const close = useCallback(() => { setOpen(false); buttonRef.current?.focus(); }, [setOpen, buttonRef]);
  const request = (action: () => void, leavesPage = true) => {
    const message = leavesPage ? guards.current.values().next().value : undefined;
    const proceed = () => { close(); action(); };
    if (message) setPending({ message, action: proceed }); else proceed();
  };
  useEffect(() => {
    if (!open) return;
    if (panel.current) panel.current.scrollTop = 0;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    buttonRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (pending) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const elements = [buttonRef.current, ...Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') ?? [])].filter((element): element is HTMLElement => !!element && element.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keyboard); };
  }, [open, close, buttonRef, pending]);
  const initials = account.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toLocaleUpperCase("ru-RU")).join("") || "ПС";
  return <NavigationGuard.Provider value={registerGuard}><div className="app-navigation">
    <header className="app-header app-navigation__header">
      <button ref={buttonRef} type="button" className="icon-button app-header__menu app-menu-toggle" onClick={() => open ? close() : setOpen(true)} aria-label={open ? "Закрыть меню" : "Открыть меню"} aria-expanded={open} aria-controls="main-navigation-panel">
        <span className="app-menu-toggle__icon" aria-hidden="true"><span/><span/><span/></span>
      </button>
      <div className="app-navigation__header-content" inert={open}>{header}</div>
    </header>
    <div className="app-navigation__content" inert={open}>{children}</div>
    {mounted && createPortal(<div className={`sidebar app-navigation-menu ${open ? "sidebar--open" : ""}`} inert={!open}>
      <button type="button" className="sidebar__backdrop" onClick={close} tabIndex={-1} aria-label="Закрыть меню по фону"/>
      <aside id="main-navigation-panel" ref={panel} className="sidebar__panel" aria-label="Главное меню">
        <div className="sidebar__top"><div className="brand"><span className="brand__mark">PS</span><span><b>Pump Station</b><small>Calculator</small></span></div></div>
        <div className="user-card"><span className="avatar avatar--large">{initials}</span><div><div className="user-card__name"><b>{account.name}</b><span className="user-role">{account.role}</span></div><small>{account.email}</small></div></div>
        <nav className="sidebar__nav" aria-label="Разделы приложения">
          {destinations.filter(item => !item.admin || account.role === "admin").map(item => <button key={item.view} type="button" className={`sidebar__link${view === item.view ? " sidebar__link--active" : ""}`} aria-current={view === item.view ? "page" : undefined} disabled={beta && item.full} title={beta && item.full ? "Доступно в полной версии" : undefined} onClick={() => request(() => navigate(item.view), view !== item.view)}>
            <span aria-hidden="true">{item.icon}</span><span>{item.label}</span>{item.view === "projects" && projectCount != null && <em>{projectCount}</em>}
          </button>)}
          <button type="button" className="sidebar__link" onClick={() => request(settings, false)}><span aria-hidden="true">⚙</span><span>Настройки</span></button>
          {beta && <Link className="sidebar__link" href="/?auth=forgot" onClick={event => { event.preventDefault(); request(() => { window.location.href = "/?auth=forgot"; }); }}><span aria-hidden="true">⌘</span><span>Сменить пароль</span></Link>}
          <button type="button" className="sidebar__link" onClick={() => request(logout)}><span aria-hidden="true">↪</span><span>Выйти</span></button>
        </nav>
        <button type="button" className="sidebar__footer help-center-entry" aria-current={view === "help" ? "page" : undefined} onClick={() => request(() => navigate("help"), view !== "help")}><span className="help-center-entry__icon" aria-hidden="true">?</span><span><b>Центр помощи</b><small>Документация и поддержка</small></span></button>
      </aside>
    </div>, document.body)}
    {pending && <LeaveConfirmation message={pending.message} cancel={() => setPending(null)} proceed={() => { const action = pending.action; setPending(null); action(); }}/>}
  </div></NavigationGuard.Provider>;
}
