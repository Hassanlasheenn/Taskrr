import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DragDropModule, CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ITodo } from '../../../core/interfaces/todo.interface';
import { trackById } from '../../helpers/trackByFn.helper';
import { ProgressBarComponent } from '../progress-bar/progress-bar.component';

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

    @Output() edit   = new EventEmitter<ITodo>();
    @Output() delete = new EventEmitter<ITodo>();
    @Output() statusChange = new EventEmitter<ITodoStatusChange>();
    /** Emitted when a todo is dropped onto the unassigned column — parent should clear assigned_to_user_id */
    @Output() unassign = new EventEmitter<ITodo>();

    readonly trackById = trackById;

    // ── Internal mutable arrays — CDK drag-drop operates on these ──
    _unassigned:  ITodo[] = [];
    _new:         ITodo[] = [];
    _inProgress:  ITodo[] = [];
    _paused:      ITodo[] = [];
    _done:        ITodo[] = [];

    // ── Collapse state ────────────────────────────────────────────
    _collapsed: Record<string, boolean> = {};

    // ── Expand state (big screens only) ──────────────────────────
    _expanded: string | null = null;

    // Signature caches — prevent CDK arrays being re-built while a
    // drag is in flight (filteredTodos getter in the parent creates a
    // new reference every CD cycle).
    private _todosSignature      = '';
    private _unassignedSignature = '';

    // ─────────────────────────────────────────────────────────────
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['todos'] || changes['showUnassigned']) {
            const sig = this.todos.map(t => `${t.id}:${t.status}`).join(',');
            if (sig !== this._todosSignature || changes['showUnassigned']) {
                this._todosSignature = sig;
                // Distribute todos into status columns.
                this._new        = this.todos.filter(t => t.status === 'new');
                this._inProgress = this.todos.filter(t => t.status === 'inProgress');
                this._paused     = this.todos.filter(t => t.status === 'paused');
                this._done       = this.todos.filter(t => t.status === 'done');
            }
        }
        if (changes['unassignedTodos']) {
            const sig = this.unassignedTodos.map(t => t.id).join(',');
            if (sig !== this._unassignedSignature) {
                this._unassignedSignature = sig;
                this._unassigned = [...this.unassignedTodos];
            }
        }
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
            // Bump the signature so the next ngOnChanges call from the parent's
            // in-flight todos getter does NOT undo the visual move.
            this._todosSignature = this.todos.map(t => `${t.id}:${t.status}`).join(',')
                + `:moved:${todo.id}→${targetStatus}`;
            this.statusChange.emit({ todo, newStatus: targetStatus });
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
}
