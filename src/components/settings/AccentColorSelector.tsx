import React from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AccentColor } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import {
  ACCENT_COLOR_OPTIONS,
  applyAccentColor,
} from "@/lib/utils/theme";
import { SettingContainer } from "../ui/SettingContainer";

interface AccentColorSelectorProps {
  descriptionMode?: "inline" | "tooltip";
  grouped?: boolean;
}

export const AccentColorSelector: React.FC<AccentColorSelectorProps> = React.memo(
  ({ descriptionMode = "inline", grouped = false }) => {
    const { t } = useTranslation();
    const { settings, updateSetting, isUpdating } = useSettings();
    const selected = settings?.accent_color ?? "violet";

    const selectAccent = (accentColor: AccentColor) => {
      applyAccentColor(accentColor);
      updateSetting("accent_color", accentColor);
    };

    return (
      <SettingContainer
        title={t("appearance.accent.title")}
        description={t("appearance.accent.description")}
        descriptionMode={descriptionMode}
        grouped={grouped}
        layout="stacked"
      >
        <div className="grid grid-cols-10 gap-2 sm:grid-cols-[repeat(15,minmax(0,1fr))]">
          {ACCENT_COLOR_OPTIONS.map((option) => {
            const isSelected = option.value === selected;
            return (
              <button
                key={option.value}
                type="button"
                aria-label={option.swatch}
                aria-pressed={isSelected}
                disabled={isUpdating("accent_color")}
                onClick={() => selectAccent(option.value)}
                className={`grid aspect-square place-items-center rounded-full border transition duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/60 disabled:cursor-wait ${
                  isSelected
                    ? "border-text/70 ring-2 ring-background ring-offset-2 ring-offset-background"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: option.swatch }}
              >
                {isSelected && <Check size={13} className="text-white drop-shadow" />}
              </button>
            );
          })}
        </div>
      </SettingContainer>
    );
  },
);

AccentColorSelector.displayName = "AccentColorSelector";
