"use client";

import { useEffect, useRef } from "react";
import type { DarkColorProfile, Theme } from "./theme";

export function AppSettings({ theme, onThemeChange, profile, onProfileChange, onClose }: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  profile: DarkColorProfile;
  onProfileChange: (profile: DarkColorProfile) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // Native modal dialogs handle keyboard dismissal through onCancel (Escape).
  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
  return <dialog
    ref={dialog}
    className="app-settings"
    aria-labelledby="app-settings-title"
    aria-describedby="app-settings-description"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled)");
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}
    onPointerDown={event => { backdropPress.current = event.target === event.currentTarget; }}
    onClick={event => {
      if (backdropPress.current && event.target === event.currentTarget) onClose();
      backdropPress.current = false;
    }}
  >
    <div className="app-settings__content">
      <header className="app-settings__header">
        <div><span className="app-settings__eyebrow">ПЕРСОНАЛИЗАЦИЯ</span><h2 id="app-settings-title">Настройки</h2></div>
        <button type="button" className="icon-button" aria-label="Закрыть настройки" onClick={onClose}>×</button>
      </header>
      <p id="app-settings-description">Настройте внешний вид рабочего пространства.</p>
      <div className="app-settings__appearance">
        <span className="app-settings__theme-icon" aria-hidden="true">{theme === "dark" ? "☾" : "☀"}</span>
        <div><label id="theme-switch-label" htmlFor="theme-switch">Тёмная тема</label><p id="theme-switch-description">{theme === "dark" ? "Включена" : "Выключена"}</p></div>
        <button
          id="theme-switch"
          type="button"
          role="switch"
          aria-checked={theme === "dark"}
          aria-labelledby="theme-switch-label"
          aria-describedby="theme-switch-description"
          className="theme-switch"
          onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
        ><span /></button>
      </div>
      <label className="app-settings__profile" htmlFor="theme-profile">
        <span>Цветовой профиль</span>
        <select id="theme-profile" value={theme === "light" ? "standard" : profile} onChange={event => {
          if (theme === "dark") onProfileChange(event.target.value === "gray" ? "gray" : "blue-gray");
        }}>
          {theme === "light" ? <option value="standard">Стандарт</option> : <>
            <option value="blue-gray">Сине-серый</option>
            <option value="gray">Серый</option>
          </>}
        </select>
      </label>
      <p className="app-settings__hint">Тема и цветовой профиль применяются сразу и запоминаются в этом браузере.</p>
      <footer><button type="button" className="button button--primary" onClick={onClose}>Готово</button></footer>
    </div>
  </dialog>;
}
