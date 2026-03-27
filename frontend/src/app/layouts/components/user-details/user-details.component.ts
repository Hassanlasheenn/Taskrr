import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Subject, takeUntil, forkJoin } from "rxjs";
import { AdminService, IUserWithTodos } from "../../../core/services/admin.service";
import { LoaderService } from "../../../core/services/loader.service";
import { ToastService } from "../../../core/services/toast.service";
import { AuthService } from "../../../auth/services/auth.service";
import { TodoService } from "../../../core/services/todo.service";
import { ITodoResponse, ITodo, ITodoUpdate } from "../../../core/interfaces/todo.interface";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { trackById } from "../../../shared/helpers/trackByFn.helper";
import { DashboardSections } from "../../enums/dashboard-sections.enum";
import { NavigationService } from "../../../core/services/navigation.service";
import { SharedTableComponent } from "../../../shared/components/shared-table/shared-table.component";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from "@angular/cdk/drag-drop";

@Component({
    selector: 'app-user-details',
    templateUrl: './user-details.component.html',
    styleUrls: ['./user-details.component.scss'],
    standalone: true,
    imports: [CommonModule, RouterLink, DragDropModule, SharedTableComponent]
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

    constructor(
        private readonly _route: ActivatedRoute,
        private readonly _adminService: AdminService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService,
        private readonly _router: Router,
        private readonly _navService: NavigationService,
        public readonly _authService: AuthService,
        private readonly _todoService: TodoService,
        private readonly _confirmationDialog: ConfirmationDialogService
    ) {}

    ngOnInit(): void {
        const savedViewMode = localStorage.getItem('dashboardViewMode');
        if (savedViewMode === 'grid' || savedViewMode === 'table') {
            this.viewMode = savedViewMode;
        }

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
    }

    onEditTodo(todo: ITodo | ITodoResponse): void {
        this._router.navigate([LayoutPaths.TODO_VIEW, todo.id]);
    }

    onUpdateTodo(event: { id: number; data: ITodoUpdate }): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this._todoService.updateTodo(userId, event.id, event.data).subscribe({
            next: (response: any) => {
                if (this.userData) {
                    const index = this.userData.todos.findIndex(t => t.id === event.id);
                    if (index !== -1) {
                        this.userData.todos[index] = { ...this.userData.todos[index], ...response };
                        this.userData.todos = [...this.userData.todos];
                    }
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
                this._loaderService.show();
                this._todoService.deleteTodo(userId, todo.id).subscribe({
                    next: (response) => {
                        if (this.userData) {
                            const index = this.userData.todos.findIndex(t => t.id === todo.id);
                            if (index !== -1) {
                                this.userData.todos[index] = { ...this.userData.todos[index], is_deleted: true } as any;
                                this.userData = { ...this.userData, todos: [...this.userData.todos] };
                            }
                        }
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

    loadUserData(): void {
        if (!this.userId) return;
        
        const currentUserId = this._authService.getCurrentUserId();
        if (!currentUserId) return;

        this._loaderService.show();
        
        const requests = {
            usersWithTodos: this._adminService.getUsersWithTodos(),
            allTodos: this._todoService.getTodos(currentUserId)
        };

        forkJoin(requests)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: ({ usersWithTodos, allTodos }) => {
                    const found = usersWithTodos.find(u => u.user.id === this.userId);
                    if (found) {
                        this.userData = found;
                        this.allTodos = allTodos.todos;
                    } else {
                        this._toastService.error('User not found');
                        this._router.navigate(['/']);
                    }
                    this._loaderService.hide();
                },
                error: (error) => {
                    this._loaderService.hide();
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

    onTodoDrop(event: CdkDragDrop<ITodoResponse[]>, newStatus: string): void {
        if (event.previousContainer === event.container) {
            moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
        } else {
            const todo = event.previousContainer.data[event.previousIndex];
            const userId = this._authService.getCurrentUserId();
            if (!userId) return;

            // Map UI status names to API status values
            let apiStatus = newStatus;
            if (newStatus === 'new-tasks') apiStatus = 'new';
            if (newStatus === 'in-progress') apiStatus = 'inProgress';
            if (newStatus === 'completed-dashboard') apiStatus = 'done';

            this._todoService.updateTodo(userId, todo.id, { status: apiStatus as ITodo['status'] }).subscribe({
                next: (updatedTodo) => {
                    // Update local state in userData.todos
                    if (this.userData) {
                        const index = this.userData.todos.findIndex(t => t.id === todo.id);
                        if (index !== -1) {
                            this.userData.todos[index] = { ...this.userData.todos[index], ...updatedTodo };
                            this.userData.todos = [...this.userData.todos];
                        }
                    }
                    this._toastService.success(`Status updated to ${apiStatus}`);
                },
                error: (error) => {
                    this._toastService.error('Failed to update status');
                    this.loadUserData(); // Reload on error
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
