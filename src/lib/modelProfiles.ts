import type { GpuDeviceOption } from "@/bindings";

export type HardwareProfile = "low" | "balanced";

export interface HardwareRecommendation {
  profile: HardwareProfile;
  modelId: string;
  gpu: GpuDeviceOption | null;
  integratedGpu: boolean;
}

const PROFILE_MODELS: Record<HardwareProfile, string> = {
  low: "handy-computer/whisper-small-gguf/whisper-small-Q8_0.gguf",
  balanced: "handy-computer/whisper-medium-gguf/whisper-medium-Q8_0.gguf",
};

export function getHardwareRecommendation(
  gpuDevices: GpuDeviceOption[],
  totalSystemMemoryMb: number,
): HardwareRecommendation {
  const gpu = gpuDevices.reduce<GpuDeviceOption | null>(
    (largest, device) =>
      largest === null || device.total_vram_mb > largest.total_vram_mb
        ? device
        : largest,
    null,
  );

  const name = gpu?.name.toLowerCase() ?? "";
  const integratedGpu =
    (name.includes("intel") && !name.includes("arc")) ||
    name.includes("radeon graphics") ||
    name.includes("radeon vega");
  const profile: HardwareProfile =
    totalSystemMemoryMb > 0 && totalSystemMemoryMb < 12 * 1024
      ? "low"
      : "balanced";

  return { profile, modelId: PROFILE_MODELS[profile], gpu, integratedGpu };
}
