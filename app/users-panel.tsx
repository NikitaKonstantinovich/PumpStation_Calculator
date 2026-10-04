"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountUser, ManagedUser, UserForm, UserRole } from "./user-types";

const emptyForm: UserForm = { email: "", name: "", role: "user", password: "" };
type Change = { label: string; before: string; after: string };

function UserEditor({ user, actor, onClose, onSaved }: {
  user: ManagedUser | null; actor: AccountUser; onClose: () => void;
  onSaved: (user: ManagedUser, signedOut: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<UserForm>(() => user ? { email: user.email, name: user.name, role: user.role, password: "" } : emptyForm);
  const [confirming, setConfirming] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { dialog.current?.querySelector<HTMLElement>(confirming ? "footer .button--primary" : "input")?.focus(); }, [confirming]);
  const changes: Change[] = [];
  const values = { ...form, email: form.email.trim().toLowerCase(), name: form.name.trim() };
  for (const [key, label] of [["email", "Почта"], ["name", "Имя"], ["role", "Уровень"]] as const) {
    if (!user || values[key] !== user[key]) changes.push({ label, before: user?.[key] ?? "—", after: values[key] });
  }
  if (form.password) changes.push({ label: "Пароль", before: user ? "Текущий пароль" : "—", after: "Новый пароль (скрыт)" });
  const sessionChange = Boolean(user && (form.password || values.email !== user.email || values.role !== user.role));
  const save = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/users", { method: user ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, id: user?.id, revision: user?.revision, confirmed: true }) });
      const result = await response.json() as { user: ManagedUser; signedOut?: boolean; error?: string };
      if (!response.ok) {
        if (response.status === 409 && user) setConflict(true);
        throw new Error(result.error ?? "Не удалось сохранить пользователя.");
      }
      onSaved(result.user, Boolean(result.signedOut));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось связаться с сервером."); }
    finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="users-dialog" aria-labelledby="user-editor-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><span className="users-eyebrow">УПРАВЛЕНИЕ ДОСТУПОМ</span><h2 id="user-editor-title">{confirming ? "Подтверждение изменений" : user ? "Изменить пользователя" : "Новый пользователь"}</h2></div><button type="button" className="icon-button" aria-label="Закрыть окно" disabled={busy} onClick={onClose}>×</button></header>
    {confirming ? <>
      <p>{user ? <>Вы действительно хотите изменить данные пользователя <strong>{user.email}</strong>?</> : "Вы действительно хотите создать пользователя со следующими данными?"}</p>
      <div className="users-table-scroll"><table className="users-changes"><thead><tr><th>Поле</th><th>Было</th><th>Станет</th></tr></thead><tbody>{changes.map(change => <tr key={change.label}><th scope="row">{change.label}</th><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table></div>
      {sessionChange && <p className="users-notice">{user?.id === actor.id ? "После сохранения потребуется снова войти в аккаунт." : "Активные сессии пользователя завершатся. Потребуется войти снова."}</p>}
      {error && <p className="users-error" role="alert">{error}</p>}
      <footer><button className="button" disabled={busy} onClick={() => { setConfirming(false); setError(""); }}>Назад</button><button className="button button--primary" disabled={busy || conflict} onClick={save}>{busy ? "Сохранение…" : user ? "Подтвердить изменения" : "Создать пользователя"}</button></footer>
    </> : <form onSubmit={event => { event.preventDefault(); setError(""); setConfirming(true); }}>
      <div className="users-form">
        <label><span>Имя</span><input required minLength={2} maxLength={120} autoComplete="off" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label>
        <label><span>Почта</span><input type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
        <label><span>Уровень</span><select value={form.role} disabled={user?.id === actor.id} onChange={event => setForm({ ...form, role: event.target.value as UserRole })}><option value="user">user — Пользователь</option><option value="admin">admin — Администратор</option></select></label>
        <label><span>{user ? "Новый пароль" : "Пароль"}</span><input type="password" required={!user} minLength={10} maxLength={256} autoComplete="new-password" value={form.password} placeholder={user ? "Оставьте пустым, чтобы не менять" : "Не менее 10 символов"} onChange={event => setForm({ ...form, password: event.target.value })}/></label>
      </div>
      <p className="users-note">{user ? "Сохранённый пароль скрыт. Чтобы сменить его, введите новый." : "Пользователь сможет сразу войти с указанными почтой и паролем. Подтверждение почты не требуется."}</p>
      {user?.id === actor.id && <p className="users-note">Ваш уровень может изменить другой администратор.</p>}
      {conflict && <p className="users-error" role="alert">Закройте окно и обновите список перед повторным изменением.</p>}
      <footer><button type="button" className="button" onClick={onClose}>Отмена</button><button className="button button--primary" disabled={!changes.length || conflict}>Проверить изменения</button></footer>
    </form>}
  </dialog>;
}

export function UsersPanel({ actor, onBack, onAccountChange }: { actor: AccountUser; onBack: () => void; onAccountChange: (user: AccountUser | null) => void }) {
  const [users, setUsers] = useState<ManagedUser[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ user: ManagedUser | null } | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/users", { cache: "no-store", signal });
      const result = await response.json() as { users?: ManagedUser[]; error?: string };
      if (signal?.aborted) return;
      if (response.status === 401) { onAccountChange(null); return; }
      if (!response.ok) { if (response.status === 403) setUsers([]); throw new Error(result.error ?? "Не удалось загрузить пользователей."); }
      setUsers(result.users ?? []); setError("");
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Не удалось связаться с сервером."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [onAccountChange]);
  useEffect(() => {
    const controller = new AbortController(); queueMicrotask(() => void load(controller.signal));
    const timer = window.setInterval(() => void load(controller.signal), 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load]);
  const filtered = users.filter(user => `${user.email} ${user.name} ${user.role}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU")));
  return <main className="users-page">
    <header className="users-page__header"><button className="button" onClick={onBack}>← Рабочее пространство</button><span>{actor.name} <span className="user-role">{actor.role}</span></span></header>
    <section className="users-page__content">
      <div className="users-page__title"><div><span className="users-eyebrow">АДМИНИСТРИРОВАНИЕ</span><h1>Список пользователей</h1><p>Управляйте аккаунтами и уровнями доступа.</p></div><button className="button button--primary" onClick={() => { setNotice(""); setEditor({ user: null }); }}>＋ Добавить пользователя</button></div>
      <div className="users-toolbar"><label><span className="visually-hidden">Поиск пользователей</span><input type="search" value={query} placeholder="Поиск по имени, почте или уровню" onChange={event => setQuery(event.target.value)}/></label><span>{users.length} пользователей</span><button className="button" onClick={() => void load()}>Обновить</button></div>
      {error && <p className="users-error" role="alert">{error}</p>}{notice && <p className="users-notice" role="status">{notice}</p>}
      <div className="users-table-scroll"><table className="users-table"><caption className="visually-hidden">Пользователи калькулятора</caption><thead><tr><th>Почта</th><th>Имя</th><th>Уровень</th><th>Пароль</th><th>Статус</th><th><span className="visually-hidden">Действия</span></th></tr></thead><tbody>
        {filtered.map(user => <tr key={user.id}><td>{user.email}{user.id === actor.id && <small>Ваш аккаунт</small>}{!user.verified && <small>Почта не подтверждена</small>}</td><td>{user.name}</td><td><span className={`user-role ${user.role === "user" ? "user-role--user" : ""}`}>{user.role}</span></td><td><span aria-label="Пароль скрыт">••••••••</span><small>Можно сменить</small></td><td><span className={`user-presence ${user.online ? "user-presence--online" : ""}`}><i aria-hidden="true"/>{user.online ? "В сети" : "Не в сети"}</span></td><td><button className="button" aria-label={`Изменить ${user.email}`} onClick={() => { setNotice(""); setEditor({ user }); }}>Изменить</button></td></tr>)}
        {!filtered.length && <tr><td colSpan={6} className="users-table__empty">{loading ? "Загрузка пользователей…" : error ? "Список недоступен" : "Пользователи не найдены"}</td></tr>}
      </tbody></table></div>
      <p className="users-note">«В сети» — активная сессия с откликом за последние 2 минуты. Список обновляется каждые 30 секунд.</p>
    </section>
    {editor && <UserEditor user={editor.user} actor={actor} onClose={() => { setEditor(null); void load(); }} onSaved={(user, signedOut) => {
      setEditor(null);
      if (signedOut) { window.location.replace("/"); return; }
      setUsers(current => [user, ...current.filter(item => item.id !== user.id)]);
      setNotice(editor.user ? "Изменения сохранены." : "Пользователь создан. Можно войти с заданным паролем.");
      if (user.id === actor.id) onAccountChange({ id: user.id, name: user.name, email: user.email, role: user.role });
      void load();
    }}/>}
  </main>;
}
