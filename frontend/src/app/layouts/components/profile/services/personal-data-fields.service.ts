import { Injectable } from "@angular/core";
import { IFieldControl } from "../../../../shared/interfaces/IFieldControl.interface";
import { InputTypes } from "../../../../shared/enums/input-types.enum";
import { ValidatorTypes } from "../../../../shared/enums/validator-types.enum";
import { RegexPatterns } from "../../../../shared/enums/regex-patterns.enum";

@Injectable({
    providedIn: 'root'
})
export class PersonalDataFieldsService {
    getFields(photoUrl: string | null = null): IFieldControl[] {
        return [
            {
                label: 'Profile Photo',
                type: InputTypes.UPLOAD_PHOTO,
                formControlName: 'photo',
                placeholder: '',
                value: '',
                required: false,
                validations: [],
                photoUrl: photoUrl,
            },
            {
                label: 'Username',
                type: InputTypes.TEXT,
                formControlName: 'username',
                placeholder: 'Enter your username',
                value: '',
                required: true,
                validations: [
                    { type: ValidatorTypes.REQUIRED, message: 'Username is required' },
                    { type: ValidatorTypes.MINLENGTH, message: 'Username must be at least 3 characters', value: 3 }
                ],
            },
            {
                label: 'Email',
                type: InputTypes.EMAIL,
                formControlName: 'email',
                placeholder: 'Enter your email',
                value: '',
                required: true,
                validations: [
                    { type: ValidatorTypes.REQUIRED, message: 'Email is required' },
                    { type: ValidatorTypes.EMAIL, message: 'Please enter a valid email address', value: RegexPatterns.EMAIL }
                ],
            },
        ];
    }

    updateFieldPhotoUrl(fields: IFieldControl[], photoUrl: string | null): IFieldControl[] {
        const photoFieldIndex = fields.findIndex(field => field.formControlName === 'photo');
        if (photoFieldIndex === -1) return fields;

        return [
            ...fields.slice(0, photoFieldIndex),
            { ...fields[photoFieldIndex], photoUrl },
            ...fields.slice(photoFieldIndex + 1)
        ];
    }
}

