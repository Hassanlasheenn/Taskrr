import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { AuthService } from "../../../auth/services";
import { TodoListComponent, ITodo } from "../todo-list/todo-list.component";

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    standalone: true,
    imports: [CommonModule, TodoListComponent],
})
export class DashboardComponent implements OnInit {
    userData: any;
    todos: ITodo[] = [];
    
    constructor(
        private readonly _authService: AuthService
    ) {}

    ngOnInit(): void {
        this.userData = this._authService.getCurrentUserData();
        // TODO: Load todos from API
    }

    onAddTodo(): void {
        // TODO: Open add todo modal/dialog
        console.log('Add todo clicked');
    }

    onToggleTodo(todo: ITodo): void {
        // TODO: Update todo status via API
        const index = this.todos.findIndex(t => t.id === todo.id);
        if (index !== -1) {
            this.todos[index] = { ...todo, completed: !todo.completed };
            this.todos = [...this.todos];
        }
    }

    onDeleteTodo(todo: ITodo): void {
        // TODO: Delete todo via API
        this.todos = this.todos.filter(t => t.id !== todo.id);
    }
}