import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AiChatRequest, AiChatResponse } from "@/types/chat";
import type { Todo } from "@/types/todo";

export const aiService = {
  async chat(request: AiChatRequest): Promise<AiChatResponse<Todo>> {
    return invoke("ai_chat", { request }) as Promise<AiChatResponse<Todo>>;
  },

  async chatStream(
    request: AiChatRequest,
    onChunk: (content: string) => void,
    onFunctionCall?: (name: string, result: unknown) => void,
  ): Promise<void> {
    const unlisten = await listen<{
      content?: string;
      function_call?: { name: string; result: unknown };
    }>("ai-stream-chunk", (event) => {
      if (event.payload.content) {
        onChunk(event.payload.content);
      }
      if (event.payload.function_call && onFunctionCall) {
        onFunctionCall(
          event.payload.function_call.name,
          event.payload.function_call.result,
        );
      }
    });

    try {
      await invoke("ai_chat_stream", { request });
    } finally {
      unlisten();
    }
  },
};

