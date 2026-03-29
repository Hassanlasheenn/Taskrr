import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { Subject, takeUntil, debounceTime } from "rxjs";
import { AdminService, IUserWithTodos } from "../../../../../core/services/admin.service";
import { LoaderService } from "../../../../../core/services/loader.service";
import { ToastService } from "../../../../../core/services/toast.service";
import { NotificationService } from "../../../../../core/services/notification.service";
import { AuthService } from "../../../../../auth/services/auth.service";
import { ITodoResponse } from "../../../../../core/interfaces/todo.interface";
import { LayoutPaths } from "../../../../enums/layout-paths.enum";
import { trackById } from "../../../../../shared/helpers/trackByFn.helper";

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
    private hasLoadedData: boolean = false;
    trackById = trackById;
    isAdmin: boolean = false;

    // Pagination
    skip: number = 0;
    readonly limit: number = 6;
    hasMore: boolean = true;
    loadingMore: boolean = false;

    constructor(
        private readonly _adminService: AdminService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService,
        private readonly _notificationService: NotificationService,
        public readonly _authService: AuthService
    ) {}

    ngOnInit(): void {
        this.isAdmin = this._authService.isAdmin();
        this._authService.currentUserData$
            .pipe(takeUntil(this._destroy$))
            .subscribe((userData) => {
                if (userData && this.isAdmin && !this.hasLoadedData) {
                    this.hasLoadedData = true;
                    this.loadUsersWithTodos();
                }
            });
        
        this._notificationService.notificationEvents$
            .pipe(
                debounceTime(300),
                takeUntil(this._destroy$)
            )
            .subscribe((notification) => {
                if (notification.todo_id) {
                    this.refreshData();
                }
            });
    }

    loadUsersWithTodos(): void {
        if (this.skip === 0) this._loaderService.show();
        else this.loadingMore = true;

        this._adminService.getUsersWithTodos(this.skip, this.limit)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (data) => {
                    if (this.skip === 0) {
                        this.usersWithTodos = data;
                    } else {
                        this.usersWithTodos = [...this.usersWithTodos, ...data];
                    }
                    
                    this.hasMore = data.length === this.limit;
                    this._loaderService.hide();
                    this.loadingMore = false;
                },
                error: (error) => {
                    this._loaderService.hide();
                    this.loadingMore = false;
                    this._toastService.error(error?.error?.detail || 'Failed to load users and todos');
                }
            });
    }

    loadMore(): void {
        if (this.loadingMore || !this.hasMore) return;
        this.skip += this.limit;
        this.loadUsersWithTodos();
    }

    refreshData(): void {
        this.skip = 0;
        this.hasMore = true;
        this.loadUsersWithTodos();
    }

    getCompletedCount(userId: number): number {
        const user = this.usersWithTodos.find(u => u.user.id === userId);
        if (!user) return 0;
        return user.todos.filter(t => t.status === 'done').length;
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
