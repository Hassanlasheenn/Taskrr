import {
    HttpInterceptorFn,
    HttpErrorResponse,
    HttpRequest,
    HttpResponse,
    HttpEventType,
    HttpBackend
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, filter, map, switchMap, take, throwError } from 'rxjs';
import { AuthService } from '../../auth/services/auth.service';
import { UserActivityService } from '../services/user-activity.service';
import { SessionExpiryDialogService } from '../services/session-expiry-dialog.service';
import { API_URLS } from '../../api.global';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    const authService = inject(AuthService);
    const userActivityService = inject(UserActivityService);
    const sessionExpiryDialog = inject(SessionExpiryDialogService);
    const httpBackend = inject(HttpBackend);

    const isRefreshCall = req.url.includes('/refresh');
    const isAuthCall = req.url.includes('/login') || req.url.includes('/register');

    // Add Authorization header from sessionStorage token (multi-tab support)
    const token = authService.getToken();
    if (token && !req.headers.has('Authorization') && !isRefreshCall) {
        req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
    }

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            // Only handle 401s that aren't from auth/refresh calls or already-retried requests
            if (error.status !== 401 || isRefreshCall || isAuthCall || req.headers.has('X-Retry-After-Refresh')) {
                return throwError(() => error);
            }

            const currentUrl = router.url;
            const isLoginPage = currentUrl === '/' || currentUrl.includes('/login');
            if (isLoginPage) {
                return throwError(() => error);
            }

            // If a refresh is already underway, queue this request until it completes
            if (sessionExpiryDialog.isRefreshing) {
                return sessionExpiryDialog.refreshResult$.pipe(
                    take(1),
                    switchMap(success => {
                        if (success) {
                            const newToken = authService.getToken();
                            const retryReq = newToken
                                ? req.clone({ setHeaders: { Authorization: `Bearer ${newToken}`, 'X-Retry-After-Refresh': 'true' } })
                                : req.clone({ headers: req.headers.set('X-Retry-After-Refresh', 'true') });
                            return next(retryReq);
                        }
                        return throwError(() => error);
                    })
                );
            }

            // User is inactive — logout immediately without a dialog
            if (!userActivityService.isUserActive()) {
                authService.clearCurrentUser();
                router.navigate(['/']);
                return throwError(() => error);
            }

            // User is active — show session expiry dialog
            sessionExpiryDialog.isRefreshing = true;

            return sessionExpiryDialog.show().pipe(
                switchMap(choice => {
                    if (choice === 'logout') {
                        sessionExpiryDialog.isRefreshing = false;
                        sessionExpiryDialog.refreshResult$.next(false);
                        authService.clearCurrentUser();
                        router.navigate(['/']);
                        return throwError(() => error);
                    }

                    // Call refresh endpoint via HttpBackend (bypasses all interceptors)
                    const refreshHttpReq = new HttpRequest('POST', API_URLS.auth.refresh, {}, { withCredentials: true });
                    const refresh$ = httpBackend.handle(refreshHttpReq).pipe(
                        filter(event => event.type === HttpEventType.Response),
                        map(event => (event as HttpResponse<any>).body)
                    );

                    return refresh$.pipe(
                        switchMap((response: any) => {
                            authService.setToken(response.access_token);
                            sessionExpiryDialog.isRefreshing = false;
                            sessionExpiryDialog.refreshResult$.next(true);

                            const retryReq = req.clone({
                                setHeaders: {
                                    Authorization: `Bearer ${response.access_token}`,
                                    'X-Retry-After-Refresh': 'true'
                                }
                            });
                            return next(retryReq);
                        }),
                        catchError(refreshError => {
                            sessionExpiryDialog.isRefreshing = false;
                            sessionExpiryDialog.refreshResult$.next(false);
                            authService.clearCurrentUser();
                            router.navigate(['/']);
                            return throwError(() => refreshError);
                        })
                    );
                })
            );
        })
    );
};
