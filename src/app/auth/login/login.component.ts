import { Component, OnInit } from "@angular/core";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { SharedModule } from "../../shared/shared.module";
import { IFieldControl } from "../../shared/interfaces/IFieldControl.interface";
import { InputTypes } from "../../shared/enums/input-types.enum";
import { ReactiveFormService } from "../../shared/services/reactive-form.service";
import { RouterLink } from "@angular/router";
import { ValidatorTypes } from "../../shared/enums/validator-types.enum";
import { RegexPatterns } from "../../shared/enums/regex-patterns.enum";

@Component({
    selector: 'app-login',
    standalone: true,
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    imports: [SharedModule, ReactiveFormsModule, RouterLink],
})
export class LoginComponent implements OnInit {
    form: FormGroup = new FormGroup({});
    isSubmitted: boolean = false;
    fields: IFieldControl[] = [
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
    constructor(
        private readonly _formService: ReactiveFormService,
    ) {}

    ngOnInit(): void {
        this.initForm();
    }

    private initForm(): void {
        this.form = this._formService.initializeForm(this.fields);
    }

    loginUser(): void {
        if(this.form?.invalid) {
            this.isSubmitted = true;
        } else if(this.form?.valid) {
            this.isSubmitted = false;
            console.log('Form submitted:', this.form.value);
        }
    }
}