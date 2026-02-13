import { Component, Output, EventEmitter, OnInit, Input, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { FormGroup } from "@angular/forms";
import { DynamicFormComponent } from "../dynamic-form.component";
import { ReactiveFormService } from "../../../services/reactive-form.service";
import { IFieldControl } from "../../../interfaces/IFieldControl.interface";
import { InputTypes } from "../../../enums/input-types.enum";
import { ValidatorTypes } from "../../../enums/validator-types.enum";
import { ITodoCreate, ITodoUpdate } from "../../../../core/interfaces/todo.interface";
import { ITodo } from "../../../../layouts/components/todo-list/todo-list.component";
import { UserService } from "../../../../core/services/user.service";
import { IUserListResponse } from "../../../../auth/interfaces";
import { Subject, takeUntil } from "rxjs";
import { AuthService } from "../../../../auth/services/auth.service";

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
            label: 'Assign To',
            type: InputTypes.DROPDOWN,
            formControlName: 'assigned_to_user_id',
            placeholder: 'Select user',
            value: 0,
            required: false,
            validations: [],
            options: [{ key: 0, value: 'Unassigned' }],
        },
    ];

    priorities: { value: PriorityLevel; label: string; icon: string; color: string }[] = [
        { value: 'low', label: 'Low', icon: 'bi-arrow-down', color: '#28a745' },
        { value: 'medium', label: 'Medium', icon: 'bi-dash', color: '#ffc107' },
        { value: 'high', label: 'High', icon: 'bi-arrow-up', color: '#dc3545' },
    ];

    selectedPriority: PriorityLevel | null = null;
    selectedCategory: string = '';
    customCategory: string = '';
    isOtherCategory: boolean = false;
    isCompleted: boolean = false;
    availableCategories: string[] = ['Work', 'Personal', 'Shopping', 'Health', 'Learning', 'Other'];

    constructor(
        private readonly _formService: ReactiveFormService,
        private readonly _userService: UserService,
        private readonly _authService: AuthService
    ) {}

    ngOnInit(): void {
        this.isAdmin = this._authService.isAdmin();
        this.updateFieldsBasedOnRole();
        this.form = this._formService.initializeForm(this.fields);
            
        if (this.isAdmin) {
            this.loadUsers();
        }
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }

    updateFieldsBasedOnRole(): void {
        if (!this.isAdmin) {
            this.fields = this.fields.filter(f => f.formControlName !== 'assigned_to_user_id');
        }
    }

    loadUsers(): void {
        if (!this.isAdmin) {
            return;
        }
        
        this._userService.getUsersWithRoleUser()
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
            const unassignedOption = { key: 0, value: 'Unassigned' };
            const userOptions = this.users.map(user => ({ key: user.id, value: user.username }));
            this.fields[userFieldIndex].options = [unassignedOption, ...userOptions];
        }
    }

    selectPriority(priority: PriorityLevel): void {
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

        let assignedUserId: number | null = null;
        if (this.isAdmin) {
            const assignedUserIdValue = this.form.get('assigned_to_user_id')?.value;
            if (assignedUserIdValue === null || assignedUserIdValue === undefined || 
                assignedUserIdValue === 0 || assignedUserIdValue === "0" || 
                String(assignedUserIdValue).trim() === "0") {
                assignedUserId = null;
            } else {
                const numValue = Number(assignedUserIdValue);
                assignedUserId = isNaN(numValue) ? null : numValue;
            }
        }
        
        const todoData: ITodoCreate = {
            title: this.form.get('title')?.value,
            description: this.form.get('description')?.value || undefined,
            priority: this.selectedPriority || 'medium', // Default to medium if not selected
            category: categoryToUse,
            assigned_to_user_id: assignedUserId
        };

        if (this.isEditMode && this.editingTodo) {
            const updateData: ITodoUpdate = {
                title: todoData.title,
                description: todoData.description,
                priority: this.selectedPriority || undefined, // Only include if selected
                category: todoData.category,
                completed: this.isCompleted,
                assigned_to_user_id: assignedUserId ?? null
            };
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
        this.form.reset();
        // Reset assigned_to_user_id to 0 (Unassigned) if admin
        if (this.isAdmin && this.form.get('assigned_to_user_id')) {
            this.form.patchValue({ assigned_to_user_id: 0 });
        }
        this.selectedPriority = null;
        this.selectedCategory = '';
        this.customCategory = '';
        this.isOtherCategory = false;
        this.isCompleted = false;
        this.isSubmitted = false;
        this.errorSummary = null;
        this.isEditMode = false;
        this.editingTodo = null;
        this.selectedUserId = null;
    }

    populateForm(todo: ITodo): void {
        this.isEditMode = true;
        this.editingTodo = todo;
        this.selectedUserId = todo.assigned_to_user_id || null;
        
        // Ensure form is initialized
        if (!this.form || Object.keys(this.form.controls).length === 0) {
            this.form = this._formService.initializeForm(this.fields);
        }
        
        // Ensure users are loaded before populating form (for admin)
        if (this.isAdmin && this.users.length === 0) {
            // Users not loaded yet, wait for them - loadUsers will call populateFormData
            this.loadUsers();
            return;
        }
        
        // Users already loaded (or not needed), populate form data directly
        this.populateFormData(todo);
    }

    private populateFormData(todo: ITodo): void {
        // Ensure form has all controls
        if (this.isAdmin && !this.form.get('assigned_to_user_id')) {
            this.form = this._formService.initializeForm(this.fields);
        }
        
        // Update dropdown options if admin
        if (this.isAdmin) {
            this.updateUserDropdownField();
        }
        
        this.selectedPriority = (todo.priority || null) as PriorityLevel | null;
        
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
        
        // Set completed state
        this.isCompleted = todo.completed || false;
        
        // Prepare form values
        const formValue: any = {
            title: todo.title || '',
            description: todo.description || ''
        };
        
        if (this.isAdmin) {
            const assignedUserId = todo.assigned_to_user_id;
            if (assignedUserId && assignedUserId !== null && assignedUserId !== 0) {
                const userField = this.fields.find(f => f.formControlName === 'assigned_to_user_id');
                const userExists = userField?.options?.some(opt => opt.key === assignedUserId);
                formValue.assigned_to_user_id = userExists ? assignedUserId : 0;
            } else {
                formValue.assigned_to_user_id = 0;
            }
        }
        
        // Use setTimeout to ensure form is ready and DOM is updated
        setTimeout(() => {
            if (this.form) {
                // Patch all form values at once
                this.form.patchValue(formValue, { emitEvent: false });
                
                // Verify values were set correctly
                if (this.form.get('title')?.value !== formValue.title) {
                    this.form.get('title')?.setValue(formValue.title, { emitEvent: false });
                }
                if (this.form.get('description')?.value !== formValue.description) {
                    this.form.get('description')?.setValue(formValue.description, { emitEvent: false });
                }
                if (this.isAdmin && this.form.get('assigned_to_user_id')) {
                    const currentValue = this.form.get('assigned_to_user_id')?.value;
                    if (currentValue !== formValue.assigned_to_user_id) {
                        this.form.get('assigned_to_user_id')?.setValue(formValue.assigned_to_user_id, { emitEvent: false });
                    }
                }
            }
        }, 100);
    }

    toggleCompleted(): void {
        this.isCompleted = !this.isCompleted;
    }
}

