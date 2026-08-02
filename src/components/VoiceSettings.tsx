import { useTranslation } from "react-i18next";
import { AccentColorSelector } from "./settings/AccentColorSelector";
import { AutostartToggle, GeneralSettings } from "./settings";
import { AppLanguageSelector } from "./settings/AppLanguageSelector";
import { ShowOverlay } from "./settings/ShowOverlay";
import { ThemeSelector } from "./settings/ThemeSelector";
import { SettingsGroup } from "./ui/SettingsGroup";

const VoiceSettings = () => {
  const { t } = useTranslation();

  return (
    <section className="w-full max-w-4xl px-2 py-5 sm:px-6 sm:py-9">
      <div className="mb-8">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-logo-primary">
          {t("voiceSettings.eyebrow")}
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.04em] text-text sm:text-4xl">
          {t("voiceSettings.title")}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-mid-gray">
          {t("voiceSettings.subtitle")}
        </p>
      </div>
      <div className="mb-6 max-w-3xl">
        <AppLanguageSelector descriptionMode="tooltip" />
      </div>
      <div className="mb-6 max-w-3xl">
        <SettingsGroup>
          <ThemeSelector descriptionMode="inline" grouped />
          <AccentColorSelector descriptionMode="inline" grouped />
        </SettingsGroup>
      </div>
      <div className="mb-6 max-w-3xl">
        <SettingsGroup title={t("settings.advanced.groups.app")}>
          <AutostartToggle descriptionMode="inline" grouped />
          <ShowOverlay descriptionMode="inline" grouped />
        </SettingsGroup>
      </div>
      <GeneralSettings />
    </section>
  );
};

export default VoiceSettings;
