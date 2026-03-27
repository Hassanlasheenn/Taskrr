import { CommonModule } from "@angular/common";
import { AfterViewChecked, Component, ElementRef, EventEmitter, Input, Output, QueryList, TrackByFunction, ViewChildren } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { ITodo, ITodoUpdate } from "../../../core/interfaces/todo.interface";
import { IUserListResponse } from "../../../auth/interfaces";
import { trackById } from "../../helpers/trackByFn.helper";
import { LayoutPaths } from "../../../layouts/enums/layout-paths.enum";
import { DropdownFormComponent } from "../form-fields/dropdown/dropdown.component";
import { DatePickerComponent } from "../form-fields/date-picker/date-picker.component";
import { IFieldControl } from "../../interfaces";
import { InputTypes } from "../../enums";

@Component({
    selector: 'app-shared-table',
    templateUrl: './shared-table.component.html',
    styleUrls: ['./shared-table.component.scss'],
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule, DropdownFormComponent, DatePickerComponent]
})
export class SharedTableComponent implements AfterViewChecked {
    @ViewChildren('titleInput') titleInputs!: QueryList<ElementRef<HTMLInputElement>>;
    @ViewChildren('customCatInput') customCatInputs!: QueryList<ElementRef<HTMLInputElement>>;
    private shouldFocusTitleInput = false;
    private shouldFocusCustomCatInput = false;

    @Input() emptyMessage: string = 'No data found.';

    // --- Todo mode inputs ---
    @Input() todos: ITodo[] = [];
    @Input() isAdmin: boolean = false;

    @Output() update = new EventEmitter<{ id: number; data: ITodoUpdate }>();
    @Output() delete = new EventEmitter<ITodo>();

    // --- Users mode inputs ---
    @Input() users: IUserListResponse[] = [];
    @Input() currentUserId: number | null = null;

    @Output() roleChange = new EventEmitter<{ userId: number; role: 'user' | 'admin' }>();
    @Output() deleteUser = new EventEmitter<number>();

    readonly LayoutPaths = LayoutPaths;
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
