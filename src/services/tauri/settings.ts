import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "@/types/settings";

// 后端的 Settings 使用 Option<String>，这里做一次转换
type BackendSettings = {
  apiKey?: string | null;
  apiBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
};

export const settingsService = {
  async get(): Promise<Settings> {
    const raw = (await invoke("get_settings")) as BackendSettings;
    return {
      apiKey: raw.apiKey ?? "",
      apiBaseUrl: raw.apiBaseUrl,
      model: raw.model,
      temperature: raw.temperature,
      maxTokens: raw.maxTokens,
      systemPrompt: raw.systemPrompt,
    };
  },

  async save(settings: Settings): Promise<void> {
    await invoke("save_settings", {
      settings: {
        apiKey: settings.apiKey || null,
        apiBaseUrl: settings.apiBaseUrl,
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        systemPrompt: settings.systemPrompt,
      },
    });
  },

  async testApiConnection(): Promise<boolean> {
    return invoke("test_api_connection") as Promise<boolean>;
  },
};

