import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  Check,
  Clipboard,
  FileAudio,
  FolderOpen,
  LoaderCircle,
  Save,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { useModelStore } from "@/stores/modelStore";

type Status = "idle" | "transcribing" | "complete" | "error";

interface FileTranscriptionResult {
  text: string;
  duration_seconds: number;
}

const audioExtensions = ["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus"];

const getFileName = (path: string) => path.split(/[\\/]/).pop() || path;

const getTextFileName = (path: string) => {
  const fileName = getFileName(path);
  const extensionIndex = fileName.lastIndexOf(".");
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  return `${baseName}.txt`;
};

const isSupportedAudioFile = (path: string) => {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension !== undefined && audioExtensions.includes(extension);
};

const FileTranscription = () => {
  const { t } = useTranslation();
  const currentModel = useModelStore((state) => state.currentModel);
  const models = useModelStore((state) => state.models);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeModel = models.find((model) => model.id === currentModel);

  const selectPath = (path: string) => {
    if (!isSupportedAudioFile(path)) {
      setError(t("fileTranscription.errors.unsupportedFile"));
      return;
    }
    setFilePath(path);
    setTranscript("");
    setDurationSeconds(null);
    setError(null);
    setStatus("idle");
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setIsDragging(true);
        } else if (event.payload.type === "leave") {
          setIsDragging(false);
        } else if (event.payload.type === "drop") {
          setIsDragging(false);
          const [path] = event.payload.paths;
          if (path) selectPath(path);
        }
      })
      .then((unsubscribe) => {
        unlisten = unsubscribe;
      });

    return () => unlisten?.();
  }, [t]);

  const chooseFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: t("fileTranscription.fileFilter"),
          extensions: audioExtensions,
        },
      ],
    });
    if (typeof selected === "string") selectPath(selected);
  };

  const transcribe = async () => {
    if (!filePath || !currentModel) return;

    setStatus("transcribing");
    setError(null);
    setCopied(false);
    try {
      const result = await invoke<FileTranscriptionResult>("transcribe_file", {
        path: filePath,
      });
      setTranscript(result.text);
      setDurationSeconds(result.duration_seconds);
      setStatus("complete");
    } catch (reason) {
      setStatus("error");
      setError(String(reason));
    }
  };

  const copyTranscript = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setError(t("fileTranscription.errors.copy"));
    }
  };

  const saveTranscript = async () => {
    if (!filePath || !transcript) return;
    const output = await save({
      defaultPath: getTextFileName(filePath),
      filters: [{ name: t("fileTranscription.textFile"), extensions: ["txt"] }],
    });
    if (typeof output !== "string") return;

    try {
      await invoke("save_transcription_text", { path: output, text: transcript });
    } catch (reason) {
      setError(String(reason));
    }
  };

  const isBusy = status === "transcribing";

  return (
    <section className="w-full max-w-4xl px-2 py-5 sm:px-6 sm:py-9">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-logo-primary">
            <Sparkles size={14} />
            {t("fileTranscription.eyebrow")}
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-text sm:text-4xl">
            {t("fileTranscription.title")}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-mid-gray">
            {t("fileTranscription.subtitle")}
          </p>
        </div>
        <div className="rounded-2xl border border-mid-gray/15 bg-mid-gray/5 px-4 py-3 text-sm">
          <p className="text-xs text-mid-gray">{t("fileTranscription.model")}</p>
          <p className="mt-1 font-medium text-text">
            {activeModel?.name || t("fileTranscription.noModel")}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-mid-gray/15 bg-mid-gray/[0.035] shadow-[0_18px_60px_-36px_rgba(0,0,0,0.38)]">
        <div className="border-b border-mid-gray/12 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3 text-sm text-mid-gray">
            <ShieldCheck size={18} className="text-logo-primary" />
            <span>{t("fileTranscription.localOnly")}</span>
          </div>
        </div>

        <div className="p-5 sm:p-7">
          <button
            type="button"
            onClick={chooseFile}
            disabled={isBusy}
            className={`group flex min-h-60 w-full flex-col items-center justify-center rounded-3xl border border-dashed px-6 text-center transition-all duration-200 disabled:cursor-wait disabled:opacity-70 ${
              isDragging
                ? "border-logo-primary bg-logo-primary/10 scale-[1.01]"
                : "border-mid-gray/25 bg-background/50 hover:border-logo-primary/70 hover:bg-logo-primary/[0.055]"
            }`}
          >
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-logo-primary/15 text-logo-primary transition-transform duration-200 group-hover:-translate-y-1">
              {filePath ? <FileAudio size={26} /> : <Upload size={26} />}
            </span>
            <span
              className="max-w-full truncate text-base font-semibold text-text"
              title={filePath ? getFileName(filePath) : undefined}
            >
              {filePath ? getFileName(filePath) : t("fileTranscription.dropTitle")}
            </span>
            <span className="mt-2 max-w-md text-sm leading-6 text-mid-gray">
              {filePath ? t("fileTranscription.replaceFile") : t("fileTranscription.dropDescription")}
            </span>
            <span className="mt-5 inline-flex items-center gap-2 rounded-xl border border-mid-gray/15 bg-background px-3 py-2 text-sm font-medium text-text shadow-sm">
              <FolderOpen size={16} />
              {t("fileTranscription.chooseFile")}
            </span>
          </button>

          {error && (
            <p className="mt-4 rounded-2xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-mid-gray">
              {currentModel
                ? t("fileTranscription.readyHint")
                : t("fileTranscription.modelRequired")}
            </p>
            <button
              type="button"
              onClick={transcribe}
              disabled={!filePath || !currentModel || isBusy}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-background-ui px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_var(--color-background-ui)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isBusy ? <LoaderCircle className="motion-safe:animate-spin" size={17} /> : <Sparkles size={17} />}
              {isBusy ? t("fileTranscription.transcribing") : t("fileTranscription.transcribe")}
            </button>
          </div>
        </div>
      </div>

      {(status === "complete" || transcript) && (
        <div className="result-reveal mt-6 overflow-hidden rounded-[28px] border border-mid-gray/15 bg-background shadow-[0_18px_60px_-36px_rgba(0,0,0,0.32)]">
          <div className="flex flex-col gap-4 border-b border-mid-gray/12 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <p className="font-semibold text-text">{t("fileTranscription.result")}</p>
              {durationSeconds !== null && (
                <p className="mt-1 text-xs text-mid-gray">
                  {t("fileTranscription.duration", { seconds: Math.round(durationSeconds) })}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyTranscript}
                className="inline-flex items-center gap-2 rounded-xl border border-mid-gray/15 px-3 py-2 text-sm font-medium text-text transition hover:bg-mid-gray/10"
              >
                {copied ? <Check size={16} /> : <Clipboard size={16} />}
                {copied ? t("fileTranscription.copied") : t("fileTranscription.copy")}
              </button>
              <button
                type="button"
                onClick={saveTranscript}
                className="inline-flex items-center gap-2 rounded-xl border border-mid-gray/15 px-3 py-2 text-sm font-medium text-text transition hover:bg-mid-gray/10"
              >
                <Save size={16} />
                {t("fileTranscription.save")}
              </button>
            </div>
          </div>
          <textarea
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            spellCheck={false}
            className="min-h-56 w-full resize-y bg-transparent px-5 py-5 text-[15px] leading-7 text-text outline-none placeholder:text-mid-gray/70 sm:px-7"
            placeholder={t("fileTranscription.emptyResult")}
          />
        </div>
      )}
    </section>
  );
};

export default FileTranscription;
