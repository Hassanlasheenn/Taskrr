import { CommonModule } from "@angular/common";
import { Component, OnInit, ViewChild } from "@angular/core";
import { AuthService } from "../../../auth/services";
import { TodoService, ITodoCreate } from "../../../core/services/todo.service";
import { LoaderService } from "../../../core/services/loader.service";
import { ToastService } from "../../../core/services/toast.service";
import { TodoListComponent, ITodo } from "../todo-list/todo-list.component";
import { SidebarComponent } from "../../../shared/components/sidebar/sidebar.component";
import { TodoFormComponent } from "../todo-form/todo-form.component";

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    standalone: true,
    imports: [CommonModule, TodoListComponent, SidebarComponent, TodoFormComponent],
})
export class DashboardComponent implements OnInit {
    @ViewChild('todoForm') todoFormComponent!: TodoFormComponent;
    
    userData: any;
    todos: ITodo[] = [];
    totalTodos: number = 0;
    isSidebarOpen: boolean = false;
    
    constructor(
        private readonly _authService: AuthService,
        private readonly _todoService: TodoService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService
    ) {}

    ngOnInit(): void {
        this.userData = this._authService.getCurrentUserData();
        this.loadTodos();
    }

    loadTodos(): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._loaderService.show();
        this._todoService.getTodos(userId).subscribe({
            next: (response) => {
                this.todos = response.todos as ITodo[];
                this.totalTodos = response.total;
                this._loaderService.hide();
            },
            error: (error) => {
                this._toastService.error(error?.error?.detail || 'Failed to load todos');
                this._loaderService.hide();
            }
        });
    }

    onAddTodo(): void {
        this.isSidebarOpen = true;
    }

    onSidebarClose(): void {
        this.isSidebarOpen = false;
        if (this.todoFormComponent) {
            this.todoFormComponent.resetForm();
        }
    }

    onTodoSubmit(todoData: ITodoCreate): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._loaderService.show();
        this._todoService.createTodo(userId, todoData).subscribe({
            next: (newTodo) => {
                this.todos = [newTodo as ITodo, ...this.todos];
                this.totalTodos++;
                this.isSidebarOpen = false;
                if (this.todoFormComponent) {
                    this.todoFormComponent.resetForm();
                }
                this._loaderService.hide();
                this._toastService.success('Todo created successfully');
            },
            error: (error) => {
                this._toastService.error(error?.error?.detail || 'Failed to create todo');
                this._loaderService.hide();
            }
        });
    }

    onToggleTodo(todo: ITodo): void {
        // Toggle locally for instant feedback
        const index = this.todos.findIndex(t => t.id === todo.id);
        if (index !== -1) {
            this.todos[index] = { ...todo, completed: !todo.completed };
            this.todos = [...this.todos];
        }
    }

    onDeleteTodo(todo: ITodo): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._loaderService.show();
        this._todoService.deleteTodo(userId, todo.id).subscribe({
            next: (response) => {
                this.todos = this.todos
                    .filter(t => t.id !== todo.id)
                    .map((t, idx) => ({ ...t, order_index: idx + 1 }));
                this.totalTodos = Math.max(0, this.totalTodos - 1);
                this._loaderService.hide();
                this._toastService.success(response?.message || 'Todo deleted successfully');
            },
            error: (error) => {
                this._toastService.error(error?.error?.detail || 'Failed to delete todo');
                this._loaderService.hide();
            }
        });
    }
}