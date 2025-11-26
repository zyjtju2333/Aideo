# Aideo 前端实现计划

## 一、项目结构设计

```
src/
├── main.tsx                    # 应用入口
├── App.tsx                     # 根组件
├── vite-env.d.ts              # Vite 类型声明
│
├── components/                 # UI 组件
│   ├── layout/
│   │   ├── Header.tsx         # 顶部导航栏
│   │   ├── ViewSwitcher.tsx   # 视图切换器
│   │   └── MainLayout.tsx     # 主布局容器
│   │
│   ├── todo/
│   │   ├── TodoInput.tsx      # 新建 Todo 输入框
│   │   ├── TodoItem.tsx       # 单个 Todo 条目
│   │   ├── TodoList.tsx       # Todo 列表容器
│   │   ├── TodoMenu.tsx       # Todo 操作菜单
│   │   └── ArchivedList.tsx   # 已归档列表
│   │
│   ├── chat/
│   │   ├── ChatPanel.tsx      # 聊天面板主容器
│   │   ├── ChatHeader.tsx     # 聊天面板头部
│   │   ├── ChatMessages.tsx   # 消息列表
│   │   ├── ChatInput.tsx      # 消息输入框
│   │   ├── ChatBubble.tsx     # 消息气泡
│   │   ├── QuickActions.tsx   # 快捷操作按钮
│   │   └── TypingIndicator.tsx# 打字指示器
│   │
│   ├── views/
│   │   ├── ListView.tsx       # 列表视图
│   │   ├── SummaryView.tsx    # 回顾/统计视图
│   │   └── SettingsView.tsx   # 设置视图
│   │
│   └── ui/                    # 基础 UI 组件
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Card.tsx
│       ├── LoadingSpinner.tsx
│       └── FloatingButton.tsx
│
├── hooks/                      # 自定义 Hooks
│   ├── useTodos.ts            # Todo CRUD 操作
│   ├── useChat.ts             # AI 聊天逻辑
│   ├── useSettings.ts         # 设置管理
│   └── useTauriIpc.ts         # Tauri IPC 封装
│
├── services/                   # 服务层
│   ├── tauri/
│   │   ├── index.ts           # Tauri IPC 统一导出
│   │   ├── todo.ts            # Todo 相关 IPC 调用
│   │   └── settings.ts        # 设置相关 IPC 调用
│   │
│   └── ai/
│       ├── index.ts           # AI 服务统一导出
│       ├── types.ts           # AI 相关类型定义
│       └── functions.ts       # Function Call 定义
│
├── store/                      # 状态管理
│   ├── index.ts               # Store 统一导出
│   ├── todoStore.ts           # Todo 状态
│   ├── chatStore.ts           # 聊天状态
│   └── settingsStore.ts       # 设置状态
│
├── types/                      # TypeScript 类型定义
│   ├── todo.ts                # Todo 相关类型
│   ├── chat.ts                # 聊天相关类型
│   ├── settings.ts            # 设置相关类型
│   └── tauri.ts               # Tauri IPC 类型
│
├── utils/                      # 工具函数
│   ├── date.ts                # 日期处理
│   ├── sort.ts                # 排序逻辑
│   └── constants.ts           # 常量定义
│
└── styles/                     # 样式文件
    ├── globals.css            # 全局样式
    └── animations.css         # 动画定义
```

---

## 二、组件拆分方案

### 从 demo.tsx 拆分的组件映射

| 原型代码位置 | 目标组件 | 职责 |
|-------------|---------|------|
| Header 部分 (Line 388-421) | `Header.tsx` + `ViewSwitcher.tsx` | 标题、同步状态、视图切换 |
| Todo Input (Line 427-438) | `TodoInput.tsx` | 新 Todo 输入表单 |
| TodoItem 内部组件 (Line 325-372) | `TodoItem.tsx` + `TodoMenu.tsx` | Todo 条目展示与操作 |
| activeTodos 列表 (Line 441-450) | `TodoList.tsx` | Todo 列表渲染 |
| archivedTodos (Line 453-468) | `ArchivedList.tsx` | 归档 Todo 展示 |
| list 视图 (Line 424-470) | `ListView.tsx` | 列表视图组合 |
| summary 视图 (Line 473-498) | `SummaryView.tsx` | 统计回顾视图 |
| settings 视图 (Line 502-579) | `SettingsView.tsx` | 设置配置视图 |
| Chat Window (Line 586-661) | `ChatPanel.tsx` 及子组件 | AI 聊天面板 |
| Floating Button (Line 664-673) | `FloatingButton.tsx` | 悬浮触发按钮 |

---

## 三、状态管理方案 (Zustand)

### todoStore.ts
```typescript
interface TodoState {
  todos: Todo[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchTodos: () => Promise<void>;
  addTodo: (text: string) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  archiveTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  batchAddTodos: (todos: Omit<Todo, 'id'>[]) => Promise<void>;

  // Derived
  activeTodos: () => Todo[];
  archivedTodos: () => Todo[];
  completedCount: () => number;
}
```

### chatStore.ts
```typescript
interface ChatState {
  messages: ChatMessage[];
  isTyping: boolean;
  isChatOpen: boolean;
  streamingContent: string;

  // Actions
  toggleChat: () => void;
  addMessage: (message: ChatMessage) => void;
  updateStreamingContent: (content: string) => void;
  setTyping: (typing: boolean) => void;
  clearMessages: () => void;
}
```

### settingsStore.ts
```typescript
interface SettingsState {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;

  // Actions
  updateSettings: (settings: Partial<SettingsState>) => Promise<void>;
  loadSettings: () => Promise<void>;
}
```

---

## 四、Tauri IPC 通信层

### services/tauri/todo.ts
```typescript
import { invoke } from '@tauri-apps/api/core';
import type { Todo, TodoUpdate, NewTodo, TodoFilter } from '@/types/todo';

export const todoService = {
  async getAll(filter?: TodoFilter): Promise<Todo[]> {
    return invoke('get_todos', { filter });
  },

  async create(text: string, priority?: string): Promise<Todo> {
    return invoke('create_todo', { text, priority });
  },

  async update(id: string, updates: TodoUpdate): Promise<Todo> {
    return invoke('update_todo', { id, updates });
  },

  async delete(id: string): Promise<void> {
    return invoke('delete_todo', { id });
  },

  async batchCreate(todos: NewTodo[]): Promise<Todo[]> {
    return invoke('batch_create_todos', { todos });
  },

  async getStatistics(): Promise<TodoStatistics> {
    return invoke('get_todo_statistics');
  }
};
```

### services/tauri/ai.ts
```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AiChatRequest, AiChatResponse, ChatMessage } from '@/types/chat';

export const aiService = {
  async chat(request: AiChatRequest): Promise<AiChatResponse> {
    return invoke('ai_chat', { request });
  },

  async chatStream(
    request: AiChatRequest,
    onChunk: (content: string) => void,
    onFunctionCall?: (name: string, result: unknown) => void
  ): Promise<void> {
    // 监听流式事件
    const unlisten = await listen<{ content?: string; function_call?: { name: string; result: unknown } }>(
      'ai-stream-chunk',
      (event) => {
        if (event.payload.content) {
          onChunk(event.payload.content);
        }
        if (event.payload.function_call && onFunctionCall) {
          onFunctionCall(event.payload.function_call.name, event.payload.function_call.result);
        }
      }
    );

    try {
      await invoke('ai_chat_stream', { request });
    } finally {
      unlisten();
    }
  }
};
```

---

## 五、类型定义

### types/todo.ts
```typescript
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high';

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  status: TodoStatus;
  priority: Priority;
  dueDate?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TodoUpdate {
  text?: string;
  completed?: boolean;
  status?: TodoStatus;
  priority?: Priority;
  dueDate?: string;
  tags?: string[];
}

export interface NewTodo {
  text: string;
  priority?: Priority;
  dueDate?: string;
  tags?: string[];
}

export interface TodoFilter {
  status?: TodoStatus;
  completed?: boolean;
  priority?: Priority;
  search?: string;
  tag?: string;
}

export interface TodoStatistics {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  cancelled: number;
  byPriority: Record<Priority, number>;
}
```

### types/chat.ts
```typescript
export type MessageRole = 'system' | 'user' | 'assistant' | 'function';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  functionCall?: {
    name: string;
    arguments: string;
  };
  functionName?: string;
  createdAt: string;
}

export interface AiChatRequest {
  message: string;
  history?: ChatMessage[];
}

export interface AiChatResponse {
  message: string;
  functionResults?: FunctionResult[];
  updatedTodos?: Todo[];
}

export interface FunctionResult {
  functionName: string;
  success: boolean;
  result: unknown;
}
```

### types/settings.ts
```typescript
export interface Settings {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  apiBaseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: ''
};

export const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder']
  },
  moonshot: {
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  },
  zhipu: {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4', 'glm-4-flash']
  }
};
```

---

## 六、依赖安装

```bash
# 状态管理
pnpm add zustand

# 图标库
pnpm add lucide-react

# CSS
pnpm add -D tailwindcss postcss autoprefixer

# 工具库
pnpm add clsx

# 开发依赖
pnpm add -D @types/node
```

---

## 七、配置文件更新

### vite.config.ts
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
```

### tsconfig.json (paths 部分)
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### tailwind.config.js
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: '#F7F7F5',
        foreground: '#37352F',
      },
    },
  },
  plugins: [],
}
```

---

## 八、实现优先级

### P0 - 核心功能
- types/ 类型定义
- services/tauri/ IPC 封装
- store/ 状态管理
- TodoItem, TodoList, TodoInput

### P1 - 主要功能
- Header, ViewSwitcher, MainLayout
- ListView, SettingsView
- 基础样式和配置

### P2 - AI 功能
- ChatPanel 及子组件
- useChat Hook
- 流式响应处理

### P3 - 完善
- SummaryView
- 动画效果
- QuickActions
