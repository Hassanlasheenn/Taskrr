import { CommonModule } from "@angular/common";
import { ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output, SimpleChanges, OnDestroy } from "@angular/core";
import { AuthService } from "../../../auth/services";
import { ITodo } from "../../../core/interfaces/todo.interface";
import { trackById } from "../../../shared/helpers/trackByFn.helper";
import { getTodoType, getTodoTypeLabel, getTodoTypeIcon } from "../../../shared/helpers/todo-type.helper";
import { TodoStatus as FilterStatus } from "../dashboard/components/status-filter/status-filter.component";
import { DynamicFormComponent } from "../../../shared/components/dynamic-form/dynamic-form.component";
import { FormGroup } from "@angular/forms";
import { IFieldControl } from "../../../shared/interfaces";
import { InputTypes } from "../../../shared/enums";
import { ReactiveFormService } from "../../../shared/services/reactive-form.service";
import { Subject, takeUntil } from "rxjs";

@Component({
    selector: 'app-todo-list',
    templateUrl: './todo-list.component.html',
    styleUrls: ['./todo-list.component.scss'],
    standalone: true,
    imports: [CommonModule, DynamicFormComponent],
})
export class TodoListComponent implements OnInit, OnChanges, OnDestroy {
    @Input() todos: ITodo[] = [];
    @Input() totalCount: number = 0;
    @Input() showAddButton: boolean = true;
    @Input() showIndex: boolean = true;
    @Input() sectionTitle: string = 'Your Todos';
    @Input() groupByCategory: boolean = false;
    @Input() showUsername: boolean = false;
    @Input() username: string | null = null;
    @Input() showStatusFilter: boolean = false;
    @Input() activeStatus: FilterStatus = 'all';
    @Input() activePriority: string = 'all';
    @Input() isCompletedSection: boolean = false;
    @Output() addTodo = new EventEmitter<void>();
    @Output() toggleTodo = new EventEmitter<ITodo>();
    @Output() deleteTodo = new EventEmitter<ITodo>();
    @Output() editTodo = new EventEmitter<ITodo>();
    @Output() viewTodo = new EventEmitter<ITodo>();
    @Output() statusChange = new EventEmitter<FilterStatus>();
    @Output() priorityChange = new EventEmitter<string>();
    @Output() addSubtask = new EventEmitter<ITodo>();

    private readonly _destroy$ = new Subject<void>();
    filterForm: FormGroup = new FormGroup({});
    filterFields: IFieldControl[] = [
        {
            label: 'Status',
            type: InputTypes.DROPDOWN,
            formControlName: 'status',
            placeholder: 'All Statuses',
            value: 'all',
            options: [
                { key: 'all', value: 'All Statuses' },
                { key: 'new', value: 'New' },
                { key: 'inProgress', value: 'In Progress' },
                { key: 'paused', value: 'Paused' },
                { key: 'done', value: 'Done' }
            ],
            validations: []
        },
        {
            label: 'Priority',
            type: InputTypes.DROPDOWN,
            formControlName: 'priority',
            placeholder: 'All Priorities',
            value: 'all',
            options: [
                { key: 'all', value: 'All Priorities' },
                { key: 'low', value: 'Low' },
                { key: 'medium', value: 'Medium' },
                { key: 'high', value: 'High' }
            ],
            validations: []
        }
    ];

    expandedCategories: { [key: string]: boolean } = {};
    viewMode: 'grid' | 'list' = 'grid';
    openActionsTodoId: number | null = null;

    @HostListener('document:click')
    onDocumentClick(): void {
        this.openActionsTodoId = null;
    }

    constructor(
        private readonly _authService: AuthService,
        private readonly _cdr: ChangeDetectorRef,
        private readonly _formService: ReactiveFormService
    ) {}

    get isAdmin(): boolean {
        return this._authService.isAdmin();
    }

    get groupedTodos(): { category: string | null; todos: ITodo[] }[] {
        if (!this.groupByCategory) {
            return this.todos.length > 0 ? [{ category: null, todos: this.todos }] : [];
        }

        const grouped = new Map<string | null, ITodo[]>();
        
        this.todos.forEach(todo => {
            const category = todo.category || null;
            if (!grouped.has(category)) {
                grouped.set(category, []);
            }
            grouped.get(category)!.push(todo);
        });

        const sorted = Array.from(grouped.entries())
            .filter(([_, todos]) => todos.length > 0) // Only include categories with todos
            .sort((a, b) => {
                if (a[0] === null) return -1;
                if (b[0] === null) return 1;
                return (a[0] || '').localeCompare(b[0] || '');
            });

        return sorted.map(([category, todos]) => ({ category, todos }));
    }

    onAddTodo(): void {
        this.addTodo.emit();
    }

    onToggleTodo(todo: ITodo): void {
        this.toggleTodo.emit(todo);
    }

    onEditTodo(todo: ITodo): void {
        this.editTodo.emit(todo);
    }

    onViewTodo(todo: ITodo): void {
        this.viewTodo.emit(todo);
    }

    onDeleteTodo(todo: ITodo): void {
        this.deleteTodo.emit(todo);
    }

    onAddSubtask(todo: ITodo): void {
        this.addSubtask.emit(todo);
    }

    toggleActionsMenu(todoId: number): void {
        this.openActionsTodoId = this.openActionsTodoId === todoId ? null : todoId;
        this._cdr.markForCheck();
    }

    closeActionsMenu(): void {
        this.openActionsTodoId = null;
        this._cdr.markForCheck();
    }

    onActionsWrapperKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.closeActionsMenu();
        }
    }

    onClearFilters(): void {
        this.filterForm.patchValue({ status: 'all', priority: 'all' }, { emitEvent: true });
    }

    trackById = trackById;

    getPriorityClass(priority: string): string {
        return `priority-${priority}`;
    }

    getPriorityIcon(priority: string): string {
        switch (priority) {
            case 'high': return 'bi-arrow-up';
            case 'low': return 'bi-arrow-down';
            default: return 'bi-dash';
        }
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

    getStatusClass(status: string): string {
        return `status-${status}`;
    }

    isOverdue(dateString?: string): boolean {
        if (!dateString) return false;
        const dueDate = new Date(dateString);
        dueDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return dueDate <= today;
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

    formatDate(dateString?: string): { date: string; day: string; time: string } | null {
        if (!dateString) return null;
        
        let date: Date;
        if (dateString.endsWith('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
            date = new Date(dateString);
        } else {
            date = new Date(dateString.replace('T', ' '));
        }
        
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        
        const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const weekDay = weekDays[date.getDay()];
        
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const formattedTime = `${hours}:${minutes} ${ampm}`;
        
        return {
            date: formattedDate,
            day: weekDay,
            time: formattedTime
        };
    }

    toggleCategory(category: string | null): void {
        const categoryKey = category ?? 'null';
        // Toggle the expanded state (default to true if undefined)
        const currentState = this.expandedCategories[categoryKey] ?? true;
        // Create a new object reference to trigger change detection in Chrome
        this.expandedCategories = { 
            ...this.expandedCategories,
            [categoryKey]: !currentState
        };
        this._cdr.markForCheck();
    }

    isCategoryExpanded(category: string | null): boolean {
        const categoryKey = category ?? 'null';
        return this.expandedCategories[categoryKey] === true;
    }

    toggleViewMode(): void {
        this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
    }

    ngOnInit(): void {
        this.initializeExpandedCategories();
        this.filterForm = this._formService.initializeForm(this.filterFields);
        
        this.filterForm.patchValue({
            status: this.activeStatus,
            priority: this.activePriority
        }, { emitEvent: false });

        this.filterForm.valueChanges
            .pipe(takeUntil(this._destroy$))
            .subscribe(values => {
                this.statusChange.emit(values.status);
                this.priorityChange.emit(values.priority);
            });
    }

    private initializeExpandedCategories(): void {
        if (this.groupByCategory && this.todos.length > 0) {
            const newExpandedCategories: { [key: string]: boolean } = {};
            
            // Add new categories (default to expanded) and preserve existing ones
            this.groupedTodos.forEach(group => {
                const categoryKey = group.category ?? 'null';
                // Preserve existing state if it exists, otherwise default to expanded (true)
                newExpandedCategories[categoryKey] = this.expandedCategories[categoryKey] ?? true;
            });
            
            this.expandedCategories = newExpandedCategories;
        } else {
            // Clear expanded categories if not grouping by category
            this.expandedCategories = {};
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.filterForm) {
            if (changes['activeStatus'] && !changes['activeStatus'].firstChange) {
                this.filterForm.get('status')?.setValue(this.activeStatus, { emitEvent: false });
            }
            if (changes['activePriority'] && !changes['activePriority'].firstChange) {
                this.filterForm.get('priority')?.setValue(this.activePriority, { emitEvent: false });
            }
        }
        if (changes['isCompletedSection']) {
            this.viewMode = this.isCompletedSection ? 'list' : 'grid';
        }
        if (this.groupByCategory && this.todos.length > 0) {
            // Only add new categories, don't reset existing expanded state
            const newExpandedCategories = { ...this.expandedCategories };
            
            this.groupedTodos.forEach(group => {
                const categoryKey = group.category ?? 'null';
                // Only add if it doesn't exist (preserve user's expanded/collapsed state)
                newExpandedCategories[categoryKey] ??= true; // Default to expanded
            });
            
            // Remove categories that no longer exist
            const currentCategoryKeys = new Set(this.groupedTodos.map(group => (group.category ?? 'null')));
            Object.keys(newExpandedCategories).forEach(key => {
                if (!currentCategoryKeys.has(key)) {
                    delete newExpandedCategories[key];
                }
            });
            
            this.expandedCategories = newExpandedCategories;
        } else if (!this.groupByCategory) {
            this.expandedCategories = {};
        }
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }

    getChipLabel(todo: any): string  { return getTodoTypeLabel(getTodoType(todo)); }
    getChipIcon(todo: any): string   { return getTodoTypeIcon(getTodoType(todo)); }
    getChipClass(todo: any): string  { return 'story-type-chip--' + getTodoType(todo); }
}
