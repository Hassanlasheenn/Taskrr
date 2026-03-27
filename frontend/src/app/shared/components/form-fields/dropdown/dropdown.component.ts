import { CommonModule } from "@angular/common";
import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, HostListener, ElementRef, forwardRef, ChangeDetectorRef } from "@angular/core";
import { FormGroup, ReactiveFormsModule, AbstractControl, ControlValueAccessor, NG_VALUE_ACCESSOR, FormControl } from "@angular/forms";
import { ICustomStyle, IFieldControl } from "../../../interfaces";
import { InputTypes } from "../../../enums";
import { ReactiveFormService } from "../../../services/reactive-form.service";
import { Subscription } from "rxjs";
import { trackById } from "../../../helpers/trackByFn.helper";

@Component({
    selector: 'app-dropdown-form',
    templateUrl: './dropdown.component.html',
    styleUrls: ['./dropdown.component.scss'],
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => DropdownFormComponent),
            multi: true
        }
    ]
})
export class DropdownFormComponent implements OnInit, OnDestroy, OnChanges, ControlValueAccessor {
    @Input() label: string = '';
    @Input() type: InputTypes = InputTypes.DROPDOWN;
    @Input() placeholder?: string;
    @Input() value: any = null;
    @Input() name: string = '';
    @Input() formGroup?: FormGroup;
    @Input() customInputStyle: ICustomStyle = {};
    @Input() customInputClass?: string;
    @Input() field?: IFieldControl;
    @Input() showErrors: boolean = false;
    @Input() isFilter: boolean = false;
    @Input() isBadge: boolean = false;
    
    errorMessage: string | null = null;
    isOpen: boolean = false;
    private readonly subscriptions: Subscription[] = [];
    trackById = trackById;

    // ControlValueAccessor members
    innerValue: any = null;
    onChange: any = () => {};
    onTouched: any = () => {};
    disabled: boolean = false;
    
    constructor(
        private readonly formService: ReactiveFormService,
        private readonly el: ElementRef,
        private readonly cdr: ChangeDetectorRef
    ) {}

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.el.nativeElement.contains(event.target)) {
            this.isOpen = false;
        }
    }

    ngOnInit() {
        if (this.formGroup && this.name) {
            this.setupValidation();
        }
    }

    ngOnDestroy() {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['showErrors'] && !changes['showErrors'].firstChange) {
            this.updateErrorMessage();
        }
        if (changes['value'] && !changes['value'].firstChange) {
            this.innerValue = this.value;
        }
    }

    private setupValidation(): void {
        const control = this.control;
        if (!control) return;

        const valueSub = control.valueChanges.subscribe((val) => {
            this.innerValue = val;
            this.updateErrorMessage();
            this.cdr.markForCheck();
        });
        this.subscriptions.push(valueSub);

        const statusSub = control.statusChanges.subscribe(() => {
            this.updateErrorMessage();
            this.cdr.markForCheck();
        });
        this.subscriptions.push(statusSub);
    }

    get control(): AbstractControl | null {
        return (this.formGroup && this.name) ? this.formGroup.get(this.name) : null;
    }

    get isInvalid(): boolean {
        const control = this.control;
        return !!(control && control.invalid && (this.showErrors || (control.touched && control.dirty)));
    }

    toggleDropdown(): void {
        if (this.disabled) return;
        this.isOpen = !this.isOpen;
    }

    selectOption(key: any): void {
        this.innerValue = key;
        this.onChange(key);
        this.onTouched();
        
        if (this.control) {
            this.control.setValue(key);
            this.control.markAsDirty();
            this.control.markAsTouched();
        }
        
        this.isOpen = false;
    }

    getSelectedLabel(): string {
        const val = this.control ? this.control.value : this.innerValue;
        const option = this.field?.options?.find(opt => opt.key == val);
        if (option) return option.value;
        return (val && val !== '') ? val : (this.placeholder || 'Select option');
    }

    getInputClasses(): { [key: string]: boolean } {
        const classes: { [key: string]: boolean } = {
            'input-error': this.isInvalid,
            'active': this.isOpen,
            'disabled': this.disabled
        };
        
        if (this.customInputClass) {
            classes[this.customInputClass] = true;
        }
        
        return classes;
    }

    updateErrorMessage(): void {
        if (this.field && this.control) {
            this.errorMessage = this.formService.getValidationError(this.control, this.field, this.showErrors);
        }
    }

    // ControlValueAccessor implementation
    writeValue(value: any): void {
        this.innerValue = value;
        this.cdr.markForCheck();
    }

    registerOnChange(fn: any): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: any): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.disabled = isDisabled;
        this.cdr.markForCheck();
    }
}
