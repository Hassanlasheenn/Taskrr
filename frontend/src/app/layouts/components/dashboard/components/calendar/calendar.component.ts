import { Component, OnInit, Input, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ITodo } from "../../../todo-list/todo-list.component";

@Component({
    selector: 'app-calendar',
    templateUrl: './calendar.component.html',
    styleUrls: ['./calendar.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class CalendarComponent implements OnInit, OnChanges {
    @Input() todos: ITodo[] = [];

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
    hours: number[] = Array.from({ length: 24 }, (_, i) => (i + 9) % 24); // 9 AM to 8 AM next day (9-8)

    ngOnInit(): void {
        this.generateCalendar();
    }

    generateCalendar(): void {
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        this.calendarDays = [];

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < startingDayOfWeek; i++) {
            this.calendarDays.push(null);
        }

        // Add all days of the month
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
            // Calendar will re-render automatically when todos change
        }
    }

    getTodosForDate(date: Date | null): ITodo[] {
        if (!date) return [];
        
        return this.todos.filter(todo => {
            if (!todo.created_at) return false;
            
            const todoDate = this.parseTodoDate(todo.created_at);
            const compareDate = new Date(date);
            
            // Compare year, month, and day
            return todoDate.getFullYear() === compareDate.getFullYear() &&
                   todoDate.getMonth() === compareDate.getMonth() &&
                   todoDate.getDate() === compareDate.getDate();
        });
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
        // Parse the date - if it doesn't have timezone info, treat as local time
        if (dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
            // Has timezone info - parse normally (will convert to local)
            return new Date(dateString);
        } else {
            // No timezone info - treat as local time, not UTC
            // Replace 'T' with space and parse without timezone conversion
            return new Date(dateString.replace('T', ' '));
        }
    }

    getTodosForHour(hour: number): ITodo[] {
        if (!this.selectedDate) return [];
        
        const todosInHour = this.selectedDayTodos.filter(todo => {
            if (!todo.created_at) return false;
            
            const todoDate = this.parseTodoDate(todo.created_at);
            return todoDate.getHours() === hour;
        });

        // Sort by exact time (minutes and seconds)
        return todosInHour.sort((a, b) => {
            if (!a.created_at || !b.created_at) return 0;
            const dateA = this.parseTodoDate(a.created_at);
            const dateB = this.parseTodoDate(b.created_at);
            return dateA.getTime() - dateB.getTime();
        });
    }

    getTodoTimeIndicator(todo: ITodo): string {
        if (!todo.created_at) return '';
        
        const todoDate = this.parseTodoDate(todo.created_at);
        const minutes = todoDate.getMinutes();
        const seconds = todoDate.getSeconds();
        
        // Return formatted time with minutes and seconds
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    getTodoPositionPercent(todo: ITodo): number {
        if (!todo.created_at) return 0;
        
        const todoDate = this.parseTodoDate(todo.created_at);
        const minutes = todoDate.getMinutes();
        const seconds = todoDate.getSeconds();
        
        // Calculate position as percentage of the hour (0-100%)
        // 60 minutes * 60 seconds = 3600 seconds in an hour
        const totalSeconds = (minutes * 60) + seconds;
        const percentage = (totalSeconds / 3600) * 100;
        
        return Math.min(percentage, 95); // Cap at 95% to prevent overflow
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

    trackByTodo(index: number, todo: ITodo): number {
        return todo.id;
    }
}

