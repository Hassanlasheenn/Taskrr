import { CommonModule } from "@angular/common";
import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from "@angular/core";
import { AuthService } from "../../../auth/services";

export interface ITodo {
    id: number;
    title: string;
    description?: string;
    completed: boolean;
    priority: 'low' | 'medium' | 'high';
    category?: string;
    order_index: number;
    created_at?: string;
    updated_at?: string;
    user_id?: number;
    assigned_to_user_id?: number | null;
    assigned_to_username?: string | null;
}

@Component({
    selector: 'app-todo-list',
    templateUrl: './todo-list.component.html',
    styleUrls: ['./todo-list.component.scss'],
    standalone: true,
    imports: [CommonModule],
})
export class TodoListComponent implements OnInit, OnChanges {
    @Input() todos: ITodo[] = [];
    @Input() totalCount: number = 0;
    @Input() showAddButton: boolean = true;
    @Input() showIndex: boolean = true;
    @Input() sectionTitle: string = 'Your Todos';
    @Input() groupByCategory: boolean = false;
    @Input() showUsername: boolean = false;
    @Input() username: string | null = null;
    @Output() addTodo = new EventEmitter<void>();
    @Output() toggleTodo = new EventEmitter<ITodo>();
    @Output() deleteTodo = new EventEmitter<ITodo>();
    @Output() editTodo = new EventEmitter<ITodo>();

    expandedCategories: Set<string | null> = new Set();

    constructor(private readonly _authService: AuthService) {}

    get isAdmin(): boolean {
        return this._authService.isAdmin();
    }

    get groupedTodos(): { category: string | null; todos: ITodo[] }[] {
        if (!this.groupByCategory) {
            return [{ category: null, todos: this.todos }];
        }

        const grouped = new Map<string | null, ITodo[]>();
        
        this.todos.forEach(todo => {
            const category = todo.category || null;
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category)!.push(todo);
        });

        const sorted = Array.from(grouped.entries()).sort((a, b) => {
            if (a[0] === null) return -1;
            if (b[0] === null) return 1;
            return (a[0] || '').localeCompare(b[0] || '');
        });

        return sorted.map(([category, todos]) => ({ category, todos }));
    }

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
        
        let date: Date;
        if (dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
            date = new Date(dateString);
        } else {
            date = new Date(dateString.replace('T', ' '));
        }
        
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        
        const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const weekDay = weekDays[date.getDay()];
        
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const formattedTime = `${hours}:${minutes} ${ampm}`;
        
        return {
            date: formattedDate,
            day: weekDay,
            time: formattedTime
        };
    }

    toggleCategory(category: string | null): void {
        if (this.expandedCategories.has(category)) {
            this.expandedCategories.delete(category);
        } else {
            this.expandedCategories.add(category);
        }
    }

    isCategoryExpanded(category: string | null): boolean {
        return this.expandedCategories.has(category);
    }

    ngOnInit(): void {
        this.initializeExpandedCategories();
    }

    private initializeExpandedCategories(): void {
        if (this.groupByCategory && this.todos.length > 0) {
            this.groupedTodos.forEach(group => {
                if (!this.expandedCategories.has(group.category)) {
                    this.expandedCategories.add(group.category);
                }
            });
        }
    }

    ngOnChanges(): void {
        if (this.groupByCategory) {
            this.initializeExpandedCategories();
        }
    }
}

