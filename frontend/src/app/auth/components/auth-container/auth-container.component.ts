import { Component, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { HttpErrorResponse } from "@angular/common/http";
import { Router, RouterLink } from "@angular/router";
import { Subject, takeUntil } from "rxjs";

import { SharedModule } from "../../../shared/shared.module";
import { IFieldControl } from "../../../shared/interfaces/IFieldControl.interface";
import { InputTypes } from "../../../shared/enums/input-types.enum";
import { ValidatorTypes } from "../../../shared/enums/validator-types.enum";
import { RegexPatterns } from "../../../shared/enums/regex-patterns.enum";
import { ReactiveFormService } from "../../../shared/services/reactive-form.service";
import { ToastService } from "../../../core/services/toast.service";
import { AuthService } from "../../services";
import { ILoginPayload, ILoginResponse, IRegisterPayload, IRegisterResponse } from "../../interfaces";
import { LayoutPaths } from "../../../layouts/enums";
import { PosthogService } from "../../../core/services";

type AuthMode = 'login' | 'register';

@Component({
    selector: 'app-auth-container',
    standalone: true,
    templateUrl: './auth-container.component.html',
    styleUrls: ['./auth-container.component.scss'],
    imports: [CommonModule, SharedModule, ReactiveFormsModule, RouterLink]
})
export class AuthContainerComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    
    currentMode: AuthMode = 'login';
    registrationSuccess: boolean = false;
    registeredEmail: string = '';
    isResending: boolean = false;
    
    // Login form
    loginForm: FormGroup = new FormGroup({});
    loginSubmitted: boolean = false;
    loginError: string | null = null;
    loginFields: IFieldControl[] = [
        {
            label: 'Email or Username',
            type: InputTypes.TEXT,
            formControlName: 'username',
            placeholder: 'Enter your email or username',
            value: '',
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Email or username is required' }
            ],
        },
        {
            label: 'Password',
            type: InputTypes.PASSWORD,
            formControlName: 'password',
            placeholder: 'Enter your password',
            value: '',
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Password is required' },
                { type: ValidatorTypes.MINLENGTH, message: 'Password must be at least 8 characters', value: 8 }
            ],
        },
    ];

    // Register form
    registerForm: FormGroup = new FormGroup({});
    registerSubmitted: boolean = false;
    registerError: string | null = null;
    registerFields: IFieldControl[] = [
        {
            label: 'Username',
            type: InputTypes.TEXT,
            formControlName: 'username',
            value: '',
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Username is required' },
                { type: ValidatorTypes.MINLENGTH, message: 'Username must be at least 3 characters', value: 3 },
                { type: ValidatorTypes.MAXLENGTH, message: 'Username must not exceed 20 characters', value: 20 }
            ],
            placeholder: 'Enter your username'
        },
        {
            label: 'Email',
            type: InputTypes.EMAIL,
            formControlName: 'email',
            placeholder: 'Enter your email',
            value: '',
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Email is required' },
                { type: ValidatorTypes.EMAIL, message: 'Please enter a valid email address', value: RegexPatterns.EMAIL }
            ],
        },
        {
            label: 'Password',
            type: InputTypes.PASSWORD,
            formControlName: 'password',
            placeholder: 'Enter your password',
            value: '',
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Password is required' },
                { type: ValidatorTypes.MINLENGTH, message: 'Password must be at least 8 characters', value: 8 }
            ],
        },
        {
            label: 'Confirm Password',
            type: InputTypes.PASSWORD,
            formControlName: 'confirmPassword',
            placeholder: 'Confirm Password',
            value: '',
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Confirm Password is required' },
                { type: ValidatorTypes.PASSWORD_MATCH, message: 'Passwords do not match', value: 'password' },
            ],
        },
    ];

    constructor(
        private readonly _formService: ReactiveFormService,
        private readonly _authService: AuthService,
        private readonly _router: Router,
        private readonly _toastService: ToastService,
        private readonly _posthogService: PosthogService
    ) {}

    ngOnInit(): void {
        if (this._authService.isAuthenticated()) {
            this._router.navigate([LayoutPaths.DASHBOARD]);
            return;
        }
        this.initForms();
    }

    private initForms(): void {
        this.loginForm = this._formService.initializeForm(this.loginFields);
        this.registerForm = this._formService.initializeForm(this.registerFields);
    }

    switchToLogin(): void {
        this.currentMode = 'login';
        this.clearErrors();
    }

    switchToRegister(): void {
        this.currentMode = 'register';
        this.clearErrors();
    }

    private clearErrors(): void {
        this.loginError = null;
        this.registerError = null;
        this.loginSubmitted = false;
        this.registerSubmitted = false;
        this.registrationSuccess = false;
        this.isResending = false;
    }

    resendVerification(): void {
        if (!this.registeredEmail || this.isResending) return;
        
        this.isResending = true;
        this._authService.resendVerificationEmail(this.registeredEmail)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (res) => {
                    this.isResending = false;
                    this._toastService.success(res.message || 'Verification link resent!');
                },
                error: (err) => {
                    this.isResending = false;
                    this._toastService.error(err?.error?.detail || 'Failed to resend link');
                }
            });
    }

    // Login methods
    onLoginSubmit(): void {
        if (this.loginForm?.invalid) {
            this.loginSubmitted = true;
        } else if (this.loginForm?.valid) {
            this.loginSubmitted = false;
            this.performLogin();
        }
    }

    private performLogin(): void {
        this.loginError = null;
        
        const username = this.loginForm.get('username')?.value;
        const payload: ILoginPayload = {
            username: username,
            password: this.loginForm.get('password')?.value,
        };

        this._authService
            .loginUser(payload)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (res: ILoginResponse) => {
                    this.loginError = null;
                    if (res.access_token) {
                        this._authService.setToken(res.access_token);
                    }
                    if (res.data?.id) {
                        this._authService.setCurrentUserId(res.data.id);
                        this._authService.setCurrentUserData(res.data);
                    }
                    this._posthogService.capture('user_login_success', { username: payload.username });
                    this._router.navigate([LayoutPaths.DASHBOARD]);
                },
                error: (err: HttpErrorResponse) => {
                    this.loginSubmitted = true;
                    const errorMessage = err?.error?.detail || err?.error?.message || err?.message || 'An error occurred during login. Please try again.';
                    this.loginError = errorMessage;
                    
                    // If the error is about verification, store the username (which might be an email) 
                    // so we can offer a resend button (though resend needs actual email)
                    if (err.status === 403 && errorMessage.toLowerCase().includes('verified')) {
                        this.registeredEmail = username;
                    }
                    
                    this._toastService.error(errorMessage);
                }
            });
    }

    // Register methods
    onRegisterSubmit(): void {
        if (this.registerForm?.invalid) {
            this.registerSubmitted = true;
            const passwordControl = this.registerForm.get('password');
            const confirmPasswordControl = this.registerForm.get('confirmPassword');
            
            if (passwordControl && confirmPasswordControl) {
                passwordControl.updateValueAndValidity({ emitEvent: false });
                confirmPasswordControl.updateValueAndValidity({ emitEvent: false });
            }
        } else if (this.registerForm?.valid) {
            this.registerSubmitted = false;
            this.performRegister();
        }
    }

    private performRegister(): void {
        this.registerError = null;
        
        const payload: IRegisterPayload = {
            username: this.registerForm.get('username')?.value,
            email: this.registerForm.get('email')?.value,
            password: this.registerForm.get('password')?.value,
        };

        this._authService
            .registerUser(payload)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (res: IRegisterResponse) => {
                    this.registerError = null;
                    
                    if (res.data?.is_verified) {
                        // If somehow already verified, proceed as before
                        if (res.access_token) {
                            this._authService.setToken(res.access_token);
                        }
                        if (res.data?.id) {
                            this._authService.setCurrentUserId(res.data.id);
                            this._authService.setCurrentUserData(res.data);
                        }
                        this._toastService.success('Account created successfully');
                        this._router.navigate([LayoutPaths.DASHBOARD]);
                    } else {
                        // Not verified - show verification message
                        this.registrationSuccess = true;
                        this.registeredEmail = payload.email;
                        this._toastService.success('Account created! Please verify your email.');
                        this._posthogService.capture('user_registration_pending_verification', { 
                            email: payload.email 
                        });
                    }
                },
                error: (err: HttpErrorResponse) => {
                    this.registerSubmitted = true;
                    const errorMessage = err?.error?.detail || err?.error?.message || err?.message || 'An error occurred during registration. Please try again.';
                    this.registerError = errorMessage;
                    this._toastService.error(errorMessage);
                }
            });
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
