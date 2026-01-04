import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { InputFormComponent, CardComponent, DynamicFormComponent } from './components';

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputFormComponent,
    CardComponent,
    DynamicFormComponent
  ],
  exports: [
    InputFormComponent,
    CardComponent,
    DynamicFormComponent
  ]
})
export class SharedModule {}

