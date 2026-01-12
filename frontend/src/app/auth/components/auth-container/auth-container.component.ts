import { Component, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { HttpErrorResponse } from "@angular/common/http";
import { Router } from "@angular/router";
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

type AuthMode = 'login' | 'register';

@Component({
    selector: 'app-auth-container',
    standalone: true,
    templateUrl: './auth-container.component.html',
    styleUrls: ['./auth-container.component.scss'],
    imports: [CommonModule, SharedModule, ReactiveFormsModule]
})
export class AuthContainerComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    
    currentMode: AuthMode = 'register';
    
    // Login form
    loginForm: FormGroup = new FormGroup({});
    loginSubmitted: boolean = false;
    loginError: string | null = null;
    loginFields: IFieldControl[] = [
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
        private readonly _toastService: ToastService
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
        
        const payload: ILoginPayload = {
            email: this.loginForm.get('email')?.value,
            password: this.loginForm.get('password')?.value,
        };

        this._authService
            .loginUser(payload)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (res: ILoginResponse) => {
                    this.loginError = null;
                    if (res.data?.id) {
                        this._authService.setCurrentUserId(res.data.id);
                        this._authService.setCurrentUserData(res.data);
                    }
                    this._router.navigate([LayoutPaths.DASHBOARD]);
                },
                error: (err: HttpErrorResponse) => {
                    this.loginSubmitted = true;
                    const errorMessage = err?.error?.detail || err?.error?.message || err?.message || 'An error occurred during login. Please try again.';
                    this.loginError = errorMessage;
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
                    if (res?.id) {
                        this._authService.setCurrentUserId(res.id);
                        this._authService.setCurrentUserData({
                            id: res.id,
                            username: res.username,
                            email: res.email
                        });
                    }
                    this._toastService.success('Account created successfully');
                    this._router.navigate([LayoutPaths.DASHBOARD]);
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

