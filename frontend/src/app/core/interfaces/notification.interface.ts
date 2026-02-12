export interface INotificationResponse {
    id: number;
    user_id: number;
    todo_id?: number | null;
    message: string;
    is_read: boolean;
    created_at?: string | null;
}

export interface INotificationListResponse {
    notifications: INotificationResponse[];
    total: number;
    unread_count: number;
}
