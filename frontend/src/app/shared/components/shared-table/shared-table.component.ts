import { CommonModule } from "@angular/common";
import { AfterViewChecked, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, TrackByFunction, ViewChildren } from "@angular/core";
import { FormsModule, FormGroup, FormControl } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from "rxjs";
import { ITodo, ITodoFilter, ITodoUpdate } from "../../../core/interfaces/todo.interface";
import { IUserListResponse } from "../../../auth/interfaces";
import { trackById } from "../../helpers/trackByFn.helper";
import { LayoutPaths } from "../../../layouts/enums/layout-paths.enum";
import { DropdownFormComponent } from "../form-fields/dropdown/dropdown.component";
import { DatePickerComponent } from "../form-fields/date-picker/date-picker.component";
import { InputFormComponent } from "../form-fields/input/input.component";
import { IFieldControl } from "../../interfaces";
import { InputTypes } from "../../enums";
import { PaginationComponent } from "../pagination/pagination.component";

@Component({
    selector: 'app-shared-table',
    templateUrl: './shared-table.component.html',
    styleUrls: ['./shared-table.component.scss'],
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule, DropdownFormComponent, DatePickerComponent, InputFormComponent, PaginationComponent]
})
export class SharedTableComponent implements AfterViewChecked, OnInit, OnDestroy {
    @ViewChildren('titleInput') titleInputs!: QueryList<ElementRef<HTMLInputElement>>;
    @ViewChildren('customCatInput') customCatInputs!: QueryList<ElementRef<HTMLInputElement>>;
    private shouldFocusTitleInput = false;
    private shouldFocusCustomCatInput = false;
    private readonly _filterDestroy$ = new Subject<void>();

    @Input() emptyMessage: string = 'No data found.';

    // --- Todo mode inputs ---
    @Input() todos: ITodo[] = [];
    @Input() isAdmin: boolean = false;

    @Output() update = new EventEmitter<{ id: number; data: ITodoUpdate }>();
    @Output() delete = new EventEmitter<ITodo>();
    @Output() filterChange = new EventEmitter<ITodoFilter>();

    // --- Users mode inputs ---
    @Input() users: IUserListResponse[] = [];
    @Input() currentUserId: number | null = null;

    @Output() roleChange = new EventEmitter<{ userId: number; role: 'user' | 'admin' }>();
    @Output() deleteUser = new EventEmitter<number>();

    // --- Pagination inputs/outputs ---
    @Input() totalItems: number = 0;
    @Input() currentPage: number = 1;
    @Input() pageSize: number = 5;

    @Output() pageChange = new EventEmitter<number>();
    @Output() pageSizeChange = new EventEmitter<number>();
    @Output() sortChange = new EventEmitter<'asc' | 'desc'>();

    sortOrder: 'asc' | 'desc' = 'desc';
    hasActiveFilters = false;

    private static _getDateStr(daysOffset: number = 0): string {
        const d = new Date();
        d.setDate(d.getDate() + daysOffset);
        return d.toISOString().split('T')[0];
    }

    private readonly _todayStr = SharedTableComponent._getDateStr(0);
    private readonly _defaultFromStr = SharedTableComponent._getDateStr(-5);

    // --- Filter form ---
    filterForm = new FormGroup({
        title: new FormControl<string>(''),
        priority: new FormControl<string | null>(null),
        status: new FormControl<string | null>(null),
        created_from: new FormControl<string | null>(this._defaultFromStr),
        created_to: new FormControl<string | null>(this._todayStr),
    });

    filterFields: IFieldControl[] = [
        {
            label: 'Title',
            type: InputTypes.TEXT,
            formControlName: 'title',
            placeholder: 'Search by title...',
            value: '',
            validations: []
        },
        {
            label: 'Priority',
            type: InputTypes.DROPDOWN,
            formControlName: 'priority',
            placeholder: 'All priorities',
            value: null,
            options: [
                { key: null, value: 'All' },
                { key: 'low', value: 'Low' },
                { key: 'medium', value: 'Medium' },
                { key: 'high', value: 'High' }
            ],
            validations: []
        },
        {
            label: 'Status',
            type: InputTypes.DROPDOWN,
            formControlName: 'status',
            placeholder: 'All statuses',
            value: null,
            options: [
                { key: null, value: 'All' },
                { key: 'new', value: 'New' },
                { key: 'inProgress', value: 'In Progress' },
                { key: 'paused', value: 'Paused' },
                { key: 'done', value: 'Done' }
            ],
            validations: []
        },
        {
            label: 'Created from',
            type: InputTypes.DATE,
            formControlName: 'created_from',
            placeholder: 'From date',
            value: null,
            validations: [],
            minDate: '2000-01-01',
            maxDate: this._todayStr
        },
        {
            label: 'Created to',
            type: InputTypes.DATE,
            formControlName: 'created_to',
            placeholder: 'To date',
            value: null,
            validations: [],
            minDate: '2000-01-01',
            maxDate: this._todayStr
        }
    ];

    get showPagination(): boolean {
        return this.totalItems > 0;
    }

    get pageSizeOptions(): number[] {
        const count = Math.max(1, Math.ceil(this.totalItems / 5));
        // Avoid too many options if totalItems is huge, but follow user's "and so on" logic
        // Let's cap it at a reasonable number like 10 options (up to 50) if we want, 
        // but the prompt says "and so on", so I'll follow it.
        return Array.from({ length: count }, (_, i) => (i + 1) * 5);
    }

    readonly LayoutPaths = LayoutPaths;
    readonly InputTypes = InputTypes;
    trackById: TrackByFunction<any> = trackById;

    get isUsersMode(): boolean {
        return this.users.length > 0;
    }

    get displayData(): any[] {
        return this.isUsersMode ? this.users : this.todos;
    }

    isCurrentUser(userId: number): boolean {
        return userId === this.currentUserId;
    }

    ngOnInit(): void {
        const initial = this.filterForm.getRawValue();
        this.hasActiveFilters = this._checkHasActiveFilters(initial);

        // Title: wait for user to stop typing
        this.filterForm.get('title')!.valueChanges.pipe(
            debounceTime(400),
            distinctUntilChanged(),
            takeUntil(this._filterDestroy$)
        ).subscribe(() => this._emitCurrentFilter());

        // Dropdowns + date pickers: react immediately
        (['priority', 'status', 'created_from', 'created_to'] as const).forEach(field => {
            this.filterForm.get(field)!.valueChanges.pipe(
                distinctUntilChanged(),
                takeUntil(this._filterDestroy$)
            ).subscribe(() => this._emitCurrentFilter());
        });

        // Always emit initial filter — default dates applied even without showing Clear button
        this.filterChange.emit(this._buildFilter(initial));
    }

    private _emitCurrentFilter(): void {
        const value = this.filterForm.getRawValue();
        this.hasActiveFilters = this._checkHasActiveFilters(value);
        this.filterChange.emit(this._buildFilter(value));
    }

    private _buildFilter(value: any): ITodoFilter {
        const filter: ITodoFilter = {};
        if (value.title?.trim()) filter.title = value.title.trim();
        if (value.priority) filter.priority = value.priority;
        if (value.status) filter.status = value.status;
        if (value.created_from) filter.created_from = value.created_from;
        if (value.created_to) filter.created_to = value.created_to;
        return filter;
    }

    ngOnDestroy(): void {
        this._filterDestroy$.next();
        this._filterDestroy$.complete();
    }

    // Clear restores the default date range, hiding the Clear button again
    clearFilters(): void {
        this.filterForm.setValue({
            title: '',
            priority: null,
            status: null,
            created_from: this._defaultFromStr,
            created_to: this._todayStr
        });
    }

    // Active = deviated from default state (not just "any value is truthy")
    private _checkHasActiveFilters(value: any): boolean {
        const datesAreDefault =
            value.created_from === this._defaultFromStr &&
            value.created_to === this._todayStr;
        return !!(value.title?.trim() || value.priority || value.status || !datesAreDefault);
    }

    // --- Todo mode helpers ---
    readonly statusOptions = [
        { key: 'new', value: 'New' },
        { key: 'inProgress', value: 'In Progress' },
        { key: 'paused', value: 'Paused' },
        { key: 'done', value: 'Done' }
    ];

    readonly priorityOptions = [
        { key: 'low', value: 'Low' },
        { key: 'medium', value: 'Medium' },
        { key: 'high', value: 'High' }
    ];

    readonly categoryOptions = [
        { key: '', value: 'No Category' },
        { key: 'Work', value: 'Work' },
        { key: 'Personal', value: 'Personal' },
        { key: 'Shopping', value: 'Shopping' },
        { key: 'Health', value: 'Health' },
        { key: 'Learning', value: 'Learning' },
        { key: 'Other', value: 'Other' }
    ];

    getStatusField(todo: ITodo): IFieldControl {
        return {
            label: 'Status',
            type: InputTypes.DROPDOWN,
            formControlName: 'status',
            value: todo.status,
            options: this.statusOptions,
            validations: []
        };
    }

    getPriorityField(todo: ITodo): IFieldControl {
        return {
            label: 'Priority',
            type: InputTypes.DROPDOWN,
            formControlName: 'priority',
            value: todo.priority,
            options: this.priorityOptions,
            validations: []
        };
    }

    getCategoryField(todo: ITodo): IFieldControl {
        const categoryValue = todo.category || '';

        return {
            label: 'Category',
            type: InputTypes.DROPDOWN,
            formControlName: 'category',
            value: categoryValue,
            options: this.categoryOptions,
            validations: []
        };
    }

    isCustomCategory(todo: ITodo): boolean {
        const categoryValue = todo.category || '';
        if (!categoryValue) return false;
        return !this.categoryOptions.some(opt => opt.key === categoryValue && opt.key !== 'Other');
    }

    getDateField(todo: ITodo): IFieldControl {
        return {
            label: 'Due Date',
            type: InputTypes.DATE,
            formControlName: 'due_date',
            value: todo.due_date || null,
            validations: []
        };
    }

    getStatusClass(status: string): string {
        return `status-${status}`;
    }

    getPriorityClass(priority: string): string {
        return `priority-${priority?.toLowerCase() || 'medium'}`;
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

    getDueDateValue(dateString?: string): string {
        if (!dateString) return '';
        return dateString.split('T')[0];
    }

    formatCreatedAt(dateString?: string): string {
        if (!dateString) return '—';
        return new Date(dateString).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    toggleSort(): void {
        this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
        this.sortChange.emit(this.sortOrder);
    }

    // --- Title inline edit ---
    editingTitleId: number | null = null;
    editingTitleValue: string = '';

    ngAfterViewChecked(): void {
        if (this.shouldFocusTitleInput && this.titleInputs?.length) {
            const input = this.titleInputs.first?.nativeElement;
            if (input) {
                input.focus();
                input.select();
                this.shouldFocusTitleInput = false;
            }
        }
        if (this.shouldFocusCustomCatInput && this.customCatInputs?.length) {
            const input = this.customCatInputs.first?.nativeElement;
            if (input) {
                input.focus();
                this.shouldFocusCustomCatInput = false;
            }
        }
    }

    startEditTitle(todo: ITodo): void {
        if (todo.is_deleted) return;
        this.editingTitleId = todo.id;
        this.editingTitleValue = todo.title;
        this.shouldFocusTitleInput = true;
    }

    saveTitleEdit(todo: ITodo): void {
        const trimmed = this.editingTitleValue.trim();
        if (trimmed && trimmed !== todo.title) {
            this.onFieldChange(todo, 'title', trimmed);
        }
        this.editingTitleId = null;
    }

    cancelTitleEdit(): void {
        this.editingTitleId = null;
    }

    onTitleKeydown(event: KeyboardEvent, todo: ITodo): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.saveTitleEdit(todo);
        } else if (event.key === 'Escape') {
            this.cancelTitleEdit();
        }
    }

    // --- Custom category inline edit ---
    customCategoryTodoId: number | null = null;
    customCategoryValue: string = '';

    onCategoryChange(todo: ITodo, value: string): void {
        if (value === 'Other') {
            this.customCategoryTodoId = todo.id;
            this.customCategoryValue = '';
            this.shouldFocusCustomCatInput = true;
        } else {
            this.customCategoryTodoId = null;
            this.onFieldChange(todo, 'category', value || undefined);
        }
    }

    saveCustomCategory(todo: ITodo): void {
        const trimmed = this.customCategoryValue.trim();
        if (trimmed) {
            this.onFieldChange(todo, 'category', trimmed);
        }
        this.customCategoryTodoId = null;
        this.customCategoryValue = '';
    }

    cancelCustomCategory(): void {
        this.customCategoryTodoId = null;
        this.customCategoryValue = '';
    }

    onCustomCategoryKeydown(event: KeyboardEvent, todo: ITodo): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            this.saveCustomCategory(todo);
        } else if (event.key === 'Escape') {
            this.cancelCustomCategory();
        }
    }

    onFieldChange(todo: ITodo, field: keyof ITodoUpdate, value: any): void {
        const data: ITodoUpdate = {};

        if (field === 'due_date') {
            data.due_date = value || null;
        } else {
            (data as any)[field] = value;
        }

        this.update.emit({ id: todo.id, data });
    }

    onDelete(todo: ITodo): void {
        this.delete.emit(todo);
    }

    // --- Users mode helpers ---
    readonly roleOptions = [
        { key: 'user', value: 'User' },
        { key: 'admin', value: 'Admin' }
    ];

    getRoleField(user: IUserListResponse): IFieldControl {
        return {
            label: 'Role',
            type: InputTypes.DROPDOWN,
            formControlName: 'role',
            value: user.role,
            options: this.roleOptions,
            validations: []
        };
    }

    onRoleChange(userId: number, role: 'user' | 'admin'): void {
        this.roleChange.emit({ userId, role });
    }

    onDeleteUser(userId: number): void {
        this.deleteUser.emit(userId);
    }
}
