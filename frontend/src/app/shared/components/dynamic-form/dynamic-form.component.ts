import { Component, Input, OnChanges, SimpleChanges, EventEmitter, Output } from "@angular/core";
import { InputFormComponent } from "../form-fields/input/input.component";
import { UploadPhotoComponent } from "../form-fields/upload-photo/upload-photo.component";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { trackById } from "../../helpers";
import { ICustomStyle, IFieldControl } from "../../interfaces";
import { InputTypes } from "../../enums";

@Component({
    selector: 'app-dynamic-form',
    templateUrl: './dynamic-form.component.html',
    styleUrls: ['./dynamic-form.component.scss'],
    standalone: true,
    imports: [InputFormComponent, UploadPhotoComponent, CommonModule, ReactiveFormsModule]
})
export class DynamicFormComponent implements OnChanges {
    @Input() fields: IFieldControl[] = [];
    @Input() form: FormGroup = new FormGroup({});
    @Input() customInputStyle: ICustomStyle = {};
    @Input() isSubmitted: boolean = false;
    @Input() errorSummary: string | null = null;
    @Output() photoSelected = new EventEmitter<{ fieldName: string; file: File }>();
    @Output() errorSummaryChange = new EventEmitter<string | null>();
    @Output() photoRemoved = new EventEmitter<string>();
    
    trackById = trackById;
    InputTypes = InputTypes;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['isSubmitted'] && this.isSubmitted) {
            this.form.markAllAsTouched();
            this.form.updateValueAndValidity({ emitEvent: true });
        }
    }

    onPhotoSelected(fieldName: string, file: File): void {
        this.photoSelected.emit({ fieldName, file });
    }

    onValidationError(errorMessage: string): void {
        this.errorSummary = errorMessage;
        this.errorSummaryChange.emit(errorMessage);
    }

    onPhotoRemoved(fieldName: string): void {
        this.photoRemoved.emit(fieldName);
    }
}