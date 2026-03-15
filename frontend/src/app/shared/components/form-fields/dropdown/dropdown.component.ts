import { CommonModule } from "@angular/common";
import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges } from "@angular/core";
import { FormGroup, ReactiveFormsModule, AbstractControl } from "@angular/forms";
import { ICustomStyle, IFieldControl } from "../../../interfaces";
import { InputTypes } from "../../../enums";
import { ReactiveFormService } from "../../../services/reactive-form.service";
import { Subscription } from "rxjs";

@Component({
    selector: 'app-dropdown-form',
    templateUrl: './dropdown.component.html',
    styleUrls: ['./dropdown.component.scss'],
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule]
})
export class DropdownFormComponent implements OnInit, OnDestroy, OnChanges {
    @Input() label: string = '';
    @Input() type: InputTypes = InputTypes.DROPDOWN;
    @Input() placeholder?: string;
    @Input() value: number | null = null;
    @Input() name: string = '';
    @Input() formGroup: FormGroup = new FormGroup({});
    @Input() customInputStyle: ICustomStyle = {};
    @Input() customInputClass?: string;
    @Input() field?: IFieldControl;
    @Input() showErrors: boolean = false;
    
    errorMessage: string | null = null;
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
        return !!(control && control.invalid && (this.showErrors || (control.touched && control.dirty)));
    }

    getInputClasses(): { [key: string]: boolean } {
        const classes: { [key: string]: boolean } = {
            'input-error': this.isInvalid
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
}
