import { Component, OnInit } from "@angular/core";
import { SharedModule } from "../../shared/shared.module";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ReactiveFormService } from "../../shared/services/reactive-form.service";
import { IFieldControl } from "../../shared/interfaces";
import { InputTypes, RegexPatterns, ValidatorTypes } from "../../shared/enums";
import { RouterLink } from "@angular/router";

@Component({
    selector: 'app-register',
    templateUrl: './register.component.html',
    standalone: true,
    imports: [SharedModule, ReactiveFormsModule, RouterLink],
    styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
    form: FormGroup = new FormGroup({});
    isSubmitted: boolean = false;
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

    constructor(private readonly _formService: ReactiveFormService) {}

    ngOnInit() {
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
            console.log('Form submitted:', this.form.value);
        }
    }
}