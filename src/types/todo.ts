export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export type Priority = "low" | "medium" | "high";

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  status: TodoStatus;
  priority: Priority;
  dueDate?: string | null;
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
}

