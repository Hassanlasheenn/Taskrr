import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { SharedModule } from "../../../shared/shared.module";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ReactiveFormService } from "../../../shared/services/reactive-form.service";
import { ToastService } from "../../../core/services/toast.service";
import { IFieldControl } from "../../../shared/interfaces";
import { InputTypes, RegexPatterns, ValidatorTypes } from "../../../shared/enums";
import { Router, RouterLink } from "@angular/router";
import { AuthService } from "../../services";
import { IRegisterPayload, IRegisterResponse } from "../../interfaces";
import { Subject, takeUntil } from "rxjs";
import { LayoutPaths } from "../../../layouts/enums";
import { SeoService } from "../../../core/services/seo.service";

@Component({
    selector: 'app-register',
    templateUrl: './register.component.html',
    standalone: true,
    imports: [CommonModule, SharedModule, ReactiveFormsModule, RouterLink],
    styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    private readonly _seoService = inject(SeoService);
    form: FormGroup = new FormGroup({});
    isSubmitted: boolean = false;
    errorSummary: string | null = null;
    fields: IFieldControl[] = [
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
            placeholder: 'Confim Password',
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

    ngOnInit() {
        this._seoService.updateMetaTags({
            title: 'Register',
            description: 'Create an account on Taskrr to start managing your tasks efficiently and boost your productivity.',
            keywords: 'register, sign up, taskrr, task management'
        });

        if (this._authService.isAuthenticated()) {
            this._router.navigate([LayoutPaths.DASHBOARD]);
            return;
        }
        this.initForm();
    }

    private initForm(): void {
        this.form = this._formService.initializeForm(this.fields);
    }

    onSubmit(): void {
        if (this.form?.invalid) {
            this.isSubmitted = true;
            const passwordControl = this.form.get('password');
            const confirmPasswordControl = this.form.get('confirmPassword');
            
            if (passwordControl && confirmPasswordControl) {
                passwordControl.updateValueAndValidity({ emitEvent: false });
                confirmPasswordControl.updateValueAndValidity({ emitEvent: false });
            }
        } else if (this.form?.valid) {
            this.isSubmitted = false;
            this.onRegister();
        }
    }

    onRegister(): void {
        this.errorSummary = null;
        this.isSubmitted = false;

        const payload: IRegisterPayload = {
            username: this.form.get('username')?.value,
            email: this.form.get('email')?.value,
            password: this.form.get('password')?.value,
        };

        this._authService
        .registerUser(payload)
        .pipe(takeUntil(this._destroy$))
        .subscribe({
            next: (res: IRegisterResponse) => {
                this.errorSummary = null;
                if (res.access_token) {
                    this._authService.setToken(res.access_token);
                }
                if (res.data?.id) {
                    this._authService.setCurrentUserId(res.data.id);
                    this._authService.setCurrentUserData(res.data);
                }
                this._toastService.success('Account created successfully');
                this._router.navigate([LayoutPaths.DASHBOARD]);
            },
            error: (err: HttpErrorResponse) => {
                this.isSubmitted = true;
                const errorMessage = err?.error?.detail || err?.error?.message || err?.message || 'An error occurred during registration. Please try again.';
                this.errorSummary = errorMessage;
                this._toastService.error(errorMessage);
            }
        });
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}