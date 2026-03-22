import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Subject, takeUntil, forkJoin } from "rxjs";
import { AdminService, IUserWithTodos } from "../../../core/services/admin.service";
import { LoaderService } from "../../../core/services/loader.service";
import { ToastService } from "../../../core/services/toast.service";
import { AuthService } from "../../../auth/services/auth.service";
import { TodoService } from "../../../core/services/todo.service";
import { ITodoResponse, ITodo } from "../../../core/interfaces/todo.interface";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { trackById } from "../../../shared/helpers/trackByFn.helper";
import { DashboardSideNavComponent } from "../dashboard/components/dashboard-side-nav/dashboard-side-nav.component";
import { DashboardSections } from "../../enums/dashboard-sections.enum";
import { NavigationService } from "../../../core/services/navigation.service";
import { SidebarComponent } from "../../../shared/components/sidebar/sidebar.component";

@Component({
    selector: 'app-user-details',
    templateUrl: './user-details.component.html',
    styleUrls: ['./user-details.component.scss'],
    standalone: true,
    imports: [CommonModule, RouterLink, DashboardSideNavComponent, SidebarComponent]
})
export class UserDetailsComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    userData: IUserWithTodos | null = null;
    userId: number | null = null;
    allTodos: ITodoResponse[] = [];
    readonly layoutPaths = LayoutPaths;
    trackById = trackById;
    isNavSidebarOpen: boolean = false;
    collapsedSections: Set<string> = new Set();

    constructor(
        private readonly _route: ActivatedRoute,
        private readonly _adminService: AdminService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService,
        private readonly _router: Router,
        private readonly _navService: NavigationService,
        public readonly _authService: AuthService,
        private readonly _todoService: TodoService
    ) {}

    ngOnInit(): void {
        const idParam = this._route.snapshot.paramMap.get('id');
        if (idParam) {
            this.userId = parseInt(idParam, 10);
            this.loadUserData();
        } else {
            this._router.navigate(['/']);
        }

        this._navService.toggleNavSidebar$
            .pipe(takeUntil(this._destroy$))
            .subscribe(() => {
                this.isNavSidebarOpen = !this.isNavSidebarOpen;
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

    onDashboardSectionChange(section: DashboardSections): void {
        let path = '';
        switch(section) {
            case DashboardSections.CALENDAR: path = LayoutPaths.CALENDAR; break;
            case DashboardSections.COMPLETED: path = LayoutPaths.COMPLETED; break;
            case DashboardSections.USER_MANAGEMENT: path = LayoutPaths.ADMIN; break;
            default: path = LayoutPaths.DASHBOARD; break;
        }
        this._router.navigate([path]);
    }

    onNavSidebarClose(): void {
        this.isNavSidebarOpen = false;
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
