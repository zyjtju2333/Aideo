# Aideo

<div align="center">

**An AI-Powered Desktop Todo Application**

Built with Tauri v2 + React 19 + Rust

[Features](#features) • [Tech Stack](#tech-stack) • [Getting Started](#getting-started) • [Development](#development) • [Architecture](#architecture)

</div>

---

## Overview

Aideo is a modern, AI-enhanced task management application that combines the power of React and Rust to deliver a fast, secure, and intelligent desktop experience. With built-in AI capabilities, Aideo goes beyond traditional todo apps by helping you break down complex tasks, generate summaries, and manage your productivity through natural conversation.

## Features

### Core Functionality
- **Task Management** - Create, edit, delete, and organize your todos with ease
- **Priority Levels** - Assign low, medium, or high priority to tasks
- **Due Dates** - Set and track deadlines for your tasks
- **Status Tracking** - Mark tasks as pending, completed, or cancelled
- **Tags** - Organize tasks with custom tags
- **Local Storage** - All data stored securely in a local SQLite database

### AI-Powered Features
- **Intelligent Chat Assistant** - Interact with an AI assistant to manage tasks via natural language
- **Function Calling** - AI can directly create, update, and delete todos on your behalf
- **Task Decomposition** - Break down complex projects into manageable subtasks
- **Weekly Summaries** - Get AI-generated insights about your productivity
- **Streaming Responses** - Real-time AI responses with Server-Sent Events (SSE)
- **Multi-Provider Support** - Compatible with OpenAI, DeepSeek, and other OpenAI-compatible APIs

### Technical Highlights
- **Native Performance** - Built with Rust backend for blazing-fast performance
- **Connection Pooling** - Efficient database operations with WAL mode
- **Modern UI** - Clean, responsive interface built with React 19 and TailwindCSS
- **Cross-Platform** - Runs on Windows, macOS, and Linux
- **Privacy-First** - All data stays on your device, AI API keys stored locally

## Tech Stack

### Frontend
- **React 19** - Latest React with concurrent features
- **TypeScript** - Type-safe development
- **Vite 7** - Lightning-fast build tool
- **TailwindCSS** - Utility-first CSS framework
- **Lucide React** - Beautiful, customizable icons

### Backend
- **Tauri v2** - Secure, lightweight desktop framework
- **Rust** - High-performance, memory-safe systems language
- **rusqlite** - SQLite database with connection pooling
- **tokio** - Async runtime for concurrent operations
- **reqwest** - HTTP client for AI API integration
- **serde/serde_json** - Efficient serialization

## Getting Started

### Prerequisites

- **Node.js** (v18 or later)
- **pnpm** (recommended) or npm
- **Rust** (latest stable version)
- **Tauri CLI** (installed via pnpm)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/aideo.git
   cd aideo
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Run the application**
   ```bash
   pnpm tauri dev
   ```

### First-Time Setup

1. Launch the application
2. Navigate to **Settings** (⚙️ icon)
3. Configure your AI settings:
   - Enter your API endpoint (e.g., `https://api.openai.com/v1`)
   - Add your API key
   - Select your preferred model
   - Test the connection to verify settings
4. Start managing your tasks!

## Development

### Available Commands

```bash
# Frontend development
pnpm dev                 # Start Vite dev server
pnpm build              # Build frontend for production

# Tauri development
pnpm tauri dev          # Run app in development mode (hot reload)
pnpm tauri build        # Build production app for current platform

# Backend (Rust) development
cd src-tauri
cargo test              # Run unit tests
cargo check             # Quick compile check
cargo clippy            # Lint Rust code
cargo fmt               # Format Rust code
```

### Project Structure

```
aideo/
├── src/                      # React frontend
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Entry point
│   ├── services/tauri/      # Tauri API wrappers
│   └── types/               # TypeScript definitions
├── src-tauri/               # Rust backend
│   ├── src/
│   │   ├── commands/        # Tauri command handlers
│   │   ├── db/              # Database layer with pooling
│   │   ├── models/          # Data models
│   │   ├── services/        # Business logic (AI, etc.)
│   │   ├── error.rs         # Error handling
│   │   ├── state.rs         # Application state
│   │   └── lib.rs           # Tauri setup
│   └── Cargo.toml
└── package.json
```

### Development Workflow

1. **Frontend changes**: Edit files in `src/`, hot reload works automatically
2. **Backend changes**: Edit files in `src-tauri/src/`, Tauri will restart
3. **Database schema**: Modify in [db/mod.rs](src-tauri/src/db/mod.rs), migrations run on app start
4. **New Tauri commands**: Add to [commands/](src-tauri/src/commands/) and register in [lib.rs](src-tauri/src/lib.rs)

## Architecture

### Database Schema

**todos table**
```sql
id          TEXT PRIMARY KEY  -- UUID v4
text        TEXT NOT NULL
completed   INTEGER           -- 0 or 1
status      TEXT              -- 'pending' | 'completed' | 'cancelled'
priority    INTEGER           -- 0 (low) | 1 (medium) | 2 (high)
due_date    TEXT              -- ISO 8601 format
tags        TEXT              -- JSON array
created_at  TEXT NOT NULL
updated_at  TEXT NOT NULL
```

**settings table**
```sql
key         TEXT PRIMARY KEY  -- Settings identifier
value       TEXT NOT NULL     -- JSON-serialized data
updated_at  TEXT NOT NULL
```

### AI Integration

Aideo supports OpenAI-compatible APIs with the following capabilities:

- **Function Calling**: AI can execute todo operations via structured function definitions
- **Streaming**: Real-time responses using Server-Sent Events (SSE)
- **Context Awareness**: Current todo list is automatically included in AI prompts
- **Multi-Format Support**: Compatible with both OpenAI Tools and Functions API formats

See [function_call.rs](src-tauri/src/services/function_call.rs) for available AI functions.

### Error Handling

The application uses a unified error handling system:
- Backend: `AppError` type in [error.rs](src-tauri/src/error.rs) with automatic conversion
- Frontend: Async/await with try-catch blocks for Tauri invoke calls
- Database: Connection pooling with automatic retry on contention

## Testing AI Features

1. Configure API settings in the Settings view
2. Click **Test Connection** to verify API connectivity
3. Open the AI chat panel (floating button)
4. Try commands like:
   - "Create a task to review code tomorrow"
   - "Show me all high priority tasks"
   - "Mark all pending tasks as completed"
   - "Give me a summary of this week's tasks"

## Building for Production

```bash
# Build for your current platform
pnpm tauri build

# Outputs will be in src-tauri/target/release/bundle/
```

Supported platforms:
- **Windows**: `.msi` installer
- **macOS**: `.dmg` disk image, `.app` bundle
- **Linux**: `.deb`, `.appimage`

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow Rust conventions (`cargo fmt`, `cargo clippy`)
- Use TypeScript for all frontend code
- Write tests for new features
- Update CLAUDE.md if adding major architectural changes

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Tauri](https://tauri.app/)
- UI powered by [React](https://react.dev/)
- Icons from [Lucide](https://lucide.dev/)
- Inspired by modern productivity tools and AI assistants

---

<div align="center">

**Made with ❤️ and Rust**

</div>
