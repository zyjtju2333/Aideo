import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Archive,
  CheckCircle2,
  Circle,
  Bot,
  X,
  Send,
  Sparkles,
  ListTodo,
  Calendar,
  Settings as SettingsIcon,
  Database,
  Key,
  Save,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { aiService, settingsService, todoService } from "@/services/tauri";
import type { Todo } from "@/types/todo";
import type { Settings } from "@/types/settings";
import type { AiChatRequest, ApiChatMessage, UiMessage } from "@/types/chat";

type View = "list" | "summary" | "settings";
type OverlayState = "chat" | null;

const App: React.FC = () => {
  // --- State ---
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [newTodoInput, setNewTodoInput] = useState("");

  const [settings, setSettings] = useState<Settings>({
    apiKey: "",
    apiBaseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<boolean | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [fcTestResult, setFcTestResult] = useState<any>(null);

  // Overlay State (AI chat, etc.)
  const [overlay, setOverlay] = useState<OverlayState>(null);

  // AI Chat State
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "你好！我是你的 AI 助手，可以帮你拆解任务和做周期回顾。",
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // --- Init ---
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const [loadedTodos, loadedSettings] = await Promise.all([
          todoService.getAll().catch(() => []),
          settingsService.get().catch(() => null),
        ]);
        setTodos(loadedTodos);
        if (loadedSettings) {
          setSettings(loadedSettings);
        }
      } catch (err) {
        console.error("Init error", err);
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, overlay]);

  // --- Derived ---
  const activeTodos = todos.filter(
    (t) => !t.completed && t.status !== "cancelled",
  );
  const archivedTodos = todos.filter((t) => t.status === "cancelled");
  const completedCount = todos.filter((t) => t.completed).length;

  // --- Todo Handlers ---
  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTodoInput.trim();
    if (!text) return;

    try {
      const created = await todoService.create(text, "medium");
      setTodos((prev) => [created, ...prev]);
      setNewTodoInput("");
    } catch (err) {
      console.error("Error creating todo", err);
    }
  };

  const handleBatchAddTodos = async (actions: { text: string }[]) => {
    if (!actions.length) return;
    try {
      const created = await todoService.batchCreate(
        actions.map((a) => ({
          text: a.text,
          priority: "medium",
          tags: [],
        })),
      );
      setTodos((prev) => [...created, ...prev]);
    } catch (err) {
      console.error("Error batch creating todos", err);
    }
  };
  // referenced to keep for future AI 批量创建任务集成
  void handleBatchAddTodos;

  const toggleComplete = async (todo: Todo) => {
    try {
      const updated = await todoService.update(todo.id, {
        completed: !todo.completed,
        status: !todo.completed ? "completed" : "pending",
      });
      setTodos((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
    } catch (err) {
      console.error("Error toggling todo", err);
    }
  };

  const updateStatus = async (todo: Todo, newStatus: "cancelled" | "pending") => {
    try {
      const updated = await todoService.update(todo.id, {
        status: newStatus,
      });
      setTodos((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
    } catch (err) {
      console.error("Error updating status", err);
    }
  };

  const deleteTodo = async (todo: Todo) => {
    try {
      await todoService.delete(todo.id);
      setTodos((prev) => prev.filter((t) => t.id !== todo.id));
    } catch (err) {
      console.error("Error deleting todo", err);
    }
  };

  const loadTodos = async () => {
    try {
      const loadedTodos = await todoService.getAll();
      setTodos(loadedTodos);
    } catch (err) {
      console.error("Error loading todos", err);
    }
  };

  // --- Settings Handlers ---
  const saveSettings = async () => {
    try {
      setSavingSettings(true);
      await settingsService.save(settings);
      setView("list");
    } catch (err) {
      console.error("Save settings failed", err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestApi = async () => {
    try {
      setTestingApi(true);
      setApiTestResult(null);
      const ok = await settingsService.testApiConnection(settings);
      setApiTestResult(ok);
    } catch (err) {
      console.error("Test API failed", err);
      setApiTestResult(false);
    } finally {
      setTestingApi(false);
    }
  };

  const handleTestFunctionCalling = async () => {
    setIsTesting(true);
    try {
      const result = await settingsService.testFunctionCalling();
      setFcTestResult(result);

      // 如果测试成功，刷新任务列表
      if (result.success && result.todosCreated > 0) {
        await loadTodos();
      }
    } catch (error) {
      console.error("Function calling test failed:", error);
      setFcTestResult({
        success: false,
        message: "测试失败",
        recommendations: ["发生错误，请查看控制台"],
      });
    } finally {
      setIsTesting(false);
    }
  };

  // --- AI Chat ---
  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text) return;

    const userMsg: UiMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsTyping(true);

    try {
      const history: ApiChatMessage[] = messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : m.role,
        content: m.content,
      }));

      const request: AiChatRequest = {
        message: text,
        history,
      };

      const response = await aiService.chat(request);
      setIsTyping(false);

      const aiMsg: UiMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.message,
      };

      setMessages((prev) => [...prev, aiMsg]);

      // Display warnings if any
      const warnings = response.warnings ?? [];
      if (warnings.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: `warning-${Date.now()}`,
            role: "system",
            content: "⚠️ " + warnings.join("\n"),
          },
        ]);
      }

      if (response.updatedTodos && Array.isArray(response.updatedTodos)) {
        setTodos(response.updatedTodos);
        setMessages((prev) => [
          ...prev,
          {
            id: `system-${Date.now()}`,
            role: "system",
            content: "✓ 任务列表已根据 AI 建议更新。",
          },
        ]);
      }
    } catch (error: unknown) {
      setIsTyping(false);
      const msg =
        typeof error === "string"
          ? error
          : (error as { message?: string })?.message ?? "";

      const hint =
        msg.includes("MISSING_API_KEY") || msg.toLowerCase().includes("api key")
          ? "请先在「设置」中配置 API Key，再使用 AI 功能。"
          : `AI 调用失败：${msg || "请检查网络和设置。"}`;

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: hint,
        },
      ]);
    }
  };

  // --- Components ---
  const TodoItem: React.FC<{ todo: Todo }> = ({ todo }) => {
    const [showMenu, setShowMenu] = useState(false);

    return (
      <div
        className={`group relative flex items-center justify-between p-3 mb-2 bg-white rounded-xl border border-transparent transition-all duration-200 ${
          todo.completed
            ? "bg-gray-50/50"
            : "hover:shadow-md hover:border-gray-100 hover:-translate-y-[1px]"
        }`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => toggleComplete(todo)}
            className={`relative flex-shrink-0 w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center transition-all duration-300 ${
              todo.completed
                ? "bg-black border-black text-white scale-100"
                : "border-gray-300 hover:border-gray-500 text-transparent scale-95 hover:scale-100"
            }`}
          >
            <CheckCircle2 size={12} strokeWidth={3} className={`transition-transform duration-300 ${todo.completed ? "scale-100" : "scale-0"}`} />
          </button>
          <span
            className={`text-sm font-medium transition-all duration-300 truncate ${
              todo.completed
                ? "text-gray-400 line-through decoration-gray-200"
                : "text-gray-700"
            }`}
          >
            {todo.text}
          </span>
        </div>

        <div className="relative ml-2">
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            className={`p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-all ${showMenu ? 'opacity-100 bg-gray-100 text-gray-600' : 'opacity-0 group-hover:opacity-100'}`}
          >
            <MoreHorizontal size={16} />
          </button>

          {showMenu && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-8 z-20 w-36 bg-white border border-gray-100 shadow-xl rounded-xl overflow-hidden p-1 animate-scale-in origin-top-right">
                <button
                  type="button"
                  onClick={() => {
                    void updateStatus(todo, "cancelled");
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Archive size={14} className="text-gray-400" /> 归档放弃
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void deleteTodo(todo);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Trash2 size={14} /> 直接删除
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F7F5] text-gray-400">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#F7F7F5] text-[#37352F] font-sans selection:bg-[#CDE8F0] flex flex-col overflow-hidden">
      {/* --- Main Layout --- */}
      <div className="flex flex-col h-full px-4">
        {/* Header */}
        <header className="mb-8 pt-6 flex items-center justify-between flex-shrink-0 px-2">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-3">
              <span className="bg-black text-white p-1.5 rounded-xl shadow-lg shadow-black/10">
                <CheckCircle2 size={20} strokeWidth={2.5} />
              </span>
              Aideo
            </h1>
            <p className="text-gray-400 text-[11px] font-medium mt-1 ml-1 hidden sm:block tracking-wide">
              FOCUS ON WHAT MATTERS
            </p>
          </div>

          <div className="flex gap-3">
            <div className="flex bg-white border border-gray-100 p-1 rounded-xl shadow-sm h-10">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`px-3 flex items-center rounded-lg text-xs font-medium transition-all duration-300 ${
                  view === "list"
                    ? "bg-black text-white shadow-md"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                }`}
              >
                <ListTodo size={14} className="mr-1.5" /> 列表
              </button>
              <button
                type="button"
                onClick={() => setView("summary")}
                className={`px-3 flex items-center rounded-lg text-xs font-medium transition-all duration-300 ${
                  view === "summary"
                    ? "bg-black text-white shadow-md"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Calendar size={14} className="mr-1.5" /> 回顾
              </button>
            </div>
            <button
              type="button"
              onClick={() => setView("settings")}
              className={`h-10 w-10 flex items-center justify-center rounded-xl border transition-all duration-300 ${
                view === "settings"
                  ? "bg-white border-gray-200 text-black shadow-sm"
                  : "bg-white border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50"
              }`}
            >
              <SettingsIcon size={18} />
            </button>
          </div>
        </header>

        {/* --- Main Content --- */}
        <main className="flex-1 overflow-y-auto pb-12">
          {/* --- View: Todo List --- */}
          {view === "list" && (
            <div className="animate-in fade-in duration-500 max-w-3xl mx-auto">
            {/* Input Area */}
            <form onSubmit={handleAddTodo} className="relative mb-8 group">
              <div className="absolute left-4 top-4 text-gray-400 transition-colors group-focus-within:text-black">
                <Plus size={20} />
              </div>
              <input
                type="text"
                value={newTodoInput}
                onChange={(e) => setNewTodoInput(e.target.value)}
                placeholder="写下你今天最重要的一件事..."
                className="w-full pl-12 pr-4 py-4 bg-white rounded-2xl border-none shadow-sm hover:shadow-md focus:shadow-lg placeholder:text-gray-300 text-base transition-all duration-300 outline-none ring-1 ring-gray-100 focus:ring-2 focus:ring-black/5"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-focus-within:opacity-100 transition-all duration-300 scale-90 group-focus-within:scale-100">
                 <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-md">Enter</span>
              </div>
            </form>

            {/* Tasks */}
            <div className="space-y-1 pb-20">
              <div className="flex items-center justify-between mb-4 px-2">
                 <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                  进行中
                </h2>
                <span className="text-[10px] font-medium text-gray-300 bg-gray-100 px-2 py-0.5 rounded-full">
                   {activeTodos.length}
                </span>
              </div>
              
              {activeTodos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 animate-in fade-in zoom-in duration-500">
                  <div className="w-24 h-24 bg-white rounded-full shadow-sm flex items-center justify-center mb-2">
                     <Sparkles size={32} className="text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-gray-800 font-medium">没有待办事项</p>
                    <p className="text-gray-400 text-xs mt-1">享受你的闲暇时光，或者规划新的目标。</p>
                  </div>
                </div>
              ) : (
                activeTodos.map((todo) => (
                  <TodoItem key={todo.id} todo={todo} />
                ))
              )}

            {/* Archived */}
            {archivedTodos.length > 0 && (
              <div className="mt-16 pt-8 border-t border-gray-200/50 opacity-80">
                <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4 px-2 flex items-center gap-2">
                  <Archive size={12} /> 已归档 / 放弃
                </h2>
                <div className="space-y-1">
                {archivedTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/50 transition-colors duration-200"
                  >
                    <div className="w-2 h-2 rounded-full bg-gray-200 group-hover:bg-gray-300 transition-colors" />
                    <span className="text-xs text-gray-400 line-through decoration-gray-200 flex-1 truncate">
                      {todo.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateStatus(todo, "pending")}
                      className="px-2 py-1 text-[10px] font-medium text-gray-400 hover:text-black hover:bg-white rounded-md border border-transparent hover:border-gray-100 hover:shadow-sm transition-all opacity-0 group-hover:opacity-100"
                    >
                      恢复
                    </button>
                  </div>
                ))}
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {/* --- View: Summary --- */}
        {view === "summary" && (
          <div className="animate-slide-in-bottom max-w-3xl mx-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-6 px-1">本周概览</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                   <CheckCircle2 size={64} className="text-green-500" />
                </div>
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest z-10">
                  已完成
                </div>
                <div className="text-4xl font-bold text-gray-900 z-10">
                  {completedCount}
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-32 relative overflow-hidden group hover:shadow-md transition-all">
                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                   <Circle size={64} className="text-blue-500" />
                </div>
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest z-10">
                  待办中
                </div>
                <div className="text-4xl font-bold text-gray-900 z-10">
                  {activeTodos.length}
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-white to-purple-50/50 p-6 rounded-2xl border border-purple-100/50 shadow-sm mb-4 relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-purple-200/20 rounded-full blur-3xl -mr-10 -mt-10" />
              
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 relative z-10">
                <Sparkles size={16} className="text-purple-500" /> AI 智能周报
              </h3>
              
              <div className="bg-white/60 backdrop-blur-sm border border-white/50 p-5 rounded-xl text-sm text-gray-600 leading-relaxed relative z-10 shadow-sm">
                {!settings.apiKey && (
                  <div className="text-xs text-orange-600 bg-orange-50 border border-orange-100 px-3 py-2 rounded-lg mb-3 font-medium flex items-center gap-2">
                    <AlertCircle size={14} />
                    当前未配置 API Key，AI 分析不可用。
                  </div>
                )}
                <div className="prose prose-sm max-w-none text-gray-600">
                    <p>
                    本周你的工作效率很高。你主要集中在{" "}
                    <span className="font-semibold text-gray-900 bg-purple-100/50 px-1 rounded">日常事务处理</span>{" "}
                    上。
                    你放弃了 {archivedTodos.length} 个任务，这说明你在尝试精简目标，这是好事。
                    </p>
                    <p className="mt-2 text-xs text-gray-400 italic">
                    {settings.apiKey
                    ? "（来自真实 AI 模型的分析）"
                    : "配置好 AI 之后，可以在这里查看自动生成的周报和建议。"}
                    </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- View: Settings --- */}
        {view === "settings" && (
          <div className="animate-slide-in-bottom max-w-3xl mx-auto pb-20">
             <h2 className="text-lg font-bold text-gray-900 mb-6 px-1">设置</h2>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="p-6 border-b border-gray-50">
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <Database size={18} />
                  </div>
                  <h3 className="font-bold text-gray-900">数据库状态</h3>
                </div>
                <p className="text-xs text-gray-500 ml-11">
                  您的数据安全地存储在本地。
                </p>
              </div>
               <div className="px-6 py-4 bg-gray-50/50 flex items-center justify-between">
                    <span className="text-xs text-gray-600 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
                      本地数据库已连接
                    </span>
               </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-50">
                <div className="flex items-center gap-3 mb-1">
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                    <Bot size={18} />
                  </div>
                  <h3 className="font-bold text-gray-900">LLM 模型配置</h3>
                </div>
                 <p className="text-xs text-gray-500 ml-11">
                  配置 AI 助手以启用智能建议和周报功能。
                </p>
              </div>

              <div className="p-6 space-y-5">
                <div>
                    <label className="block text-[11px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                    API Key
                    </label>
                    <div className="relative group">
                    <Key
                        size={16}
                        className="absolute left-3.5 top-3 text-gray-300 group-focus-within:text-purple-500 transition-colors"
                    />
                    <input
                        type="password"
                        value={settings.apiKey}
                        onChange={(e) =>
                        setSettings((prev) => ({
                            ...prev,
                            apiKey: e.target.value,
                        }))
                        }
                        placeholder="输入 OpenAI / DeepSeek 等服务的 API Key..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-50 outline-none transition-all placeholder:text-gray-300"
                    />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5 ml-1">
                    密钥仅保存在本地数据库中，不会上传到任何服务器。
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                    <label className="block text-[11px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                        Base URL
                    </label>
                    <input
                        type="text"
                        value={settings.apiBaseUrl}
                        onChange={(e) =>
                        setSettings((prev) => ({
                            ...prev,
                            apiBaseUrl: e.target.value,
                        }))
                        }
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-50 outline-none transition-all placeholder:text-gray-300"
                    />
                    </div>
                    <div>
                    <label className="block text-[11px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                        模型名称 (Model)
                    </label>
                    <input
                        type="text"
                        value={settings.model}
                        onChange={(e) =>
                        setSettings((prev) => ({
                            ...prev,
                            model: e.target.value,
                        }))
                        }
                        placeholder="例如: gpt-4o-mini"
                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-50 outline-none transition-all placeholder:text-gray-300"
                    />
                    </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                    <button
                    type="button"
                    onClick={handleTestApi}
                    disabled={testingApi}
                    className="px-4 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                    >
                    {testingApi ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <span className="w-2 h-2 rounded-full bg-gray-400" />
                    )}
                    测试连接
                    </button>
                    {apiTestResult === true && (
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1 animate-in fade-in">
                         <CheckCircle2 size={14} /> 连接成功
                    </span>
                    )}
                    {apiTestResult === false && (
                    <span className="text-xs text-red-500 font-medium flex items-center gap-1 animate-in fade-in">
                        <AlertCircle size={14} /> 连接失败
                    </span>
                    )}
                </div>

                {/* Advanced Settings */}
                <div className="border-t border-gray-100 pt-4">
                    <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer select-none text-gray-500 hover:text-gray-800 transition-colors">
                        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                         高级设置
                        </span>
                         <div className="p-1 rounded hover:bg-gray-100">
                            <MoreHorizontal size={16} />
                         </div>
                    </summary>

                    <div className="mt-4 space-y-5 pl-1 animate-in fade-in slide-in-from-top-2">
                        <div>
                        <label className="block text-[11px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                            函数调用模式 (Function Calling)
                        </label>
                        <div className="relative">
                            <select
                                value={settings.functionCallingMode || "auto"}
                                onChange={(e) =>
                                setSettings({
                                    ...settings,
                                    functionCallingMode: e.target.value,
                                })
                                }
                                className="w-full pl-3 pr-10 py-2.5 bg-white border border-gray-200 rounded-xl text-sm appearance-none focus:border-purple-500 focus:ring-2 focus:ring-purple-50 outline-none"
                            >
                                <option value="auto">自动（推荐）</option>
                                <option value="tools">仅现代格式（Tools）</option>
                                <option value="functions">仅旧版格式（Functions）</option>
                                <option value="disabled">禁用函数调用</option>
                            </select>
                            <div className="absolute right-3 top-3 pointer-events-none text-gray-400">
                                <Bot size={14} />
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">
                            自动模式会尝试两种格式以获得最佳兼容性
                        </p>
                        </div>

                        <div className="flex items-start gap-3">
                             <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    id="enableTextFallback"
                                    checked={settings.enableTextFallback !== false}
                                    onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        enableTextFallback: e.target.checked,
                                    })
                                    }
                                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                />
                             </div>
                            <div>
                                <label
                                    htmlFor="enableTextFallback"
                                    className="text-sm font-medium text-gray-700 cursor-pointer select-none"
                                >
                                    启用文本解析降级（推荐）
                                </label>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                    当 API 不支持结构化函数调用时，尝试从文本中解析指令。
                                </p>
                            </div>
                        </div>
                        
                         {/* Function Calling Test */}
                         <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                             <div className="flex items-center justify-between mb-2">
                                 <span className="text-xs font-semibold text-gray-600">调试工具</span>
                                 <button
                                    type="button"
                                    onClick={handleTestFunctionCalling}
                                    disabled={isTesting}
                                    className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:border-purple-300 hover:text-purple-600 text-xs transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                >
                                    {isTesting ? "测试中..." : "测试函数调用能力"}
                                </button>
                             </div>

                            {fcTestResult && (
                                <div className={`mt-3 p-3 rounded-lg text-xs border ${fcTestResult.success ? 'bg-green-50/50 border-green-200' : 'bg-red-50/50 border-red-200'} animate-in fade-in slide-in-from-top-1`}>
                                <p className={`font-semibold mb-1 ${fcTestResult.success ? 'text-green-800' : 'text-red-800'}`}>
                                    {fcTestResult.message}
                                </p>
                                <p className="text-gray-500 mb-1">
                                    检测格式: <span className="font-mono bg-white px-1 rounded border border-gray-100">{fcTestResult.apiFormatDetected}</span>
                                </p>
                                {fcTestResult.success && fcTestResult.todosCreated > 0 && (
                                    <p className="text-green-700 mt-1 flex items-center gap-1">
                                    <CheckCircle2 size={10} /> 任务列表已自动刷新
                                    </p>
                                )}
                                {fcTestResult.recommendations && fcTestResult.recommendations.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-gray-200/50 text-gray-600">
                                    <p className="font-semibold mb-1">建议：</p>
                                    <ul className="list-disc list-inside space-y-0.5 opacity-80">
                                        {fcTestResult.recommendations.map((rec: string, i: number) => (
                                        <li key={i}>{rec}</li>
                                        ))}
                                    </ul>
                                    </div>
                                )}
                                </div>
                            )}
                         </div>
                    </div>
                    </details>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveSettings()}
                  disabled={savingSettings}
                  className="flex items-center gap-2 px-6 py-2.5 bg-black text-white rounded-xl hover:bg-gray-800 transition-all active:scale-95 text-sm font-medium disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-black/10"
                >
                  {savingSettings && (
                    <Loader2 size={16} className="animate-spin" />
                  )}
                  <Save size={16} /> 保存配置
                </button>
              </div>
            </div>
          </div>
        )}
        </main>
      </div>

      {/* --- AI Chat Bottom Sheet & FAB --- */}
      {/* Chat Bottom Sheet */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-40
          bg-white/95 backdrop-blur-xl border-t border-gray-200/50 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]
          transition-transform duration-500 cubic-bezier(0.32, 0.72, 0, 1) will-change-transform
          rounded-t-[2rem]
          ${overlay === "chat" ? "translate-y-0" : "translate-y-[110%]"}
        `}
        style={{ height: "75vh" }}
      >
        <div className="h-full flex flex-col relative">
           {/* Handle bar for visual cue */}
           <div className="absolute -top-3 left-0 right-0 flex justify-center pointer-events-none">
             <div className="w-12 h-1.5 bg-gray-300/50 rounded-full backdrop-blur-sm" />
           </div>

          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-gray-100/50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-tr from-black to-gray-700 text-white p-2 rounded-xl shadow-lg shadow-gray-200">
                <Bot size={18} />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm text-gray-800">
                  AI 效率助手
                </span>
                <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${settings.apiKey ? 'bg-green-500' : 'bg-gray-300'}`} />
                  {settings.apiKey ? "Online" : "需要配置 API Key"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOverlay(null)}
              className="p-2 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-gray-50/30 scroll-smooth">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === "user"
                    ? "justify-end"
                    : msg.role === "system"
                      ? "justify-center"
                      : "justify-start"
                }`}
              >
                {msg.role === "system" ? (
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-3 py-1 rounded-full border border-gray-200/50">
                    {msg.content}
                  </span>
                ) : (
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      msg.role === "user"
                        ? "bg-black text-white rounded-br-none"
                        : "bg-white border border-gray-100 text-gray-700 rounded-bl-none"
                    }`}
                  >
                    {msg.content}
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-4 py-3 flex gap-1.5 items-center shadow-sm">
                  <div
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Actions */}
          {messages.length <= 1 && (
            <div className="px-6 pb-2 flex gap-2 overflow-x-auto no-scrollbar py-2">
              <button
                type="button"
                onClick={() => {
                  setChatInput("帮我把这个大目标拆成可执行的小任务");
                  void handleSendChat();
                }}
                className="flex-shrink-0 px-4 py-2 bg-white hover:bg-gray-50 text-xs text-gray-600 font-medium rounded-full border border-gray-200 transition-all hover:border-gray-300 hover:shadow-sm"
              >
                ✨ 生成项目计划
              </button>
              <button
                type="button"
                onClick={() => {
                  setChatInput("帮我总结一下本周的完成情况");
                  void handleSendChat();
                }}
                className="flex-shrink-0 px-4 py-2 bg-white hover:bg-gray-50 text-xs text-gray-600 font-medium rounded-full border border-gray-200 transition-all hover:border-gray-300 hover:shadow-sm"
              >
                📊 总结本周
              </button>
            </div>
          )}

          {/* Input */}
          <div className="p-4 bg-white border-t border-gray-100">
            <div className="flex items-center gap-3 bg-gray-50 rounded-[1.5rem] px-4 py-3 border border-transparent focus-within:bg-white focus-within:border-gray-200 focus-within:ring-4 focus-within:ring-gray-100 transition-all duration-300">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSendChat()}
                placeholder="输入指令或提问..."
                className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => void handleSendChat()}
                disabled={!chatInput.trim()}
                className={`p-2 rounded-full transition-all duration-300 ${
                  chatInput.trim()
                    ? "bg-black text-white hover:scale-105 shadow-md"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Background Overlay */}
      {overlay === "chat" && (
        <div
          className="fixed inset-0 bg-black/30 z-30 backdrop-blur-[2px] animate-in fade-in duration-500"
          onClick={() => setOverlay(null)}
        />
      )}

      {/* FAB Button */}
      <button
        type="button"
        onClick={() =>
          setOverlay((prev) => (prev === "chat" ? null : "chat"))
        }
        className={`fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-500 hover:scale-110 active:scale-90 ${
          overlay === "chat"
            ? "bg-white text-gray-800 rotate-90 hover:bg-gray-100"
            : "bg-black text-white hover:shadow-black/25"
        }`}
      >
        {overlay === "chat" ? <X size={24} /> : <Sparkles size={24} />}
      </button>
    </div>
  );
};

export default App;
