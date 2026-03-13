import { Component, OnInit, OnDestroy } from "@angular/core";
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

@Component({
    selector: 'app-admin',
    templateUrl: './admin.component.html',
    styleUrls: ['./admin.component.scss'],
    standalone: true,
    imports: [CommonModule, CardComponent]
})
export class AdminComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    users: IUserListResponse[] = [];
    currentUserId: number | null = null;
    trackById = trackById;
    private isDeleting: boolean = false;

    constructor(
        private readonly _adminService: AdminService,
        private readonly _authService: AuthService,
        private readonly _toastService: ToastService,
        private readonly _loaderService: LoaderService,
        private readonly _confirmationDialog: ConfirmationDialogService,
        private readonly _posthogService: PosthogService
    ) {}

    ngOnInit(): void {
        this.currentUserId = this._authService.getCurrentUserId();
        
        // Verify user is admin before loading users
        if (!this._authService.isAdmin()) {
            this._toastService.error('Access denied. Admin privileges required.');
            return;
        }
        
        this.loadUsers();
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
                    
                    // If 401, suggest logging out and back in
                    if (error?.status === 401) {
                        console.error('Authentication error. Please log out and log back in to refresh your session.');
                    }
                }
            });
    }

    onDeleteUser(userId: number): void {
        // Prevent multiple simultaneous delete operations
        if (this.isDeleting) {
            return;
        }

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
                                // Remove user from local array instead of reloading all users
                                this.users = this.users.filter(user => user.id !== userId);
                                this._loaderService.hide();
                                this.isDeleting = false;
                                this._toastService.success('User deleted successfully');
                                this._posthogService.capture('user_deleted_by_admin', { deleted_user_id: userId });
                            },
                            error: (error) => {
                                this._loaderService.hide();
                                this.isDeleting = false;
                                this._toastService.error(error?.error?.detail || 'Failed to delete user');
                            }
                        });
                }
            },
            error: () => {
                // Handle any errors from the dialog
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
                    this._posthogService.capture('user_role_changed_by_admin', { 
                        target_user_id: userId,
                        new_role: newRole 
                    });
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

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
