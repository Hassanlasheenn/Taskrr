import { CommonModule } from "@angular/common";
import { Component, Input, Output, EventEmitter } from "@angular/core";

export interface ITodo {
    id: number;
    title: string;
    description?: string;
    completed: boolean;
    createdAt?: Date;
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
    @Output() addTodo = new EventEmitter<void>();
    @Output() toggleTodo = new EventEmitter<ITodo>();
    @Output() deleteTodo = new EventEmitter<ITodo>();

    onAddTodo(): void {
        this.addTodo.emit();
    }

    onToggleTodo(todo: ITodo): void {
        this.toggleTodo.emit(todo);
    }

    onDeleteTodo(todo: ITodo): void {
        this.deleteTodo.emit(todo);
    }

    trackById(index: number, item: ITodo): number {
        return item.id;
    }
}

