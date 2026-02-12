import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../../auth/services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    // Add Authorization header if token exists (for multi-tab support)
    const token = authService.getToken();
    if (token && !req.headers.has('Authorization')) {
        req = req.clone({
            setHeaders: {
                Authorization: `Bearer ${token}`
            }
        });
    }

    return next(req).pipe(
        catchError((error: HttpErrorResponse) => {
            if (error.status === 401) {
                authService.clearCurrentUser();
                
                const currentUrl = router.url;
                const isLoginPage = currentUrl === '/' || currentUrl.includes('/login');
                
                if (isLoginPage) {
                    return throwError(() => error);
                } else {
                    globalThis.location.href = '/';
                }
            }
            
            return throwError(() => error);
        })
    );
};
