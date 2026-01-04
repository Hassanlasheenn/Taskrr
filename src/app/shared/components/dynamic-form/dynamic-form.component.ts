import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { InputFormComponent } from "../form-fields/input/input.component";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { trackById } from "../../helpers";
import { ICustomStyle, IFieldControl } from "../../interfaces";

@Component({
    selector: 'app-dynamic-form',
    templateUrl: './dynamic-form.component.html',
    styleUrls: ['./dynamic-form.component.scss'],
    standalone: true,
    imports: [InputFormComponent, CommonModule, ReactiveFormsModule]
})
export class DynamicFormComponent implements OnChanges {
    @Input() fields: IFieldControl[] = [];
    @Input() form: FormGroup = new FormGroup({});
    @Input() customInputStyle: ICustomStyle = {};
    @Input() isSubmitted: boolean = false;
    
    trackById = trackById;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['isSubmitted'] && this.isSubmitted) {
            this.form.markAllAsTouched();
            this.form.updateValueAndValidity({ emitEvent: true });
        }
    }
}