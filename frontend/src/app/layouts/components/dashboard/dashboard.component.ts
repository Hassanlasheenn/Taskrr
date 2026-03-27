import { CommonModule } from "@angular/common";
import { Component, OnInit, OnDestroy, ViewChild } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { Subject, takeUntil, debounceTime, Observable, map } from "rxjs";
import { AuthService } from "../../../auth/services";
import { TodoService } from "../../../core/services/todo.service";
import { NotificationService } from "../../../core/services/notification.service";
import { ITodo, ITodoCreate, ITodoUpdate } from "../../../core/interfaces/todo.interface";
import { trackById } from "../../../shared/helpers/trackByFn.helper";
import { LoaderService } from "../../../core/services/loader.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { NavigationService } from "../../../core/services/navigation.service";
import { TodoListComponent } from "../todo-list/todo-list.component";
import { SidebarComponent } from "../../../shared/components/sidebar/sidebar.component";
import { CalendarComponent } from "./components/calendar/calendar.component";
import { TodoStatus as FilterStatus } from "./components/status-filter/status-filter.component";
import { AdminPanelComponent } from "./components/admin-panel/admin-panel.component";
import { AdminComponent } from "../admin/admin.component";
import { DashboardSections } from "../../enums/dashboard-sections.enum";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { TodoFormComponent } from "../../../shared/components/dynamic-form/todo-form/todo-form.component";
import { SharedTableComponent } from "../../../shared/components/shared-table/shared-table.component";
import { CanComponentDeactivate } from "../../../auth/guards/can-deactivate.guard";
import { PosthogService } from "../../../core/services";
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from "@angular/cdk/drag-drop";

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    standalone: true,
    imports: [
        CommonModule, 
        RouterLink,
        TodoListComponent, 
        SidebarComponent, 
        CalendarComponent, 
        AdminPanelComponent,
        AdminComponent,
        TodoFormComponent,
        SharedTableComponent,
        DragDropModule
    ],
})
export class DashboardComponent implements OnInit, OnDestroy, CanComponentDeactivate {
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
    activePriority: string = 'all';
    selectedCategory: string | null = null;
    trackById = trackById;
    readonly LayoutPaths = LayoutPaths;
    collapsedSections: Set<string> = new Set();
    isAdmin: boolean = false;
    viewMode: 'grid' | 'table' = 'grid';

    constructor(
        public readonly _authService: AuthService,
        private readonly _todoService: TodoService,
        private readonly _notificationService: NotificationService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService,
        private readonly _confirmationDialog: ConfirmationDialogService,
        private readonly _router: Router,
        private readonly _navService: NavigationService,
        private readonly _posthogService: PosthogService
    ) {}

    ngOnInit(): void {
        const savedViewMode = localStorage.getItem('dashboardViewMode');
        if (savedViewMode === 'grid' || savedViewMode === 'table') {
            this.viewMode = savedViewMode;
        }

        this.isAdmin = this._authService.isAdmin();
        this.userData = this._authService.getCurrentUserData();
        this.loadTodos();
        this._syncSectionWithUrl();

        // Listen to route changes for back/forward support
        this._router.events
            .pipe(takeUntil(this._destroy$))
            .subscribe(() => {
                this._syncSectionWithUrl();
            });

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
                this._posthogService.capture('todo_created', { 
                    category: newTodo.category,
                    priority: newTodo.priority
                });
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
            this._posthogService.capture('todo_status_toggled', { 
                todo_id: todo.id,
                new_status: newStatus 
            });
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
                        const index = this.todos.findIndex(t => t.id === todo.id);
                        if (index !== -1) {
                            this.todos[index] = { ...this.todos[index], is_deleted: true };
                            this.todos = [...this.todos];
                        }
                        this._loaderService.hide();
                        this._toastService.success(response?.message || 'Todo deleted successfully');
                        this._posthogService.capture('todo_deleted', { todo_id: todo.id });
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
        this._posthogService.capture('todo_view_clicked', { todo_id: todo.id });
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
                this._posthogService.capture('todo_updated', { 
                    todo_id: event.id,
                    status: event.data.status,
                    priority: event.data.priority
                });
            },
            error: (error: any) => {
                this._toastService.error(error?.error?.detail || 'Failed to update todo');
                this._loaderService.hide();
            }
        });
    }

    onTodoDrop(event: CdkDragDrop<ITodo[]>, newStatus: string): void {
        if (event.previousContainer === event.container) {
            moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
        } else {
            const todo = event.previousContainer.data[event.previousIndex];
            const userId = this._authService.getCurrentUserId();
            if (!userId) return;

            // Map UI status names to API status values if necessary
            let apiStatus = newStatus;
            if (newStatus === 'new-tasks') apiStatus = 'new';
            if (newStatus === 'in-progress') apiStatus = 'inProgress';
            if (newStatus === 'completed-dashboard') apiStatus = 'done';

            this._todoService.updateTodo(userId, todo.id, { status: apiStatus as ITodo['status'] }).subscribe({
                next: (updatedTodo) => {
                    // Update local state
                    const index = this.todos.findIndex(t => t.id === todo.id);
                    if (index !== -1) {
                        this.todos[index] = { ...this.todos[index], ...updatedTodo } as ITodo;
                        this.todos = [...this.todos];
                    }
                    this._toastService.success(`Status updated to ${apiStatus}`);
                },
                error: (error) => {
                    this._toastService.error('Failed to update status');
                    this.loadTodos(false); // Reload on error to sync state
                }
            });

            transferArrayItem(
                event.previousContainer.data,
                event.container.data,
                event.previousIndex,
                event.currentIndex
            );
        }
    }

    toggleSection(section: string): void {
        if (this.collapsedSections.has(section)) {
            this.collapsedSections.delete(section);
        } else {
            this.collapsedSections.add(section);
        }
    }

    setViewMode(mode: 'grid' | 'table'): void {
        this.viewMode = mode;
        localStorage.setItem('dashboardViewMode', mode);
        this._posthogService.capture('dashboard_view_mode_changed', { mode });
    }

    isSectionCollapsed(section: string): boolean {
        return this.collapsedSections.has(section);
    }

    private _syncSectionWithUrl(): void {
        const url = this._router.url.split('?')[0].replace('/', '');
        
        switch(url) {
            case LayoutPaths.CALENDAR: this.activeSection = DashboardSections.CALENDAR; break;
            case LayoutPaths.COMPLETED: this.activeSection = DashboardSections.COMPLETED; break;
            case LayoutPaths.ADMIN: this.activeSection = DashboardSections.USER_MANAGEMENT; break;
            case LayoutPaths.ADMIN_PANEL: this.activeSection = DashboardSections.ADMIN_PANEL; break;
            case LayoutPaths.DASHBOARD: 
            case 'home':
            default: this.activeSection = DashboardSections.DASHBOARD; break;
        }
        
        // Reset filters when switching sections via URL
        this.searchQuery = '';
        this.activeStatus = 'all';
        this.activePriority = 'all';
        this.selectedCategory = null;
    }

    get unassignedCount(): number {
        return this.unassignedTodos.length;
    }

    get unassignedTodos(): ITodo[] {
        return this.todos.filter(todo => 
            todo.status !== 'done' && 
            (!todo.assigned_to_user_id || todo.assigned_to_user_id === null)
        );
    }

    get completedCount(): number {
        return this.todos.filter(todo => todo.status === 'done').length;
    }

    get hasActiveTodosInSection(): boolean {
        if (this.activeSection === DashboardSections.DASHBOARD) {
            return this.isAdmin ? this.unassignedCount > 0 : this.todos.length > 0;
        }
        return false;
    }

    get inProgressTodos(): ITodo[] { return this.filteredTodos.filter(t => t.status === 'inProgress'); }
    get newTodos(): ITodo[] { return this.filteredTodos.filter(t => t.status === 'new'); }
    get pausedTodos(): ITodo[] { return this.filteredTodos.filter(t => t.status === 'paused'); }
    get completedTodos(): ITodo[] { return this.filteredTodos.filter(t => t.status === 'done'); }

    get combinedActiveTodos(): ITodo[] {
        return [...this.newTodos, ...this.inProgressTodos];
    }

    getPriorityClass(priority: string): string {
        return `priority-${priority?.toLowerCase() || 'medium'}`;
    }

    getPriorityIcon(priority: string): string {
        switch (priority?.toLowerCase()) {
            case 'high': return 'bi-arrow-up';
            case 'low': return 'bi-arrow-down';
            default: return 'bi-dash';
        }
    }

    formatDate(dateString?: string): string {
        if (!dateString) return 'No date';
        const date = new Date(dateString);
        return date.toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
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

    get sectionTitle(): string {
        switch (this.activeSection) {
            case DashboardSections.COMPLETED:
                return 'Completed Todos';
            case DashboardSections.DASHBOARD:
                return this.isAdmin ? 'Pending Todos' : 'Your Todos';
            default:
                return 'Your Todos';
        }
    }

    getStatusLabel(status: string): string {
        const statusMap: { [key: string]: string } = {
            'new': 'New',
            'inProgress': 'In Progress',
            'paused': 'Paused',
            'done': 'Done'
        };
        return statusMap[status] || status;
    }

    getStatusClass(status: string): string {
        return `status-${status}`;
    }

    onSearchChange(query: string): void {
        this.searchQuery = query.toLowerCase().trim();
    }

    onStatusChange(status: FilterStatus): void {
        this.activeStatus = status;
    }

    onPriorityChange(priority: string): void {
        this.activePriority = priority;
    }

    private applyPriorityFilter(todos: ITodo[]): ITodo[] {
        if (this.activePriority === 'all') return todos;
        return todos.filter(todo => todo.priority === this.activePriority);
    }

    get filteredTodos(): ITodo[] {
        let filtered = this.todos;
        const isAdmin = this.isAdmin;
        const userId = this._authService.getCurrentUserId();

        switch (this.activeSection) {
            case DashboardSections.COMPLETED:
                filtered = filtered.filter(todo => todo.status === 'done');
                break;
            case DashboardSections.DASHBOARD:
                if (!isAdmin) {
                    filtered = filtered.filter(todo => todo.assigned_to_user_id === userId);
                }
                break;
            default:
                break;
        }

        if (this.activeSection === DashboardSections.DASHBOARD) {
            filtered = this.applyStatusFilter(filtered);
            filtered = this.applyPriorityFilter(filtered);
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

        const statusOrder: { [key: string]: number } = {
            'inProgress': 0,
            'new': 1,
            'paused': 2,
            'done': 3
        };

        return filtered.sort((a, b) => {
            // Deleted todos always go to the end
            if (a.is_deleted !== b.is_deleted) {
                return a.is_deleted ? 1 : -1;
            }

            const statusA = statusOrder[a.status] ?? 1;
            const statusB = statusOrder[b.status] ?? 1;
            if (statusA !== statusB) {
                return statusA - statusB;
            }

            const categoryA = a.category || '\uffff';
            const categoryB = b.category || '\uffff';
            if (categoryA !== categoryB) {
                return categoryA.localeCompare(categoryB);
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
        const isAdmin = this.isAdmin;
        const userId = this._authService.getCurrentUserId();

        // Apply section filter
        switch (this.activeSection) {
            case DashboardSections.COMPLETED:
                filtered = filtered.filter(todo => todo.status === 'done');
                break;
            case DashboardSections.DASHBOARD:
                if (!isAdmin) {
                    filtered = filtered.filter(todo => todo.assigned_to_user_id === userId);
                }
                break;
            default:
                break;
        }

        // Apply status filter
        if (this.activeSection === DashboardSections.DASHBOARD) {
            filtered = this.applyStatusFilter(filtered);
            filtered = this.applyPriorityFilter(filtered);
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

    canDeactivate(): boolean | Observable<boolean> {
        if (this.isSidebarOpen && this.todoFormComponent?.hasChanges()) {
            return this._confirmationDialog.show({
                title: 'Unsaved Changes',
                message: 'You have unsaved changes in your todo. Are you sure you want to leave?',
                confirmText: 'Leave',
                cancelText: 'Stay'
            }).pipe(map(result => result.confirmed));
        }
        return true;
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
