import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, HostListener, ElementRef, forwardRef, ChangeDetectorRef } from "@angular/core";
import { FormGroup, ReactiveFormsModule, AbstractControl, ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { ICustomStyle, IFieldControl } from "../../../interfaces";
import { ReactiveFormService } from "../../../services/reactive-form.service";
import { Subscription } from "rxjs";
import { CommonModule } from "@angular/common";
import { getTomorrowISO, trackById } from "../../../helpers";

@Component({
    selector: 'app-date-picker',
    templateUrl: './date-picker.component.html',
    styleUrls: ['./date-picker.component.scss'],
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => DatePickerComponent),
            multi: true
        }
    ]
})
export class DatePickerComponent implements OnInit, OnDestroy, OnChanges, ControlValueAccessor {
    @Input() label: string = 'Due Date';
    @Input() placeholder: string = 'Select date';
    @Input() name: string = '';
    @Input() formGroup?: FormGroup;
    @Input() customInputStyle: ICustomStyle = {};
    @Input() customInputClass?: string;
    @Input() field?: IFieldControl;
    @Input() showErrors: boolean = false;
    @Input() minDate: string = '';
    @Input() maxDate: string = '';
    @Input() isFilter: boolean = false;
    @Input() isBadge: boolean = false;
    @Input() disabled: boolean = false;

    errorMessage: string | null = null;
    showPicker: boolean = false;
    popupStyle: { [key: string]: string } = {};
    viewDate: Date = new Date();
    calendarDays: (Date | null)[] = [];
    weekDays: string[] = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    months: string[] = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    trackById = trackById;

    private readonly subscriptions: Subscription[] = [];

    // ControlValueAccessor members
    innerValue: string = '';
    onChange: any = () => {};
    onTouched: any = () => {};

    constructor(
        private readonly formService: ReactiveFormService,
        private readonly el: ElementRef,
        private readonly cdr: ChangeDetectorRef
    ) {
        if (!this.minDate) {
            this.minDate = getTomorrowISO();
        }
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.el.nativeElement.contains(event.target)) {
            this.showPicker = false;
        }
    }

    ngOnInit() {
        if (this.field?.minDate) {
            this.minDate = this.field.minDate;
        }
        if (this.field?.maxDate) {
            this.maxDate = this.field.maxDate;
        }
        if (this.formGroup && this.name) {
            this.setupValidation();
        }
        this.generateCalendar();
        
        // Sync view date with existing value if any
        const currentVal = this.control ? this.control.value : this.innerValue;
        if (currentVal) {
            this.viewDate = new Date(currentVal);
        }
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
        const control = this.control;
        if (!control) return;

        this.subscriptions.push(control.valueChanges.subscribe((val) => {
            this.innerValue = val;
            this.updateErrorMessage();
            this.cdr.markForCheck();
        }));
        this.subscriptions.push(control.statusChanges.subscribe(() => {
            this.updateErrorMessage();
            this.cdr.markForCheck();
        }));
    }

    generateCalendar(): void {
        const year = this.viewDate.getFullYear();
        const month = this.viewDate.getMonth();
        
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const days: (Date | null)[] = [];
        
        // Add empty slots for days before the 1st
        for (let i = 0; i < firstDayOfMonth; i++) {
            days.push(null);
        }
        
        // Add days of the month
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i));
        }
        
        this.calendarDays = days;
    }

    togglePicker(): void {
        if (this.disabled) return;
        this.showPicker = !this.showPicker;
        if (this.showPicker) {
            const currentVal = this.control ? this.control.value : this.innerValue;
            this.viewDate = currentVal ? new Date(currentVal) : new Date();
            this.generateCalendar();
            this.calculatePopupPosition();
        }
    }

    private calculatePopupPosition(): void {
        const container = this.el.nativeElement.querySelector('.date-picker__container');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const popupWidth = 300;
        const viewportWidth = window.innerWidth;

        if (rect.left + popupWidth > viewportWidth) {
            // Popup would overflow right edge — align to right
            this.popupStyle = { left: 'auto', right: '0' };
        } else {
            this.popupStyle = { left: '0', right: 'auto' };
        }
    }

    prevMonth(event: MouseEvent): void {
        event.stopPropagation();
        this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() - 1, 1);
        this.generateCalendar();
    }

    nextMonth(event: MouseEvent): void {
        event.stopPropagation();
        this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + 1, 1);
        this.generateCalendar();
    }

    selectDate(date: Date | null, event: MouseEvent): void {
        event.stopPropagation();
        if (!date || this.isDateDisabled(date)) return;
        
        // Ensure we store only the date part in YYYY-MM-DD format
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;
        
        this.innerValue = dateString;
        this.onChange(dateString);
        this.onTouched();

        if (this.control) {
            this.control.setValue(dateString);
            this.control.markAsDirty();
            this.control.markAsTouched();
        }
        this.showPicker = false;
        this.cdr.markForCheck();
    }

    isDateSelected(date: Date | null): boolean {
        if (!date) return false;
        const currentVal = this.control ? this.control.value : this.innerValue;
        if (!currentVal) return false;
        
        // Parse currentVal carefully (could be ISO string or YYYY-MM-DD)
        const d = new Date(currentVal);
        return date.getDate() === d.getDate() && 
               date.getMonth() === d.getMonth() && 
               date.getFullYear() === d.getFullYear();
    }

    isDateDisabled(date: Date | null): boolean {
        if (!date) return false;
        
        const compareDate = new Date(date);
        compareDate.setHours(0, 0, 0, 0);

        if (this.minDate) {
            const min = new Date(this.minDate);
            min.setHours(0, 0, 0, 0);
            if (compareDate < min) return true;
        }
        if (this.maxDate) {
            const max = new Date(this.maxDate);
            max.setHours(23, 59, 59, 999);
            if (compareDate > max) return true;
        }
        return false;
    }

    isToday(date: Date | null): boolean {
        if (!date) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date.getDate() === today.getDate() && 
               date.getMonth() === today.getMonth() && 
               date.getFullYear() === today.getFullYear();
    }

    get control(): AbstractControl | null {
        return (this.formGroup && this.name) ? this.formGroup.get(this.name) : null;
    }

    get isInvalid(): boolean {
        const control = this.control;
        return !!(control && control.invalid && (this.showErrors || (control.touched && control.dirty)));
    }

    get formattedValue(): string {
        const val = this.control ? this.control.value : this.innerValue;
        if (!val) return '';
        
        // Handle potentially different date formats
        const date = new Date(val);
        if (isNaN(date.getTime())) return '';
        
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    getInputClasses(): { [key: string]: boolean } {
        return { 'input-error': this.isInvalid, 'active': this.showPicker, 'disabled': this.disabled };
    }

    updateErrorMessage(): void {
        if (this.field && this.control) {
            this.errorMessage = this.formService.getValidationError(this.control, this.field, this.showErrors);
        }
    }

    // ControlValueAccessor implementation
    writeValue(value: any): void {
        this.innerValue = value || '';
        if (value) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                this.viewDate = date;
                this.generateCalendar();
            }
        }
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
