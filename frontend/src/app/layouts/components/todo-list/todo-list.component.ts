import { CommonModule } from "@angular/common";
import { Component, Input, Output, EventEmitter } from "@angular/core";

export interface ITodo {
    id: number;
    title: string;
    description?: string;
    completed: boolean;
    priority: 'low' | 'medium' | 'high';
    order_index: number;
    created_at?: string;
    user_id?: number;
}

@Component({
    selector: 'app-todo-list',
    templateUrl: './todo-list.component.html',
    styleUrls: ['./todo-list.component.scss'],
    standalone: true,
    imports: [CommonModule],
})
export class TodoListComponent {
    @Input() todos: ITodo[] = [];
    @Input() totalCount: number = 0;
    @Output() addTodo = new EventEmitter<void>();
    @Output() toggleTodo = new EventEmitter<ITodo>();
    @Output() deleteTodo = new EventEmitter<ITodo>();
    @Output() editTodo = new EventEmitter<ITodo>();

    onAddTodo(): void {
        this.addTodo.emit();
    }

    onToggleTodo(todo: ITodo): void {
        this.toggleTodo.emit(todo);
    }

    onEditTodo(todo: ITodo): void {
        this.editTodo.emit(todo);
    }

    onDeleteTodo(todo: ITodo): void {
        this.deleteTodo.emit(todo);
    }

    trackById(index: number, item: ITodo): number {
        return item.id;
    }

    getPriorityClass(priority: string): string {
        return `priority-${priority}`;
    }

    getPriorityIcon(priority: string): string {
        switch (priority) {
            case 'high': return 'bi-arrow-up';
            case 'low': return 'bi-arrow-down';
            default: return 'bi-dash';
        }
    }

    formatDate(dateString?: string): { date: string; day: string; time: string } | null {
        if (!dateString) return null;
        
        // Parse the date - if it doesn't have timezone info, treat as local time
        let date: Date;
        if (dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
            // Has timezone info - parse normally (will convert to local)
            date = new Date(dateString);
        } else {
            // No timezone info - treat as local time, not UTC
            // Replace 'T' with space and parse without timezone conversion
            date = new Date(dateString.replace('T', ' '));
        }
        
        // Format: dd/mm/yyyy
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        
        // Week day name
        const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const weekDay = weekDays[date.getDay()];
        
        // Time: HH:MM AM/PM
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12; // 0 becomes 12
        const formattedTime = `${hours}:${minutes} ${ampm}`;
        
        return {
            date: formattedDate,
            day: weekDay,
            time: formattedTime
        };
    }
}

