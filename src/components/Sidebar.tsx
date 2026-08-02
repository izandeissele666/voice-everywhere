import React from "react";
import { useTranslation } from "react-i18next";
import { Cpu, FileAudio, Mic, Settings } from "lucide-react";
import { ModelsSettings } from "./settings";
import FileTranscription from "./FileTranscription";
import DictationHome from "./DictationHome";
import VoiceSettings from "./VoiceSettings";
import BrandMark from "./BrandMark";

export type SidebarSection = keyof typeof SECTIONS_CONFIG;

interface IconProps {
  width?: number | string;
  height?: number | string;
  size?: number | string;
  className?: string;
  [key: string]: any;
}

interface SectionConfig {
  labelKey: string;
  icon: React.ComponentType<IconProps>;
  component: React.ComponentType;
}

export const SECTIONS_CONFIG = {
  dictation: {
    labelKey: "sidebar.dictation",
    icon: Mic,
    component: DictationHome,
  },
  file: {
    labelKey: "sidebar.file",
    icon: FileAudio,
    component: FileTranscription,
  },
  models: {
    labelKey: "sidebar.models",
    icon: Cpu,
    component: ModelsSettings,
  },
  settings: {
    labelKey: "sidebar.settings",
    icon: Settings,
    component: VoiceSettings,
  },
} as const satisfies Record<string, SectionConfig>;

interface SidebarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { t } = useTranslation();
  const sections = Object.entries(SECTIONS_CONFIG).map(([id, config]) => ({
    id: id as SidebarSection,
    ...config,
  }));

  return (
    <aside className="flex h-full w-[216px] shrink-0 flex-col border-e border-mid-gray/15 bg-mid-gray/[0.035] px-3 py-4">
      <div className="flex items-center gap-3 px-2 py-2">
        <BrandMark size={34} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.02em] text-text">{t("sidebar.appName")}</p>
          <p className="mt-0.5 text-[11px] font-medium text-mid-gray">{t("sidebar.caption")}</p>
        </div>
      </div>
      <nav className="mt-8 flex flex-col gap-1" aria-label={t("sidebar.navigation")}>
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;

          return (
            <button
              type="button"
              key={section.id}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-primary/45 ${
                isActive
                  ? "bg-logo-primary/15 text-text"
                  : "text-mid-gray hover:bg-mid-gray/10 hover:text-text"
              }`}
              onClick={() => onSectionChange(section.id)}
            >
              {isActive && <span className="sidebar-active-rail" aria-hidden="true" />}
              <Icon size={18} className={isActive ? "text-logo-primary" : ""} />
              <span className="truncate" title={t(section.labelKey)}>{t(section.labelKey)}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-mid-gray/15 bg-background/70 p-3">
        <p className="text-xs font-semibold text-text">{t("sidebar.offlineTitle")}</p>
        <p className="mt-1 text-xs leading-5 text-mid-gray">{t("sidebar.offlineDescription")}</p>
      </div>
    </aside>
  );
};
