import { environment } from '../environments/environment';

export const API_BASE_URL = environment.apiBaseUrl;

export const API_URLS = {
    auth: {
        register: `${API_BASE_URL}/register`,
        login: `${API_BASE_URL}/login`,
        logout: `${API_BASE_URL}/logout`,
        refresh: `${API_BASE_URL}/refresh`,
        resendVerification: `${API_BASE_URL}/resend-verification`,
    },
           user: {
               getUserById: `${API_BASE_URL}/users`,
               updateUser: `${API_BASE_URL}/users`,
               getUsersWithRoleUser: `${API_BASE_URL}/users/role/user`,
               getMentionableUsers: `${API_BASE_URL}/users/mentionable`,
           },
    admin: {
        listUsers: `${API_BASE_URL}/admin/users`,
        listUsersWithTodos: `${API_BASE_URL}/admin/users-with-todos`,
        deleteUser: `${API_BASE_URL}/admin/users`,
        updateUserRole: `${API_BASE_URL}/admin/users`,
    },
    notifications: {
        getNotifications: `${API_BASE_URL}/notifications`,
        markAsRead: (id: number) => `${API_BASE_URL}/notifications/${id}/read`,
        markAllAsRead: `${API_BASE_URL}/notifications/read-all`,
        deleteNotification: (id: number) => `${API_BASE_URL}/notifications/${id}`,
        websocket: (userId: number) => {
            // Use backend API URL for WebSocket connection
            const apiUrl = new URL(API_BASE_URL);
            const protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
            return `${protocol}//${apiUrl.host}/notifications/ws/${userId}`;
        },
    },
};