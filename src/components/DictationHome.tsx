import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Cpu, Keyboard, Mic, Radio, Sparkles } from "lucide-react";
import { commands } from "@/bindings";
import { useSettings } from "@/hooks/useSettings";
import { useModelStore } from "@/stores/modelStore";

const DictationHome = () => {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const currentModel = useModelStore((state) => state.currentModel);
  const models = useModelStore((state) => state.models);
  const [isRecording, setIsRecording] = useState(false);

  const shortcut = settings?.bindings?.transcribe?.current_binding;
  const activeModel = models.find((model) => model.id === currentModel);

  useEffect(() => {
    let active = true;
    const refreshRecordingState = async () => {
      try {
        const recording = await commands.isRecording();
        if (active) setIsRecording(recording);
      } catch {
        // The initial state is still usable while the native backend starts.
      }
    };

    refreshRecordingState();
    const timer = window.setInterval(refreshRecordingState, 800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="w-full max-w-4xl px-2 py-5 sm:px-6 sm:py-9">
      <div className="mb-8 flex items-center justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-logo-primary">
            <Radio size={14} />
            {t("dictation.eyebrow")}
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-text sm:text-4xl">
            {t("dictation.title")}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-mid-gray/15 bg-background/70 px-3.5 py-2.5 shadow-sm">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-logo-primary/12 text-logo-primary">
            <Cpu size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mid-gray">
              {t("dictation.activeModel")}
            </p>
            <p className="max-w-40 truncate text-xs font-semibold text-text">
              {activeModel?.name || t("dictation.noModel")}
            </p>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[30px] border border-mid-gray/15 bg-mid-gray/[0.035] px-6 py-8 shadow-[0_22px_70px_-42px_rgba(0,0,0,0.4)] sm:px-10 sm:py-11">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-logo-primary/10 blur-3xl" />
        <div className="relative flex flex-col items-center text-center">
          <div className={`mb-6 grid h-20 w-20 place-items-center rounded-[28px] ${isRecording ? "dictation-mic-active bg-logo-primary text-white shadow-[0_14px_36px_-16px_var(--color-background-ui)]" : "bg-logo-primary/15 text-logo-primary"}`}>
            <Mic size={34} className={isRecording ? "motion-safe:animate-pulse" : ""} />
          </div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">
            {isRecording ? t("dictation.listening") : t("dictation.heroTitle")}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-mid-gray">
            {isRecording ? t("dictation.listeningDescription") : t("dictation.heroDescription")}
          </p>
          <div className="mt-7 inline-flex items-center gap-3 rounded-2xl border border-mid-gray/15 bg-background px-4 py-3 shadow-sm">
            <Keyboard size={18} className="text-logo-primary" />
            <span className="text-sm text-mid-gray">{t("dictation.shortcut")}</span>
            <kbd className="rounded-lg border border-mid-gray/15 bg-mid-gray/5 px-2.5 py-1 text-sm font-semibold text-text">
              {shortcut || t("dictation.shortcutUnavailable")}
            </kbd>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          ["one", "Keyboard"],
          ["two", "Mic"],
          ["three", "Sparkles"],
        ].map(([step, icon]) => {
          const Icon = icon === "Keyboard" ? Keyboard : icon === "Mic" ? Mic : Sparkles;
          return (
            <div key={step} className="rounded-3xl border border-mid-gray/15 bg-background px-5 py-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-logo-primary">{t(`dictation.steps.${step}.number`)}</span>
                <Icon size={17} className="text-mid-gray" />
              </div>
              <h3 className="font-semibold text-text">{t(`dictation.steps.${step}.title`)}</h3>
              <p className="mt-2 text-sm leading-6 text-mid-gray">{t(`dictation.steps.${step}.description`)}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-mid-gray/15 bg-background px-5 py-5 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-logo-primary"><Check size={18} /></span>
          <div>
            <p className="text-sm font-semibold text-text">{t("dictation.localTitle")}</p>
            <p className="mt-1 text-sm leading-6 text-mid-gray">{t("dictation.localDescription")}</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DictationHome;
