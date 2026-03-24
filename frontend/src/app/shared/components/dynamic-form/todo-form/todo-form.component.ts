import { Component, Output, EventEmitter, OnInit, Input, OnDestroy } from "@angular/core";
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

type PriorityLevel = 'low' | 'medium' | 'high';

@Component({
    selector: 'app-todo-form',
    templateUrl: './todo-form.component.html',
    styleUrls: ['./todo-form.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule, DynamicFormComponent],
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
    selectedUserId: number | null = null;
    isAdmin: boolean = false;
    trackById = trackById;

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
            type: InputTypes.TEXT,
            formControlName: 'description',
            placeholder: 'Enter description (optional)',
            value: '',
            required: false,
            validations: [],
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

    priorities: { value: PriorityLevel; label: string; icon: string; color: string }[] = [
        { value: 'low', label: 'Low', icon: 'bi-arrow-down', color: '#28a745' },
        { value: 'medium', label: 'Medium', icon: 'bi-dash', color: '#ffc107' },
        { value: 'high', label: 'High', icon: 'bi-arrow-up', color: '#dc3545' },
    ];

    statuses: { value: TodoStatus; label: string }[] = [
        { value: 'new', label: 'New' },
        { value: 'inProgress', label: 'In Progress' },
        { value: 'paused', label: 'Paused' },
        { value: 'done', label: 'Done' }
    ];

    selectedPriority: PriorityLevel | null = null;
    selectedStatus: TodoStatus = 'new';
    selectedCategory: string = '';
    customCategory: string = '';
    isOtherCategory: boolean = false;
    availableCategories: string[] = ['Work', 'Personal', 'Shopping', 'Health', 'Learning', 'Other'];

    constructor(
        private readonly _formService: ReactiveFormService,
        private readonly _userService: UserService,
        private readonly _authService: AuthService
    ) {}

    ngOnInit(): void {
        this.isAdmin = this._authService.isAdmin();
        this._updateFieldsForRole();
        this.form = this._formService.initializeForm(this.fields);
        this.loadUsers();
    }

    private _updateFieldsForRole(): void {
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
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }

    trackByValue(index: number, item: any): any {
        return item.value ?? index;
    }

    loadUsers(): void {
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
            const userOptions = this.users.map(user => ({ key: user.id, value: user.username }));
            
            // Always add the current user to the list if not already present
            const currentUser = this._authService.getCurrentUserData();
            if (currentUser && !this.users.some(u => u.id === currentUser.id)) {
                userOptions.unshift({ key: currentUser.id, value: `${currentUser.username} (Me)` });
            }
            
            if (this.isAdmin) {
                // Admins get the Unassigned option
                this.fields[userFieldIndex].options = [{ key: null, value: 'Unassigned' }, ...userOptions];
            } else {
                // Non-admins must choose a user
                this.fields[userFieldIndex].options = userOptions;
            }
        }
    }

    selectPriority(priority: PriorityLevel): void {
        // Non-admin users cannot change priority when editing
        if (this.isEditMode && !this.isAdmin) {
            return;
        }
        // Toggle: if same priority is clicked, deselect it
        this.selectedPriority = this.selectedPriority === priority ? null : priority;
    }

    selectCategory(category: string): void {
        if (category === 'Other') {
            if (this.selectedCategory === 'Other') {
                this.isOtherCategory = false;
                this.selectedCategory = '';
                this.customCategory = '';
            } else {
                this.isOtherCategory = true;
                this.selectedCategory = 'Other';
                this.customCategory = '';
            }
        } else {
            this.isOtherCategory = false;
            this.selectedCategory = this.selectedCategory === category ? '' : category;
            this.customCategory = '';
        }
    }

    onSubmit(): void {
        if (this.form.invalid) {
            this.isSubmitted = true;
            return;
        }

        if (this.isOtherCategory && !this.customCategory.trim()) {
            this.errorSummary = 'Please enter a custom category name';
            this.isSubmitted = true;
            return;
        }

        let categoryToUse: string | undefined = undefined;
        if (this.isOtherCategory && this.customCategory.trim()) {
            categoryToUse = this.customCategory.trim();
        } else if (this.selectedCategory && this.selectedCategory !== 'Other') {
            categoryToUse = this.selectedCategory;
        } else if (this.selectedCategory === 'Other' && !this.isOtherCategory) {
            categoryToUse = 'Other';
        }

        const assignedUserIdValue = this.form.get('assigned_to_user_id')?.value;
        let assignedUserId: number | null = null;
        
        if (assignedUserIdValue === null || assignedUserIdValue === undefined || 
            assignedUserIdValue === 0 || assignedUserIdValue === "0" || 
            String(assignedUserIdValue).trim() === "0") {
            assignedUserId = null;
        } else {
            const numValue = Number(assignedUserIdValue);
            assignedUserId = isNaN(numValue) ? null : numValue;
        }
        
        const todoData: ITodoCreate = {
            title: this.form.get('title')?.value,
            description: this.form.get('description')?.value || undefined,
            due_date: this.form.get('due_date')?.value || undefined,
            priority: this.selectedPriority || 'medium',
            category: categoryToUse,
            assigned_to_user_id: assignedUserId
        };

        if (this.isEditMode && this.editingTodo) {
            const updateData: ITodoUpdate = {
                title: todoData.title,
                description: todoData.description,
                due_date: todoData.due_date || null,
                category: todoData.category,
                status: this.selectedStatus,
                assigned_to_user_id: assignedUserId
            };
            
            // Only include priority if user is admin (non-admin users cannot change priority)
            if (this.isAdmin) {
                updateData.priority = this.selectedPriority || undefined;
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
        
        // Reset fields to original state
        const baseFields = [
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
                type: InputTypes.TEXT,
                formControlName: 'description',
                placeholder: 'Enter description (optional)',
                value: '',
                required: false,
                validations: [],
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
        
        this.fields = baseFields;
        this._updateFieldsForRole();
        this.form = this._formService.initializeForm(this.fields);
        this.updateUserDropdownField();
        
        if (this.form.get('due_date')) {
            this.form.get('due_date')?.setValue('');
        }
        this.selectedPriority = null;
        this.selectedStatus = 'new';
        this.selectedCategory = '';
        this.customCategory = '';
        this.isOtherCategory = false;
        this.isSubmitted = false;
        this.errorSummary = null;
        this.selectedUserId = null;
    }

    populateForm(todo: ITodo): void {
        this.isEditMode = true;
        this.editingTodo = todo;
        this.selectedUserId = todo.assigned_to_user_id || null;
        
        // Restore all fields
        const baseFields = [
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
                type: InputTypes.TEXT,
                formControlName: 'description',
                placeholder: 'Enter description (optional)',
                value: '',
                required: false,
                validations: [],
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
        
        this.fields = baseFields;
        this._updateFieldsForRole();
        this.form = this._formService.initializeForm(this.fields);
        this.updateUserDropdownField();
        
        if (this.users.length === 0) {
            this.loadUsers();
            return;
        }
        
        this.populateFormData(todo);
    }

    private populateFormData(todo: ITodo): void {
        if (this.isAdmin && !this.form.get('assigned_to_user_id')) {
            this.form = this._formService.initializeForm(this.fields);
        }
        
        if (this.isAdmin) {
            this.updateUserDropdownField();
        }
        
        this.selectedPriority = (todo.priority || null) as PriorityLevel | null;
        this.selectedStatus = (todo.status || 'new') as TodoStatus;
        
        if (todo.category) {
            if (this.availableCategories.includes(todo.category)) {
                this.selectedCategory = todo.category;
                this.isOtherCategory = false;
                this.customCategory = '';
            } else {
                this.selectedCategory = 'Other';
                this.isOtherCategory = true;
                this.customCategory = todo.category;
            }
        } else {
            this.selectedCategory = '';
            this.isOtherCategory = false;
            this.customCategory = '';
        }
        
        const formValue: any = {
            title: todo.title || '',
            description: todo.description || '',
            due_date: todo.due_date ? todo.due_date.split('T')[0] : ''
        };
        
        // Handle assignee dropdown value
        const assignedUserId = todo.assigned_to_user_id;
        if (assignedUserId && assignedUserId !== null && assignedUserId !== 0) {
            const userField = this.fields.find(f => f.formControlName === 'assigned_to_user_id');
            const userExists = userField?.options?.some(opt => opt.key === assignedUserId);
            formValue.assigned_to_user_id = userExists ? assignedUserId : 0;
        } else {
            formValue.assigned_to_user_id = 0;
        }
        
        setTimeout(() => {
            if (this.form) {
                this.form.patchValue(formValue, { emitEvent: false });
                
                if (this.form.get('title')?.value !== formValue.title) {
                    this.form.get('title')?.setValue(formValue.title, { emitEvent: false });
                }
                if (this.form.get('description')?.value !== formValue.description) {
                    this.form.get('description')?.setValue(formValue.description, { emitEvent: false });
                }
                if (this.form.get('assigned_to_user_id')) {
                    const currentValue = this.form.get('assigned_to_user_id')?.value;
                    if (currentValue !== formValue.assigned_to_user_id) {
                        this.form.get('assigned_to_user_id')?.setValue(formValue.assigned_to_user_id, { emitEvent: false });
                    }
                }
                // Reset dirty state after population
                this.form.markAsPristine();
            }
        }, 100);
    }

    hasChanges(): boolean {
        // If form is dirty, or priority/status/category was changed manually
        if (this.form.dirty) return true;
        
        if (this.isEditMode && this.editingTodo) {
            const priorityChanged = this.selectedPriority !== (this.editingTodo.priority || null);
            const statusChanged = this.selectedStatus !== (this.editingTodo.status || 'new');
            
            let currentCategory = '';
            if (this.isOtherCategory) {
                currentCategory = this.customCategory;
            } else if (this.selectedCategory && this.selectedCategory !== 'Other') {
                currentCategory = this.selectedCategory;
            }
            const categoryChanged = currentCategory !== (this.editingTodo.category || '');
            
            return priorityChanged || statusChanged || categoryChanged;
        } else {
            // In create mode, check if any selections were made
            return !!(this.selectedPriority || this.selectedCategory || this.form.get('title')?.value || this.form.get('description')?.value);
        }
    }

}
