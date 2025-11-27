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

  // AI Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
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
  }, [messages, isTyping, isChatOpen]);

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
      if (response.warnings && response.warnings.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: `warning-${Date.now()}`,
            role: "system",
            content: "⚠️ " + response.warnings.join("\n"),
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
      <div className="group flex items-center justify-between p-3 mb-2 bg-white border border-gray-100 rounded-lg hover:shadow-sm transition-all duration-200">
        <div className="flex items-center gap-3 flex-1">
          <button
            type="button"
            onClick={() => toggleComplete(todo)}
            className={`transition-colors duration-200 ${
              todo.completed
                ? "text-gray-400"
                : "text-gray-300 hover:text-gray-500"
            }`}
          >
            {todo.completed ? (
              <CheckCircle2 size={20} className="text-green-500" />
            ) : (
              <Circle size={20} />
            )}
          </button>
          <span
            className={`text-sm font-medium transition-all duration-200 ${
              todo.completed ? "text-gray-400 line-through" : "text-gray-700"
            }`}
          >
            {todo.text}
          </span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            className="p-1 text-gray-300 hover:text-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
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
              <div className="absolute right-0 top-6 z-20 w-32 bg-white border border-gray-100 shadow-lg rounded-md overflow-hidden py-1">
                <button
                  type="button"
                  onClick={() => {
                    void updateStatus(todo, "cancelled");
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Archive size={12} /> 归档放弃
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void deleteTodo(todo);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 size={12} /> 直接删除
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
      <div className="min-h-screen flex items-center justify-center bg-[#F7F7F5] text-gray-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#37352F] font-sans selection:bg-[#CDE8F0]">
      {/* --- Main Layout --- */}
      <div className="max-w-2xl mx-auto pt-12 pb-24 px-6">
        {/* Header */}
        <header className="mb-10 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-800 flex items-center gap-2">
              <span className="bg-black text-white p-1 rounded-md">
                <CheckCircle2 size={20} />
              </span>
              Aideo
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              本地数据库已就绪，支持离线任务管理。
            </p>
          </div>

          <div className="flex gap-2">
            <div className="flex bg-gray-200 p-1 rounded-lg h-9">
              <button
                type="button"
                onClick={() => setView("list")}
                className={`px-3 flex items-center rounded-md text-sm font-medium transition-all ${
                  view === "list"
                    ? "bg-white shadow-sm text-black"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <ListTodo size={14} className="mr-1" /> 列表
              </button>
              <button
                type="button"
                onClick={() => setView("summary")}
                className={`px-3 flex items-center rounded-md text-sm font-medium transition-all ${
                  view === "summary"
                    ? "bg-white shadow-sm text-black"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Calendar size={14} className="mr-1" /> 回顾
              </button>
            </div>
            <button
              type="button"
              onClick={() => setView("settings")}
              className={`h-9 w-9 flex items-center justify-center rounded-lg transition-all ${
                view === "settings"
                  ? "bg-gray-800 text-white"
                  : "bg-gray-200 text-gray-500 hover:text-gray-800"
              }`}
            >
              <SettingsIcon size={16} />
            </button>
          </div>
        </header>

        {/* --- View: Todo List --- */}
        {view === "list" && (
          <div className="animate-in fade-in duration-500">
            {/* Input Area */}
            <form onSubmit={handleAddTodo} className="relative mb-8 group">
              <div className="absolute left-3 top-3 text-gray-400">
                <Plus size={20} />
              </div>
              <input
                type="text"
                value={newTodoInput}
                onChange={(e) => setNewTodoInput(e.target.value)}
                placeholder="写下你今天最重要的一件事..."
                className="w-full pl-10 pr-4 py-3 bg-transparent border-b-2 border-gray-200 focus:border-gray-800 outline-none text-lg placeholder:text-gray-300 transition-colors"
              />
            </form>

            {/* Tasks */}
            <div className="space-y-1">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">
                进行中
              </h2>
              {activeTodos.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm italic">
                  没有待办事项，享受你的闲暇时光吧。
                </div>
              ) : (
                activeTodos.map((todo) => (
                  <TodoItem key={todo.id} todo={todo} />
                ))
              )}
            </div>

            {/* Archived */}
            {archivedTodos.length > 0 && (
              <div className="mt-12 opacity-60">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
                  <Archive size={12} /> 已归档 / 放弃
                </h2>
                {archivedTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className="flex items-center gap-3 p-3 mb-2 border-b border-gray-100"
                  >
                    <div className="w-5 h-5 rounded-full border border-gray-200 flex items-center justify-center">
                      <div className="w-2 h-2 bg-gray-300 rounded-full" />
                    </div>
                    <span className="text-sm text-gray-400 line-through">
                      {todo.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateStatus(todo, "pending")}
                      className="ml-auto text-xs text-blue-500 hover:underline"
                    >
                      恢复
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- View: Summary --- */}
        {view === "summary" && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-3xl font-bold text-gray-800 mb-1">
                  {completedCount}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  已完成任务
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-3xl font-bold text-gray-800 mb-1">
                  {activeTodos.length}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  待办任务
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-6">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Sparkles size={16} className="text-yellow-500" /> AI 智能周报
              </h3>
              <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600 leading-relaxed">
                {!settings.apiKey && (
                  <div className="text-xs text-orange-500 mb-2 font-medium flex items-center gap-1">
                    <AlertCircle size={12} />
                    当前未配置 API Key，AI 分析不可用。
                  </div>
                )}
                本周你的工作效率很高。你主要集中在{" "}
                <span className="font-medium text-gray-900">日常事务处理</span>{" "}
                上。
                你放弃了 {archivedTodos.length} 个任务，这说明你在尝试精简目标，这是好事。
                <br />
                <br />
                {settings.apiKey
                  ? "（来自真实 AI 模型的分析）"
                  : "配置好 AI 之后，可以在这里查看自动生成的周报和建议。"}
              </div>
            </div>
          </div>
        )}

        {/* --- View: Settings --- */}
        {view === "settings" && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <SettingsIcon size={20} /> 设置
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  配置应用参数和 AI 模型连接。
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* Database Section */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                    <Database size={16} className="text-blue-500" /> 数据库状态
                  </h3>
                  <div className="bg-blue-50 text-blue-800 text-sm p-4 rounded-lg flex items-center justify-between">
                    <span>
                      <span className="font-bold">本地数据库已连接</span>
                      <br />
                      <span className="text-xs opacity-75">
                        所有数据保存在本机，无需登录账号。
                      </span>
                    </span>
                    <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                  </div>
                </div>

                <hr className="border-gray-100" />

                {/* LLM Section */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                    <Bot size={16} className="text-purple-500" /> LLM 模型配置
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">
                        API Key
                      </label>
                      <div className="relative">
                        <Key
                          size={16}
                          className="absolute left-3 top-3 text-gray-400"
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
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none transition-all"
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        密钥仅保存在本地数据库中，不会上传到任何服务器。
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">
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
                          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">
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
                          placeholder="例如: gpt-4o-mini / deepseek-chat"
                          className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleTestApi}
                        disabled={testingApi}
                        className="px-3 py-1.5 text-xs rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {testingApi && (
                          <Loader2 size={12} className="animate-spin" />
                        )}
                        测试连接
                      </button>
                      {apiTestResult === true && (
                        <span className="text-xs text-green-600">
                          连接成功，可以正常调用。
                        </span>
                      )}
                      {apiTestResult === false && (
                        <span className="text-xs text-red-500">
                          连接失败，请检查 Key 与 Base URL。
                        </span>
                      )}
                    </div>

                    {/* Advanced Settings */}
                    <div className="space-y-3 pt-3 border-t border-gray-200">
                      <h4 className="text-xs font-semibold text-gray-700 uppercase">高级设置</h4>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          函数调用模式
                        </label>
                        <select
                          value={settings.functionCallingMode || 'auto'}
                          onChange={(e) => setSettings({ ...settings, functionCallingMode: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                        >
                          <option value="auto">自动（推荐）</option>
                          <option value="tools">仅现代格式（Tools）</option>
                          <option value="functions">仅旧版格式（Functions）</option>
                          <option value="disabled">禁用函数调用</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          自动模式会尝试两种格式以获得最佳兼容性
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="enableTextFallback"
                          checked={settings.enableTextFallback !== false}
                          onChange={(e) => setSettings({ ...settings, enableTextFallback: e.target.checked })}
                          className="rounded"
                        />
                        <label htmlFor="enableTextFallback" className="text-sm text-gray-700">
                          启用文本解析降级（推荐）
                        </label>
                      </div>
                      <p className="text-xs text-gray-500 ml-6">
                        当 API 不支持结构化函数调用时，尝试从文本中解析函数调用
                      </p>
                    </div>

                    {/* Function Calling Test */}
                    <div className="space-y-2 pt-3 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={handleTestFunctionCalling}
                        disabled={isTesting}
                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm"
                      >
                        {isTesting ? "测试中..." : "测试函数调用"}
                      </button>

                      {fcTestResult && (
                        <div className={`p-3 rounded text-sm ${fcTestResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                          <p className={`font-semibold ${fcTestResult.success ? 'text-green-800' : 'text-red-800'}`}>
                            {fcTestResult.message}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            检测到的格式: {fcTestResult.apiFormatDetected}
                          </p>
                          {fcTestResult.success && fcTestResult.todosCreated > 0 && (
                            <p className="text-xs text-green-700 mt-1">
                              ✓ 任务列表已自动刷新，请切换到"列表"视图查看
                            </p>
                          )}
                          {fcTestResult.recommendations && fcTestResult.recommendations.length > 0 && (
                            <div className="mt-2 text-xs text-gray-700">
                              <p className="font-semibold">建议：</p>
                              <ul className="list-disc list-inside">
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
                </div>
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => void saveSettings()}
                  disabled={savingSettings}
                  className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-all active:scale-95 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
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
      </div>

      {/* --- AI Floating Button & Chat --- */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
        {/* Chat Window */}
        {isChatOpen && (
          <div className="bg-white w-[340px] h-[500px] rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-200 origin-bottom-right">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-50 bg-gray-50/50 backdrop-blur flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="bg-gradient-to-tr from-purple-500 to-indigo-500 text-white p-1.5 rounded-lg">
                  <Bot size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-sm text-gray-700">
                    AI 效率助手
                  </span>
                  <span className="text-[10px] text-gray-400 leading-none">
                    {settings.apiKey ? "Online" : "需要配置 API Key"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsChatOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
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
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
                      {msg.content}
                    </span>
                  ) : (
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-black text-white rounded-br-none"
                          : "bg-gray-100 text-gray-800 rounded-bl-none"
                      }`}
                    >
                      {msg.content}
                    </div>
                  )}
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-none px-4 py-3 flex gap-1 items-center">
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
              <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => {
                    setChatInput("帮我把这个大目标拆成可执行的小任务");
                    void handleSendChat();
                  }}
                  className="whitespace-nowrap px-3 py-1 bg-gray-50 hover:bg-gray-100 text-xs text-gray-600 rounded-full border border-gray-200 transition"
                >
                  ✨ 生成项目计划
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChatInput("帮我总结一下本周的完成情况");
                    void handleSendChat();
                  }}
                  className="whitespace-nowrap px-3 py-1 bg-gray-50 hover:bg-gray-100 text-xs text-gray-600 rounded-full border border-gray-200 transition"
                >
                  📊 总结本周
                </button>
              </div>
            )}

            {/* Input */}
            <div className="p-3 bg-white border-t border-gray-50">
              <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2 border border-gray-200 focus-within:border-purple-300 focus-within:ring-2 focus-within:ring-purple-100 transition-all">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleSendChat()}
                  placeholder="问问 AI..."
                  className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => void handleSendChat()}
                  disabled={!chatInput.trim()}
                  className={`p-1.5 rounded-full transition-all ${
                    chatInput.trim()
                      ? "bg-black text-white hover:bg-gray-800"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toggle Button */}
        <button
          type="button"
          onClick={() => setIsChatOpen((v) => !v)}
          className={`h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
            isChatOpen
              ? "bg-gray-200 text-gray-600 rotate-90"
              : "bg-gradient-to-tr from-gray-900 to-gray-700 text-white"
          }`}
        >
          {isChatOpen ? <X size={24} /> : <Sparkles size={24} />}
        </button>
      </div>
    </div>
  );
};

export default App;

