import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { ITodo, ITodoUpdate } from '../../../core/interfaces/todo.interface';
import { TodoService } from '../../../core/services/todo.service';
import { ToastService } from '../../../core/services/toast.service';
import { trackById } from '../../helpers/trackByFn.helper';
import { ConfirmationDialogService } from '../../../core/services/confirmation-dialog.service';
import { AuthService } from '../../../auth/services/auth.service';

@Component({
    selector: 'app-subtask-list',
    templateUrl: './subtask-list.component.html',
    styleUrls: ['./subtask-list.component.scss'],
    standalone: true,
    imports: [CommonModule],
})
export class SubtaskListComponent implements OnChanges {
    @Input() subtasks: ITodo[] = [];
    @Input() parentId!: number;
    @Input() userId!: number;
    @Input() parentType: 'project' | 'story' | string = 'story';
    @Output() openAddForm = new EventEmitter<void>();
    @Output() editSubtask = new EventEmitter<ITodo>();
    @Output() subtaskDeleted = new EventEmitter<number>();
    @Output() subtaskUpdated = new EventEmitter<ITodo>();

    trackById = trackById;

    constructor(
        private readonly _todoService: TodoService,
        private readonly _toastService: ToastService,
        private readonly _router: Router,
        private readonly _confirmationDialog: ConfirmationDialogService,
        private readonly _authService: AuthService,
    ) {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['subtasks']) {
            this.subtasks = [...(this.subtasks || [])];
        }
    }

    isCurrentUser(assignedUserId: number | null | undefined): boolean {
        return !!assignedUserId && this._authService.getCurrentUserId() === assignedUserId;
    }

    get doneCount(): number {
        return this.subtasks.filter(s => s.status === 'done').length;
    }

    get completionPercent(): number {
        if (!this.subtasks.length) return 0;
        return Math.round((this.doneCount / this.subtasks.length) * 100);
    }

    get labels(): { plural: string, singular: string } {
        if (this.parentType === 'project') {
            return { plural: 'Stories', singular: 'Story' };
        }
        return { plural: 'Tasks', singular: 'Task' };
    }

    onToggleStatus(subtask: ITodo): void {
        const newStatus = subtask.status === 'done' ? 'new' : 'done';
        const update: ITodoUpdate = { status: newStatus };
        this._todoService.updateTodo(this.userId, subtask.id, update).subscribe({
            next: (res) => {
                const updated: ITodo = { ...subtask, status: res.status };
                this.subtasks = this.subtasks.map(s => s.id === subtask.id ? updated : s);
                this.subtaskUpdated.emit(updated);
            },
            error: () => this._toastService.show('Failed to update task', 'error')
        });
    }

    onViewSubtask(subtask: ITodo): void {
        this._router.navigate(['/todo', subtask.id], { queryParams: { user_id: this.userId } });
    }

    onDeleteSubtask(subtask: ITodo): void {
        this._confirmationDialog.show({
            title: 'Delete Task',
            message: `Are you sure you want to delete "${subtask.title}"?`,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            confirmButtonClass: 'btn-danger'
        }).subscribe(result => {
            if (result.confirmed) {
                this._todoService.deleteTodo(this.userId, subtask.id).subscribe({
                    next: () => {
                        this.subtasks = this.subtasks.filter(s => s.id !== subtask.id);
                        this.subtaskDeleted.emit(subtask.id);
                        this._toastService.show('Task deleted successfully', 'success');
                    },
                    error: () => this._toastService.show('Failed to delete task', 'error')
                });
            }
        });
    }

    canDeleteSubtask(subtask: ITodo): boolean {
        return this._authService.isAdmin() || subtask.user_id === this._authService.getCurrentUserId();
    }
}
