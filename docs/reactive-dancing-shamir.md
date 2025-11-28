# Aideo 紧凑化改造实施计划

## 目标概述

将 Aideo 从当前的 800x600 窗口改造为 480x640 的紧凑型桌面应用，采用移动端优先的设计理念，为未来的移动平台部署做好准备。

## 用户需求

1. **窗口尺寸**：480x640（小巧紧凑型，适合桌面角落）
2. **布局优化**：采用最佳实践优化间距和排版
3. **AI 聊天面板**：从浮动窗口改为窗口内显示（底部滑出）
4. **最小窗口限制**：360x480（iPhone SE 尺寸）
5. **未来考虑**：可能部署到移动平台

## 核心设计决策

### 1. 窗口配置
- **默认尺寸**：480x640（3:4 比例，接近手机屏幕）
- **最小尺寸**：360x480（支持最小移动设备）
- **最大尺寸**：600x900（保持紧凑感的合理上限）
- **可调整大小**：是（在限制范围内）

### 2. AI 聊天面板策略
采用**底部滑出抽屉**模式，而非浮动窗口或新标签页：
- **高度**：70vh（约 448px），占用屏幕 70%
- **宽度**：100%（480px，比原来的 340px 更宽）
- **触发方式**：右下角 FAB 按钮
- **背景遮罩**：半透明背景，点击关闭
- **优势**：符合移动端 UX 模式，保持上下文可见性

### 3. 响应式断点
```javascript
'xs': '360px',  // 最小支持尺寸
'sm': '480px',  // 默认窗口尺寸
'md': '600px',  // 最大窗口尺寸
```

### 4. 字体缩放策略
基于窗口宽度的动态字体大小：
- 360px 以下：13px
- 480px（默认）：14px
- 600px 以上：15px

## 实施步骤

### 步骤 1：窗口配置（5 分钟）

**文件**：`src-tauri/tauri.conf.json`

修改窗口配置：
```json
{
  "app": {
    "windows": [{
      "title": "aideo",
      "width": 480,
      "height": 640,
      "minWidth": 360,
      "minHeight": 480,
      "maxWidth": 600,
      "maxHeight": 900,
      "resizable": true
    }]
  }
}
```

### 步骤 2：Tailwind 配置（5 分钟）

**文件**：`tailwind.config.js`

添加自定义断点：
```javascript
export default {
  theme: {
    screens: {
      'xs': '360px',
      'sm': '480px',
      'md': '600px',
    },
    extend: {
      colors: {
        background: "#F7F7F5",
        foreground: "#37352F",
      },
    },
  },
};
```

**文件**：`src/styles/globals.css`

添加动态字体缩放：
```css
@layer base {
  html {
    font-size: 14px;
  }

  @media (max-width: 360px) {
    html { font-size: 13px; }
  }

  @media (min-width: 600px) {
    html { font-size: 15px; }
  }
}
```

### 步骤 3：主布局重构（10 分钟）

**文件**：`src/App.tsx`（第 380 行附近）

**修改前**：
```typescript
<div className="min-h-screen bg-[#F7F7F5]...">
  <div className="max-w-2xl mx-auto pt-12 pb-24 px-6">
```

**修改后**：
```typescript
<div className="h-screen bg-[#F7F7F5]... flex flex-col overflow-hidden">
  <div className="flex flex-col h-full px-4">
```

添加可滚动主区域包裹器：
```typescript
<header className="mb-4 py-3 flex items-center justify-between flex-shrink-0">
  {/* 头部内容 */}
</header>

<main className="flex-1 overflow-y-auto pb-12">
  {view === "list" && <ListView />}
  {view === "summary" && <SummaryView />}
  {view === "settings" && <SettingsView />}
</main>
```

### 步骤 4：头部组件紧凑化（15 分钟）

**文件**：`src/App.tsx`（第 384-434 行）

关键修改：
- Logo 图标：20px → 16px
- 标题字体：text-3xl (30px) → text-lg (18px)
- 副标题：text-sm → text-[10px]，在小屏隐藏
- 导航标签高度：h-9 → h-8
- 导航按钮：px-3 → px-2，text-sm → text-xs
- 导航图标：14px → 12px
- 间距：gap-2 → gap-1.5，mb-10 → mb-4

### 步骤 5：AI 聊天状态管理（10 分钟）

**文件**：`src/App.tsx`（第 50 行附近）

添加覆盖层状态类型：
```typescript
type OverlayState = "chat" | null;
const [overlay, setOverlay] = useState<OverlayState>(null);
```

全局替换：
- `isChatOpen` → `overlay === "chat"`
- `setIsChatOpen(false)` → `setOverlay(null)`
- `setIsChatOpen(true)` → `setOverlay("chat")`
- `setIsChatOpen(v => !v)` → `setOverlay(prev => prev === "chat" ? null : "chat")`

### 步骤 6：AI 聊天面板重构（30 分钟）

**文件**：`src/App.tsx`（第 773-918 行）

替换浮动聊天窗口为底部滑出面板：

```typescript
{/* AI 聊天滑出面板 */}
<div
  className={`
    fixed bottom-0 left-0 right-0 z-40
    bg-white border-t border-gray-200 shadow-2xl
    transition-transform duration-300 ease-out
    ${overlay === "chat" ? "translate-y-0" : "translate-y-full"}
  `}
  style={{ height: "70vh" }}
>
  <div className="h-full flex flex-col">
    {/* 头部：px-3 py-2 */}
    {/* 消息区：px-3 py-3，text-xs */}
    {/* 快捷操作：text-[10px] */}
    {/* 输入框：px-3 py-2，text-xs */}
  </div>
</div>

{/* 背景遮罩 */}
{overlay === "chat" && (
  <div
    className="fixed inset-0 bg-black/20 z-30 backdrop-blur-sm"
    onClick={() => setOverlay(null)}
  />
)}

{/* FAB 按钮 */}
<button
  onClick={() => setOverlay(prev => prev === "chat" ? null : "chat")}
  className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-xl..."
>
  {overlay === "chat" ? <X size={20} /> : <Sparkles size={20} />}
</button>
```

### 步骤 7：待办事项组件优化（15 分钟）

**文件**：`src/App.tsx`（第 296-369 行）

关键修改：
- 容器 padding：p-3 → p-2.5
- 间距：gap-3 → gap-2，mb-2 → mb-1.5
- 图标：20px → 16px
- 文本：text-sm → text-xs
- 菜单图标：14px → 14px
- 菜单项：px-3 py-2 → px-2.5 py-1.5，text-xs → text-[10px]

### 步骤 8：列表视图优化（20 分钟）

**文件**：`src/App.tsx`（第 437-498 行）

关键修改：
- 输入框 padding：py-3 → py-2
- 输入框字体：text-lg → text-sm
- 图标：20px → 16px
- 标题字体：text-xs → text-[10px]
- 归档图标：12px → 11px

### 步骤 9：概览视图优化（15 分钟）

**文件**：`src/App.tsx`（第 500-545 行）

关键修改：
- 卡片 padding：p-6 → p-4
- 统计数字：text-3xl → text-2xl
- 标签字体：text-xs → text-[10px]
- 图标：16px → 14px
- 内容字体：text-sm → text-xs
- 间距：gap-4 → gap-3，mb-6 → mb-4

### 步骤 10：设置视图优化（25 分钟）

**文件**：`src/App.tsx`（第 547-770 行）

关键修改：
- 标题：text-lg → text-base，图标 18px → 16px
- 副标题：text-sm → text-xs
- 章节标题：text-sm → text-xs，图标 16px → 14px
- 标签：text-xs → text-[10px]
- 输入框：py-2.5 → py-2，text-sm → text-xs
- 图标（输入框内）：16px → 14px
- 按钮：text-sm → text-xs，图标 14px → 12px
- 提示文字：text-xs → text-[9px]
- 两列网格：保持 grid-cols-2，减少 gap-3 → gap-2

高级设置使用折叠面板（details/summary）节省空间。

### 步骤 11：加载状态更新（2 分钟）

**文件**：`src/App.tsx`（第 371-377 行）

```typescript
if (loading) {
  return (
    <div className="h-screen flex items-center justify-center bg-[#F7F7F5] text-gray-400">
      <Loader2 className="animate-spin" size={20} />
    </div>
  );
}
```

## 尺寸对比表

| 元素 | 修改前 | 修改后 | 变化 |
|------|--------|--------|------|
| 窗口宽度 | 800px | 480px | -40% |
| 窗口高度 | 600px | 640px | +7% |
| 主容器最大宽 | 672px | 100% | 更充分利用空间 |
| 头部高度 | ~60px | ~40px | -33% |
| 水平 padding | 24px | 16px | -33% |
| 顶部 padding | 48px | 16px | -67% |
| 底部 padding | 96px | 0（改用 flex） | -100% |
| 标题字体 | 30px | 18px | -40% |
| 正文字体 | 14px | 12px | -14% |
| 主要图标 | 20-24px | 12-16px | -33% |
| AI 聊天宽度 | 340px | 480px | +41% |
| AI 聊天高度 | 500px | ~448px (70vh) | -10% |

## 关键文件清单

1. **src-tauri/tauri.conf.json** - 窗口尺寸和约束
2. **src/App.tsx** - 主要布局和所有组件修改（约 400 行改动）
3. **tailwind.config.js** - 响应式断点
4. **src/styles/globals.css** - 字体缩放

## 潜在挑战与解决方案

### 挑战 1：文本溢出
**解决方案**：所有可变长度文本使用 `truncate` 类，flex 容器设置 `min-w-0`

### 挑战 2：触摸目标尺寸
**解决方案**：虽然图标缩小，但保持 padding 确保触摸区域 ≥ 32px

### 挑战 3：小屏幕上聊天面板过高
**解决方案**：使用 `max-h-[70vh]` 而非固定高度

### 挑战 4：设置表单双列网格
**解决方案**：在极小屏幕使用 `grid-cols-1 xs:grid-cols-2`

### 挑战 5：滚动性能
**解决方案**：为动画面板添加 `will-change: transform` 和 GPU 加速

## 移动平台准备

虽然当前是桌面应用，但采用移动优先设计：

1. **安全区域支持**：预留 CSS 变量用于未来的 safe-area-insets
2. **触摸友好**：所有交互元素有足够的点击区域
3. **手势准备**：滑出面板设计为抽屉模式，未来可添加滑动手势
4. **平台检测**：可选添加 Tauri 平台检测用于条件 UX

## 测试清单

### 视觉测试
- [ ] 窗口默认打开为 480x640
- [ ] 调整到最小尺寸 360x480，所有元素可见
- [ ] 调整到最大尺寸 600x900，无异常拉伸
- [ ] 所有文本在 480px 宽度下可读
- [ ] 无横向滚动条
- [ ] 间距统一且和谐

### 功能测试
- [ ] 待办事项增删改查正常
- [ ] 设置保存加载正常
- [ ] AI 聊天滑出动画流畅
- [ ] 聊天输入发送正常
- [ ] 背景遮罩点击关闭正常
- [ ] FAB 切换正常
- [ ] 视图切换正常
- [ ] 各区域滚动正常

### 响应式测试
- [ ] 360px 宽度测试
- [ ] 480px 宽度测试
- [ ] 600px 宽度测试
- [ ] 字体缩放正确（13/14/15px）

## 预计工时

- 窗口和配置：10 分钟
- 布局重构：10 分钟
- 头部优化：15 分钟
- AI 聊天重构：40 分钟（状态 + 面板）
- 待办组件：15 分钟
- 列表视图：20 分钟
- 概览视图：15 分钟
- 设置视图：25 分钟
- 加载状态：2 分钟
- 测试和调整：30 分钟

**总计**：约 3 小时

## 回滚方案

如遇问题：
1. **窗口太小**：恢复 tauri.conf.json 为 800x600
2. **文字太小**：调整 globals.css 基础字号为 15px
3. **聊天面板问题**：降低高度到 50vh 或恢复浮动窗口
4. **性能问题**：移除过渡动画和背景模糊

## 实施原则

1. **渐进式修改**：按步骤顺序执行，每步完成后测试
2. **保持功能完整**：所有现有功能必须正常工作
3. **视觉和谐**：缩小尺寸的同时保持美观
4. **移动优先**：为未来移动平台部署铺路
5. **可逆性**：所有改动都可快速回滚
