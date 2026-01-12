import { environment } from '../environments/environment';

export const API_BASE_URL = environment.apiBaseUrl;

export const API_URLS = {
    auth: {
        register: `${API_BASE_URL}/register`,
        login: `${API_BASE_URL}/login`,
        logout: `${API_BASE_URL}/logout`,
    },
    user: {
        getUserById: `${API_BASE_URL}`,
        updateUser: `${API_BASE_URL}`,
    },
};