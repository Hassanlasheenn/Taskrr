import { CommonModule } from "@angular/common";
import { Component, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { AuthService } from "../../../auth/services/auth.service";
import { UserService } from "../../../core/services/user.service";
import { TodoService } from "../../../core/services/todo.service";
import { IUserListResponse } from "../../../auth/interfaces";
import { LoaderService } from "../../../core/services/loader.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmationDialogService } from "../../../core/services/confirmation-dialog.service";
import { ITodo, TodoStatus } from "../../../core/interfaces/todo.interface";
import { LayoutPaths } from "../../enums/layout-paths.enum";
import { CanComponentDeactivate } from "../../../auth/guards";

type StatusOption = { value: TodoStatus; label: string };
type PriorityOption = { value: 'low' | 'medium' | 'high'; label: string };

const STATUS_OPTIONS: StatusOption[] = [
    { value: 'new', label: 'New' },
    { value: 'inProgress', label: 'In Progress' },
    { value: 'paused', label: 'Paused' },
    { value: 'done', label: 'Done' },
];

const PRIORITY_OPTIONS: PriorityOption[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
];

@Component({
    selector: 'app-todo-view',
    templateUrl: './todo-view.component.html',
    styleUrls: ['./todo-view.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
})
export class TodoViewComponent implements OnInit, CanComponentDeactivate {
    todo: ITodo | null = null;
    saving = false;
    initialStatus: TodoStatus | null = null;
    initialPriority: 'low' | 'medium' | 'high' | null = null;
    initialDescription: string | null = null;
    initialAssignedToUserId: number | null = null;
    users: IUserListResponse[] = [];
    LayoutPaths = LayoutPaths;
    readonly statusOptions = STATUS_OPTIONS;
    readonly priorityOptions = PRIORITY_OPTIONS;

    get isAdmin(): boolean {
        return this._authService.isAdmin();
    }

    get hasChanges(): boolean {
        if (!this.todo || this.initialStatus === null || this.initialPriority === null) return false;
        const statusChanged = this.todo.status !== this.initialStatus;
        const priorityChanged = this.todo.priority !== this.initialPriority;
        const descriptionChanged = (this.todo.description ?? '') !== (this.initialDescription ?? '');
        const assignedChanged = (this.todo.assigned_to_user_id ?? null) !== this.initialAssignedToUserId;
        return statusChanged || priorityChanged || descriptionChanged || assignedChanged;
    }

    constructor(
        private readonly _route: ActivatedRoute,
        private readonly _router: Router,
        private readonly _authService: AuthService,
        private readonly _todoService: TodoService,
        private readonly _userService: UserService,
        private readonly _loaderService: LoaderService,
        private readonly _toastService: ToastService,
        private readonly _confirmationDialog: ConfirmationDialogService
    ) {}

    canDeactivate(): boolean | Observable<boolean> {
        if (!this.hasChanges) return true;
        return this._confirmationDialog.show({
            title: 'Unsaved changes',
            message: 'You have unsaved changes. Leave without saving?',
            confirmText: 'Leave',
            cancelText: 'Stay',
            confirmButtonClass: 'btn-primary',
        }).pipe(map((result) => result.confirmed));
    }

    ngOnInit(): void {
        const idParam = this._route.snapshot.paramMap.get('id');
        const todoId = idParam ? Number.parseInt(idParam, 10) : Number.NaN;
        if (!idParam || Number.isNaN(todoId)) {
            this._toastService.error('Invalid todo');
            this._router.navigate([LayoutPaths.DASHBOARD]);
            return;
        }
        const userId = this._authService.getCurrentUserId();
        if (!userId) {
            this._router.navigate([LayoutPaths.DASHBOARD]);
            return;
        }
        this._loaderService.show();
        this._todoService.getTodo(userId, todoId).subscribe({
            next: (response) => {
                this.todo = {
                    ...response,
                    status: (response.status ?? 'new') as TodoStatus,
                    priority: (response.priority ?? 'medium') as 'low' | 'medium' | 'high',
                } as ITodo;
                this.initialStatus = this.todo.status;
                this.initialPriority = this.todo.priority;
                this.initialDescription = this.todo.description ?? null;
                this.initialAssignedToUserId = this.todo.assigned_to_user_id ?? null;
                if (this.isAdmin) this._loadUsers();
                this._loaderService.hide();
            },
            error: (error) => {
                this._loaderService.hide();
                this._toastService.error(error?.error?.detail || 'Failed to load todo');
                this._router.navigate([LayoutPaths.DASHBOARD]);
            }
        });
    }

    private _loadUsers(): void {
        this._userService.getUsersWithRoleUser().subscribe({
            next: (list) => { this.users = list; },
            error: () => { this.users = []; },
        });
    }

    userInList(userId: number): boolean {
        return this.users.some((u) => u.id === userId);
    }

    onSave(): void {
        if (!this.todo) return;
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this.saving = true;
        this._todoService.updateTodo(userId, this.todo.id, {
            status: this.todo.status,
            priority: this.todo.priority,
            description: this.todo.description ?? undefined,
            assigned_to_user_id: this.todo.assigned_to_user_id ?? null,
        }).subscribe({
            next: (updated) => {
                this.todo = {
                    ...this.todo!,
                    status: updated.status as TodoStatus,
                    priority: updated.priority as 'low' | 'medium' | 'high',
                    description: updated.description ?? this.todo!.description,
                    assigned_to_user_id: updated.assigned_to_user_id ?? undefined,
                    assigned_to_username: updated.assigned_to_username ?? this.todo!.assigned_to_username,
                    updated_at: updated.updated_at,
                };
                this.initialStatus = this.todo.status;
                this.initialPriority = this.todo.priority;
                this.initialDescription = this.todo.description ?? null;
                this.initialAssignedToUserId = this.todo.assigned_to_user_id ?? null;
                this.saving = false;
                this._toastService.success('Todo updated');
            },
            error: (err) => {
                this.saving = false;
                this._toastService.error(err?.error?.detail || 'Failed to update todo');
            },
        });
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

    getPriorityIcon(priority: string): string {
        switch (priority) {
            case 'high': return 'bi-arrow-up';
            case 'low': return 'bi-arrow-down';
            default: return 'bi-dash';
        }
    }

    formatDate(dateString?: string): { date: string; time: string } | null {
        if (!dateString) return null;
        const date = new Date(dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10)
            ? dateString
            : dateString.replace('T', ' '));
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const formattedTime = `${hours}:${minutes} ${ampm}`;
        return { date: formattedDate, time: formattedTime };
    }
}
