export type TodoStatus = 'new' | 'inProgress' | 'paused' | 'done';

export interface ITodoCreate {
    title: string;
    description?: string;
    priority: 'low' | 'medium' | 'high';
    status?: TodoStatus;
    category?: string;
    assigned_to_user_id?: number | null;
}

export interface ITodoUpdate {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    status?: TodoStatus;
    category?: string;
    assigned_to_user_id?: number | null;
}

export interface ITodoResponse {
    id: number;
    title: string;
    description?: string;
    status: string;
    priority: string;
    category?: string;
    order_index: number;
    created_at?: string;
    updated_at?: string;
    user_id: number;
    assigned_to_user_id?: number | null;
    assigned_to_username?: string | null;
}

export interface ITodoListResponse {
    todos: ITodoResponse[];
    total: number;
}

export interface ITodo {
    id: number;
    title: string;
    description?: string;
    status: TodoStatus;
    priority: 'low' | 'medium' | 'high';
    category?: string;
    order_index: number;
    created_at?: string;
    updated_at?: string;
    user_id?: number;
    assigned_to_user_id?: number | null;
    assigned_to_username?: string | null;
}

export interface ITodoComment {
    id: number;
    todo_id: number;
    user_id: number;
    username: string;
    user_photo?: string | null;
    content: string;
    created_at?: string;
}

export interface ITodoCommentListResponse {
    comments: ITodoComment[];
}

