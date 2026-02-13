import { Injectable } from "@angular/core";
import { API_URLS } from "../../api.global";
import { HttpClient } from "@angular/common/http";
import { Observable, take } from "rxjs";
import { IUserResponse, ILoginPayload, ILoginResponse, IRegisterPayload, IRegisterResponse } from "../interfaces";
import { AuthHttpService } from "./auth-http.service";

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private readonly ACCESS_TOKEN_KEY = 'access_token';
    private readonly USER_ID_KEY = 'currentUserId';
    private readonly USER_DATA_KEY = 'currentUserData';
    private currentUserId: number | null = null;
    private currentUserData: IUserResponse | null = null;

    constructor(
        private readonly _http: HttpClient,
        private readonly _authHttpService: AuthHttpService,
    ) {
        this.loadUserIdFromStorage();
        this.loadUserDataFromStorage();
        this.ensureUserDataLoaded();
    }

    registerUser(payload: IRegisterPayload): Observable<IRegisterResponse> {
        return this._authHttpService.registerUser(payload);
    }

    loginUser(payload: ILoginPayload): Observable<ILoginResponse> {
        return this._authHttpService.loginUser(payload);
    }

    logout(): Observable<void> {
        this.clearCurrentUser();
        return this._authHttpService.logout();
    }

    isAuthenticated(): boolean {
        return this.getCurrentUserId() !== null;
    }

    isAdmin(): boolean {
        const userData = this.getCurrentUserData();
        if (userData && !userData.role && this.currentUserId) {
            this.fetchUserData();
        }
        return userData?.role === 'admin';
    }

    getToken(): string | null {
        // First try sessionStorage (per-tab), then fall back to checking cookies via document.cookie
        const token = sessionStorage.getItem(this.ACCESS_TOKEN_KEY);
        if (token) {
            return token;
        }
        // If not in sessionStorage, token is likely in cookies (handled by backend with withCredentials)
        return null;
    }

    setToken(token: string): void {
        if (token) {
            sessionStorage.setItem(this.ACCESS_TOKEN_KEY, token);
        }
    }

    // ========== User ID Management ==========
    setCurrentUserId(userId: number): void {
        this.currentUserId = userId;
        sessionStorage.setItem(this.USER_ID_KEY, userId.toString());
    }

    getCurrentUserId(): number | null {
        if (this.currentUserId === null) {
            this.loadUserIdFromStorage();
        }
        return this.currentUserId;
    }

    // ========== User Data Management ==========
    setCurrentUserData(userData: IUserResponse): void {
        this.currentUserData = userData;
        sessionStorage.setItem(this.USER_DATA_KEY, JSON.stringify(userData));
    }

    getCurrentUserData(): IUserResponse | null {
        if (this.currentUserData === null) {
            this.loadUserDataFromStorage();
            // If still null and we have userId, fetch from API
            if (this.currentUserData === null && this.currentUserId !== null) {
                this.fetchUserData();
            }
        }
        return this.currentUserData;
    }

    clearCurrentUser(): void {
        this.currentUserId = null;
        this.currentUserData = null;
        sessionStorage.removeItem(this.ACCESS_TOKEN_KEY);
        sessionStorage.removeItem(this.USER_ID_KEY);
        sessionStorage.removeItem(this.USER_DATA_KEY);
    }

    // ========== Private Helper Methods ==========
    private fetchUserData(): void {
        const userId = this.getCurrentUserId();
        if (!userId) return;

        this._http
            .get<IUserResponse>(`${API_URLS.user.getUserById}/${userId}`, {
                withCredentials: true
            })
            .pipe(take(1))
            .subscribe({
                next: (userData) => {
                    this.setCurrentUserData(userData);
                },
                error: () => {
                    this.clearCurrentUser();
                }
            });
    }

    private ensureUserDataLoaded(): void {
        if (this.currentUserId !== null && this.currentUserData === null) {
            this.fetchUserData();
        }
    }

    private loadUserIdFromStorage(): void {
        const storedUserId = sessionStorage.getItem(this.USER_ID_KEY);
        if (storedUserId) {
            const userId = Number.parseInt(storedUserId, 10);
            if (Number.isNaN(userId)) {
                sessionStorage.removeItem(this.USER_ID_KEY);
            } else {
                this.currentUserId = userId;
            }
        }
    }

    private loadUserDataFromStorage(): void {
        const storedUserData = sessionStorage.getItem(this.USER_DATA_KEY);
        if (storedUserData) {
            try {
                this.currentUserData = JSON.parse(storedUserData);
            } catch {
                sessionStorage.removeItem(this.USER_DATA_KEY);
                this.currentUserData = null;
            }
        }
    }
}
