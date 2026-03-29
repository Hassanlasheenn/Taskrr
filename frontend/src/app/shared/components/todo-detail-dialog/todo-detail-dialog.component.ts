import { Component, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router, RouterLink } from "@angular/router";
import { Subject, takeUntil } from "rxjs";
import { TodoDetailDialogService } from "../../../core/services/todo-detail-dialog.service";
import { ITodo } from "../../../core/interfaces/todo.interface";
import { LayoutPaths } from "../../../layouts/enums/layout-paths.enum";
import { AuthService } from "../../../auth/services/auth.service";
import { TodoService } from "../../../core/services/todo.service";
import { ToastService } from "../../../core/services/toast.service";
import { ProgressBarComponent } from "../progress-bar/progress-bar.component";
import { getTodoType, getTodoTypeLabel, getTodoTypeIcon } from "../../helpers/todo-type.helper";

@Component({
    selector: 'app-todo-detail-dialog',
    templateUrl: './todo-detail-dialog.component.html',
    styleUrls: ['./todo-detail-dialog.component.scss'],
    standalone: true,
    imports: [CommonModule, RouterLink, ProgressBarComponent]
})
export class TodoDetailDialogComponent implements OnInit, OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    todo: ITodo | null = null;
    isVisible: boolean = false;
    saving = false;

    constructor(
        private readonly _dialogService: TodoDetailDialogService,
        private readonly _router: Router,
        private readonly _authService: AuthService,
        private readonly _todoService: TodoService,
        private readonly _toastService: ToastService
    ) {}

    ngOnInit(): void {
        this._dialogService.getTodo()
            .pipe(takeUntil(this._destroy$))
            .subscribe(todo => {
                this.todo = todo;
                this.isVisible = !!todo;
            });
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }

    onClose(): void {
        this._dialogService.close();
    }

    onViewDetails(): void {
        if (this.todo) {
            const userId = this._authService.getCurrentUserId();
            this._router.navigate(['/', LayoutPaths.TODO_VIEW, this.todo.id], {
                queryParams: { user_id: userId }
            });
            this.onClose();
        }
    }

    onUpdateStatus(newStatus: string): void {
        if (!this.todo || this.saving) return;
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this.saving = true;
        this._todoService.updateTodo(userId, this.todo.id, { status: newStatus as any }).subscribe({
            next: (updated) => {
                this.todo = { ...this.todo, ...updated } as ITodo;
                this._dialogService.notifyUpdate(this.todo);
                this.saving = false;
                this._toastService.success('Status updated');
            },
            error: () => {
                this.saving = false;
                this._toastService.error('Failed to update status');
            }
        });
    }

    onUpdatePriority(newPriority: string): void {
        if (!this.todo || this.saving) return;
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        this.saving = true;
        this._todoService.updateTodo(userId, this.todo.id, { priority: newPriority as any }).subscribe({
            next: (updated) => {
                this.todo = { ...this.todo, ...updated } as ITodo;
                this._dialogService.notifyUpdate(this.todo);
                this.saving = false;
                this._toastService.success('Priority updated');
            },
            error: () => {
                this.saving = false;
                this._toastService.error('Failed to update priority');
            }
        });
    }

    onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('dialog-backdrop')) {
            this.onClose();
        }
    }

    get dialogTitle(): string {
        if (!this.todo) return '';
        return getTodoTypeLabel(getTodoType(this.todo));
    }

    get dialogTypeIcon(): string {
        if (!this.todo) return '';
        return getTodoTypeIcon(getTodoType(this.todo));
    }

    get dialogTypeClass(): string {
        if (!this.todo) return '';
        return 'dialog-type-badge--' + getTodoType(this.todo);
    }

    getPriorityClass(priority: string): string {
        return `priority-${priority?.toLowerCase() || 'medium'}`;
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
}
