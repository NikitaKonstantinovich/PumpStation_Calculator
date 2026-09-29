"use client";

import { useSyncExternalStore } from "react";
import { DARK_PROFILE_STORAGE_KEY, THEME_STORAGE_KEY, type DarkColorProfile, type Theme } from "./theme";

const THEME_EVENT = "pumpstation-theme-change";
const currentTheme = (): Theme => document.documentElement.dataset.theme === "dark" ? "dark" : "light";
const serverTheme = (): Theme => "light";
const currentProfile = (): DarkColorProfile => document.documentElement.dataset.themeProfile === "gray" ? "gray" : "blue-gray";
const serverProfile = (): DarkColorProfile => "blue-gray";

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY && event.key !== DARK_PROFILE_STORAGE_KEY && event.key !== null) return;
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    }
    if (event.key === DARK_PROFILE_STORAGE_KEY || event.key === null) {
      document.documentElement.dataset.themeProfile = event.newValue === "gray" ? "gray" : "blue-gray";
    }
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The switch still works when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, serverTheme);
  const profile = useSyncExternalStore(subscribe, currentProfile, serverProfile);
  return [theme, setTheme, profile, setProfile] as const;
}

function setProfile(profile: DarkColorProfile) {
  document.documentElement.dataset.themeProfile = profile;
  try {
    localStorage.setItem(DARK_PROFILE_STORAGE_KEY, profile);
  } catch {
    // Keep the selected profile usable without browser storage.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}
