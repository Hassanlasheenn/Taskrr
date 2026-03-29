import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ITodo } from '../../../core/interfaces/todo.interface';
import { getTodoType, getTodoTypeLabel, getTodoTypeIcon, enrichTodoTypes } from '../../helpers/todo-type.helper';
import { trackById } from '../../helpers/trackByFn.helper';
import { ProgressBarComponent } from '../progress-bar/progress-bar.component';
import { TodoService } from '../../../core/services/todo.service';
import { AuthService } from '../../../auth/services/auth.service';
import { TodoDetailDialogService } from '../../../core/services/todo-detail-dialog.service';
import { ToastService } from '../../../core/services/toast.service';

export interface ITodoStatusChange {
    todo: ITodo;
    newStatus: string;
}

@Component({
    selector: 'app-todo-columns',
    templateUrl: './todo-columns.component.html',
    styleUrls: ['./todo-columns.component.scss'],
    standalone: true,
    imports: [CommonModule, RouterLink, DragDropModule, ProgressBarComponent]
})
export class TodoColumnsComponent implements OnChanges {
    /** Main todos — split internally into 4 status columns. */
    @Input() todos: ITodo[] = [];
    /** Pre-filtered unassigned todos — optional 5th column. */
    @Input() unassignedTodos: ITodo[] = [];
    /** Whether to render the unassigned column. */
    @Input() showUnassigned: boolean = false;
    /** Route segment used to build the "view" link (e.g. "todo"). */
    @Input() todoViewPath: string = 'todo';
    /** User ID for loading more todos. */
    @Input() userId: number | null = null;
    @Input() showAddSubtask: boolean = true;

    @Output() edit   = new EventEmitter<ITodo>();
    @Output() delete = new EventEmitter<ITodo>();
    @Output() statusChange = new EventEmitter<ITodoStatusChange>();
    /** Emitted when a todo is dropped onto the unassigned column — parent should clear assigned_to_user_id */
    @Output() unassign = new EventEmitter<ITodo>();
    @Output() addSubtask = new EventEmitter<ITodo>();

    readonly trackById = trackById;

    // ── Subtask expand state ──────────────────────────────────────
    _expandedStories  = new Set<number>();
    _loadingSubtasks  = new Set<number>();
    _loadedSubtasks   = new Map<number, ITodo[]>();

    // ── Internal mutable arrays — CDK drag-drop operates on these ──
    _unassigned:  ITodo[] = [];
    _new:         ITodo[] = [];
    _inProgress:  ITodo[] = [];
    _paused:      ITodo[] = [];
    _done:        ITodo[] = [];

    // ── Pagination state ──────────────────────────────────────────
    readonly limit = 6;
    _pagination = {
        unassigned: { skip: 0, total: 0, hasMore: false, loading: false, currentCount: 6 },
        new:        { skip: 0, total: 0, hasMore: false, loading: false, currentCount: 6 },
        inprogress: { skip: 0, total: 0, hasMore: false, loading: false, currentCount: 6 },
        paused:     { skip: 0, total: 0, hasMore: false, loading: false, currentCount: 6 },
        done:       { skip: 0, total: 0, hasMore: false, loading: false, currentCount: 6 }
    };

    // ── Collapse state ────────────────────────────────────────────
    _collapsed: Record<string, boolean> = {};

    // ── Expand state (big screens only) ──────────────────────────
    _expanded: string | null = null;

    constructor(
        private readonly _todoService: TodoService,
        private readonly _authService: AuthService,
        private readonly _dialogService: TodoDetailDialogService,
        private readonly _toastService: ToastService,
    ) {}

    onSubtaskClick(subtask: ITodo, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this._dialogService.open(subtask);
    }

    onTodoClick(todo: ITodo, event: MouseEvent): void {
        // Only open if not clicking an action button or status toggle
        const target = event.target as HTMLElement;
        if (target.closest('.tc-item__btn') || target.closest('.tc-item__subtask-toggle') || target.closest('.tc-item__subtasks') || target.closest('.tc-item__subtask-status')) {
            return;
        }
        this._dialogService.open(todo);
    }

    onUpdateSubtaskStatus(subtask: ITodo, event: MouseEvent): void {
        event.stopPropagation();
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        const newStatus = subtask.status === 'done' ? 'new' : 'done';
        this._todoService.updateTodo(userId, subtask.id, { status: newStatus as any }).subscribe({
            next: (updated) => {
                const parentId = subtask.parent_id;
                if (parentId) {
                    const subtasks = this._loadedSubtasks.get(parentId);
                    if (subtasks) {
                        const idx = subtasks.findIndex(s => s.id === subtask.id);
                        if (idx !== -1) {
                            subtasks[idx] = { ...updated } as ITodo;
                            this._loadedSubtasks.set(parentId, [...subtasks]);
                        }
                    }
                }
                this._toastService.success(`Status updated to ${newStatus}`);
                this._dialogService.notifyUpdate(updated as ITodo);
            },
            error: () => {
                this._toastService.error('Failed to update subtask status');
            }
        });
    }

    isCurrentUser(assignedUserId: number | null | undefined): boolean {
        return !!assignedUserId && this._authService.getCurrentUserId() === assignedUserId;
    }

    ngOnInit(): void {
        this._dialogService.todoUpdated$
            .subscribe(updated => {
                if (updated) {
                    if (updated.parent_id) {
                        // Update in _loadedSubtasks map
                        const subtasks = this._loadedSubtasks.get(updated.parent_id);
                        if (subtasks) {
                            const idx = subtasks.findIndex(s => s.id === updated.id);
                            if (idx !== -1) {
                                subtasks[idx] = { ...updated };
                                this._loadedSubtasks.set(updated.parent_id, [...subtasks]);
                            }
                        }
                    }
                    
                    // Also update in main lists if present
                    const lists = [this._unassigned, this._new, this._inProgress, this._paused, this._done];
                    lists.forEach(list => {
                        const idx = list.findIndex(t => t.id === updated.id);
                        if (idx !== -1) {
                            list[idx] = { ...updated };
                        }
                    });
                }
            });
    }

    // Signature caches — prevent CDK arrays being re-built while a
    // drag is in flight (filteredTodos getter in the parent creates a
    // new reference every CD cycle).
    private _todosSignature      = '';
    private _unassignedSignature = '';

    // ─────────────────────────────────────────────────────────────
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['todos'] || changes['showUnassigned']) {
            const sig = this.todos.map(t => `${t.id}:${t.status}:${t.priority}:${t.category}:${t.title}`).join(',');
            if (sig !== this._todosSignature || changes['showUnassigned']) {
                this._todosSignature = sig;
                
                // Distribute todos into status columns.
                const allNew        = this.todos.filter(t => t.status === 'new');
                const allInProgress = this.todos.filter(t => t.status === 'inProgress');
                const allPaused     = this.todos.filter(t => t.status === 'paused');
                const allDone       = this.todos.filter(t => t.status === 'done');

                this._pagination.new.total = allNew.length;
                this._pagination.inprogress.total = allInProgress.length;
                this._pagination.paused.total = allPaused.length;
                this._pagination.done.total = allDone.length;

                this._new = allNew.slice(0, this._pagination.new.currentCount);
                this._inProgress = allInProgress.slice(0, this._pagination.inprogress.currentCount);
                this._paused = allPaused.slice(0, this._pagination.paused.currentCount);
                this._done = allDone.slice(0, this._pagination.done.currentCount);

                this._updateHasMore();
            }
        }
        if (changes['unassignedTodos']) {
            const sig = this.unassignedTodos.map(t => t.id).join(',');
            if (sig !== this._unassignedSignature) {
                this._unassignedSignature = sig;
                this._pagination.unassigned.total = this.unassignedTodos.length;
                this._unassigned = this.unassignedTodos.slice(0, this._pagination.unassigned.currentCount);
                this._updateHasMore();
            }
        }
    }

    private _updateHasMore(): void {
        this._pagination.unassigned.hasMore = this._unassigned.length < this._pagination.unassigned.total;
        this._pagination.new.hasMore = this._new.length < this._pagination.new.total;
        this._pagination.inprogress.hasMore = this._inProgress.length < this._pagination.inprogress.total;
        this._pagination.paused.hasMore = this._paused.length < this._pagination.paused.total;
        this._pagination.done.hasMore = this._done.length < this._pagination.done.total;
    }

    loadMore(status: string): void {
        const statusKey = status.toLowerCase();
        const pag = (this._pagination as any)[statusKey];
        if (!pag || pag.loading || !this.userId) return;

        pag.skip += this.limit;
        pag.loading = true;

        const apiStatus = this._toApiStatus(status);

        this._todoService.getTodos(this.userId, pag.skip, this.limit, 'desc', { status: apiStatus === 'unassigned' ? undefined : apiStatus as any }, undefined, true)
            .subscribe({
                next: (res) => {
                    const newItems = res.todos as ITodo[];
                    const merge = (old: ITodo[], added: ITodo[]) => {
                        const ids = new Set(old.map(t => t.id));
                        return [...old, ...added.filter(t => !ids.has(t.id))];
                    };

                    if (status === 'unassigned') {
                        const unassigned = newItems.filter(t => !t.assigned_to_user_id);
                        this._unassigned = merge(this._unassigned, unassigned);
                        this._pagination.unassigned.currentCount = this._unassigned.length;
                    }
                    else if (status === 'new') {
                        this._new = merge(this._new, newItems);
                        this._pagination.new.currentCount = this._new.length;
                    }
                    else if (status === 'inprogress') {
                        this._inProgress = merge(this._inProgress, newItems);
                        this._pagination.inprogress.currentCount = this._inProgress.length;
                    }
                    else if (status === 'paused') {
                        this._paused = merge(this._paused, newItems);
                        this._pagination.paused.currentCount = this._paused.length;
                    }
                    else if (status === 'done') {
                        this._done = merge(this._done, newItems);
                        this._pagination.done.currentCount = this._done.length;
                    }

                    pag.total = res.total;
                    pag.loading = false;
                    this._updateHasMore();
                },
                error: () => pag.loading = false
            });
    }

    // Maps internal column keys (used by CDK/HTML) to API-accepted status values
    private _toApiStatus(colKey: string): string {
        return colKey === 'inprogress' ? 'inProgress' : colKey;
    }

    // ── Drag & Drop ───────────────────────────────────────────────
    onTodoDrop(event: CdkDragDrop<ITodo[]>, targetStatus: string): void {
        if (event.previousContainer === event.container) {
            moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
            return;
        }
        // Snapshot before transferring — parent's API handler needs the old ref
        const todo = { ...event.previousContainer.data[event.previousIndex] };
        transferArrayItem(
            event.previousContainer.data,
            event.container.data,
            event.previousIndex,
            event.currentIndex
        );
        if (targetStatus === 'unassigned') {
            // Bump both signatures so ngOnChanges doesn't undo the visual move
            // while the parent's API call is in flight.
            this._todosSignature = this.todos.map(t => `${t.id}:${t.status}`).join(',')
                + `:unassigned:${todo.id}`;
            this._unassignedSignature = this.unassignedTodos.map(t => t.id).join(',')
                + `:adding:${todo.id}`;
            this.unassign.emit(todo);
        } else {
            const apiStatus = this._toApiStatus(targetStatus);
            // Bump the signature so the next ngOnChanges call from the parent's
            // in-flight todos getter does NOT undo the visual move.
            this._todosSignature = this.todos.map(t => `${t.id}:${t.status}`).join(',')
                + `:moved:${todo.id}→${apiStatus}`;
            this.statusChange.emit({ todo, newStatus: apiStatus });
        }
    }

    // ── Collapse / Expand ─────────────────────────────────────────
    toggleSection(key: string): void {
        this._collapsed = { ...this._collapsed, [key]: !this._collapsed[key] };
    }

    isCollapsed(key: string): boolean {
        return !!this._collapsed[key];
    }

    toggleExpand(colId: string, event: MouseEvent): void {
        event.stopPropagation();
        this._expanded = this._expanded === colId ? null : colId;
    }

    isExpanded(colId: string): boolean {
        return this._expanded === colId;
    }

    // Dynamic grid-template-columns — distributes extra space to
    // the expanded column while keeping all columns in one row.
    get boardStyle(): { [key: string]: string } {
        if (!this._expanded) return {};
        const ids: string[] = [];
        if (this.showUnassigned) ids.push('unassigned');
        ids.push('new', 'inprogress', 'paused', 'done');
        const cols = ids.map(id => id === this._expanded ? '2.5fr' : '1fr');
        return { 'grid-template-columns': cols.join(' ') };
    }

    // ── Subtask expand ────────────────────────────────────────────
    toggleSubtasks(todo: ITodo, event: MouseEvent): void {
        event.stopPropagation();
        if (this._expandedStories.has(todo.id)) {
            this._expandedStories.delete(todo.id);
            return;
        }
        this._expandedStories.add(todo.id);

        // If we already have them in our local map, we're done.
        if (this._loadedSubtasks.has(todo.id)) {
            return;
        }

        // Optimized: Check if they are already in the todo object (provided by loadTodos with include_subtasks)
        if (todo.subtasks && todo.subtasks.length > 0) {
            const enriched = enrichTodoTypes(todo.subtasks, [todo, ...todo.subtasks]);
            this._loadedSubtasks.set(todo.id, enriched);
            return;
        }

        // Fallback: Fetch only if missing (e.g. for newly created items or items loaded without subtasks)
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;
        this._loadingSubtasks.add(todo.id);
        this._todoService.getSubtasks(userId, todo.id).subscribe({
            next: (res) => {
                const enriched = enrichTodoTypes(res.todos as ITodo[], [todo, ...(res.todos as ITodo[])]);
                this._loadedSubtasks.set(todo.id, enriched);
                this._loadingSubtasks.delete(todo.id);
            },
            error: () => this._loadingSubtasks.delete(todo.id)
        });
    }

    isSubtasksExpanded(id: number): boolean { return this._expandedStories.has(id); }
    isLoadingSubtasks(id: number): boolean   { return this._loadingSubtasks.has(id); }
    getSubtasks(id: number): ITodo[]         { return this._loadedSubtasks.get(id) || []; }

    getChipLabel(todo: ITodo): string {
        const subtasks = this._loadedSubtasks.get(todo.id);
        return getTodoTypeLabel(getTodoType(todo, subtasks));
    }

    getChipIcon(todo: ITodo): string {
        const subtasks = this._loadedSubtasks.get(todo.id);
        return getTodoTypeIcon(getTodoType(todo, subtasks));
    }

    getChipClass(todo: ITodo): string {
        const subtasks = this._loadedSubtasks.get(todo.id);
        return 'tc-item__story-chip--' + getTodoType(todo, subtasks);
    }

    // ── Helpers ───────────────────────────────────────────────────
    getPriorityClass(priority: string): string {
        return `priority-${priority?.toLowerCase() || 'medium'}`;
    }

    formatDate(dateString?: string): string {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    getDueDateClass(dateString?: string): string {
        if (!dateString) return '';
        const diff = Math.ceil(
            (new Date(dateString).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000
        );
        if (diff <= 3)  return 'urgency-high';
        if (diff <= 10) return 'urgency-medium';
        return 'urgency-low';
    }

    truncate(text: string | undefined | null, max = 120): string {
        if (!text) return '';
        return text.length > max ? text.slice(0, max) + '…' : text;
    }

    getTodoTypeLabel(todo: ITodo): string {
        return getTodoTypeLabel(getTodoType(todo));
    }

    getTodoTypeIcon(todo: ITodo): string {
        return getTodoTypeIcon(getTodoType(todo));
    }

    getTodoTypeClass(todo: ITodo): string {
        return 'tc-item__type-chip--' + getTodoType(todo);
    }

    getTodoType(todo: ITodo): string {
        return getTodoType(todo);
    }

    getSubtaskToggleLabel(todo: ITodo): string {
        const type = getTodoType(todo);
        const count = todo.subtask_count || 0;
        const baseLabel = type === 'project' ? 'story' : 'task';
        
        if (count === 1) return `1 ${baseLabel}`;
        
        // Pluralize
        const plural = baseLabel === 'story' ? 'stories' : 'tasks';
        return `${count} ${plural}`;
    }
}
