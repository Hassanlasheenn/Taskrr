import { CommonModule } from "@angular/common";
import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, HostListener, ElementRef } from "@angular/core";
import { FormGroup, ReactiveFormsModule, AbstractControl } from "@angular/forms";
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
    isOpen: boolean = false;
    private readonly subscriptions: Subscription[] = [];
    trackById = trackById;
    
    constructor(
        private readonly formService: ReactiveFormService,
        private readonly el: ElementRef
    ) {}

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.el.nativeElement.contains(event.target)) {
            this.isOpen = false;
        }
    }

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
        const control = this.control;
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

    toggleDropdown(): void {
        this.isOpen = !this.isOpen;
    }

    selectOption(key: any): void {
        this.control?.setValue(key);
        this.control?.markAsDirty();
        this.control?.markAsTouched();
        this.isOpen = false;
    }

    getSelectedLabel(): string {
        const val = this.control?.value;
        const option = this.field?.options?.find(opt => opt.key == val);
        return option ? option.value : (this.placeholder || 'Select option');
    }

    getInputClasses(): { [key: string]: boolean } {
        const classes: { [key: string]: boolean } = {
            'input-error': this.isInvalid,
            'active': this.isOpen
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
