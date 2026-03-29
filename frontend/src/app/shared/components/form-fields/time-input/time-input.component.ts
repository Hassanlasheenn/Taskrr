import { CommonModule } from "@angular/common";
import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, ChangeDetectorRef } from "@angular/core";
import { FormGroup, ReactiveFormsModule, AbstractControl } from "@angular/forms";
import { ICustomStyle, IFieldControl } from "../../../interfaces";
import { ReactiveFormService } from "../../../services/reactive-form.service";
import { Subscription } from "rxjs";

@Component({
    selector: 'app-time-input',
    templateUrl: './time-input.component.html',
    styleUrls: ['./time-input.component.scss'],
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule]
})
export class TimeInputComponent implements OnInit, OnDestroy, OnChanges {
    @Input() label: string = 'Time Estimate';
    @Input() placeholder: string = 'e.g., 1w 2d 3h 30m';
    @Input() name: string = '';
    @Input() formGroup?: FormGroup;
    @Input() customInputStyle: ICustomStyle = {};
    @Input() customInputClass?: string;
    @Input() field?: IFieldControl;
    @Input() showErrors: boolean = false;
    
    errorMessage: string | null = null;
    typeError: string | null = null;
    private readonly subscriptions: Subscription[] = [];

    static validateTimeString(value: string): string | null {
        if (!value?.trim()) return null;
        const unitOrder = ['w', 'd', 'h', 'm'];
        const tokenRegex = /^(\d+)(w|d|h|m)$/i;
        const tokens = value.trim().split(/\s+/);
        let lastUnitIndex = -1;
        const seen = new Set<string>();
        for (const token of tokens) {
            const match = token.match(tokenRegex);
            if (!match) return 'Use format: 1w 2d 3h 30m';
            const unit = match[2].toLowerCase();
            const num = parseInt(match[1], 10);
            if (num <= 0) return 'Amounts must be greater than 0';
            if (seen.has(unit)) return `Duplicate unit "${unit}"`;
            const idx = unitOrder.indexOf(unit);
            if (idx <= lastUnitIndex) return 'Order must be: w → d → h → m';
            seen.add(unit);
            lastUnitIndex = idx;
        }
        return null;
    }

    get activeError(): string | null {
        if (this.typeError) return this.typeError;
        if (this.isInvalid && this.errorMessage) return this.errorMessage;
        return null;
    }

    quickOptions = [
        { label: '30m', value: '30m' },
        { label: '1h', value: '1h' },
        { label: '2h', value: '2h' },
        { label: '4h', value: '4h' },
        { label: '1d', value: '1d' },
        { label: '1w', value: '1w' }
    ];

    constructor(
        private readonly formService: ReactiveFormService,
        private readonly cdr: ChangeDetectorRef
    ) {}

    ngOnInit() {
        this.setupValidation();
    }

    ngOnDestroy() {
        this._clearSubscriptions();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['showErrors'] && !changes['showErrors'].firstChange) {
            this.updateErrorMessage();
        }
        if ((changes['formGroup'] || changes['name']) && !changes['formGroup']?.firstChange && !changes['name']?.firstChange) {
            this.setupValidation();
        }
    }

    private _clearSubscriptions(): void {
        this.subscriptions.forEach(sub => sub.unsubscribe());
        this.subscriptions.length = 0;
    }

    private setupValidation(): void {
        this._clearSubscriptions();
        const control = this.control;
        if (!control) return;

        const valueSub = control.valueChanges.subscribe((val) => {
            this.typeError = TimeInputComponent.validateTimeString(val);
            this.updateErrorMessage();
            this.cdr.markForCheck();
        });
        this.subscriptions.push(valueSub);

        const statusSub = control.statusChanges.subscribe(() => {
            this.updateErrorMessage();
            this.cdr.markForCheck();
        });
        this.subscriptions.push(statusSub);
        
        // Initial check
        this.typeError = TimeInputComponent.validateTimeString(control.value);
        this.updateErrorMessage();
    }

    get control(): AbstractControl | null {
        return (this.formGroup && this.name) ? this.formGroup.get(this.name) : null;
    }

    get isInvalid(): boolean {
        const control = this.control;
        return !!(control && control.invalid && (this.showErrors || (control.touched && control.dirty)));
    }

    updateErrorMessage(): void {
        if (this.field && this.control) {
            this.errorMessage = this.formService.getValidationError(this.control, this.field, this.showErrors);
        }
    }

    onQuickSelect(value: string): void {
        const control = this.control;
        if (!control || control.disabled) return;

        const currentVal = control.value || '';
        let newVal = value;

        if (currentVal && !currentVal.includes(value)) {
            newVal = `${currentVal} ${value}`.trim();
        }

        control.setValue(newVal);
        control.markAsDirty();
        control.markAsTouched();
    }

    onClear(): void {
        const control = this.control;
        if (!control || control.disabled) return;
        control.setValue('');
        control.markAsDirty();
        control.markAsTouched();
    }
}
