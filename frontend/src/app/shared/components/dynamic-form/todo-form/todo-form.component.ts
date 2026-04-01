import { Component, Output, EventEmitter, OnInit, OnDestroy, Input, inject, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule, FormGroup } from "@angular/forms";
import { DynamicFormComponent } from "../dynamic-form.component";
import { ReactiveFormService } from "../../../services/reactive-form.service";
import { IFieldControl } from "../../../interfaces/IFieldControl.interface";
import { InputTypes } from "../../../enums/input-types.enum";
import { ValidatorTypes } from "../../../enums/validator-types.enum";
import { ITodo, ITodoCreate, ITodoUpdate } from "../../../../core/interfaces/todo.interface";
import { UserService } from "../../../../core/services/user.service";
import { IUserListResponse } from "../../../../auth/interfaces";
import { Subject, takeUntil } from "rxjs";
import { AuthService } from "../../../../auth/services/auth.service";
import { TodoService } from "../../../../core/services/todo.service";
import { trackById } from "../../../helpers/trackByFn.helper";
import { getTodoType, enrichTodoTypes } from "../../../helpers/todo-type.helper";
import { ClickThrottleDirective } from "../../../directives/click-throttle.directive";

@Component({
    selector: 'app-todo-form',
    templateUrl: './todo-form.component.html',
    styleUrls: ['./todo-form.component.scss'],
    standalone: true,
    imports: [CommonModule, FormsModule, DynamicFormComponent, ClickThrottleDirective],
})
export class TodoFormComponent implements OnInit, OnDestroy, OnChanges {
    private readonly _formService = inject(ReactiveFormService);
    private readonly _userService = inject(UserService);
    private readonly _authService = inject(AuthService);
    private readonly _todoService = inject(TodoService);

    @Input() editingTodo: ITodo | null = null;
    @Input() parentId: number | null = null;
    @Input() parentTodo: ITodo | null = null;
    
    @Input() forcedType: string | null = null;
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

    fields: IFieldControl[] = [];
    private _allTodos: ITodo[] = [];
    private _allTodosLoaded = false;

    private _getDefaultFields(): IFieldControl[] {
        return [
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
                label: 'Type',
                type: InputTypes.DROPDOWN,
                formControlName: 'type',
                placeholder: 'Select type',
                value: 'workitem',
                required: true,
                options: [], // populated dynamically
                validations: [
                    { type: ValidatorTypes.REQUIRED, message: 'Type is required' }
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
    }

    ngOnInit(): void {
        this.isAdmin = this._authService.isAdmin();
        this.loadUsers();
        
        const userId = this._authService.getCurrentUserId();
        if (userId && !this.isEditMode) {
            this._todoService.getTodos(userId, 0, 500).subscribe(res => {
                this._allTodos = res.todos as ITodo[];
                this._allTodosLoaded = true;
                this.initForm();
            });
        } else {
            this.initForm();
        }
    }

    private _getTypeOptions(): { key: string, value: string }[] {
        if (this.forcedType) {
            const label = this.forcedType === 'project' ? 'Project' : 
                          this.forcedType === 'story' ? 'Story' : 
                          this.forcedType === 'task' ? 'Task' : 'Work Item';
            return [{ key: this.forcedType, value: label }];
        }

        const allOptions = [
            { key: 'project', value: 'Project' },
            { key: 'story', value: 'Story' },
            { key: 'workitem', value: 'Work Item' },
            { key: 'task', value: 'Task' }
        ];

        // If we have a parentId or are in edit mode, show all appropriate types 
        // (usually edit mode doesn't change type but if it does, let it be free)
        if (this.parentId || this.isEditMode) {
             return allOptions;
        }

        // Global Add logic: restrict based on what exists
        const enriched = enrichTodoTypes(this._allTodos);
        const hasProjects = enriched.some(t => getTodoType(t as any) === 'project');
        const hasStories = enriched.some(t => getTodoType(t as any) === 'story');

        const options = [
            { key: 'project', value: 'Project' },
            { key: 'workitem', value: 'Work Item' }
        ];

        if (hasProjects) {
            options.push({ key: 'story', value: 'Story' });
        }
        if (hasStories) {
            options.push({ key: 'task', value: 'Task' });
        }

        return options;
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['editingTodo']) {
            this.isEditMode = !!this.editingTodo;
            this.initForm();
            if (this.isEditMode && this.editingTodo) {
                this.populateForm(this.editingTodo);
            }
        }
        
        if ((changes['parentId'] || changes['parentTodo'] || changes['forcedType']) && !this.isEditMode) {
            this.initForm();
        }
    }

    initForm(): void {
        this.fields = this._getDefaultFields();
        
        const typeField = this.fields.find(f => f.formControlName === 'type');
        if (typeField) {
            const options = this._getTypeOptions();
            typeField.options = options;

            if (this.forcedType) {
                typeField.value = this.forcedType;
                typeField.disabled = true;
            } else if (this.isEditMode && this.editingTodo) {
                typeField.value = this.editingTodo.type || 'workitem';
            } else if (this.parentId) {
                if (this.parentTodo) {
                    const pType = getTodoType(this.parentTodo as any);
                    typeField.value = (pType === 'project') ? 'story' : 'task';
                } else {
                    typeField.value = 'task'; 
                }
            } else {
                // Global Add: default to workitem if allowed, else first allowed option
                if (options.some(o => o.key === 'workitem')) {
                    typeField.value = 'workitem';
                } else if (options.length > 0) {
                    typeField.value = options[0].key;
                }
            }
        }

        this._updateFieldsForMode();
        this.form = this._formService.initializeForm(this.fields);
        
        const initialType = this.form.get('type')?.value || (this.editingTodo ? this.editingTodo.type : 'workitem');
        this._handleTimeEstimateField(initialType);
        
        this.updateUserDropdownField();
        this._watchCategoryChanges();
        this._watchTypeChanges();
        this._watchParentChanges();
        
        if (this.isEditMode && this.editingTodo) {
            this._handleParentField(this.editingTodo.type || 'workitem');
        } else {
            this._handleParentField(this.form.get('type')?.value);
        }
    }

    private _watchTypeChanges(): void {
        this.form.get('type')?.valueChanges
            .pipe(takeUntil(this._destroy$))
            .subscribe(type => {
                this._handleParentField(type);
                this._handleTimeEstimateField(type);
            });
    }

    private _handleTimeEstimateField(type: string): void {
        const shouldHide = type === 'project' || type === 'story';
        const timeEstimateIndex = this.fields.findIndex(f => f.formControlName === 'time_estimate');

        if (shouldHide && timeEstimateIndex !== -1) {
            this.fields.splice(timeEstimateIndex, 1);
            if (this.form.get('time_estimate')) {
                this.form.removeControl('time_estimate');
            }
        } else if (!shouldHide && timeEstimateIndex === -1) {
            const timeEstimateField: IFieldControl = {
                label: 'Time Estimate',
                type: InputTypes.TIME_ESTIMATE,
                formControlName: 'time_estimate',
                placeholder: 'e.g., 1w 2d 3h 30m',
                value: '',
                required: false,
                validations: []
            };
            const descIndex = this.fields.findIndex(f => f.formControlName === 'description');
            this.fields.splice(descIndex + 1, 0, timeEstimateField);
            if (!this.form.get('time_estimate')) {
                this.form.addControl('time_estimate', this._formService.createControl(timeEstimateField));
            }
        }
    }

    private _watchParentChanges(): void {
        this.form.get('parent_id')?.valueChanges
            .pipe(takeUntil(this._destroy$))
            .subscribe(parentId => {
                if (parentId && !this.forcedType) {
                    const parent = this.users.length > 0 ? null : null; // We need to find it in potential parents
                    // Instead of finding it, we can infer from the label of the dropdown if we really had to, 
                    // but better to just look at the type selection.
                    
                    // Actually, the simplest is to check the current selected type and see if it makes sense.
                    // If we are linking to something, and we are currently a 'workitem', we should probably be a 'task'.
                    const currentType = this.form.get('type')?.value;
                    if (currentType === 'workitem') {
                        this.form.get('type')?.setValue('task', { emitEvent: false });
                        this._handleParentField('task');
                    }
                }
            });
    }

    private _handleParentField(type: string): void {
        const userId = this._authService.getCurrentUserId();
        if (!userId) return;

        if (type === 'task') {
            this._loadPotentialParents(userId, 'story', 'Link to Story');
        } else if (type === 'story') {
            this._loadPotentialParents(userId, 'project', 'Link to Project');
        } else {
            this._removeParentField();
        }
    }

    private _loadPotentialParents(userId: number, type: string, label: string): void {
        const processTodos = (todos: ITodo[]) => {
            const enriched = enrichTodoTypes(todos);
            const parents = enriched.filter(t => getTodoType(t as any) === type);
            const options: { key: string | number | null, value: string }[] = parents.map(p => ({ key: p.id, value: p.title }));
            this._addOrUpdateParentField(label, options);
        };

        if (this._allTodosLoaded) {
            processTodos(this._allTodos);
        } else {
            this._todoService.getTodos(userId, 0, 500).subscribe(res => {
                this._allTodos = res.todos as ITodo[];
                this._allTodosLoaded = true;
                processTodos(this._allTodos);
            });
        }
    }

    private _addOrUpdateParentField(label: string, options: { key: any, value: string }[]): void {
        const existingIndex = this.fields.findIndex(f => f.formControlName === 'parent_id');
        
        // Use either the @Input parentId or the one from the editing todo
        const effectiveParentId = this.parentId || (this.isEditMode ? this.editingTodo?.parent_id : null);
        
        // Ensure the effectiveParentId is in the options list so the label shows up and it is preselected
        if (effectiveParentId && !options.some(o => o.key === effectiveParentId)) {
            // Find parent title from input parentTodo or editingTodo's parent info
            let title = 'Current Parent';
            if (this.parentTodo && this.parentTodo.id === effectiveParentId) {
                title = this.parentTodo.title;
            } else if (this.isEditMode && this.editingTodo?.parent_id === effectiveParentId) {
                // If we're editing, we might have the parent's title stored in some extra field if we wanted,
                // but for now 'Current Parent' is a safe fallback if it's not in the loaded list.
                title = 'Current Parent';
            }
            options.unshift({ key: effectiveParentId, value: title });
        }

        const parentField: IFieldControl = {
            label: label,
            type: InputTypes.DROPDOWN,
            formControlName: 'parent_id',
            placeholder: `Select ${label.split(' ').pop()}`,
            value: effectiveParentId || null,
            required: true,
            options: options,
            disabled: !!this.parentId, // Disable if we already have a parentId passed via Input
            validations: [
                { type: ValidatorTypes.REQUIRED, message: `${label} is required` }
            ]
        };

        if (existingIndex !== -1) {
            this.fields[existingIndex] = parentField;
            const ctrl = this.form.get('parent_id');
            if (ctrl) {
                // Explicitly patch value to ensure UI is in sync after options are loaded
                ctrl.patchValue(effectiveParentId || null, { emitEvent: false });
                if (!!this.parentId) {
                    ctrl.disable({ emitEvent: false });
                } else {
                    ctrl.enable({ emitEvent: false });
                }
            }
        } else {
            const typeIndex = this.fields.findIndex(f => f.formControlName === 'type');
            this.fields.splice(typeIndex + 1, 0, parentField);
            this.form.addControl('parent_id', this._formService.createControl(parentField));
        }
    }

    private _removeParentField(): void {
        const index = this.fields.findIndex(f => f.formControlName === 'parent_id');
        if (index !== -1) {
            this.fields.splice(index, 1);
            this.form.removeControl('parent_id');
        }
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
                const selfOption = currentUser
                    ? [{ key: currentUser.id, value: `${currentUser.username} (Me)` }]
                    : [];
                this.fields[userFieldIndex].options = selfOption;

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

        this._submitFinalTodo(this.form.value);
    }

    private _submitFinalTodo(formValue: any): void {
        const finalCategory = formValue.category === 'Other' ? formValue.custom_category : formValue.category;
        const parentId = formValue.parent_id || this.parentId;
        const type = formValue.type || 'workitem';

        const todoData: ITodoCreate = {
            title: formValue.title,
            description: formValue.description || undefined,
            due_date: formValue.due_date || undefined,
            time_estimate: (type !== 'project' && type !== 'story') ? (formValue.time_estimate || undefined) : undefined,
            priority: formValue.priority || 'medium',
            type: type,
            category: finalCategory || undefined,
            assigned_to_user_id: formValue.assigned_to_user_id === "null" ? null : formValue.assigned_to_user_id,
            parent_id: parentId ?? undefined,
        };

        if (this.isEditMode && this.editingTodo) {
            const updateData: ITodoUpdate = {
                title: todoData.title,
                description: todoData.description,
                due_date: todoData.due_date !== undefined ? todoData.due_date : null,
                time_estimate: (type !== 'project' && type !== 'story') ? (todoData.time_estimate !== undefined ? todoData.time_estimate : null) : undefined,
                category: todoData.category,
                type: todoData.type,
                status: formValue.status || 'new',
                assigned_to_user_id: todoData.assigned_to_user_id,
                parent_id: parentId !== undefined ? (parentId ?? null) : undefined,
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
        this.isSubmitted = false;
        this.errorSummary = null;
        this.initForm();
    }

    populateForm(todo: ITodo): void {
        this.isEditMode = true;
        this.editingTodo = todo;
        this.initForm();

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

        let inferredType = todo.type || 'workitem';
        // Correct legacy/bad data: if it's a child and type is generic 'workitem', infer better
        if ((inferredType === 'workitem' || inferredType === 'task') && todo.parent_id && !this.forcedType) {
            if (this.parentTodo) {
                const pType = getTodoType(this.parentTodo as any);
                inferredType = (pType === 'project') ? 'story' : 'task';
            }
        }

        const formValue: any = {
            title: todo.title || '',
            type: this.forcedType || inferredType,
            description: todo.description || '',
            due_date: todo.due_date ? todo.due_date.split('T')[0] : '',
            time_estimate: todo.time_estimate || '',
            priority: todo.priority || 'medium',
            category: isCustomCategory ? 'Other' : (todo.category || ''),
            status: todo.status || 'new',
            assigned_to_user_id: todo.assigned_to_user_id || null,
            custom_category: isCustomCategory ? todo.category : '',
            parent_id: todo.parent_id || null
        };
        
        if (this.form) {
            this.form.patchValue(formValue, { emitEvent: false });
            this.form.markAsPristine();
        }
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
