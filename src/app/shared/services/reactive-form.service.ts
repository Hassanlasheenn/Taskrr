import { Injectable } from "@angular/core";
import { FormBuilder, FormGroup, Validators, AbstractControl, ValidatorFn } from "@angular/forms";
import { IFieldControl, IValidations } from "../interfaces";
import { ValidatorTypes, RegexPatterns, InputTypes } from "../enums";

@Injectable({
    providedIn: 'root',
})
export class ReactiveFormService {
    constructor(
        private readonly fb: FormBuilder,
    ) {}

    initializeForm(fields: IFieldControl[]): FormGroup {
        const controls: { [key: string]: any } = {};
        fields.forEach((field: IFieldControl) => {
            const validators = this.buildValidators(field, fields);
            controls[field.formControlName] = [
                { value: field?.value || '', disabled: field?.disabled || false },
                validators
            ];
        });
        return this.fb.group(controls);
    }

    private buildValidators(field: IFieldControl, allFields: IFieldControl[]): ValidatorFn[] {
        const validators: ValidatorFn[] = [];

        if (field.required) {
            validators.push(Validators.required);
        }

        if (field.type === InputTypes.EMAIL) {
            validators.push(Validators.pattern(RegexPatterns.EMAIL));
        }

        if (field.validations && field.validations.length > 0) {
            field.validations.forEach((validation: IValidations) => {
                const validator = this.getValidator(validation, field, allFields);
                if (validator) {
                    validators.push(validator);
                }
            });
        }

        return validators;
    }

    private getValidator(validation: IValidations, field: IFieldControl, allFields: IFieldControl[]): ValidatorFn | null {
        const validationType = validation.type.toLowerCase();
        switch (validationType) {
            case ValidatorTypes.MINLENGTH:
                return Validators.minLength(validation.value || 0);
            case ValidatorTypes.MAXLENGTH:
                return Validators.maxLength(validation.value || 0);
            case ValidatorTypes.PATTERN:
                return Validators.pattern(validation.value || '');
            case ValidatorTypes.EMAIL:
                return Validators.email;
            case 'passwordmatch':
                return this.passwordMatchValidator(validation.value || 'password');
            default:
                return null;
        }
    }

    private passwordMatchValidator(passwordFieldName: string): ValidatorFn {
        return (control: AbstractControl): { [key: string]: any } | null => {
            if (!control.parent) return null;

            const passwordControl = control.parent.get(passwordFieldName);
            if (!passwordControl) return null;

            const passwordValue = passwordControl.value;
            const confirmPasswordValue = control.value;

            if (!passwordValue && !confirmPasswordValue) return null;

            if (passwordValue !== confirmPasswordValue) {
                return { passwordMatch: true };
            }

            return null;
        };
    }

    getValidationError(control: AbstractControl | null, field: IFieldControl, showErrors: boolean = false): string | null {
        if (!this.shouldShowError(control, showErrors)) {
            return null;
        }

        const errors = control!.errors!;
        const customError = this.getCustomValidationError(errors, field);
        if (customError) {
            return customError;
        }

        return this.getDefaultError(errors, field);
    }

    private shouldShowError(control: AbstractControl | null, showErrors: boolean): boolean {
        return showErrors && !!control && control.invalid && !!control.errors && control.touched;
    }

    private getCustomValidationError(errors: any, field: IFieldControl): string | null {
        if (!field.validations || field.validations.length === 0) {
            return null;
        }

        for (const validation of field.validations) {
            const errorKey = this.getErrorKey(validation.type);
            if (errors[errorKey]) {
                if (errorKey === 'required' && validation.type === ValidatorTypes.REQUIRED) {
                    return validation.message || `${field.label} is required`;
                }
                return validation.message;
            }
        }

        return null;
    }

    private getDefaultError(errors: any, field: IFieldControl): string | null {
        if (errors['required']) {
            return `${field.label} is required`;
        }

        if (field.type === InputTypes.EMAIL && errors['pattern']) {
            return 'Please enter a valid email address (e.g., user@example.com)';
        }

        if (errors[ValidatorTypes.EMAIL]) {
            return 'Please enter a valid email address';
        }

        if (errors['passwordMatch']) {
            return 'Passwords do not match';
        }

        return null;
    }

    private getErrorKey(validationType: string): string {
        switch (validationType) {
            case ValidatorTypes.MINLENGTH:
                return 'minlength';
            case ValidatorTypes.MAXLENGTH:
                return 'maxlength';
            case ValidatorTypes.PATTERN:
                return 'pattern';
            case ValidatorTypes.PASSWORD_MATCH:
                return 'passwordMatch';
            default:
                return validationType;
        }
    }
}