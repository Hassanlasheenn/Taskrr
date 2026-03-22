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

    constructor(
        private readonly _adminService: AdminService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService,
        private readonly _notificationService: NotificationService,
        public readonly _authService: AuthService
    ) {}

    ngOnInit(): void {
        this._authService.currentUserData$
            .pipe(takeUntil(this._destroy$))
            .subscribe((userData) => {
                if (userData && this._authService.isAdmin() && !this.hasLoadedData) {
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
                    this.usersWithTodos = data;
                    this._loaderService.hide();
                },
                error: (error) => {
                    this._loaderService.hide();
                    this._toastService.error(error?.error?.detail || 'Failed to load users and todos');
                }
            });
    }

    trackByUserId(index: number, item: IUserWithTodos): number {
        return item.user.id;
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
