import { Component, OnDestroy, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { HttpErrorResponse } from "@angular/common/http";
import { SharedModule } from "../../../shared/shared.module";
import { IFieldControl } from "../../../shared/interfaces/IFieldControl.interface";
import { InputTypes } from "../../../shared/enums/input-types.enum";
import { ReactiveFormService } from "../../../shared/services/reactive-form.service";
import { ToastService } from "../../../core/services/toast.service";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { ValidatorTypes } from "../../../shared/enums/validator-types.enum";
import { RegexPatterns } from "../../../shared/enums/regex-patterns.enum";
import { AuthService } from "../../services";
import { Subject, takeUntil } from "rxjs";
import { AuthPaths } from "../../enums/auth-paths.enum";
import { SeoService } from "../../../core/services/seo.service";

@Component({
    selector: 'app-reset-password',
    standalone: true,
    templateUrl: './reset-password.component.html',
    styleUrls: ['./reset-password.component.scss'],
    imports: [CommonModule, SharedModule, ReactiveFormsModule, RouterLink],
})
export class ResetPasswordComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    private readonly _seoService = inject(SeoService);
    private readonly _route = inject(ActivatedRoute);
    form: FormGroup = new FormGroup({});
    isSubmitted: boolean = false;
    isSuccess: boolean = false;
    errorSummary: string | null = null;
    token: string | null = null;
    readonly authPaths = AuthPaths;

    fields: IFieldControl[] = [
        {
            label: 'New Password',
            type: InputTypes.PASSWORD,
            formControlName: 'new_password',
            placeholder: 'Enter your new password',
            value: '',
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Password is required' },
                { type: ValidatorTypes.MINLENGTH, message: 'Password must be at least 8 characters', value: 8 }
            ],
        },
        {
            label: 'Confirm New Password',
            type: InputTypes.PASSWORD,
            formControlName: 'confirm_password',
            placeholder: 'Confirm your new password',
            value: '',
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Please confirm your password' },
                { type: ValidatorTypes.PASSWORD_MATCH, message: 'Passwords do not match', value: 'new_password' }
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
            title: 'Reset Password',
            description: 'Create a new password for your Taskrr account.',
            keywords: 'reset password, taskrr, new password'
        });

        this.token = this._route.snapshot.queryParamMap.get('token');
        if (!this.token) {
            this._toastService.error('Invalid reset link');
            this._router.navigate(['/', this.authPaths.LOGIN]);
            return;
        }

        this.initForm();
    }

    private initForm(): void {
        this.form = this._formService.initializeForm(this.fields);
    }

    onSubmit(): void {
        if(this.form?.invalid) {
            this.isSubmitted = true;
        } else {
            this.isSubmitted = false;
            this.onResetPassword();
        }
    }

    onResetPassword(): void {
        this.errorSummary = null;
        const payload = {
            token: this.token,
            new_password: this.form.get('new_password')?.value
        };

        this._authService
        .resetPassword(payload)
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
