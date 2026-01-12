import { CommonModule } from "@angular/common";
import { Component, OnInit, ViewChild } from "@angular/core";
import { AuthService } from "../../../auth/services";
import { TodoService, ITodoCreate, ITodoUpdate, ITodoResponse } from "../../../core/services/todo.service";
import { LoaderService } from "../../../core/services/loader.service";
import { ToastService } from "../../../core/services/toast.service";
import { TodoListComponent, ITodo } from "../todo-list/todo-list.component";
import { SidebarComponent } from "../../../shared/components/sidebar/sidebar.component";
import { TodoFormComponent } from "../todo-form/todo-form.component";
import { DashboardSideNavComponent } from "./components/dashboard-side-nav/dashboard-side-nav.component";
import { CalendarComponent } from "./components/calendar/calendar.component";
import { DashboardSections } from "../../enums/dashboard-sections.enum";

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    standalone: true,
    imports: [CommonModule, TodoListComponent, SidebarComponent, TodoFormComponent, DashboardSideNavComponent, CalendarComponent],
})
export class DashboardComponent implements OnInit {
    @ViewChild('todoForm') todoFormComponent!: TodoFormComponent;
    
    userData: any;
    todos: ITodo[] = [];
    totalTodos: number = 0;
    isSidebarOpen: boolean = false;
    editingTodo: ITodo | null = null;
    activeSection: DashboardSections = DashboardSections.DASHBOARD;
    DashboardSections = DashboardSections;
    
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

    get sidebarTitle(): string {
        return this.editingTodo ? 'Edit Todo' : 'Add New Todo';
    }

    onAddTodo(): void {
        this.editingTodo = null;
        this.isSidebarOpen = true;
    }

    onSidebarClose(): void {
        this.isSidebarOpen = false;
        this.editingTodo = null;
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

    onEditTodo(todo: ITodo): void {
        this.editingTodo = todo;
        this.isSidebarOpen = true;
        
        // Wait for the sidebar to open and form to be ready
        setTimeout(() => {
            if (this.todoFormComponent) {
                this.todoFormComponent.populateForm(todo);
            }
        }, 100);
    }

    onTodoUpdate(event: { id: number; data: ITodoUpdate }): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._loaderService.show();
        this._todoService.updateTodo(userId, event.id, event.data).subscribe({
            next: (response: any) => {
                const index = this.todos.findIndex(t => t.id === event.id);
                if (index !== -1) {
                    this.todos[index] = { ...this.todos[index], ...response } as ITodo;
                    this.todos = [...this.todos];
                }
                this.isSidebarOpen = false;
                this.editingTodo = null;
                if (this.todoFormComponent) {
                    this.todoFormComponent.resetForm();
                }
                this._loaderService.hide();
                this._toastService.success('Todo updated successfully');
            },
            error: (error: any) => {
                this._toastService.error(error?.error?.detail || 'Failed to update todo');
                this._loaderService.hide();
            }
        });
    }

    onSectionChange(section: DashboardSections): void {
        this.activeSection = section;
        // Handle section changes - for now just update the active section
        // You can add filtering logic here based on the section
    }

    get filteredTodos(): ITodo[] {
        switch (this.activeSection) {
            case DashboardSections.TODAY:
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return this.todos.filter(todo => {
                    if (!todo.created_at) return false;
                    const todoDate = new Date(todo.created_at);
                    todoDate.setHours(0, 0, 0, 0);
                    return todoDate.getTime() === today.getTime();
                });
            case DashboardSections.COMPLETED:
                return this.todos.filter(todo => todo.completed);
            case DashboardSections.UPCOMING:
                const now = new Date();
                return this.todos.filter(todo => {
                    if (!todo.created_at) return false;
                    const todoDate = new Date(todo.created_at);
                    return todoDate > now && !todo.completed;
                });
            default:
                return this.todos;
        }
    }
}