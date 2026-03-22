import { Component, OnDestroy, OnInit } from "@angular/core";
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
import { ILoginPayload, ILoginResponse } from "../../interfaces";
import { AuthService } from "../../services";
import { Subject, takeUntil } from "rxjs";
import { LayoutPaths } from "../../../layouts/enums";

@Component({
    selector: 'app-login',
    standalone: true,
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    imports: [SharedModule, ReactiveFormsModule, RouterLink],
})
export class LoginComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    form: FormGroup = new FormGroup({});
    isSubmitted: boolean = false;
    errorSummary: string | null = null;
    fields: IFieldControl[] = [
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
            this.onLogin();
        }
    }

    onLogin(): void {
        this.errorSummary = null;
        this.isSubmitted = false;

        const payload: ILoginPayload = {
            username: this.form.get('username')?.value,
            password: this.form.get('password')?.value,
        };

        this._authService
        .loginUser(payload)
        .pipe(takeUntil(this._destroy$))
        .subscribe({
            next: (res: ILoginResponse) => {
                this.errorSummary = null;
                if (res.access_token) {
                    this._authService.setToken(res.access_token);
                }
                if (res.data?.id) {
                    this._authService.setCurrentUserId(res.data.id);
                    this._authService.setCurrentUserData(res.data);
                }
                this._router.navigate([LayoutPaths.DASHBOARD]);
            },
            error: (err: HttpErrorResponse) => {
                this.isSubmitted = true;
                const errorMessage = err?.error?.detail || err?.error?.message || err?.message || 'An error occurred during login. Please try again.';
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