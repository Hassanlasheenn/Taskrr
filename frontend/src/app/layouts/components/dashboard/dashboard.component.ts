import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, ViewChild } from "@angular/core";
import { Router } from "@angular/router";
import { Subject, takeUntil, debounceTime } from "rxjs";
import { AuthService } from "../../../auth/services";
import { TodoService } from "../../../core/services/todo.service";
import { NotificationService } from "../../../core/services/notification.service";
import { ITodo, ITodoCreate, ITodoUpdate } from "../../../core/interfaces/todo.interface";
import { LoaderService } from "../../../core/services/loader.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { TodoListComponent } from "../todo-list/todo-list.component";
import { SidebarComponent } from "../../../shared/components/sidebar/sidebar.component";
import { DashboardSideNavComponent } from "./components/dashboard-side-nav/dashboard-side-nav.component";
import { CalendarComponent } from "./components/calendar/calendar.component";
import { SearchBarComponent } from "./components/search-bar/search-bar.component";
import { StatusFilterComponent, TodoStatus as FilterStatus } from "./components/status-filter/status-filter.component";
import { AdminPanelComponent } from "./components/admin-panel/admin-panel.component";
import { DashboardSections } from "../../enums/dashboard-sections.enum";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { TodoFormComponent } from "../../../shared/components/dynamic-form/todo-form/todo-form.component";

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    standalone: true,
    imports: [
        CommonModule, 
        TodoListComponent, 
        SidebarComponent, 
        DashboardSideNavComponent, 
        CalendarComponent, 
        SearchBarComponent, 
        StatusFilterComponent, 
        AdminPanelComponent,
        TodoFormComponent
    ],
})
export class DashboardComponent implements OnInit, OnDestroy {
    @ViewChild('todoForm') todoFormComponent!: TodoFormComponent;
    private readonly _destroy$ = new Subject<void>();
    
    userData: any;
    todos: ITodo[] = [];
    totalTodos: number = 0;
    isSidebarOpen: boolean = false;
    editingTodo: ITodo | null = null;
    activeSection: DashboardSections = DashboardSections.DASHBOARD;
    DashboardSections = DashboardSections;
    searchQuery: string = '';
    activeStatus: FilterStatus = 'all';
    selectedCategory: string | null = null;

    constructor(
        private readonly _authService: AuthService,
        private readonly _todoService: TodoService,
        private readonly _notificationService: NotificationService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService,
        private readonly _confirmationDialog: ConfirmationDialogService,
        private readonly _router: Router
    ) {}

    ngOnInit(): void {
        this.userData = this._authService.getCurrentUserData();
        this.loadTodos();

        this._notificationService.notificationEvents$
            .pipe(
                debounceTime(300),
                takeUntil(this._destroy$)
            )
            .subscribe((notification) => {
                if (notification.todo_id) {
                    this.loadTodos(false);
                }
            });
    }

    loadTodos(showLoader: boolean = true): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        if (showLoader) {
            this._loaderService.show();
        }
        
        this._todoService.getTodos(userId).subscribe({
            next: (response) => {
                this.todos = [...(response.todos as ITodo[])];
                this.totalTodos = response.total;
                if (showLoader) {
                    this._loaderService.hide();
                }
            },
            error: (error) => {
                this._toastService.error(error?.error?.detail || 'Failed to load todos');
                if (showLoader) {
                    this._loaderService.hide();
                }
            }
        });
    }

    get sidebarTitle(): string {
        return this.editingTodo ? 'Edit Todo' : 'Add New Todo';
    }

    get timeBasedGreeting(): string {
        const hour = new Date().getHours();
        
        if (hour >= 5 && hour < 12) {
            return 'Good Morning';
        } else if (hour >= 12 && hour < 17) {
            return 'Good Afternoon';
        } else if (hour >= 17 && hour < 22) {
            return 'Good Evening';
        } else {
            return 'Good Night';
        }
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
        const index = this.todos.findIndex(t => t.id === todo.id);
        if (index !== -1) {
            const newStatus = todo.status === 'done' ? 'new' : 'done';
            this.todos[index] = { ...todo, status: newStatus as ITodo['status'] };
            this.todos = [...this.todos];
        }
    }

    onDeleteTodo(todo: ITodo): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._confirmationDialog.show({
            title: 'Delete Todo',
            message: `Are you sure you want to delete "${todo.title}"? This action cannot be undone.`,
            confirmText: 'Delete',
            cancelText: 'Cancel'
        })
        .pipe(takeUntil(this._destroy$))
        .subscribe(result => {
            if (result.confirmed) {
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
        });
    }

    onViewTodo(todo: ITodo): void {
        this._router.navigate([LayoutPaths.TODO_VIEW, todo.id]);
    }

    onEditTodo(todo: ITodo): void {
        this.editingTodo = todo;
        this.isSidebarOpen = true;
        
        // Wait for sidebar to open and form component to be ready
        setTimeout(() => {
            if (this.todoFormComponent) {
                this.todoFormComponent.populateForm(todo);
            }
        }, 200);
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
        this.searchQuery = '';
        this.activeStatus = 'all';
        this.selectedCategory = null;
    }

    onSearchChange(query: string): void {
        this.searchQuery = query.toLowerCase().trim();
    }

    onStatusChange(status: FilterStatus): void {
        this.activeStatus = status;
    }

    get filteredTodos(): ITodo[] {
        let filtered = this.todos;
        const isAdmin = this._authService.isAdmin();

        switch (this.activeSection) {
            case DashboardSections.COMPLETED:
                filtered = filtered.filter(todo => todo.status === 'done');
                break;
            case DashboardSections.DASHBOARD:
                if (isAdmin) {
                    filtered = filtered.filter(todo => 
                        todo.status !== 'done' && 
                        (!todo.assigned_to_user_id || todo.assigned_to_user_id === null)
                    );
                }
                break;
            default:
                break;
        }

        if (this.activeSection === DashboardSections.DASHBOARD) {
            filtered = this.applyStatusFilter(filtered);
        }

        if (this.searchQuery) {
            filtered = filtered.filter(todo => {
                const titleMatch = todo.title.toLowerCase().includes(this.searchQuery);
                const descMatch = todo.description?.toLowerCase().includes(this.searchQuery);
                return titleMatch || descMatch;
            });
        }

        if (this.selectedCategory) {
            filtered = filtered.filter(todo => todo.category === this.selectedCategory);
        }

        return filtered.sort((a, b) => {
            const categoryA = a.category || '\uffff';
            const categoryB = b.category || '\uffff';
            if (categoryA !== categoryB) {
                return categoryA.localeCompare(categoryB);
            }

            if (a.status === 'done' && b.status !== 'done') {
                return 1;
            }
            if (a.status !== 'done' && b.status === 'done') {
                return -1;
            }

            return (a.order_index || 0) - (b.order_index || 0);
        });
    }

    private applyStatusFilter(todos: ITodo[]): ITodo[] {
        switch (this.activeStatus) {
            case 'done':
                return todos.filter(todo => todo.status === 'done');
            case 'new':
                return todos.filter(todo => todo.status === 'new');
            case 'inProgress':
                return todos.filter(todo => todo.status === 'inProgress');
            case 'paused':
                return todos.filter(todo => todo.status === 'paused');
            case 'all':
            default:
                return todos;
        }
    }

    get categories(): string[] {
        // Get categories from filtered todos (after status and search filters, but not category filter)
        let filtered = this.todos;
        const isAdmin = this._authService.isAdmin();

        // Apply section filter
        switch (this.activeSection) {
            case DashboardSections.COMPLETED:
                filtered = filtered.filter(todo => todo.status === 'done');
                break;
            case DashboardSections.DASHBOARD:
                if (isAdmin) {
                    filtered = filtered.filter(todo => 
                        todo.status !== 'done' && 
                        (!todo.assigned_to_user_id || todo.assigned_to_user_id === null)
                    );
                }
                break;
            default:
                break;
        }

        // Apply status filter
        if (this.activeSection === DashboardSections.DASHBOARD) {
            filtered = this.applyStatusFilter(filtered);
        }

        // Apply search filter
        if (this.searchQuery) {
            filtered = filtered.filter(todo => {
                const titleMatch = todo.title.toLowerCase().includes(this.searchQuery);
                const descMatch = todo.description?.toLowerCase().includes(this.searchQuery);
                return titleMatch || descMatch;
            });
        }

        // Extract unique categories (don't apply category filter here)
        const cats = new Set<string>();
        filtered.forEach(todo => {
            if (todo.category) {
                cats.add(todo.category);
            }
        });
        return Array.from(cats).sort();
    }

    onCategorySelect(category: string | null): void {
        this.selectedCategory = category;
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}