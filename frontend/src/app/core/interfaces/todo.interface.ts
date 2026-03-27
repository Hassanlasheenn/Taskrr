export type TodoStatus = 'new' | 'inProgress' | 'paused' | 'done';

export interface ITodoCreate {
    title: string;
    description?: string;
    priority: 'low' | 'medium' | 'high';
    status?: TodoStatus;
    category?: string;
    due_date?: string;
    assigned_to_user_id?: number | null;
}

export interface ITodoUpdate {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    status?: TodoStatus;
    category?: string;
    due_date?: string | null;
    assigned_to_user_id?: number | null;
}

export interface ITodoResponse {
    id: number;
    title: string;
    description?: string;
    status: TodoStatus;
    priority: 'low' | 'medium' | 'high';
    category?: string;
    due_date?: string;
    is_deleted: boolean;
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
    due_date?: string;
    is_deleted: boolean;
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
    attachment_url?: string | null;
    attachment_name?: string | null;
    created_at?: string;
}

export interface ITodoCommentListResponse {
    comments: ITodoComment[];
}

export interface ITodoCommentHistoryItem {
    type: 'comment';
    id: number;
    todo_id: number;
    comment_id?: number | null;
    user_id: number;
    username: string;
    action: 'created' | 'updated' | 'deleted';
    content_before?: string | null;
    content_after?: string | null;
    created_at?: string | null;
}

export interface ITodoFieldHistoryItem {
    type: 'field';
    id: number;
    todo_id: number;
    user_id: number;
    username: string;
    field: 'status' | 'priority' | 'assigned_to_user_id';
    old_value?: string | null;
    new_value?: string | null;
    created_at?: string | null;
}

export type ITodoHistoryEntry = ITodoCommentHistoryItem | ITodoFieldHistoryItem;

export interface ITodoCommentHistoryResponse {
    history: ITodoCommentHistoryItem[];
}

export interface ITodoHistoryResponse {
    history: ITodoHistoryEntry[];
}

