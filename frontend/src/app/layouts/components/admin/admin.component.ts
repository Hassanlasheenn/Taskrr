import { Component, OnInit, OnDestroy, HostListener, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Subject, takeUntil } from "rxjs";
import { AdminService } from "../../../core/services/admin.service";
import { AuthService } from "../../../auth/services";
import { ToastService } from "../../../core/services/toast.service";
import { LoaderService } from "../../../core/services/loader.service";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { IUserListResponse } from "../../../auth/interfaces";
import { CardComponent } from "../../../shared/components/card/card.component";
import { trackById } from "../../../shared/helpers/trackByFn.helper";
import { PosthogService } from "../../../core/services";
import { Router } from "@angular/router";
import { DashboardSections } from "../../enums/dashboard-sections.enum";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { NavigationService } from "../../../core/services/navigation.service";
import { FormsModule } from "@angular/forms";

@Component({
    selector: 'app-admin',
    templateUrl: './admin.component.html',
    styleUrls: ['./admin.component.scss'],
    standalone: true,
    imports: [CommonModule, CardComponent, FormsModule]
})
export class AdminComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    users: IUserListResponse[] = [];
    currentUserId: number | null = null;
    trackById = trackById;
    isAdmin: boolean = false;
    private isDeleting: boolean = false;
    private hasLoadedUsers: boolean = false;
    
    // Filter properties
    searchQuery: string = '';
    selectedRole: string = 'all';
    isRoleDropdownOpen: boolean = false;
    
    readonly DashboardSections = DashboardSections;

    constructor(
        private readonly _adminService: AdminService,
        public readonly _authService: AuthService,
        private readonly _toastService: ToastService,
        private readonly _loaderService: LoaderService,
        private readonly _confirmationDialog: ConfirmationDialogService,
        private readonly _posthogService: PosthogService,
        private readonly _router: Router,
        private readonly _navService: NavigationService,
        private readonly _el: ElementRef
    ) {}

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        if (!this._el.nativeElement.contains(event.target)) {
            this.isRoleDropdownOpen = false;
        }
    }

    toggleRoleDropdown(): void {
        this.isRoleDropdownOpen = !this.isRoleDropdownOpen;
    }

    selectRole(role: string): void {
        this.selectedRole = role;
        this.isRoleDropdownOpen = false;
    }

    getSelectedRoleLabel(): string {
        switch(this.selectedRole) {
            case 'admin': return 'Admin';
            case 'user': return 'User';
            default: return 'All Roles';
        }
    }

    ngOnInit(): void {
        this.isAdmin = this._authService.isAdmin();
        this.currentUserId = this._authService.getCurrentUserId();

        // Wait for user data to be loaded before verifying admin status
        this._authService.currentUserData$
            .pipe(takeUntil(this._destroy$))
            .subscribe((userData) => {
                if (userData && !this.hasLoadedUsers) {
                    // Once user data is loaded, verify admin status
                    if (this.isAdmin) {
                        this.hasLoadedUsers = true;
                        this.loadUsers();
                    } else {
                        this._toastService.error('Access denied. Admin privileges required.');
                    }
                } else if (!this.currentUserId && !this.hasLoadedUsers) {
                    // No user logged in
                    this.hasLoadedUsers = true;
                    this._toastService.error('Access denied. Admin privileges required.');
                }
            });
    }

    loadUsers(): void {
        this._loaderService.show();
        this._adminService.listUsers()
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (users) => {
                    this.users = users;
                    this._loaderService.hide();
                },
                error: (error) => {
                    this._loaderService.hide();
                    const errorMessage = error?.error?.detail || error?.message || 'Failed to load users';
                    this._toastService.error(errorMessage);
                }
            });
    }

    get filteredUsers(): IUserListResponse[] {
        let filtered = this.users;

        // Apply Role Filter
        if (this.selectedRole !== 'all') {
            filtered = filtered.filter(user => user.role === this.selectedRole);
        }

        // Apply Search Filter (ID, Username, Email)
        if (this.searchQuery.trim()) {
            const query = this.searchQuery.toLowerCase().trim();
            filtered = filtered.filter(user => 
                user.id.toString() === query ||
                user.username.toLowerCase().includes(query) ||
                user.email.toLowerCase().includes(query)
            );
        }

        return filtered;
    }

    onDeleteUser(userId: number): void {
        if (this.isDeleting) return;

        this._confirmationDialog.show({
            title: 'Delete User',
            message: 'Are you sure you want to delete this user? This action cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel'
        })
        .pipe(takeUntil(this._destroy$))
        .subscribe({
            next: (result) => {
                if (result.confirmed && !this.isDeleting) {
                    this.isDeleting = true;
                    this._loaderService.show();
                    this._adminService.deleteUser(userId)
                        .pipe(takeUntil(this._destroy$))
                        .subscribe({
                            next: () => {
                                this.users = this.users.filter(user => user.id !== userId);
                                this._loaderService.hide();
                                this.isDeleting = false;
                                this._toastService.success('User deleted successfully');
                            },
                            error: (error) => {
                                this._loaderService.hide();
                                this.isDeleting = false;
                                this._toastService.error(error?.error?.detail || 'Failed to delete user');
                            }
                        });
                }
            }
        });
    }

    onRoleChange(userId: number, newRole: "user" | "admin"): void {
        this._loaderService.show();
        this._adminService.updateUserRole(userId, newRole)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: () => {
                    this._loaderService.hide();
                    this._toastService.success(`User role updated to ${newRole}`);
                    this.loadUsers();
                },
                error: (error) => {
                    this._loaderService.hide();
                    this._toastService.error(error?.error?.detail || 'Failed to update user role');
                }
            });
    }

    isCurrentUser(userId: number): boolean {
        return userId === this.currentUserId;
    }

    onSectionChange(section: DashboardSections): void {
        let path = '';
        switch(section) {
            case DashboardSections.CALENDAR: path = LayoutPaths.CALENDAR; break;
            case DashboardSections.COMPLETED: path = LayoutPaths.COMPLETED; break;
            case DashboardSections.USER_MANAGEMENT: path = LayoutPaths.ADMIN; break;
            default: path = LayoutPaths.DASHBOARD; break;
        }
        this._router.navigate([path]);
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
