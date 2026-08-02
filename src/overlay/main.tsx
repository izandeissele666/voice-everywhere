import React from "react";
import ReactDOM from "react-dom/client";
import RecordingOverlay from "./RecordingOverlay";
import "@/i18n";
import {
  applyTheme,
  applyAccentColor,
  getStoredAccentColor,
  getStoredTheme,
  listenForAppearanceChanges,
  syncThemeFromSettings,
} from "@/lib/utils/theme";

applyTheme(getStoredTheme());
applyAccentColor(getStoredAccentColor());
syncThemeFromSettings();
listenForAppearanceChanges();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RecordingOverlay />
  </React.StrictMode>,
);
