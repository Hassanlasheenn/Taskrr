import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { Subject, takeUntil, debounceTime } from "rxjs";
import { AdminService, IUserWithTodos } from "../../../../../core/services/admin.service";
import { LoaderService } from "../../../../../core/services/loader.service";
import { ToastService } from "../../../../../core/services/toast.service";
import { NotificationService } from "../../../../../core/services/notification.service";
import { ITodoResponse } from "../../../../../core/interfaces/todo.interface";
import { LayoutPaths } from "../../../../enums/layout-paths.enum";

@Component({
    selector: 'app-admin-panel',
    templateUrl: './admin-panel.component.html',
    styleUrls: ['./admin-panel.component.scss'],
    standalone: true,
    imports: [CommonModule, RouterLink]
})
export class AdminPanelComponent implements OnInit, OnDestroy {
    readonly layoutPaths = LayoutPaths;
    private readonly _destroy$ = new Subject<void>();
    usersWithTodos: IUserWithTodos[] = [];
    private originalTodosMap: Map<number, ITodoResponse[]> = new Map();
    expandedUsers: Set<number> = new Set();

    constructor(
        private readonly _adminService: AdminService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService,
        private readonly _notificationService: NotificationService
    ) {}

    ngOnInit(): void {
        this.loadUsersWithTodos();
        
        this._notificationService.notificationEvents$
            .pipe(
                debounceTime(300),
                takeUntil(this._destroy$)
            )
            .subscribe((notification) => {
                if (notification.todo_id) {
                    this.loadUsersWithTodos();
                }
            });
    }

    loadUsersWithTodos(): void {
        this._loaderService.show();
        this._adminService.getUsersWithTodos()
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (data) => {
                    this.originalTodosMap.clear();
                    data.forEach(userData => {
                        this.originalTodosMap.set(userData.user.id, userData.todos);
                    });
                    
                    this.usersWithTodos = data.map(userData => ({
                        ...userData,
                        todos: userData.todos.filter(todo => todo.status !== 'done'),
                        todo_count: userData.todos.filter(todo => todo.status !== 'done').length
                    }));
                    this._loaderService.hide();
                },
                error: (error) => {
                    this._loaderService.hide();
                    this._toastService.error(error?.error?.detail || 'Failed to load users and todos');
                }
            });
    }

    toggleUserExpansion(userId: number): void {
        const userData = this.usersWithTodos.find(u => u.user.id === userId);
        // Only allow expansion if user has todos
        if (!userData || userData.todos.length === 0) {
            return;
        }
        
        if (this.expandedUsers.has(userId)) {
            this.expandedUsers.delete(userId);
        } else {
            this.expandedUsers.add(userId);
        }
    }

    isUserExpanded(userId: number): boolean {
        return this.expandedUsers.has(userId);
    }

    getCompletedCount(userId: number): number {
        const originalTodos = this.originalTodosMap.get(userId);
        if (!originalTodos) return 0;
        return originalTodos.filter(t => t.status === 'done').length;
    }

    getPriorityClass(priority: string): string {
        switch (priority?.toLowerCase()) {
            case 'high':
                return 'priority-high';
            case 'medium':
                return 'priority-medium';
            case 'low':
                return 'priority-low';
            default:
                return '';
        }
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
