import { CommonModule } from "@angular/common";
import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from "@angular/core";
import { FormGroup, ReactiveFormsModule, AbstractControl } from "@angular/forms";
import { ICustomStyle, IFieldControl } from "../../../interfaces";
import { InputTypes } from "../../../enums";
import { ReactiveFormService } from "../../../services/reactive-form.service";
import { Subscription } from "rxjs";

@Component({
    selector: 'app-input-form',
    templateUrl: './input.component.html',
    styleUrls: ['./input.component.scss'],
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule]
})
export class InputFormComponent implements OnInit, OnDestroy, OnChanges {
    @Input() label: string = '';
    @Input() type: InputTypes = InputTypes.TEXT;
    @Input() placeholder?: string;
    @Input() value: string = '';
    @Input() name: string = '';
    @Input() formGroup: FormGroup = new FormGroup({});
    @Input() customInputStyle: ICustomStyle = {};
    @Input() customInputClass?: string;
    @Input() field?: IFieldControl;
    @Input() showErrors: boolean = false;
    @Input() isFilter: boolean = false;
    @Input() disabled: boolean = false;
    
    errorMessage: string | null = null;
    showPassword: boolean = false;
    private readonly subscriptions: Subscription[] = [];
    
    constructor(
        private readonly formService: ReactiveFormService
    ) {}

    ngOnInit() {
        this.setupValidation();
    }

    ngOnDestroy() {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['showErrors'] && !changes['showErrors'].firstChange) {
            this.updateErrorMessage();
        }
        if (changes['disabled']) {
            if (this.disabled) {
                this.control?.disable({ emitEvent: false });
            } else {
                this.control?.enable({ emitEvent: false });
            }
        }
    }

    private setupValidation(): void {
        const control = this.formGroup.get(this.name);
        if (!control) return;

        const valueSub = control.valueChanges.subscribe(() => {
            this.updateErrorMessage();
        });
        this.subscriptions.push(valueSub);

        const statusSub = control.statusChanges.subscribe(() => {
            this.updateErrorMessage();
        });
        this.subscriptions.push(statusSub);
    }

    get control(): AbstractControl | null {
        return this.formGroup.get(this.name);
    }

    get isInvalid(): boolean {
        const control = this.control;
        // Check if either it was submitted or if the user touched it and modified it (dirty)
        return !!(control && control.invalid && (this.showErrors || (control.touched && control.dirty)));
    }

    getInputClasses(): { [key: string]: boolean } {
        const classes: { [key: string]: boolean } = {
            'input-error': this.isInvalid,
            'disabled': this.disabled
        };

        if (this.customInputClass) {
            classes[this.customInputClass] = true;
        }

        return classes;
    }

    updateErrorMessage(): void {
        if (this.field) {
            this.errorMessage = this.formService.getValidationError(this.control, this.field, this.showErrors);
        }
    }

    get isPasswordField(): boolean {
        return this.type === InputTypes.PASSWORD;
    }

    get isCheckbox(): boolean {
        return this.type === InputTypes.CHECKBOX;
    }

    get inputType(): string {
        if (this.isCheckbox) return 'checkbox';
        return this.isPasswordField && this.showPassword ? 'text' : this.type;
    }

    togglePasswordVisibility(): void {
        this.showPassword = !this.showPassword;
    }
}