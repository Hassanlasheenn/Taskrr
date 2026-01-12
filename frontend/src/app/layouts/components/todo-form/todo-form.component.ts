import { Component, Output, EventEmitter, OnInit, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup } from "@angular/forms";
import { DynamicFormComponent } from "../../../shared/components/dynamic-form/dynamic-form.component";
import { ReactiveFormService } from "../../../shared/services/reactive-form.service";
import { IFieldControl } from "../../../shared/interfaces/IFieldControl.interface";
import { InputTypes } from "../../../shared/enums/input-types.enum";
import { ValidatorTypes } from "../../../shared/enums/validator-types.enum";
import { ITodoCreate, ITodoUpdate } from "../../../core/services/todo.service";
import { ITodo } from "../todo-list/todo-list.component";

@Component({
    selector: 'app-todo-form',
    templateUrl: './todo-form.component.html',
    styleUrls: ['./todo-form.component.scss'],
    standalone: true,
    imports: [CommonModule, DynamicFormComponent],
})
export class TodoFormComponent implements OnInit {
    @Input() editingTodo: ITodo | null = null;
    @Output() submitTodo = new EventEmitter<ITodoCreate>();
    @Output() updateTodo = new EventEmitter<{ id: number; data: ITodoUpdate }>();
    @Output() cancel = new EventEmitter<void>();

    form: FormGroup = new FormGroup({});
    isSubmitted: boolean = false;
    errorSummary: string | null = null;
    isEditMode: boolean = false;

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
    ];

    priorities: { value: 'low' | 'medium' | 'high'; label: string; icon: string; color: string }[] = [
        { value: 'low', label: 'Low', icon: 'bi-arrow-down', color: '#28a745' },
        { value: 'medium', label: 'Medium', icon: 'bi-dash', color: '#ffc107' },
        { value: 'high', label: 'High', icon: 'bi-arrow-up', color: '#dc3545' },
    ];

    selectedPriority: 'low' | 'medium' | 'high' = 'medium';
    isCompleted: boolean = false;

    constructor(private readonly _formService: ReactiveFormService) {}

    ngOnInit(): void {
        this.form = this._formService.initializeForm(this.fields);
    }

    selectPriority(priority: 'low' | 'medium' | 'high'): void {
        this.selectedPriority = priority;
    }

    onSubmit(): void {
        if (this.form.invalid) {
            this.isSubmitted = true;
            return;
        }

        const todoData: ITodoCreate = {
            title: this.form.get('title')?.value,
            description: this.form.get('description')?.value || undefined,
            priority: this.selectedPriority
        };

        if (this.isEditMode && this.editingTodo) {
            const updateData: ITodoUpdate = {
                title: todoData.title,
                description: todoData.description,
                priority: todoData.priority,
                completed: this.isCompleted
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
        this.selectedPriority = 'medium';
        this.isCompleted = false;
        this.isSubmitted = false;
        this.errorSummary = null;
        this.isEditMode = false;
        this.editingTodo = null;
    }

    populateForm(todo: ITodo): void {
        this.isEditMode = true;
        this.editingTodo = todo;
        this.form.patchValue({
            title: todo.title,
            description: todo.description || ''
        });
        this.selectedPriority = todo.priority;
        this.isCompleted = todo.completed;
    }

    toggleCompleted(): void {
        this.isCompleted = !this.isCompleted;
    }
}

