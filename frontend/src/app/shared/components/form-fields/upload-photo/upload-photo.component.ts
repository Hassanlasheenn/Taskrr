import { CommonModule } from "@angular/common";
import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, forwardRef, OnChanges, SimpleChanges, OnInit } from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from "@angular/forms";

@Component({
    selector: 'app-upload-photo',
    templateUrl: './upload-photo.component.html',
    styleUrls: ['./upload-photo.component.scss'],
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => UploadPhotoComponent),
            multi: true
        }
    ]
})
export class UploadPhotoComponent implements ControlValueAccessor, OnChanges, OnInit {
    @Input() label: string = 'Profile Photo';
    @Input() currentPhotoUrl: string | null = null;
    @Output() photoSelected = new EventEmitter<File>();
    @Output() validationError = new EventEmitter<string>();
    @Output() photoRemoved = new EventEmitter<void>();
    
    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
    
    previewUrl: string | null = null;
    value: File | null = null;
    displayPhotoUrl: string | null = null;
    private isRemoved: boolean = false;
    
    private onChange = (value: File | null) => {};
    private onTouched = () => {};

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (file) {
            this.handleFile(file);
        }
    }

    private handleFile(file: File): void {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.validationError.emit('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.validationError.emit('Image size should be less than 5MB');
            return;
        }

        // Reset removal flag when a new file is selected
        this.isRemoved = false;

        // Update value and notify form control
        this.value = file;
        this.onChange(file);
        this.onTouched();

        // Create preview
        const reader = new FileReader();
        reader.onload = (e: any) => {
            this.previewUrl = e.target.result;
        };
        reader.readAsDataURL(file);

        // Emit event
        this.photoSelected.emit(file);
    }

    triggerFileInput(): void {
        this.fileInput.nativeElement.click();
    }

    removePhoto(): void {
        this.value = null;
        this.onChange(null);
        this.onTouched();
        this.previewUrl = null;
        this.displayPhotoUrl = null;
        this.isRemoved = true;
        if (this.fileInput) {
            this.fileInput.nativeElement.value = '';
        }
        // Emit event to notify parent that photo was removed
        this.photoRemoved.emit();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['currentPhotoUrl']) {
            // Reset removal flag when currentPhotoUrl changes from parent
            if (changes['currentPhotoUrl'].previousValue !== changes['currentPhotoUrl'].currentValue) {
                this.isRemoved = false;
            }
            this.updateDisplayPhotoUrl();
        }
    }

    private updateDisplayPhotoUrl(): void {
        // Don't update displayPhotoUrl if photo was explicitly removed
        if (this.isRemoved) {
            this.displayPhotoUrl = null;
            return;
        }
        
        // Use currentPhotoUrl which can be a full URL or base64
        this.displayPhotoUrl = this.currentPhotoUrl || null;
    }

    get displayPhoto(): string | null {
        // Don't show photo if it was explicitly removed
        if (this.isRemoved) {
            return null;
        }
        // previewUrl (from new selection) takes precedence over displayPhotoUrl (from backend)
        return this.previewUrl || this.displayPhotoUrl;
    }

    get base64String(): string | null {
        // Extract base64 string from data URL (remove "data:image/type;base64," prefix)
        if (this.previewUrl) {
            return this.previewUrl.split(',')[1] || null;
        }
        return null;
    }

    get fullDataUrl(): string | null {
        // Return the full data URL (includes "data:image/type;base64," prefix)
        return this.previewUrl;
    }

    // ControlValueAccessor implementation
    writeValue(value: File | null): void {
        this.value = value;
        if (value instanceof File) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.previewUrl = e.target.result;
            };
            reader.readAsDataURL(value);
        } else {
            this.previewUrl = null;
        }
    }

    ngOnInit(): void {
        this.updateDisplayPhotoUrl();
    }

    registerOnChange(fn: (value: File | null) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        // Handle disabled state if needed
    }
}

