import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { HttpErrorResponse } from "@angular/common/http";
import { SharedModule } from "../../../shared/shared.module";
import { IFieldControl } from "../../../shared/interfaces/IFieldControl.interface";
import { InputTypes } from "../../../shared/enums/input-types.enum";
import { ReactiveFormService } from "../../../shared/services/reactive-form.service";
import { ToastService } from "../../../core/services/toast.service";
import { Router, RouterLink } from "@angular/router";
import { ValidatorTypes } from "../../../shared/enums/validator-types.enum";
import { RegexPatterns } from "../../../shared/enums/regex-patterns.enum";
import { AuthService } from "../../services";
import { Subject, takeUntil } from "rxjs";
import { AuthPaths } from "../../enums/auth-paths.enum";
import { SeoService } from "../../../core/services/seo.service";

@Component({
    selector: 'app-forgot-password',
    standalone: true,
    templateUrl: './forgot-password.component.html',
    styleUrls: ['./forgot-password.component.scss'],
    imports: [CommonModule, SharedModule, ReactiveFormsModule, RouterLink],
})
export class ForgotPasswordComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    private readonly _seoService = inject(SeoService);
    form: FormGroup = new FormGroup({});
    isSubmitted: boolean = false;
    isSuccess: boolean = false;
    errorSummary: string | null = null;
    readonly authPaths = AuthPaths;

    fields: IFieldControl[] = [
        {
            label: 'Email Address',
            type: InputTypes.EMAIL,
            formControlName: 'email',
            placeholder: 'Enter your account email',
            value: '',
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Email is required' },
                { type: ValidatorTypes.PATTERN, message: 'Invalid email format', value: RegexPatterns.EMAIL }
            ],
        }
    ];

    constructor(
        private readonly _formService: ReactiveFormService,
        private readonly _authService: AuthService,
        private readonly _router: Router,
        private readonly _toastService: ToastService
    ) {}

    ngOnInit(): void {
        this._seoService.updateMetaTags({
            title: 'Forgot Password',
            description: 'Reset your Taskrr account password.',
            keywords: 'forgot password, taskrr, reset password'
        });
        this.initForm();
    }

    private initForm(): void {
        this.form = this._formService.initializeForm(this.fields);
    }

    onSubmit(): void {
        if(this.form?.invalid) {
            this.isSubmitted = true;
        } else if(this.form?.valid) {
            this.isSubmitted = false;
            this.onForgotPassword();
        }
    }

    onForgotPassword(): void {
        this.errorSummary = null;
        const email = this.form.get('email')?.value;

        this._authService
        .forgotPassword(email)
        .pipe(takeUntil(this._destroy$))
        .subscribe({
            next: (res) => {
                this.isSuccess = true;
                this._toastService.success(res.message);
            },
            error: (err: HttpErrorResponse) => {
                const errorMessage = err?.error?.detail || 'An error occurred. Please try again.';
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
