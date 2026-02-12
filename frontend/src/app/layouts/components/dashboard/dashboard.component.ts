import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, ViewChild } from "@angular/core";
import { Subject, takeUntil } from "rxjs";
import { AuthService } from "../../../auth/services";
import { TodoService } from "../../../core/services/todo.service";
import { NotificationService } from "../../../core/services/notification.service";
import { ITodoCreate, ITodoUpdate } from "../../../core/interfaces/todo.interface";
import { LoaderService } from "../../../core/services/loader.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { TodoListComponent, ITodo } from "../todo-list/todo-list.component";
import { SidebarComponent } from "../../../shared/components/sidebar/sidebar.component";
import { DashboardSideNavComponent } from "./components/dashboard-side-nav/dashboard-side-nav.component";
import { CalendarComponent } from "./components/calendar/calendar.component";
import { SearchBarComponent } from "./components/search-bar/search-bar.component";
import { QuickFiltersComponent, QuickFilterType } from "./components/quick-filters/quick-filters.component";
import { AdminPanelComponent } from "./components/admin-panel/admin-panel.component";
import { DashboardSections } from "../../enums/dashboard-sections.enum";
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
        QuickFiltersComponent, 
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
    activeFilter: QuickFilterType = 'all';
    selectedCategory: string | null = null;

    constructor(
        private readonly _authService: AuthService,
        private readonly _todoService: TodoService,
        private readonly _notificationService: NotificationService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService,
        private readonly _confirmationDialog: ConfirmationDialogService
    ) {}

    ngOnInit(): void {
        this.userData = this._authService.getCurrentUserData();
        this.loadTodos();

        this._notificationService.notificationEvents$
            .pipe(takeUntil(this._destroy$))
            .subscribe((notification) => {
                // Refresh todo list for any notification (create, update, delete, assign)
                // Deleted todos have todo_id: null, but we still need to refresh
                this.loadTodos(false);
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
                this.todos = response.todos as ITodo[];
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
            this.todos[index] = { ...todo, completed: !todo.completed };
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
        this.activeFilter = 'all';
        this.selectedCategory = null;
    }

    onSearchChange(query: string): void {
        this.searchQuery = query.toLowerCase().trim();
    }

    onFilterChange(filter: QuickFilterType): void {
        this.activeFilter = filter;
    }

    get filteredTodos(): ITodo[] {
        let filtered = this.todos;

        switch (this.activeSection) {
            case DashboardSections.COMPLETED:
                filtered = filtered.filter(todo => todo.completed);
                break;
            default:
                break;
        }

        if (this.activeSection === DashboardSections.DASHBOARD) {
            filtered = this.applyQuickFilter(filtered);
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

        return filtered;
    }

    private applyQuickFilter(todos: ITodo[]): ITodo[] {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const startOfWeek = new Date(today);
        const dayOfWeek = today.getDay();
        startOfWeek.setDate(today.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        switch (this.activeFilter) {
            case 'today':
                return todos.filter(todo => {
                    if (!todo.created_at) return false;
                    const todoDate = new Date(todo.created_at);
                    todoDate.setHours(0, 0, 0, 0);
                    return todoDate.getTime() === today.getTime();
                });
            case 'thisWeek':
                return todos.filter(todo => {
                    if (!todo.created_at) return false;
                    const todoDate = new Date(todo.created_at);
                    return todoDate >= startOfWeek && todoDate <= endOfWeek;
                });
            default:
                return todos;
        }
    }

    get categories(): string[] {
        const cats = new Set<string>();
        this.todos.forEach(todo => {
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