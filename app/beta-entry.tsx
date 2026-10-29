"use client";
import { lazy, Suspense, useEffect, useState } from "react";
import { AccountScreen } from "./account-ui";
import type { AccountUser } from "./user-types";
import { IS_BETA, RELEASE_LABEL } from "./release-policy";
declare const __PSC_RELEASE_PROFILE__: string;
// The full module graph is removed at build time for beta; neither workspace
// is requested until the server has authenticated this individual account.
const Workspace = typeof __PSC_RELEASE_PROFILE__ !== "undefined" && __PSC_RELEASE_PROFILE__ === "full"
  ? lazy(() => import("./full-workspace")) : lazy(() => import("./beta-workspace"));

export default function BetaEntry() {
  const [account, setAccount] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        // Presence is refreshed only by the authenticated heartbeat action.
        // A GET checks the session but leaves last_seen_at unchanged.
        const response = await fetch("/api/auth", {
          method: "POST", cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat" }),
        });
        if (response.status === 401) { if (active) setAccount(null); return; }
        if (!response.ok) throw new Error("Не удалось проверить вход. Обновите страницу.");
        const result = await response.json() as { user: AccountUser };
        if (active) { setAccount(result.user); setError(""); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Сервер недоступен."); }
      finally { if (active) setLoading(false); }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    const focus = () => void check();
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visible); };
  }, []);
  if (loading) return <main className="beta-loading"><b>Pump Station Calculator · {RELEASE_LABEL}</b><p>Подготавливаем рабочее пространство…</p></main>;
  if (error) return <main className="beta-loading"><p role="alert">{error}</p><button onClick={() => window.location.reload()}>Повторить</button></main>;
  const auth = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("auth");
  if (!account || auth === "forgot" || auth === "reset") return <AccountScreen initialMode={auth === "reset" ? "reset" : auth === "forgot" ? "forgot" : !IS_BETA && auth === "verify" ? "verify" : "login"} registrationAllowed={!IS_BETA}/>;
  return <Suspense fallback={<main className="beta-loading">Загружаем инструменты…</main>}><Workspace key={account.id} account={account} onAccountChange={setAccount}/></Suspense>;
}
