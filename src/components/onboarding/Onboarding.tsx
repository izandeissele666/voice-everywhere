import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { commands, type GpuDeviceOption, type ModelInfo } from "@/bindings";
import type { ModelCardStatus } from "./ModelCard";
import ModelCard, { isLegacySource } from "./ModelCard";
import BrandMark from "../BrandMark";
import { useModelStore } from "../../stores/modelStore";
import { getHardwareRecommendation } from "@/lib/modelProfiles";

interface OnboardingProps {
  onModelSelected: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onModelSelected }) => {
  const { t } = useTranslation();
  const {
    models,
    downloadModel,
    selectModel,
    downloadingModels,
    verifyingModels,
    extractingModels,
    downloadProgress,
    downloadStats,
    cancelDownload,
  } = useModelStore();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [gpuDevices, setGpuDevices] = useState<GpuDeviceOption[]>([]);
  const [totalSystemMemoryMb, setTotalSystemMemoryMb] = useState(0);
  const [hardwareDetected, setHardwareDetected] = useState(false);
  const hasStartedSelection = useRef(false);
  const hasStartedRecommendedDownload = useRef(false);

  const isBusy = selectedModelId !== null;
  const hardwareRecommendation = useMemo(
    () => getHardwareRecommendation(gpuDevices, totalSystemMemoryMb),
    [gpuDevices, totalSystemMemoryMb],
  );
  const recommendedModel = models.find(
    (model) => model.id === hardwareRecommendation.modelId,
  );

  useEffect(() => {
    commands
      .getAvailableAccelerators()
      .then((available) => {
        setGpuDevices(available.gpu_devices);
        setTotalSystemMemoryMb(available.total_system_memory_mb);
      })
      .catch((error) => {
        console.warn("Failed to detect transcription hardware:", error);
      })
      .finally(() => setHardwareDetected(true));
  }, []);

  // Curate the download list: legacy (.bin/ONNX) downloads are deprecated and
  // never shown here (they still appear in the compatible section if already on
  // disk). The catalog arrives rank-sorted, so the first two recommended models
  // are the featured picks. Hardware-compatible Whisper profiles take the first
  // slot and are downloaded automatically on a clean first run.
  const { downloadable, topPicks, otherRecommended, rest } = useMemo(() => {
    const downloadable = models.filter(
      (m: ModelInfo) => !m.is_downloaded && !isLegacySource(m),
    );
    const recommended = downloadable.filter((m: ModelInfo) => m.is_recommended);
    const hardwarePick = downloadable.find(
      (m: ModelInfo) => m.id === hardwareRecommendation.modelId,
    );
    // `models` arrives in editorial rank order (the backend sorts by rank_of,
    // then accuracy), so keep that order here: ranked-but-not-recommended models
    // surface first, then the unranked tail by accuracy.
    const rest = downloadable.filter((m: ModelInfo) => !m.is_recommended);
    return {
      downloadable,
      topPicks: hardwarePick ? [hardwarePick] : recommended.slice(0, 2),
      otherRecommended: hardwarePick
        ? recommended.filter((m) => m.id !== hardwarePick.id)
        : recommended.slice(2),
      rest,
    };
  }, [hardwareRecommendation.modelId, models]);

  const hasRecommended = topPicks.length > 0 || otherRecommended.length > 0;
  // When nothing recommended remains to download (e.g. all already on disk),
  // there is no curated subset to collapse, so just show the full list.
  const showRest = showAll || !hasRecommended;

  useEffect(() => {
    if (
      !hardwareDetected ||
      hasStartedRecommendedDownload.current ||
      selectedModelId !== null ||
      models.some((model) => model.is_downloaded)
    ) {
      return;
    }

    const model = models.find(
      (item) => item.id === hardwareRecommendation.modelId,
    );
    if (!model) return;

    hasStartedRecommendedDownload.current = true;
    setSelectedModelId(model.id);
    downloadModel(model.id).then((success) => {
      if (!success) setSelectedModelId(null);
    });
  }, [
    downloadModel,
    hardwareDetected,
    hardwareRecommendation.modelId,
    models,
    selectedModelId,
  ]);

  // Watch for the selected model to finish downloading + verifying + extracting
  useEffect(() => {
    if (!selectedModelId) {
      hasStartedSelection.current = false;
      return;
    }

    const model = models.find((m) => m.id === selectedModelId);
    const stillDownloading = selectedModelId in downloadingModels;
    const stillVerifying = selectedModelId in verifyingModels;
    const stillExtracting = selectedModelId in extractingModels;

    if (
      model?.is_downloaded &&
      !stillDownloading &&
      !stillVerifying &&
      !stillExtracting &&
      !hasStartedSelection.current
    ) {
      hasStartedSelection.current = true;

      // Model is ready — select it and transition
      selectModel(selectedModelId).then((success) => {
        if (success) {
          onModelSelected();
        } else {
          toast.error(t("onboarding.errors.selectModel"));
          hasStartedSelection.current = false;
          setSelectedModelId(null);
        }
      });
    }
  }, [
    selectedModelId,
    models,
    downloadingModels,
    verifyingModels,
    extractingModels,
    selectModel,
    onModelSelected,
    t,
  ]);

  const handleDownloadModel = async (modelId: string) => {
    setSelectedModelId(modelId);

    // Error toast is handled centrally by the model-download-failed event listener
    // in modelStore — no toast here to avoid duplicates.
    const success = await downloadModel(modelId);
    if (!success) {
      setSelectedModelId(null);
    }
  };

  const handleCancelDownload = async (modelId: string) => {
    const success = await cancelDownload(modelId);
    if (success) {
      setSelectedModelId(null);
    }
  };

  const handleSelectExistingModel = (modelId: string) => {
    setSelectedModelId(modelId);
  };

  const getModelStatus = (modelId: string): ModelCardStatus => {
    if (modelId in extractingModels) return "extracting";
    if (modelId in verifyingModels) return "verifying";
    if (modelId in downloadingModels) return "downloading";
    return "downloadable";
  };

  const getExistingModelStatus = (modelId: string): ModelCardStatus => {
    if (selectedModelId === modelId) return "switching";
    return "available";
  };

  const getModelDownloadProgress = (modelId: string): number | undefined => {
    return downloadProgress[modelId]?.percentage;
  };

  const getModelDownloadSpeed = (modelId: string): number | undefined => {
    return downloadStats[modelId]?.speed;
  };

  return (
      <div className="h-screen w-screen flex flex-col p-6 gap-4 inset-0">
        <div className="flex flex-col items-center gap-2 shrink-0">
          <BrandMark size={48} />
          <h1 className="text-xl font-semibold tracking-[-0.03em] text-text">
            {t("sidebar.appName")}
          </h1>
        <p className="text-text/70 max-w-md font-medium mx-auto">
          {t("onboarding.subtitle")}
        </p>
      </div>

      <div className="max-w-[600px] w-full mx-auto text-center flex-1 flex flex-col min-h-0">
        <div className="space-y-6 pb-6">
          {models.some((m: ModelInfo) => m.is_downloaded) && (
            <div className="space-y-3">
              <div className="text-left">
                <h2 className="text-sm font-medium text-text/60">
                  {t("onboarding.existingModelsTitle")}
                </h2>
              </div>
              {models
                .filter((m: ModelInfo) => m.is_downloaded)
                .map((model: ModelInfo) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    status={getExistingModelStatus(model.id)}
                    disabled={isBusy}
                    onSelect={handleSelectExistingModel}
                    showRecommended={false}
                  />
                ))}
            </div>
          )}

          {downloadable.length > 0 && (
            <div className="space-y-3">
              <div className="text-left">
                <h2 className="text-sm font-medium text-text/60">
                  {t("onboarding.downloadModelsTitle")}
                </h2>
                {recommendedModel && (
                  <p className="mt-1 text-xs leading-5 text-text/60">
                    {t("settings.models.recommendation.description", {
                      profile: t(
                        `settings.models.recommendation.${hardwareRecommendation.profile}`,
                      ),
                      model: recommendedModel.name,
                      hardware: hardwareRecommendation.gpu
                        ? hardwareRecommendation.integratedGpu
                          ? t("settings.models.recommendation.integratedGpu", {
                              gpu: hardwareRecommendation.gpu.name,
                            })
                          : t("settings.models.recommendation.gpu", {
                              gpu: hardwareRecommendation.gpu.name,
                              vram: (
                                hardwareRecommendation.gpu.total_vram_mb / 1024
                              ).toFixed(1),
                            })
                        : t("settings.models.recommendation.cpu"),
                    })}
                  </p>
                )}
              </div>

              {topPicks.map((model: ModelInfo) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  variant="featured"
                  status={getModelStatus(model.id)}
                  disabled={isBusy}
                  onSelect={handleDownloadModel}
                  onDownload={handleDownloadModel}
                  onCancel={handleCancelDownload}
                  downloadProgress={getModelDownloadProgress(model.id)}
                  downloadSpeed={getModelDownloadSpeed(model.id)}
                  showRecommended={false}
                />
              ))}

              {otherRecommended.map((model: ModelInfo) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  status={getModelStatus(model.id)}
                  disabled={isBusy}
                  onSelect={handleDownloadModel}
                  onDownload={handleDownloadModel}
                  onCancel={handleCancelDownload}
                  downloadProgress={getModelDownloadProgress(model.id)}
                  downloadSpeed={getModelDownloadSpeed(model.id)}
                  showRecommended={false}
                />
              ))}

              {hasRecommended && rest.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="flex items-center justify-center gap-1.5 mx-auto py-1 text-sm font-medium text-text/60 hover:text-text transition-colors"
                >
                  {showAll
                    ? t("onboarding.showFewerModels")
                    : t("onboarding.showAllModels", {
                        total: downloadable.length,
                      })}
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${
                      showAll ? "rotate-180" : ""
                    }`}
                  />
                </button>
              )}

              {showRest &&
                rest.map((model: ModelInfo) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    status={getModelStatus(model.id)}
                    disabled={isBusy}
                    onSelect={handleDownloadModel}
                    onDownload={handleDownloadModel}
                    onCancel={handleCancelDownload}
                    downloadProgress={getModelDownloadProgress(model.id)}
                    downloadSpeed={getModelDownloadSpeed(model.id)}
                    showRecommended={false}
                  />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
