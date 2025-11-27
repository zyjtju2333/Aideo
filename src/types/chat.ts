export type MessageRole = "system" | "user" | "assistant" | "function";

// UI 消息
export interface UiMessage {
  id: string;
  role: Exclude<MessageRole, "function">;
  content: string;
}

// 发送给后端的 ChatMessage 结构
export interface ApiChatMessage {
  role: string;
  content?: string;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface AiChatRequest {
  message: string;
  history?: ApiChatMessage[];
}

export interface FunctionResult {
  functionName: string;
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
}

export interface AiChatResponse<TTodo = unknown> {
  message: string;
  functionResults?: FunctionResult[];
  updatedTodos?: TTodo[];
}

