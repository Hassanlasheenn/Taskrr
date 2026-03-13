import { Component, Input, Output, EventEmitter, OnInit } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { IUserResponse } from "../../../../../auth/interfaces";
import { ReactiveFormService } from "../../../../../shared/services/reactive-form.service";
import { IFieldControl } from "../../../../../shared/interfaces/IFieldControl.interface";
import { CardComponent } from "../../../../../shared/components/card/card.component";
import { DynamicFormComponent } from "../../../../../shared/components/dynamic-form/dynamic-form.component";
import { PersonalDataFieldsService } from "../../services/personal-data-fields.service";

@Component({
    selector: 'app-personal-data',
    templateUrl: './personal-data.component.html',
    styleUrls: ['./personal-data.component.scss'],
    standalone: true,
    imports: [
        CommonModule,
        CardComponent,
        DynamicFormComponent
    ],
})
export class PersonalDataComponent implements OnInit {
    @Input() userData: IUserResponse | null = null;
    @Output() formSubmit = new EventEmitter<{ form: FormGroup; photoRemoved: boolean; updateCallback: (user: IUserResponse) => void }>();

    form: FormGroup = new FormGroup({});
    isSubmitted: boolean = false;
    errorSummary: string | null = null;
    fields: IFieldControl[] = [];
    photoRemoved: boolean = false;

    constructor(
        private readonly _formService: ReactiveFormService,
        private readonly _fieldsService: PersonalDataFieldsService
    ) {}

    ngOnInit(): void {
        this.initForm();
    }

    private initForm(): void {
        this.fields = this._fieldsService.getFields(this.userData?.photo || null);
        this.form = this._formService.initializeForm(this.fields);

        if (this.userData) {
            this.form.patchValue({
                username: this.userData.username || '',
                email: this.userData.email || '',
                photo: null
            });
        }
    }

    onPhotoSelected(): void {
        this.photoRemoved = false;
        this.errorSummary = null;
    }

    onErrorSummaryChange(errorMessage: string | null): void {
        this.errorSummary = errorMessage;
    }

    onPhotoRemoved(): void {
        this.photoRemoved = true;
        this.fields = this._fieldsService.updateFieldPhotoUrl(this.fields, null);
    }

    onSubmit(): void {
        if (this.form.invalid) {
            this.isSubmitted = true;
            return;
        }

        this.isSubmitted = false;
        this.errorSummary = null;
        this.formSubmit.emit({ 
            form: this.form, 
            photoRemoved: this.photoRemoved,
            updateCallback: (updatedUser: IUserResponse) => {
                this.fields = this._fieldsService.updateFieldPhotoUrl(this.fields, updatedUser.photo || null);
                this.form.patchValue({ photo: null });
                this.photoRemoved = false;
                this.form.markAsPristine();
            }
        });
    }

    hasChanges(): boolean {
        return this.form.dirty || this.photoRemoved;
    }
}

