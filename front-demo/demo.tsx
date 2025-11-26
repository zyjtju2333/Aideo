import React, { useState, useEffect, useRef } from 'react';
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
  Layout,
  ListTodo,
  Calendar,
  Settings,
  Database,
  Key,
  Save,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';

// --- Firebase Init ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- AI Logic (Real + Sim) ---
const callAI = async (input, currentTodos, settings) => {
  const { apiKey, model } = settings;
  const lowerInput = input.toLowerCase();

  // 1. 如果没有 API Key，使用本地模拟逻辑
  if (!apiKey) {
    console.log("Using simulated AI response (No API Key provided)");
    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (lowerInput.includes('生成') || lowerInput.includes('计划') || lowerInput.includes('帮我')) {
      return {
        text: "（模拟模式）没问题，我已经为你把这个大目标拆解成了几个可执行的小任务（配置 API Key 可体验真实智能生成）：",
        actions: [
          { text: '调研相关竞品分析', completed: false, status: 'active' },
          { text: '草拟项目需求文档 (PRD)', completed: false, status: 'active' },
          { text: '设计初步 UI 原型', completed: false, status: 'active' },
        ],
        type: 'generation'
      };
    } else if (lowerInput.includes('总结') || lowerInput.includes('回顾')) {
      const completed = currentTodos.filter(t => t.completed).length;
      const pending = currentTodos.filter(t => !t.completed && t.status === 'active').length;
      return {
        text: `（模拟模式）本周工作小结：已完成 ${completed} 项，待办 ${pending} 项。建议优先处理高优先级事项。`,
        type: 'summary'
      };
    } else {
      return {
        text: "我是你的效率助手。你可以在“设置”中配置 API Key 来激活我的完全体。目前我可以模拟生成计划或总结。",
        type: 'chat'
      };
    }
  }

  // 2. 使用真实 API (以 Google Gemini 格式为例)
  try {
    const todoContext = JSON.stringify(currentTodos.map(t => ({ text: t.text, completed: t.completed, status: t.status })));
    const systemPrompt = `
      你是一个高效的 To-Do 助手。
      当前用户的任务列表是: ${todoContext}。
      
      请根据用户输入回复。
      
      规则:
      1. 如果用户让你"生成"或"计划"任务，请返回一个 JSON 对象，格式必须包含:
         { "response": "你的回复文字", "new_todos": ["任务1", "任务2", ...] }
         不要使用 Markdown 代码块，直接返回 JSON 字符串。
      2. 如果用户让你"总结"，请返回:
         { "response": "总结内容..." }
      3. 其他情况返回:
         { "response": "回复内容..." }
    `;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: systemPrompt + "\n用户输入: " + input }]
        }]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("API 返回为空");

    // 尝试清理 Markdown 标记 (```json ... ```)
    const cleanJson = rawText.replace(/```json|```/g, '').trim();
    
    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      // 如果解析失败，直接作为普通文本返回
      return { text: rawText, type: 'chat' };
    }

    if (parsed.new_todos && Array.isArray(parsed.new_todos)) {
      return {
        text: parsed.response,
        actions: parsed.new_todos.map(t => ({ text: t, completed: false, status: 'active' })),
        type: 'generation'
      };
    }

    return { text: parsed.response, type: 'chat' };

  } catch (err) {
    return {
      text: `AI 请求失败: ${err.message}。请检查设置中的 API Key 和网络。`,
      type: 'error'
    };
  }
};

export default function App() {
  // --- State ---
  const [user, setUser] = useState(null);
  const [todos, setTodos] = useState([]);
  const [newTodoInput, setNewTodoInput] = useState('');
  const [view, setView] = useState('list'); // 'list' | 'summary' | 'settings'
  const [loading, setLoading] = useState(true);

  // Settings State
  const [settings, setSettings] = useState({
    apiKey: '',
    model: 'gemini-1.5-flash'
  });
  
  // AI Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', content: '你好！我是你的 AI 助手。' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // --- Auth & Data Init ---
  useEffect(() => {
    // 1. Initialize Auth
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();

    // 2. Load Local Settings
    const savedSettings = localStorage.getItem('flowmind_settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    // 3. Auth Listener
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- Firestore Listener ---
  useEffect(() => {
    if (!user) return;

    const todosRef = collection(db, 'artifacts', appId, 'users', user.uid, 'todos');
    
    // 监听实时更新
    const unsubscribe = onSnapshot(todosRef, (snapshot) => {
      const todosData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // 客户端排序: 未完成在前，已完成在后，然后按创建时间倒序
      todosData.sort((a, b) => {
        if (a.completed === b.completed) {
          return (b.createdAt || 0) - (a.createdAt || 0);
        }
        return a.completed ? 1 : -1;
      });
      
      setTodos(todosData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // --- Handlers ---
  
  const handleAddTodo = async (e) => {
    e.preventDefault();
    if (!newTodoInput.trim() || !user) return;
    
    const newTodo = {
      text: newTodoInput,
      completed: false,
      status: 'active',
      createdAt: Date.now(),
      date: new Date().toISOString()
    };

    try {
      const docRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'todos'));
      await setDoc(docRef, newTodo);
      setNewTodoInput('');
    } catch (err) {
      console.error("Error adding todo:", err);
    }
  };

  const handleBatchAddTodos = async (newActions) => {
    if (!user) return;
    const batchPromises = newActions.map(action => {
      const docRef = doc(collection(db, 'artifacts', appId, 'users', user.uid, 'todos'));
      return setDoc(docRef, {
        ...action,
        createdAt: Date.now(),
        date: new Date().toISOString()
      });
    });
    await Promise.all(batchPromises);
  };

  const toggleComplete = async (todo) => {
    if (!user) return;
    const todoRef = doc(db, 'artifacts', appId, 'users', user.uid, 'todos', todo.id);
    await setDoc(todoRef, { completed: !todo.completed }, { merge: true });
  };

  const updateStatus = async (todo, newStatus) => {
    if (!user) return;
    const todoRef = doc(db, 'artifacts', appId, 'users', user.uid, 'todos', todo.id);
    if (newStatus === 'deleted') {
      await deleteDoc(todoRef);
    } else {
      await setDoc(todoRef, { status: newStatus }, { merge: true });
    }
  };

  const saveSettings = () => {
    localStorage.setItem('flowmind_settings', JSON.stringify(settings));
    setView('list'); // Save and go back
  };

  // AI Chat Logic
  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = { role: 'user', content: chatInput };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);

    try {
      const response = await callAI(userMsg.content, todos, settings);
      
      setIsTyping(false);
      setMessages(prev => [...prev, { role: 'ai', content: response.text }]);
      
      if (response.type === 'generation' && response.actions) {
        await handleBatchAddTodos(response.actions);
        // Add a system message confirming addition
        setMessages(prev => [...prev, { role: 'system', content: `✓ 已自动添加 ${response.actions.length} 个任务到列表` }]);
      }
    } catch (e) {
      setIsTyping(false);
      setMessages(prev => [...prev, { role: 'ai', content: "抱歉，出现了一些错误。" }]);
    }
  };

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping, isChatOpen]);

  // --- Derived State ---
  const activeTodos = todos.filter(t => t.status === 'active');
  const archivedTodos = todos.filter(t => t.status === 'archived');
  const completedCount = todos.filter(t => t.completed).length;

  // --- Components ---

  const TodoItem = ({ todo }) => {
    const [showMenu, setShowMenu] = useState(false);

    return (
      <div className="group flex items-center justify-between p-3 mb-2 bg-white border border-gray-100 rounded-lg hover:shadow-sm transition-all duration-200">
        <div className="flex items-center gap-3 flex-1">
          <button 
            onClick={() => toggleComplete(todo)}
            className={`transition-colors duration-200 ${todo.completed ? 'text-gray-400' : 'text-gray-300 hover:text-gray-500'}`}
          >
            {todo.completed ? <CheckCircle2 size={20} className="text-green-500" /> : <Circle size={20} />}
          </button>
          <span className={`text-sm font-medium transition-all duration-200 ${todo.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
            {todo.text}
          </span>
        </div>

        <div className="relative">
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 text-gray-300 hover:text-gray-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreHorizontal size={16} />
          </button>
          
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-6 z-20 w-32 bg-white border border-gray-100 shadow-lg rounded-md overflow-hidden py-1">
                <button 
                  onClick={() => updateStatus(todo, 'archived')}
                  className="w-full text-left px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Archive size={12} /> 归档放弃
                </button>
                <button 
                  onClick={() => updateStatus(todo, 'deleted')}
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
              <span className="bg-black text-white p-1 rounded-md"><CheckCircle2 size={20} /></span>
              FlowSpace
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {user ? '云端同步已开启' : '离线模式'}
            </p>
          </div>
          
          <div className="flex gap-2">
             <div className="flex bg-gray-200 p-1 rounded-lg h-9">
              <button 
                onClick={() => setView('list')}
                className={`px-3 flex items-center rounded-md text-sm font-medium transition-all ${view === 'list' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <ListTodo size={14} className="mr-1"/> 列表
              </button>
              <button 
                onClick={() => setView('summary')}
                className={`px-3 flex items-center rounded-md text-sm font-medium transition-all ${view === 'summary' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Calendar size={14} className="mr-1"/> 回顾
              </button>
            </div>
            <button 
              onClick={() => setView('settings')}
              className={`h-9 w-9 flex items-center justify-center rounded-lg transition-all ${view === 'settings' ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-500 hover:text-gray-800'}`}
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        {/* --- View: Todo List --- */}
        {view === 'list' && (
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
                placeholder="添加一个新任务，按回车确认..."
                className="w-full pl-10 pr-4 py-3 bg-transparent border-b-2 border-gray-200 focus:border-gray-800 outline-none text-lg placeholder:text-gray-300 transition-colors"
              />
            </form>

            {/* Tasks */}
            <div className="space-y-1">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">进行中</h2>
              {activeTodos.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm italic">
                  没有待办事项，享受你的闲暇时光吧。
                </div>
              ) : (
                activeTodos.map(todo => <TodoItem key={todo.id} todo={todo} />)
              )}
            </div>

            {/* Archived / Completed Toggle (Simple Visual) */}
            {archivedTodos.length > 0 && (
              <div className="mt-12 opacity-60">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
                  <Archive size={12} /> 已归档 / 放弃
                </h2>
                {archivedTodos.map(todo => (
                   <div key={todo.id} className="flex items-center gap-3 p-3 mb-2 border-b border-gray-100">
                      <div className="w-5 h-5 rounded-full border border-gray-200 flex items-center justify-center">
                        <div className="w-2 h-2 bg-gray-300 rounded-full" />
                      </div>
                      <span className="text-sm text-gray-400 line-through">{todo.text}</span>
                      <button onClick={() => updateStatus(todo, 'active')} className="ml-auto text-xs text-blue-500 hover:underline">恢复</button>
                   </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- View: Summary --- */}
        {view === 'summary' && (
          <div className="animate-in slide-in-from-right-4 duration-300">
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-3xl font-bold text-gray-800 mb-1">{completedCount}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">已完成任务</div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="text-3xl font-bold text-gray-800 mb-1">{activeTodos.length}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">待办任务</div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mb-6">
              <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Sparkles size={16} className="text-yellow-500" /> AI 智能周报
              </h3>
              <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600 leading-relaxed">
                {!settings.apiKey && <div className="text-xs text-orange-500 mb-2 font-medium flex items-center gap-1"><AlertCircle size={12}/> 当前为模拟模式</div>}
                本周你的工作效率很高。你主要集中在 <span className="font-medium text-gray-900">日常事务处理</span> 上。
                你放弃了 {archivedTodos.length} 个任务，这说明你在尝试精简目标，这是好事。
                <br /><br />
                {settings.apiKey ? "（来自真实 AI 模型的分析）" : "建议下周尝试借助右下角的 AI 助手，帮你规划更具挑战性的项目拆解。"}
              </div>
            </div>
          </div>
        )}

        {/* --- View: Settings --- */}
        {view === 'settings' && (
           <div className="animate-in slide-in-from-right-4 duration-300">
             <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
               <div className="p-6 border-b border-gray-100">
                 <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                   <Settings size={20} /> 设置
                 </h2>
                 <p className="text-sm text-gray-500 mt-1">配置应用参数和 AI 模型连接。</p>
               </div>
               
               <div className="p-6 space-y-6">
                 {/* Database Section */}
                 <div>
                   <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                     <Database size={16} className="text-blue-500"/> 数据库状态
                   </h3>
                   <div className="bg-blue-50 text-blue-800 text-sm p-4 rounded-lg flex items-center justify-between">
                     <span>
                       <span className="font-bold">Firestore 已连接</span>
                       <br/>
                       <span className="text-xs opacity-75">User ID: {user?.uid?.slice(0, 8)}...</span>
                     </span>
                     <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                   </div>
                 </div>

                 <hr className="border-gray-100"/>

                 {/* LLM Section */}
                 <div>
                   <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                     <Bot size={16} className="text-purple-500"/> LLM 模型配置
                   </h3>
                   
                   <div className="space-y-4">
                     <div>
                       <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">API Key</label>
                       <div className="relative">
                         <Key size={16} className="absolute left-3 top-3 text-gray-400" />
                         <input 
                            type="password" 
                            value={settings.apiKey}
                            onChange={(e) => setSettings({...settings, apiKey: e.target.value})}
                            placeholder="输入 Google Gemini API Key..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none transition-all"
                         />
                       </div>
                       <p className="text-xs text-gray-400 mt-1">
                         密钥仅保存在本地浏览器中，不会上传到我们的服务器。
                         未填写时使用模拟模式。
                       </p>
                     </div>

                     <div>
                       <label className="block text-xs font-medium text-gray-500 mb-1 uppercase">模型名称 (Model ID)</label>
                       <input 
                          type="text" 
                          value={settings.model}
                          onChange={(e) => setSettings({...settings, model: e.target.value})}
                          placeholder="例如: gemini-1.5-flash"
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none transition-all"
                       />
                     </div>
                   </div>
                 </div>
               </div>

               <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                 <button 
                   onClick={saveSettings}
                   className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-all active:scale-95 text-sm font-medium"
                 >
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
                  <span className="font-semibold text-sm text-gray-700">AI 效率助手</span>
                  <span className="text-[10px] text-gray-400 leading-none">{settings.apiKey ? 'Online' : 'Simulated'}</span>
                </div>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : (msg.role === 'system' ? 'justify-center' : 'justify-start')}`}>
                  {msg.role === 'system' ? (
                     <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">{msg.content}</span>
                  ) : (
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-black text-white rounded-br-none' 
                        : 'bg-gray-100 text-gray-800 rounded-bl-none'
                    }`}>
                      {msg.content}
                    </div>
                  )}
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                   <div className="bg-gray-100 rounded-2xl rounded-bl-none px-4 py-3 flex gap-1 items-center">
                     <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                     <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                     <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                   </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            
            {/* Quick Actions / Suggestions */}
            {messages.length < 2 && (
               <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
                  <button onClick={() => {setChatInput('帮我生成项目计划'); handleSendChat();}} className="whitespace-nowrap px-3 py-1 bg-gray-50 hover:bg-gray-100 text-xs text-gray-600 rounded-full border border-gray-200 transition">✨ 生成项目计划</button>
                  <button onClick={() => {setChatInput('总结本周工作'); handleSendChat();}} className="whitespace-nowrap px-3 py-1 bg-gray-50 hover:bg-gray-100 text-xs text-gray-600 rounded-full border border-gray-200 transition">📊 总结本周</button>
               </div>
            )}

            {/* Input */}
            <div className="p-3 bg-white border-t border-gray-50">
              <div className="flex items-center gap-2 bg-gray-50 rounded-full px-4 py-2 border border-gray-200 focus-within:border-purple-300 focus-within:ring-2 focus-within:ring-purple-100 transition-all">
                <input 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="问问 AI..."
                  className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
                />
                <button 
                  onClick={handleSendChat}
                  disabled={!chatInput.trim()}
                  className={`p-1.5 rounded-full transition-all ${chatInput.trim() ? 'bg-black text-white hover:bg-gray-800' : 'bg-gray-200 text-gray-400'}`}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toggle Button */}
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95 ${
            isChatOpen 
            ? 'bg-gray-200 text-gray-600 rotate-90' 
            : 'bg-gradient-to-tr from-gray-900 to-gray-700 text-white'
          }`}
        >
          {isChatOpen ? <X size={24} /> : <Sparkles size={24} />}
        </button>
      </div>

    </div>
  );
}