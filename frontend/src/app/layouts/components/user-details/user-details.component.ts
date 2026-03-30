import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Subject, takeUntil } from "rxjs";
import { AdminService, IUserWithTodos } from "../../../core/services/admin.service";
import { ToastService } from "../../../core/services/toast.service";
import { AuthService } from "../../../auth/services/auth.service";
import { TodoService } from "../../../core/services/todo.service";
import { ITodoResponse, ITodo, ITodoFilter, ITodoUpdate } from "../../../core/interfaces/todo.interface";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { trackById } from "../../../shared/helpers/trackByFn.helper";
import { DashboardSections } from "../../enums/dashboard-sections.enum";
import { NavigationService } from "../../../core/services/navigation.service";
import { SharedTableComponent } from "../../../shared/components/shared-table/shared-table.component";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { TodoColumnsComponent, ITodoStatusChange } from "../../../shared/components/todo-columns/todo-columns.component";
import { TodoDetailDialogService } from "../../../core/services/todo-detail-dialog.service";
import { getTodoType, enrichTodoTypes, enrichTodo } from "../../../shared/helpers/todo-type.helper";

@Component({
    selector: 'app-user-details',
    templateUrl: './user-details.component.html',
    styleUrls: ['./user-details.component.scss'],
    standalone: true,
    imports: [CommonModule, RouterLink, SharedTableComponent, TodoColumnsComponent]
})
export class UserDetailsComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    userData: IUserWithTodos | null = null;
    userId: number | null = null;
    allTodos: ITodoResponse[] = [];
    readonly layoutPaths = LayoutPaths;
    trackById = trackById;
    collapsedSections: Set<string> = new Set();
    isAdmin: boolean = false;
    viewMode: 'grid' | 'table' = 'grid';

    tableTodos: ITodo[] = [];
    tableTotal: number = 0;
    tablePage: number = 1;
    tablePageSize: number = 5;
    tableSortOrder: 'asc' | 'desc' = 'desc';
    tableFilter: ITodoFilter = {};

    constructor(
        private readonly _route: ActivatedRoute,
        private readonly _adminService: AdminService,
        private readonly _toastService: ToastService,
        private readonly _router: Router,
        private readonly _navService: NavigationService,
        public readonly _authService: AuthService,
        private readonly _todoService: TodoService,
        private readonly _confirmationDialog: ConfirmationDialogService,
        private readonly _detailDialogService: TodoDetailDialogService
    ) {}

    ngOnInit(): void {
        const savedViewMode = localStorage.getItem('dashboardViewMode');
        if (savedViewMode === 'grid' || savedViewMode === 'table') {
            this.viewMode = savedViewMode;
        }

        this._detailDialogService.todoUpdated$
            .pipe(takeUntil(this._destroy$))
            .subscribe(updated => {
                if (updated && this.userData) {
                    const idx = this.userData.todos.findIndex(t => t.id === updated.id);
                    if (idx !== -1) {
                        this.userData.todos[idx] = { ...this.userData.todos[idx], ...updated } as any;
                        this.userData = { ...this.userData };
                    }
                }
            });

        this.isAdmin = this._authService.isAdmin();
        const idParam = this._route.snapshot.paramMap.get('id');
        if (idParam) {
            this.userId = parseInt(idParam, 10);
            this.loadUserData();
        } else {
            this._router.navigate(['/']);
        }
    }

    setViewMode(mode: 'grid' | 'table'): void {
        this.viewMode = mode;
        localStorage.setItem('dashboardViewMode', mode);
        if (mode === 'table') {
            this.tablePage = 1;
            this.loadTableTodos();
        }
    }

    loadTableTodos(): void {
        if (!this.userData) return;
        
        // 1. Enrich before filtering to ensure types are correct (e.g. Work Item -> Story)
        let todos = enrichTodoTypes([...this.userData.todos], this.allTodos);

        // 2. Apply filters client-side
        if (this.tableFilter.title) {
            const search = this.tableFilter.title.toLowerCase();
            todos = todos.filter(t => t.title.toLowerCase().includes(search));
        }
        if (this.tableFilter.priority) {
            todos = todos.filter(t => t.priority === this.tableFilter.priority);
        }
        if (this.tableFilter.status) {
            // Match normalized status
            todos = todos.filter(t => t.status === this.tableFilter.status);
        }
        if (this.tableFilter.type) {
            // Use getTodoType which now sees the enriched .type property
            todos = todos.filter(t => getTodoType(t as any) === this.tableFilter.type);
        }
        if (this.tableFilter.created_from) {
            const from = new Date(this.tableFilter.created_from);
            todos = todos.filter(t => t.created_at && new Date(t.created_at) >= from);
        }
        if (this.tableFilter.created_to) {
            const to = new Date(this.tableFilter.created_to);
            to.setHours(23, 59, 59, 999);
            todos = todos.filter(t => t.created_at && new Date(t.created_at) <= to);
        }

        const sorted = todos.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return this.tableSortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });
        this.tableTotal = sorted.length;
        const skip = (this.tablePage - 1) * this.tablePageSize;
        this.tableTodos = sorted.slice(skip, skip + this.tablePageSize) as ITodo[];
    }

    onTablePageChange(page: number): void {
        this.tablePage = page;
        this.loadTableTodos();
    }

    onTablePageSizeChange(size: number): void {
        this.tablePageSize = size;
        this.tablePage = 1;
        this.loadTableTodos();
    }

    onTableSortChange(order: 'asc' | 'desc'): void {
        this.tableSortOrder = order;
        this.tablePage = 1;
        this.loadTableTodos();
    }

    onTableFilterChange(filter: ITodoFilter): void {
        this.tableFilter = filter;
        this.tablePage = 1;
        this.loadTableTodos();
    }

    onEditTodo(todo: ITodo | ITodoResponse): void {
        this._router.navigate([LayoutPaths.TODO_VIEW, todo.id]);
    }

    onUpdateTodo(event: { id: number; data: ITodoUpdate }): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._todoService.updateTodo(userId, event.id, event.data).subscribe({
            next: (updatedTodo) => {
                const enriched = enrichTodo(updatedTodo, this.userData?.todos || []);
                
                if (this.userData) {
                    const idx = this.userData.todos.findIndex(t => t.id === event.id);
                    if (idx !== -1) {
                        this.userData.todos[idx] = { ...this.userData.todos[idx], ...enriched } as ITodoResponse;
                        this.userData = { ...this.userData, todos: [...this.userData.todos] };
                    }
                }
                
                const tableIdx = this.tableTodos.findIndex(t => t.id === event.id);
                if (tableIdx !== -1) {
                    this.tableTodos[tableIdx] = { ...this.tableTodos[tableIdx], ...enriched } as ITodoResponse;
                    this.tableTodos = [...this.tableTodos];
                }

                this._toastService.success('Todo updated successfully');
            },
            error: (error: any) => {
                this._toastService.error(error?.error?.detail || 'Failed to update todo');
                this.loadUserData();
            }
        });
    }

    onDeleteTodo(todo: ITodo | ITodoResponse): void {
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
                this._todoService.deleteTodo(userId, todo.id).subscribe({
                    next: (response) => {
                        if (this.userData) {
                            this.userData.todos = this.userData.todos.filter(t => t.id !== todo.id);
                            this.userData = { ...this.userData, todos: [...this.userData.todos] };
                        }
                        this.tableTodos = this.tableTodos.filter(t => t.id !== todo.id);
                        this._toastService.success(response?.message || 'Todo deleted successfully');
                    },
                    error: (error) => {
                        this._toastService.error(error?.error?.detail || 'Failed to delete todo');
                    }
                });
            }
        });
    }

    loadUserData(): void {
        if (!this.userId) return;

        this._adminService.getUsersWithTodos()
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (usersWithTodos) => {
                    const found = usersWithTodos.find(u => u.user.id === this.userId);
                    if (found) {
                        this.allTodos = usersWithTodos.flatMap(u => u.todos);
                        // Enrich with context of all todos across all users if needed
                        const enrichedTodos = enrichTodoTypes(found.todos as ITodo[], this.allTodos as ITodo[]);
                        this.userData = { ...found, todos: enrichedTodos as any };
                        
                        if (this.viewMode === 'table') {
                            this.loadTableTodos();
                        }
                    } else {
                        this._toastService.error('User not found');
                        this._router.navigate(['/']);
                    }
                },
                error: (error) => {
                    this._toastService.error(error?.error?.detail || 'Failed to load user details');
                }
            });
    }

    toggleSection(section: string): void {
        if (this.collapsedSections.has(section)) {
            this.collapsedSections.delete(section);
        } else {
            this.collapsedSections.add(section);
        }
    }

    isSectionCollapsed(section: string): boolean {
        return this.collapsedSections.has(section);
    }

    onTodoUnassign(todo: ITodo): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._todoService.updateTodo(userId, todo.id, { assigned_to_user_id: null })
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (updatedTodo) => {
                    const enriched = enrichTodo(updatedTodo, this.allTodos);
                    if (this.userData) {
                        const idx = this.userData.todos.findIndex(t => t.id === todo.id);
                        if (idx !== -1) {
                            this.userData.todos[idx] = { ...this.userData.todos[idx], ...enriched };
                            this.userData = { ...this.userData, todos: [...this.userData.todos] };
                        }
                    }
                    this._toastService.success('Todo unassigned successfully');
                },
                error: () => {
                    this._toastService.error('Failed to unassign todo');
                    this.loadUserData();
                }
            });
    }

    onTodoStatusChange(event: ITodoStatusChange): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._todoService.updateTodo(userId, event.todo.id, { status: event.newStatus as ITodo['status'] })
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (updatedTodo) => {
                    const enriched = enrichTodo(updatedTodo, this.allTodos);
                    if (this.userData) {
                        const idx = this.userData.todos.findIndex(t => t.id === event.todo.id);
                        if (idx !== -1) {
                            this.userData.todos[idx] = { ...this.userData.todos[idx], ...enriched };
                            this.userData = { ...this.userData, todos: [...this.userData.todos] };
                        }
                    }
                    this._toastService.success(`Status updated to ${event.newStatus}`);
                },
                error: () => {
                    this._toastService.error('Failed to update status');
                    this.loadUserData();
                }
            });
    }

    getTodosByStatus(status: string): ITodoResponse[] {
        if (!this.userData) return [];
        return this.userData.todos.filter(t => t.status === status);
    }

    get unassignedTodos(): ITodoResponse[] {
        if (!this._authService.isAdmin()) return [];
        return this.allTodos.filter(todo => 
            todo.status !== 'done' && 
            (!todo.assigned_to_user_id || todo.assigned_to_user_id === null)
        );
    }

    get unassignedCount(): number {
        return this.unassignedTodos.length;
    }

    get userTodos(): ITodo[] {
        return (this.userData?.todos ?? []) as ITodo[];
    }

    get inProgressTodos(): ITodoResponse[] { return this.getTodosByStatus('inProgress'); }
    get newTodos(): ITodoResponse[] { return this.getTodosByStatus('new'); }
    get pausedTodos(): ITodoResponse[] { return this.getTodosByStatus('paused'); }
    get completedTodos(): ITodoResponse[] { return this.getTodosByStatus('done'); }

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

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
