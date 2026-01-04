import { InputTypes } from "../enums";

export interface IFieldControl {
    id?: string | number;
    label: string;
    type: InputTypes;
    placeholder: string;
    formControlName: string;
    value: string;
    disabled?: boolean;
    required?: boolean;
    options?: IDropdownOptions[];
    validations: IValidations[];
    customInputClass?: string;
}

export interface IDropdownOptions {
    key: number;
    value: string;
}

export interface IValidations {
    type: string;
    message: string;
    value?: any;
}

export interface ICustomStyle {
    [key: string]: string;
}