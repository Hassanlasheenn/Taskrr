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
import { PosthogService } from "../../../core/services";
import { Router } from "@angular/router";
import { DashboardSections } from "../../enums/dashboard-sections.enum";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { NavigationService } from "../../../core/services/navigation.service";
import { FormsModule, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { DynamicFormComponent } from "../../../shared/components/dynamic-form/dynamic-form.component";
import { IFieldControl } from "../../../shared/interfaces";
import { InputTypes } from "../../../shared/enums";
import { ReactiveFormService } from "../../../shared/services/reactive-form.service";
import { SharedTableComponent } from "../../../shared/components/shared-table/shared-table.component";

@Component({
    selector: 'app-admin',
    templateUrl: './admin.component.html',
    styleUrls: ['./admin.component.scss'],
    standalone: true,
    imports: [CommonModule, CardComponent, FormsModule, ReactiveFormsModule, DynamicFormComponent, SharedTableComponent]
})
export class AdminComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    users: IUserListResponse[] = [];
    currentUserId: number | null = null;
    isAdmin: boolean = false;
    private isDeleting: boolean = false;
    private hasLoadedUsers: boolean = false;
    
    // Filter properties
    filterForm: FormGroup = new FormGroup({});
    filterFields: IFieldControl[] = [
        {
            label: 'Search',
            type: InputTypes.TEXT,
            formControlName: 'search',
            placeholder: 'Search by ID, username or email...',
            value: '',
            icon: 'bi-search',
            validations: []
        },
        {
            label: 'Role',
            type: InputTypes.DROPDOWN,
            formControlName: 'role',
            placeholder: 'All Roles',
            value: 'all',
            options: [
                { key: 'all', value: 'All Roles' },
                { key: 'user', value: 'User' },
                { key: 'admin', value: 'Admin' }
            ],
            validations: []
        }
    ];
    
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
        private readonly _el: ElementRef,
        private readonly _formService: ReactiveFormService
    ) {}

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        // Dropdown handled by DynamicForm child components
    }

    ngOnInit(): void {
        this.isAdmin = this._authService.isAdmin();
        this.currentUserId = this._authService.getCurrentUserId();

        this.filterForm = this._formService.initializeForm(this.filterFields);

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
        const search = this.filterForm.get('search')?.value;
        const role = this.filterForm.get('role')?.value;

        // Apply Role Filter
        if (role && role !== 'all') {
            filtered = filtered.filter(user => user.role === role);
        }

        // Apply Search Filter (ID, Username, Email)
        if (search && search.trim()) {
            const query = search.toLowerCase().trim();
            filtered = filtered.filter(user => 
                user.id.toString() === query ||
                user.username.toLowerCase().includes(query) ||
                user.email.toLowerCase().includes(query)
            );
        }

        return filtered.sort((a, b) => {
            if (a.role === 'admin' && b.role !== 'admin') return -1;
            if (a.role !== 'admin' && b.role === 'admin') return 1;
            return 0;
        });
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

    onRoleChange(event: { userId: number; role: 'user' | 'admin' }): void {
        this._loaderService.show();
        this._adminService.updateUserRole(event.userId, event.role)
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: () => {
                    this._loaderService.hide();
                    this._toastService.success(`User role updated to ${event.role}`);
                    this.loadUsers();
                },
                error: (error) => {
                    this._loaderService.hide();
                    this._toastService.error(error?.error?.detail || 'Failed to update user role');
                }
            });
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
