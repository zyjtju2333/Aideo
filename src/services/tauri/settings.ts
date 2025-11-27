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
  functionCallingMode?: string;
  enableTextFallback?: boolean;
};

export interface FunctionCallTestResult {
  success: boolean;
  message: string;
  apiFormatDetected: string;
  functionCalled: boolean;
  functionName?: string;
  todosCreated: number;
  rawResponseSample?: string;
  recommendations: string[];
}

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
      functionCallingMode: raw.functionCallingMode ?? "auto",
      enableTextFallback: raw.enableTextFallback ?? true,
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
        functionCallingMode: settings.functionCallingMode ?? "auto",
        enableTextFallback: settings.enableTextFallback ?? true,
      },
    });
  },

  async testApiConnection(settings: Settings): Promise<boolean> {
    return invoke("test_api_connection", {
      settings: {
        apiKey: settings.apiKey || null,
        apiBaseUrl: settings.apiBaseUrl,
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        systemPrompt: settings.systemPrompt,
      },
    }) as Promise<boolean>;
  },

  async testFunctionCalling(): Promise<FunctionCallTestResult> {
    return invoke("test_function_calling") as Promise<FunctionCallTestResult>;
  },
};

