import { Injectable, PLATFORM_ID, inject } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { API_URLS } from "../../api.global";
import { HttpClient } from "@angular/common/http";
import { Observable, take, BehaviorSubject, map } from "rxjs";
import { IUserResponse, ILoginPayload, ILoginResponse, IRegisterPayload, IRegisterResponse } from "../interfaces";
import { AuthHttpService } from "./auth-http.service";
import { PosthogService } from "../../core/services/posthog.service";

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private readonly ACCESS_TOKEN_KEY = 'access_token';
    private readonly USER_ID_KEY = 'currentUserId';
    private readonly USER_DATA_KEY = 'currentUserData';
    private currentUserId: number | null = null;
    private currentUserData: IUserResponse | null = null;
    
    private readonly _platformId = inject(PLATFORM_ID);
    private _currentUserDataSubject = new BehaviorSubject<IUserResponse | null>(null);
    public readonly currentUserData$ = this._currentUserDataSubject.asObservable();
    public readonly isLoggedIn$ = this._currentUserDataSubject.pipe(
        map(userData => userData !== null)
    );

    constructor(
        private readonly _http: HttpClient,
        private readonly _authHttpService: AuthHttpService,
        private readonly _posthogService: PosthogService,
    ) {
        if (isPlatformBrowser(this._platformId)) {
            this.loadUserIdFromStorage();
            this.loadUserDataFromStorage();
            this.ensureUserDataLoaded();

            // Identify if already logged in
            if (this.currentUserId) {
                this._posthogService.identify(this.currentUserId, this.currentUserData);
            }
        }
    }

    registerUser(payload: IRegisterPayload): Observable<IRegisterResponse> {
        return this._authHttpService.registerUser(payload);
    }

    loginUser(payload: ILoginPayload): Observable<ILoginResponse> {
        return this._authHttpService.loginUser(payload);
    }

    resendVerificationEmail(email: string): Observable<any> {
        return this._http.post(`${API_URLS.auth.resendVerification}?email=${email}`, {});
    }

    logout(): Observable<void> {
        this.clearCurrentUser();
        this._posthogService.reset();
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
        if (isPlatformBrowser(this._platformId)) {
            const token = sessionStorage.getItem(this.ACCESS_TOKEN_KEY);
            if (token) {
                return token;
            }
        }
        return null;
    }

    setToken(token: string): void {
        if (token && isPlatformBrowser(this._platformId)) {
            sessionStorage.setItem(this.ACCESS_TOKEN_KEY, token);
        }
    }

    // ========== User ID Management ==========
    setCurrentUserId(userId: number): void {
        this.currentUserId = userId;
        if (isPlatformBrowser(this._platformId)) {
            sessionStorage.setItem(this.USER_ID_KEY, userId.toString());
            this._posthogService.identify(userId);
        }
    }

    getCurrentUserId(): number | null {
        if (this.currentUserId === null && isPlatformBrowser(this._platformId)) {
            this.loadUserIdFromStorage();
        }
        return this.currentUserId;
    }

    // ========== User Data Management ==========
    setCurrentUserData(userData: IUserResponse): void {
        this.currentUserData = userData;
        this._currentUserDataSubject.next(userData);
        if (isPlatformBrowser(this._platformId)) {
            sessionStorage.setItem(this.USER_DATA_KEY, JSON.stringify(userData));
            if (this.currentUserId) {
                this._posthogService.identify(this.currentUserId, userData);
            }
        }
    }

    getCurrentUserData(): IUserResponse | null {
        if (this.currentUserData === null && isPlatformBrowser(this._platformId)) {
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
        this._currentUserDataSubject.next(null);
        if (isPlatformBrowser(this._platformId)) {
            sessionStorage.removeItem(this.ACCESS_TOKEN_KEY);
            sessionStorage.removeItem(this.USER_ID_KEY);
            sessionStorage.removeItem(this.USER_DATA_KEY);
        }
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
        if (!isPlatformBrowser(this._platformId)) return;
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
        if (!isPlatformBrowser(this._platformId)) return;
        const storedUserData = sessionStorage.getItem(this.USER_DATA_KEY);
        if (storedUserData) {
            try {
                this.currentUserData = JSON.parse(storedUserData);
                this._currentUserDataSubject.next(this.currentUserData);
            } catch {
                sessionStorage.removeItem(this.USER_DATA_KEY);
                this.currentUserData = null;
                this._currentUserDataSubject.next(null);
            }
        }
    }
}
