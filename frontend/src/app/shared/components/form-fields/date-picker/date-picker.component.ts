import { Component, Input, OnInit, OnDestroy, OnChanges, SimpleChanges, HostListener, ElementRef } from "@angular/core";
import { FormGroup, ReactiveFormsModule, AbstractControl } from "@angular/forms";
import { ICustomStyle, IFieldControl } from "../../../interfaces";
import { ReactiveFormService } from "../../../services/reactive-form.service";
import { Subscription } from "rxjs";
import { CommonModule } from "@angular/common";

@Component({
    selector: 'app-date-picker',
    templateUrl: './date-picker.component.html',
    styleUrls: ['./date-picker.component.scss'],
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule]
})
export class DatePickerComponent implements OnInit, OnDestroy, OnChanges {
    @Input() label: string = 'Due Date';
    @Input() placeholder: string = 'Select date';
    @Input() name: string = '';
    @Input() formGroup: FormGroup = new FormGroup({});
    @Input() customInputStyle: ICustomStyle = {};
    @Input() customInputClass?: string;
    @Input() field?: IFieldControl;
    @Input() showErrors: boolean = false;
    @Input() minDate: string = '';

    errorMessage: string | null = null;
    showPicker: boolean = false;
    viewDate: Date = new Date();
    calendarDays: (Date | null)[] = [];
    weekDays: string[] = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    months: string[] = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    private readonly subscriptions: Subscription[] = [];

    constructor(
        private readonly formService: ReactiveFormService,
        private readonly el: ElementRef
    ) {
        if (!this.minDate) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            this.minDate = today.toISOString().split('T')[0];
        }
    }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this.el.nativeElement.contains(event.target)) {
            this.showPicker = false;
        }
    }

    ngOnInit() {
        this.setupValidation();
        this.generateCalendar();
        
        // Sync view date with existing value if any
        const currentVal = this.formGroup.get(this.name)?.value;
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
    }

    private setupValidation(): void {
        const control = this.formGroup.get(this.name);
        if (!control) return;

        this.subscriptions.push(control.valueChanges.subscribe(() => this.updateErrorMessage()));
        this.subscriptions.push(control.statusChanges.subscribe(() => this.updateErrorMessage()));
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
        this.showPicker = !this.showPicker;
        if (this.showPicker) {
            const currentVal = this.formGroup.get(this.name)?.value;
            this.viewDate = currentVal ? new Date(currentVal) : new Date();
            this.generateCalendar();
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
        
        const offset = date.getTimezoneOffset();
        const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
        const dateString = adjustedDate.toISOString().split('T')[0];
        
        this.formGroup.get(this.name)?.setValue(dateString);
        this.formGroup.get(this.name)?.markAsTouched();
        this.showPicker = false;
    }

    isDateSelected(date: Date | null): boolean {
        if (!date) return false;
        const currentVal = this.formGroup.get(this.name)?.value;
        if (!currentVal) return false;
        
        const d = new Date(currentVal);
        return date.getDate() === d.getDate() && 
               date.getMonth() === d.getMonth() && 
               date.getFullYear() === d.getFullYear();
    }

    isDateDisabled(date: Date | null): boolean {
        if (!date) return false;
        const min = new Date(this.minDate);
        min.setHours(0, 0, 0, 0);
        return date < min;
    }

    isToday(date: Date | null): boolean {
        if (!date) return false;
        const today = new Date();
        return date.getDate() === today.getDate() && 
               date.getMonth() === today.getMonth() && 
               date.getFullYear() === today.getFullYear();
    }

    get control(): AbstractControl | null {
        return this.formGroup.get(this.name);
    }

    get isInvalid(): boolean {
        const control = this.control;
        return !!(control && control.invalid && (this.showErrors || (control.touched && control.dirty)));
    }

    get formattedValue(): string {
        const val = this.control?.value;
        if (!val) return '';
        const date = new Date(val);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    getInputClasses(): { [key: string]: boolean } {
        return { 'input-error': this.isInvalid, 'active': this.showPicker };
    }

    updateErrorMessage(): void {
        if (this.field) {
            this.errorMessage = this.formService.getValidationError(this.control, this.field, this.showErrors);
        }
    }
}
