import { Component, OnInit, Input, OnChanges, SimpleChanges, Output, EventEmitter } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ITodo } from "../../../../../core/interfaces/todo.interface";

@Component({
    selector: 'app-calendar',
    templateUrl: './calendar.component.html',
    styleUrls: ['./calendar.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class CalendarComponent implements OnInit, OnChanges {
    @Input() todos: ITodo[] = [];
    @Output() viewTodo = new EventEmitter<ITodo>();

    currentDate: Date = new Date();
    currentMonth: number = this.currentDate.getMonth();
    currentYear: number = this.currentDate.getFullYear();
    
    weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    monthNames: string[] = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    calendarDays: (Date | null)[] = [];
    selectedDate: Date | null = null;
    selectedDayTodos: ITodo[] = [];
    isDayView: boolean = false;
    hours: number[] = Array.from({ length: 24 }, (_, i) => (i + 9) % 24);

    ngOnInit(): void {
        this.generateCalendar();
    }

    generateCalendar(): void {
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        this.calendarDays = [];

        for (let i = 0; i < startingDayOfWeek; i++) {
            this.calendarDays.push(null);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            this.calendarDays.push(new Date(this.currentYear, this.currentMonth, day));
        }
    }

    isToday(date: Date | null): boolean {
        if (!date) return false;
        const today = new Date();
        return date.getDate() === today.getDate() &&
               date.getMonth() === today.getMonth() &&
               date.getFullYear() === today.getFullYear();
    }

    isCurrentMonth(date: Date | null): boolean {
        return date !== null && date.getMonth() === this.currentMonth;
    }

    previousMonth(): void {
        if (this.currentMonth === 0) {
            this.currentMonth = 11;
            this.currentYear--;
        } else {
            this.currentMonth--;
        }
        this.generateCalendar();
    }

    nextMonth(): void {
        if (this.currentMonth === 11) {
            this.currentMonth = 0;
            this.currentYear++;
        } else {
            this.currentMonth++;
        }
        this.generateCalendar();
    }

    goToToday(): void {
        this.currentDate = new Date();
        this.currentMonth = this.currentDate.getMonth();
        this.currentYear = this.currentDate.getFullYear();
        this.generateCalendar();
    }

    getMonthYearLabel(): string {
        return `${this.monthNames[this.currentMonth]} ${this.currentYear}`;
    }

    trackByDate(index: number, date: Date | null): any {
        return date ? date.getTime() : index;
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['todos'] && !changes['todos'].firstChange) {
        }
    }

    getTodosForDate(date: Date | null): ITodo[] {
        if (!date) return [];
        const compareDate = new Date(date);
        
        return this.todos.filter(todo => {
            if (!todo.created_at) return false;
            const todoDate = this.parseTodoDate(todo.created_at);
            
            return todoDate.getFullYear() === compareDate.getFullYear() &&
                   todoDate.getMonth() === compareDate.getMonth() &&
                   todoDate.getDate() === compareDate.getDate();
        });
    }

    isDueDate(todo: ITodo, date: Date | null): boolean {
        if (!date || !(todo as any).due_date) return false;
        const dueDate = this.parseTodoDate((todo as any).due_date);
        return dueDate.getFullYear() === date.getFullYear() &&
               dueDate.getMonth() === date.getMonth() &&
               dueDate.getDate() === date.getDate();
    }

    isOverdue(dateString?: string): boolean {
        if (!dateString) return false;
        const dueDate = new Date(dateString);
        dueDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return dueDate <= today;
    }

    getDueDateUrgencyClass(dateString?: string): string {
        if (!dateString) return '';
        
        const dueDate = new Date(dateString);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 3) return 'urgency-high';
        if (diffDays <= 10) return 'urgency-medium';
        return 'urgency-low';
    }

    getPriorityClass(priority: string): string {
        return `priority-${priority}`;
    }

    onDayClick(date: Date | null): void {
        if (!date) return;
        
        this.selectedDate = date;
        this.selectedDayTodos = this.getTodosForDate(date);
        this.isDayView = true;
    }

    closeDayView(): void {
        this.isDayView = false;
        this.selectedDate = null;
        this.selectedDayTodos = [];
    }

    parseTodoDate(dateString: string): Date {
        if (dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
            return new Date(dateString);
        } else {
            return new Date(dateString.replace('T', ' '));
        }
    }

    getTodosForHour(hour: number): ITodo[] {
        if (!this.selectedDate) return [];
        
        const todosInHour = this.selectedDayTodos.filter(todo => {
            const dateStr = (todo as any).due_date || todo.created_at;
            if (!dateStr) return false;
            
            const todoDate = this.parseTodoDate(dateStr);
            return todoDate.getHours() === hour;
        });

        return todosInHour.sort((a, b) => {
            const dateAStr = (a as any).due_date || a.created_at;
            const dateBStr = (b as any).due_date || b.created_at;
            if (!dateAStr || !dateBStr) return 0;
            
            const dateA = this.parseTodoDate(dateAStr);
            const dateB = this.parseTodoDate(dateBStr);
            return dateA.getTime() - dateB.getTime();
        });
    }

    getTodoTimeIndicator(todo: ITodo): string {
        const dueDateStr = (todo as any).due_date;
        if (!dueDateStr) return '';
        
        const todoDate = this.parseTodoDate(dueDateStr);
        const minutes = todoDate.getMinutes();
        const seconds = todoDate.getSeconds();
        
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    getTodoPositionPercent(todo: ITodo): number {
        const dueDateStr = (todo as any).due_date;
        if (!dueDateStr) return 0;
        
        const todoDate = this.parseTodoDate(dueDateStr);
        const minutes = todoDate.getMinutes();
        const seconds = todoDate.getSeconds();
        
        const totalSeconds = (minutes * 60) + seconds;
        const percentage = (totalSeconds / 3600) * 100;
        
        return Math.min(percentage, 95);
    }

    formatHour(hour: number): string {
        const h = hour % 12 || 12;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return `${h}:00 ${ampm}`;
    }

    getHourLabel(hour: number): string {
        const h = hour % 12 || 12;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return `${h} ${ampm}`;
    }

    formatSelectedDate(): string {
        if (!this.selectedDate) return '';
        const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = weekDays[this.selectedDate.getDay()];
        const day = this.selectedDate.getDate();
        const month = this.monthNames[this.selectedDate.getMonth()];
        const year = this.selectedDate.getFullYear();
        return `${dayName}, ${month} ${day}, ${year}`;
    }

    formatTime(dateString?: string): string {
        if (!dateString) return '';
        
        const date = this.parseTodoDate(dateString);
        
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${minutes} ${ampm}`;
    }

    formatFullDate(dateString?: string): string {
        if (!dateString) return '';
        const date = this.parseTodoDate(dateString);
        return date.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    onViewTodo(todo: ITodo, event: MouseEvent): void {
        event.stopPropagation();
        this.viewTodo.emit(todo);
    }

    trackByTodo(index: number, todo: ITodo): number {
        return todo.id;
    }
}

