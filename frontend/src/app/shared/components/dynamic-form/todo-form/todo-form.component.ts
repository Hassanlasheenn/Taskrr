import { Component, Output, EventEmitter, OnInit, Input, OnDestroy, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule, FormGroup } from "@angular/forms";
import { DynamicFormComponent } from "../dynamic-form.component";
import { ReactiveFormService } from "../../../services/reactive-form.service";
import { IFieldControl } from "../../../interfaces/IFieldControl.interface";
import { InputTypes } from "../../../enums/input-types.enum";
import { ValidatorTypes } from "../../../enums/validator-types.enum";
import { ITodo, ITodoCreate, ITodoUpdate, TodoStatus } from "../../../../core/interfaces/todo.interface";
import { UserService } from "../../../../core/services/user.service";
import { IUserListResponse } from "../../../../auth/interfaces";
import { Subject, takeUntil } from "rxjs";
import { AuthService } from "../../../../auth/services/auth.service";
import { trackById } from "../../../helpers/trackByFn.helper";

import { ClickThrottleDirective } from "../../../directives/click-throttle.directive";

@Component({
    selector: 'app-todo-form',
    templateUrl: './todo-form.component.html',
    styleUrls: ['./todo-form.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule, DynamicFormComponent, ClickThrottleDirective],
})
export class TodoFormComponent implements OnInit, OnDestroy {
    @Input() editingTodo: ITodo | null = null;
    @Output() submitTodo = new EventEmitter<ITodoCreate>();
    @Output() updateTodo = new EventEmitter<{ id: number; data: ITodoUpdate }>();
    @Output() cancel = new EventEmitter<void>();

    private readonly _destroy$ = new Subject<void>();
    form: FormGroup = new FormGroup({});
    isSubmitted: boolean = false;
    errorSummary: string | null = null;
    isEditMode: boolean = false;
    users: IUserListResponse[] = [];
    isAdmin: boolean = false;
    trackById = trackById;

    availableCategories: string[] = ['Work', 'Personal', 'Shopping', 'Health', 'Learning', 'Other'];

    fields: IFieldControl[] = [
        {
            label: 'Title',
            type: InputTypes.TEXT,
            formControlName: 'title',
            placeholder: 'Enter todo title',
            value: '',
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Title is required' },
                { type: ValidatorTypes.MINLENGTH, message: 'Title must be at least 3 characters', value: 3 }
            ],
        },
        {
            label: 'Description',
            type: InputTypes.TEXTAREA,
            formControlName: 'description',
            placeholder: 'Enter description',
            value: '',
            required: false,
            validations: [],
            showImagePreviews: true,
            imagePreviewMode: 'carousel',
            showAttachHint: true
        },
        {
            label: 'Time Estimate',
            type: InputTypes.TIME_ESTIMATE,
            formControlName: 'time_estimate',
            placeholder: 'e.g., 1w 2d 3h 30m',
            value: '',
            required: false,
            validations: []
        },
        {
            label: 'Category',
            type: InputTypes.DROPDOWN,
            formControlName: 'category',
            placeholder: 'Select category',
            value: '',
            required: false,
            options: this.availableCategories.map(cat => ({ key: cat, value: cat })),
            validations: [],
        },
        {
            label: 'Priority',
            type: InputTypes.DROPDOWN,
            formControlName: 'priority',
            placeholder: 'Select priority',
            value: 'medium',
            required: true,
            options: [
                { key: 'low', value: 'Low' },
                { key: 'medium', value: 'Medium' },
                { key: 'high', value: 'High' }
            ],
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Priority is required' }
            ],
        },
        {
            label: 'Due Date',
            type: InputTypes.DATE,
            formControlName: 'due_date',
            placeholder: 'Select due date',
            value: '',
            required: false,
            validations: [],
        },
        {
            label: 'Assign To',
            type: InputTypes.DROPDOWN,
            formControlName: 'assigned_to_user_id',
            placeholder: 'Select user',
            value: null,
            required: true,
            validations: [
                { type: ValidatorTypes.REQUIRED, message: 'Assignee is required' }
            ],
            options: [],
        },
    ];

    constructor(
        private readonly _formService: ReactiveFormService,
        private readonly _userService: UserService,
        private readonly _authService: AuthService
    ) {}

    ngOnInit(): void {
        this.isAdmin = this._authService.isAdmin();
        this._updateFieldsForMode();
        this.form = this._formService.initializeForm(this.fields);
        this.loadUsers();
        this._watchCategoryChanges();
    }

    private _watchCategoryChanges(): void {
        this.form.get('category')?.valueChanges
            .pipe(takeUntil(this._destroy$))
            .subscribe(value => {
                this.toggleCustomCategoryField(value === 'Other');
            });
    }

    private toggleCustomCategoryField(show: boolean): void {
        const customCategoryIndex = this.fields.findIndex(f => f.formControlName === 'custom_category');
        
        if (show && customCategoryIndex === -1) {
            // Find category field index to insert below it
            const categoryIndex = this.fields.findIndex(f => f.formControlName === 'category');
            const insertIndex = categoryIndex !== -1 ? categoryIndex + 1 : 3;
            
            const customField: IFieldControl = {
                label: 'Custom Category',
                type: InputTypes.TEXT,
                formControlName: 'custom_category',
                placeholder: 'Enter your custom category...',
                value: '',
                required: true,
                validations: [
                    { type: ValidatorTypes.REQUIRED, message: 'Custom category is required' }
                ],
            };
            
            this.fields.splice(insertIndex, 0, customField);
            this.form.addControl('custom_category', this._formService.createControl(customField));
        } else if (!show && customCategoryIndex !== -1) {
            this.fields.splice(customCategoryIndex, 1);
            this.form.removeControl('custom_category');
        }
    }

    private _updateFieldsForMode(): void {
        // Find fields to update based on admin status and edit mode
        const userFieldIndex = this.fields.findIndex(f => f.formControlName === 'assigned_to_user_id');
        if (userFieldIndex !== -1) {
            if (this.isAdmin) {
                this.fields[userFieldIndex].required = false;
                this.fields[userFieldIndex].validations = [];
            } else {
                this.fields[userFieldIndex].required = true;
                this.fields[userFieldIndex].validations = [
                    { type: ValidatorTypes.REQUIRED, message: 'Assignee is required' }
                ];
            }
        }

        // Add status field if in edit mode
        const statusFieldIndex = this.fields.findIndex(f => f.formControlName === 'status');
        if (this.isEditMode && statusFieldIndex === -1) {
            this.fields.push({
                label: 'Status',
                type: InputTypes.DROPDOWN,
                formControlName: 'status',
                placeholder: 'Select status',
                value: 'new',
                required: true,
                options: [
                    { value: 'New', key: 'new' },
                    { value: 'In Progress', key: 'inProgress' },
                    { value: 'Paused', key: 'paused' },
                    { value: 'Done', key: 'done' }
                ],
                validations: [
                    { type: ValidatorTypes.REQUIRED, message: 'Status is required' }
                ],
            });
        } else if (!this.isEditMode && statusFieldIndex !== -1) {
            this.fields.splice(statusFieldIndex, 1);
        }

        // Non-admins cannot change priority in edit mode
        const priorityFieldIndex = this.fields.findIndex(f => f.formControlName === 'priority');
        if (priorityFieldIndex !== -1) {
            this.fields[priorityFieldIndex].disabled = this.isEditMode && !this.isAdmin;
        }
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }

    loadUsers(): void {
        if (!this.isAdmin) {
            this.updateUserDropdownField();
            if (this.isEditMode && this.editingTodo) {
                this.populateFormData(this.editingTodo);
            }
            return;
        }

        this._userService.getMentionableUsers()
            .pipe(takeUntil(this._destroy$))
            .subscribe({
                next: (users) => {
                    this.users = users;
                    this.updateUserDropdownField();

                    if (!this.form.get('assigned_to_user_id')) {
                        this.form = this._formService.initializeForm(this.fields);
                    }

                    if (this.isEditMode && this.editingTodo) {
                        this.populateFormData(this.editingTodo);
                    }
                },
                error: (error) => {
                    console.error('Failed to load users:', error);
                }
            });
    }

    updateUserDropdownField(): void {
        const userFieldIndex = this.fields.findIndex(f => f.formControlName === 'assigned_to_user_id');
        if (userFieldIndex !== -1) {
            const currentUser = this._authService.getCurrentUserData();

            if (this.isAdmin) {
                const userOptions = this.users.map(user => ({ key: user.id, value: user.username }));
                if (currentUser && !this.users.some(u => u.id === currentUser.id)) {
                    userOptions.unshift({ key: currentUser.id, value: `${currentUser.username} (Me)` });
                }
                this.fields[userFieldIndex].options = [{ key: null, value: 'Unassigned' }, ...userOptions];
            } else {
                // Non-admins can only assign to themselves
                const selfOption = currentUser
                    ? [{ key: currentUser.id, value: `${currentUser.username} (Me)` }]
                    : [];
                this.fields[userFieldIndex].options = selfOption;

                // Auto-select self if no value is set
                if (currentUser && !this.form.get('assigned_to_user_id')?.value) {
                    this.form.get('assigned_to_user_id')?.setValue(currentUser.id, { emitEvent: false });
                }
            }
        }
    }

    onSubmit(): void {
        if (this.form.invalid) {
            this.isSubmitted = true;
            this.form.markAllAsTouched();
            return;
        }

        const formValue = this.form.value;
        const finalCategory = formValue.category === 'Other' ? formValue.custom_category : formValue.category;
        
        const todoData: ITodoCreate = {
            title: formValue.title,
            description: formValue.description || undefined,
            due_date: formValue.due_date || undefined,
            time_estimate: formValue.time_estimate || undefined,
            priority: formValue.priority || 'medium',
            category: finalCategory || undefined,
            assigned_to_user_id: formValue.assigned_to_user_id === "null" ? null : formValue.assigned_to_user_id
        };

        if (this.isEditMode && this.editingTodo) {
            const updateData: ITodoUpdate = {
                title: todoData.title,
                description: todoData.description,
                due_date: todoData.due_date || null,
                time_estimate: todoData.time_estimate || null,
                category: todoData.category,
                status: formValue.status || 'new',
                assigned_to_user_id: todoData.assigned_to_user_id
            };
            
            if (this.isAdmin) {
                updateData.priority = todoData.priority;
            }
            
            this.updateTodo.emit({ 
                id: this.editingTodo.id, 
                data: updateData
            });
        } else {
            this.submitTodo.emit(todoData);
        }
    }

    onCancel(): void {
        this.cancel.emit();
    }

    resetForm(): void {
        this.isEditMode = false;
        this.editingTodo = null;
        this._updateFieldsForMode();
        this.form = this._formService.initializeForm(this.fields);
        this.updateUserDropdownField();
        this.isSubmitted = false;
        this.errorSummary = null;
    }

    populateForm(todo: ITodo): void {
        this.isEditMode = true;
        this.editingTodo = todo;
        this._updateFieldsForMode();
        this.form = this._formService.initializeForm(this.fields);
        this._watchCategoryChanges();
        this.updateUserDropdownField();

        // If the todo's category is not in the predefined list, it's a custom one
        const isCustomCategory = todo.category && !this.availableCategories.includes(todo.category);
        if (isCustomCategory) {
            this.toggleCustomCategoryField(true);
        }

        if (this.users.length === 0) {
            this.loadUsers();
            return;
        }

        this.populateFormData(todo);
    }

    private populateFormData(todo: ITodo): void {
        const isCustomCategory = todo.category && !this.availableCategories.includes(todo.category);

        const formValue: any = {
            title: todo.title || '',
            description: todo.description || '',
            due_date: todo.due_date ? todo.due_date.split('T')[0] : '',
            time_estimate: todo.time_estimate || '',
            priority: todo.priority || 'medium',
            category: isCustomCategory ? 'Other' : (todo.category || ''),
            status: todo.status || 'new',
            assigned_to_user_id: todo.assigned_to_user_id || null,
            custom_category: isCustomCategory ? todo.category : ''
        };
        
        setTimeout(() => {
            if (this.form) {
                this.form.patchValue(formValue, { emitEvent: false });
                this.form.markAsPristine();
            }
        }, 100);
    }

    hasChanges(): boolean {
        if (this.form.dirty) return true;
        
        if (this.isEditMode && this.editingTodo) {
            const formValue = this.form.value;
            const finalCategory = formValue.category === 'Other' ? formValue.custom_category : formValue.category;
            
            const priorityChanged = formValue.priority !== (this.editingTodo.priority || 'medium');
            const statusChanged = formValue.status !== (this.editingTodo.status || 'new');
            const categoryChanged = finalCategory !== (this.editingTodo.category || '');
            const timeEstimateChanged = formValue.time_estimate !== (this.editingTodo.time_estimate || '');
            const titleChanged = formValue.title !== this.editingTodo.title;
            const descriptionChanged = formValue.description !== (this.editingTodo.description || '');
            
            return priorityChanged || statusChanged || categoryChanged || timeEstimateChanged || titleChanged || descriptionChanged;
        }
        return this.form.dirty;
    }
}
