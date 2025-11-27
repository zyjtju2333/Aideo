import { invoke } from "@tauri-apps/api/core";
import type {
  Todo,
  TodoFilter,
  TodoStatistics,
  TodoUpdate,
  NewTodo,
} from "@/types/todo";

export const todoService = {
  async getAll(filter?: TodoFilter): Promise<Todo[]> {
    return invoke("get_todos", {
      filter: filter ?? null,
    }) as Promise<Todo[]>;
  },

  async create(text: string, priority: string | null = null): Promise<Todo> {
    // create_todo(text, priority, due_date, tags)
    return invoke("create_todo", {
      text,
      priority,
      due_date: null,
      tags: null,
    }) as Promise<Todo>;
  },

  async update(id: string, updates: TodoUpdate): Promise<Todo> {
    return invoke("update_todo", {
      id,
      updates,
    }) as Promise<Todo>;
  },

  async delete(id: string): Promise<void> {
    await invoke("delete_todo", { id });
  },

  async batchCreate(todos: NewTodo[]): Promise<Todo[]> {
    // batch_create_todos(todos: Vec<CreateTodoRequest>)
    return invoke("batch_create_todos", {
      todos,
    }) as Promise<Todo[]>;
  },

  async getStatistics(): Promise<TodoStatistics> {
    return invoke("get_todo_statistics") as Promise<TodoStatistics>;
  },
};

