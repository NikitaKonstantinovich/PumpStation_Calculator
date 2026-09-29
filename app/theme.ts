export type Theme = "light" | "dark";
export type DarkColorProfile = "blue-gray" | "gray";

export const THEME_STORAGE_KEY = "pumpstation-theme";
export const DARK_PROFILE_STORAGE_KEY = "pumpstation-dark-profile";

// Run before the page is painted, including in detached tool windows.
export const THEME_INIT_SCRIPT = `try{document.documentElement.dataset.theme=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="dark"?"dark":"light";document.documentElement.dataset.themeProfile=localStorage.getItem(${JSON.stringify(DARK_PROFILE_STORAGE_KEY)})==="gray"?"gray":"blue-gray"}catch{document.documentElement.dataset.theme="light";document.documentElement.dataset.themeProfile="blue-gray"}`;
