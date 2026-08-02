import { listen } from "@tauri-apps/api/event";
import { commands, type AccentColor, type Theme } from "@/bindings";

/**
 * Appearance theme handling.
 *
 * Handy already ships a full light palette and a full dark palette (see
 * `App.css`). This module lets the user pick which one is used instead of
 * always following the OS:
 *  - `system` removes the override so the `prefers-color-scheme` media query
 *    governs (the historical behaviour).
 *  - `light` / `dark` set `data-theme` on the document root, whose
 *    higher-specificity CSS selectors win over the media query.
 *
 * The choice is persisted in `AppSettings` (source of truth) and mirrored to
 * localStorage so it can be applied synchronously on boot, before React mounts,
 * avoiding a flash of the wrong palette.
 */

export const THEME_STORAGE_KEY = "voice-everywhere.theme";
export const ACCENT_COLOR_STORAGE_KEY = "voice-everywhere.accent-color";

export const THEME_OPTIONS: Theme[] = ["system", "light", "dark"];

type AccentPalette = {
  lightPrimary: string;
  darkPrimary: string;
  ui: string;
};

export const ACCENT_COLOR_OPTIONS: ReadonlyArray<
  AccentPalette & { value: AccentColor; swatch: string }
> = [
  { value: "violet", swatch: "#7667F9", lightPrimary: "#7667F9", darkPrimary: "#978BFF", ui: "#6F63F6" },
  { value: "indigo", swatch: "#5B5CE2", lightPrimary: "#5B5CE2", darkPrimary: "#A5B4FC", ui: "#5455D4" },
  { value: "blue", swatch: "#2563EB", lightPrimary: "#2563EB", darkPrimary: "#60A5FA", ui: "#2563EB" },
  { value: "azure", swatch: "#0284C7", lightPrimary: "#0284C7", darkPrimary: "#38BDF8", ui: "#0284C7" },
  { value: "cyan", swatch: "#0891B2", lightPrimary: "#0891B2", darkPrimary: "#22D3EE", ui: "#0891B2" },
  { value: "teal", swatch: "#0F766E", lightPrimary: "#0F766E", darkPrimary: "#2DD4BF", ui: "#0F766E" },
  { value: "mint", swatch: "#059669", lightPrimary: "#059669", darkPrimary: "#6EE7B7", ui: "#059669" },
  { value: "emerald", swatch: "#047857", lightPrimary: "#047857", darkPrimary: "#34D399", ui: "#047857" },
  { value: "green", swatch: "#16A34A", lightPrimary: "#16A34A", darkPrimary: "#4ADE80", ui: "#16A34A" },
  { value: "lime", swatch: "#65A30D", lightPrimary: "#65A30D", darkPrimary: "#A3E635", ui: "#65A30D" },
  { value: "yellow", swatch: "#CA8A04", lightPrimary: "#CA8A04", darkPrimary: "#FACC15", ui: "#CA8A04" },
  { value: "amber", swatch: "#D97706", lightPrimary: "#D97706", darkPrimary: "#FBBF24", ui: "#D97706" },
  { value: "orange", swatch: "#EA580C", lightPrimary: "#EA580C", darkPrimary: "#FB923C", ui: "#EA580C" },
  { value: "tangerine", swatch: "#F97316", lightPrimary: "#F97316", darkPrimary: "#FDBA74", ui: "#EA580C" },
  { value: "red", swatch: "#DC2626", lightPrimary: "#DC2626", darkPrimary: "#F87171", ui: "#DC2626" },
  { value: "crimson", swatch: "#BE123C", lightPrimary: "#BE123C", darkPrimary: "#FB7185", ui: "#BE123C" },
  { value: "rose", swatch: "#E11D48", lightPrimary: "#E11D48", darkPrimary: "#FDA4AF", ui: "#E11D48" },
  { value: "pink", swatch: "#DB2777", lightPrimary: "#DB2777", darkPrimary: "#F9A8D4", ui: "#DB2777" },
  { value: "fuchsia", swatch: "#C026D3", lightPrimary: "#C026D3", darkPrimary: "#E879F9", ui: "#C026D3" },
  { value: "purple", swatch: "#9333EA", lightPrimary: "#9333EA", darkPrimary: "#C084FC", ui: "#9333EA" },
  { value: "plum", swatch: "#7E22CE", lightPrimary: "#7E22CE", darkPrimary: "#D8B4FE", ui: "#7E22CE" },
  { value: "lavender", swatch: "#7C3AED", lightPrimary: "#7C3AED", darkPrimary: "#C4B5FD", ui: "#7C3AED" },
  { value: "slate", swatch: "#475569", lightPrimary: "#475569", darkPrimary: "#94A3B8", ui: "#475569" },
  { value: "steel", swatch: "#526D82", lightPrimary: "#526D82", darkPrimary: "#9DB4C0", ui: "#526D82" },
  { value: "charcoal", swatch: "#34343B", lightPrimary: "#34343B", darkPrimary: "#A1A1AA", ui: "#34343B" },
  { value: "black", swatch: "#18181B", lightPrimary: "#18181B", darkPrimary: "#D4D4D8", ui: "#27272A" },
  { value: "brown", swatch: "#92400E", lightPrimary: "#92400E", darkPrimary: "#D6A46E", ui: "#92400E" },
  { value: "copper", swatch: "#B45309", lightPrimary: "#B45309", darkPrimary: "#F0A45D", ui: "#B45309" },
  { value: "sand", swatch: "#A16207", lightPrimary: "#A16207", darkPrimary: "#EAC883", ui: "#A16207" },
  { value: "coral", swatch: "#E05D44", lightPrimary: "#E05D44", darkPrimary: "#FDA48F", ui: "#E05D44" },
];

const isTheme = (value: unknown): value is Theme =>
  value === "system" || value === "light" || value === "dark";

const isAccentColor = (value: unknown): value is AccentColor =>
  ACCENT_COLOR_OPTIONS.some((option) => option.value === value);

/** Apply a theme to the document root and remember it for the next launch. */
export const applyTheme = (theme: Theme): void => {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage may be unavailable (e.g. private mode); the setting still
    // persists in AppSettings, so this only costs a one-frame flash on boot.
  }
};

/** Read the last-applied theme for synchronous boot-time application. */
export const getStoredTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // ignore
  }
  return "system";
};

/** Apply a curated accent palette to the shared main/overlay CSS tokens. */
export const applyAccentColor = (accentColor: AccentColor): void => {
  const palette = ACCENT_COLOR_OPTIONS.find(
    (option) => option.value === accentColor,
  )!;
  const root = document.documentElement;
  root.dataset.accent = accentColor;
  root.style.setProperty("--light-color-logo-primary", palette.lightPrimary);
  root.style.setProperty("--dark-color-logo-primary", palette.darkPrimary);
  root.style.setProperty("--color-background-ui", palette.ui);
  try {
    localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, accentColor);
  } catch {
    // Settings remain persisted by Rust even when localStorage is unavailable.
  }
};

/** Read the latest accent hint so the first frame matches the last session. */
export const getStoredAccentColor = (): AccentColor => {
  try {
    const stored = localStorage.getItem(ACCENT_COLOR_STORAGE_KEY);
    if (isAccentColor(stored)) return stored;
  } catch {
    // ignore
  }
  return "violet";
};

/** Apply the persisted theme from AppSettings (the source of truth). */
export const syncThemeFromSettings = async (): Promise<void> => {
  try {
    const result = await commands.getAppSettings();
    if (result.status === "ok") {
      applyTheme(result.data.theme ?? "system");
      applyAccentColor(result.data.accent_color ?? "violet");
    }
  } catch (e) {
    console.warn("Failed to sync theme from settings:", e);
  }
};

/** Keep both webviews in sync while Settings remains open. */
export const listenForAppearanceChanges = async (): Promise<void> => {
  await listen<{ setting?: string; value?: unknown }>(
    "settings-changed",
    ({ payload }) => {
      if (payload.setting === "theme" && isTheme(payload.value)) {
        applyTheme(payload.value);
      }
      if (payload.setting === "accent_color" && isAccentColor(payload.value)) {
        applyAccentColor(payload.value);
      }
    },
  );
};
