import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, OnInit, OnDestroy, OnChanges, Output, SimpleChanges, ViewChild, ElementRef } from "@angular/core";
import { FormGroup, ReactiveFormsModule, AbstractControl } from "@angular/forms";
import { ICustomStyle, IFieldControl } from "../../../interfaces";
import { InputTypes } from "../../../enums";
import { ReactiveFormService } from "../../../services/reactive-form.service";
import { Subscription } from "rxjs";
import { PasteImageDirective } from "../../../directives/paste-image.directive";
import { ImageUploadService } from "../../../../core/services/image-upload.service";
import { ToastService } from "../../../../core/services/toast.service";

@Component({
    selector: 'app-textarea-form',
    templateUrl: './textarea.component.html',
    styleUrls: ['./textarea.component.scss'],
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, PasteImageDirective]
})
export class TextareaFormComponent implements OnInit, OnDestroy, OnChanges {
    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
    @Input() label: string = '';
    @Input() placeholder?: string;
    @Input() value: string = '';
    @Input() name: string = '';
    @Input() formGroup: FormGroup = new FormGroup({});
    @Input() customInputStyle: ICustomStyle = {};
    @Input() customInputClass?: string;
    @Input() field?: IFieldControl;
    @Input() showErrors: boolean = false;
    @Input() rows: number = 3;
    @Input() showImagePreviews: boolean = true;
    @Input() imagePreviewMode: 'grid' | 'carousel' | 'filmstrip' = 'grid';
    @Input() disableInternalLightbox: boolean = false;
    @Input() showAttachHint: boolean = false;
    @Input() disabled: boolean = false;

    @Output() previewActiveChange = new EventEmitter<boolean>();
    @Output() imageClick = new EventEmitter<string>();

    isUploading: boolean = false;
    previewUrl: string | null = null;
    carouselIndex = 0;
    galleryOpen = false;

    errorMessage: string | null = null;
    private readonly subscriptions: Subscription[] = [];

    constructor(
        private readonly formService: ReactiveFormService,
        private readonly _imageUploadService: ImageUploadService,
        private readonly _toastService: ToastService
    ) {}

    ngOnInit() {
        this.setupValidation();
    }

    ngOnDestroy() {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['showErrors'] && !changes['showErrors'].firstChange) {
            this.updateErrorMessage();
        }
        if (changes['disabled']) {
            if (this.disabled) {
                this.control?.disable({ emitEvent: false });
            } else {
                this.control?.enable({ emitEvent: false });
            }
        }
    }

    private setupValidation(): void {
        const control = this.formGroup.get(this.name);
        if (!control) return;

        const valueSub = control.valueChanges.subscribe(() => {
            this.updateErrorMessage();
        });
        this.subscriptions.push(valueSub);

        const statusSub = control.statusChanges.subscribe(() => {
            this.updateErrorMessage();
        });
        this.subscriptions.push(statusSub);
    }

    get control(): AbstractControl | null {
        return this.formGroup.get(this.name);
    }

    get isInvalid(): boolean {
        const control = this.control;
        return !!(control && control.invalid && (this.showErrors || (control.touched && control.dirty)));
    }

    // Clean text (no image markdown) shown in the visible textarea
    get cleanDisplayValue(): string {
        const value = this.control?.value || '';
        return value.replace(/\n?!\[image\]\(((?:https?:\/\/|\/)[^)]+)\)/g, '').trimEnd();
    }

    // Image URLs extracted from the control value
    get computedImageUrls(): string[] {
        if (!this.showImagePreviews) return [];
        const value = this.control?.value || '';
        const regex = /!\[image\]\(((?:https?:\/\/|\/)[^)]+)\)/g;
        const urls: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = regex.exec(value)) !== null) {
            urls.push(match[1]);
        }
        return urls;
    }

    getInputClasses(): { [key: string]: boolean } {
        const classes: { [key: string]: boolean } = {
            'input-error': this.isInvalid,
            'disabled': this.disabled
        };
        if (this.customInputClass) {
            classes[this.customInputClass] = true;
        }
        return classes;
    }

    updateErrorMessage(): void {
        if (this.field) {
            this.errorMessage = this.formService.getValidationError(this.control, this.field, this.showErrors);
        }
    }

    // Called from the visible textarea when showImagePreviews = true
    onVisibleTextareaInput(event: Event): void {
        const el = event.target as HTMLTextAreaElement;
        const inputValue = el.value;

        // If the paste directive inserted image markdown, strip it from the visible textarea
        const hasImageMarkdown = /!\[image\]\(((?:https?:\/\/|\/)[^)]+)\)/.test(inputValue);
        let textPart = inputValue;
        const newUrls: string[] = [];

        if (hasImageMarkdown) {
            const imgRegex = /!\[image\]\(((?:https?:\/\/|\/)[^)]+)\)/g;
            let m;
            while ((m = imgRegex.exec(inputValue)) !== null) {
                newUrls.push(m[1]);
            }
            textPart = inputValue.replace(/\n?!\[image\]\(((?:https?:\/\/|\/)[^)]+)\)/g, '');
            el.value = textPart;
        }

        // Preserve existing image URLs already in the control
        const existingUrls = this._extractImageUrls(this.control?.value || '');
        const allUrls = [...new Set([...existingUrls, ...newUrls])];
        const imagePart = allUrls.length > 0 ? '\n' + allUrls.map(u => `![image](${u})`).join('\n') : '';

        this.control?.setValue(textPart + imagePart, { emitEvent: false });
        this.control?.markAsDirty();
        this.updateErrorMessage();
    }

    onVisibleTextareaBlur(): void {
        this.control?.markAsTouched();
        this.updateErrorMessage();
    }

    onImageUploading(uploading: boolean): void {
        this.isUploading = uploading;
    }

    openGallery(): void {
        this.galleryOpen = true;
        this.previewActiveChange.emit(true);
    }

    closeGallery(): void {
        this.galleryOpen = false;
        if (!this.previewUrl) {
            this.previewActiveChange.emit(false);
        }
    }

    openPreview(url: string): void {
        if (this.disableInternalLightbox) {
            this.imageClick.emit(url);
            return;
        }
        this.previewUrl = url;
        this.carouselIndex = this.computedImageUrls.indexOf(url);
        if (this.carouselIndex === -1) this.carouselIndex = 0;
        this.previewActiveChange.emit(true);
        this._setBodyScrollLock(true);
    }

    closePreview(): void {
        this.previewUrl = null;
        if (!this.galleryOpen) {
            this.previewActiveChange.emit(false);
        }
        this._setBodyScrollLock(false);
    }

    downloadImage(url: string | null): void {
        if (!url) return;
        
        const filename = url.split('/').pop() || 'image';
        
        fetch(url)
            .then(response => response.blob())
            .then(blob => {
                const blobUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(blobUrl);
            })
            .catch(err => {
                console.error('Download failed:', err);
                window.open(url, '_blank');
            });
    }

    onAttachIconClick(): void {
        this.fileInput.nativeElement.click();
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        // Check if it is an image
        if (!file.type.startsWith('image/')) {
            this._toastService.error('Only image files are allowed');
            return;
        }

        this.isUploading = true;
        this._imageUploadService.uploadImage(file).subscribe({
            next: (url: string) => {
                this.isUploading = false;
                this._insertMarkdownAtCursor(`![image](${url})`);
                input.value = ''; // Reset input
            },
            error: (err) => {
                this.isUploading = false;
                this._toastService.error(err?.error?.detail || 'Failed to upload image');
                input.value = '';
            }
        });
    }

    private _insertMarkdownAtCursor(markdown: string): void {
        const control = this.control;
        if (!control) return;

        const currentValue = control.value || '';
        const newValue = currentValue ? `${currentValue}\n${markdown}` : markdown;
        
        control.setValue(newValue, { emitEvent: true });
        control.markAsDirty();
        this.updateErrorMessage();
    }

    private _setBodyScrollLock(lock: boolean): void {
        const overflow = lock ? 'hidden' : '';
        document.documentElement.style.overflow = overflow;
        document.body.style.overflow = overflow;
    }

    removeImage(url: string): void {
        const control = this.control;
        if (!control) return;
        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const newValue = (control.value as string).replace(new RegExp(`\\n?!\\[image\\]\\(${escaped}\\)`, 'g'), '');
        control.setValue(newValue);
        control.markAsDirty();
        // Keep carousel index in bounds after removal
        const remaining = this.computedImageUrls.length;
        if (this.carouselIndex >= remaining && this.carouselIndex > 0) {
            this.carouselIndex = remaining - 1;
        }
        if (remaining === 0) {
            this.galleryOpen = false;
            this.previewActiveChange.emit(false);
        }
    }

    nextSlide(): void {
        if (this.carouselIndex < this.computedImageUrls.length - 1) {
            this.carouselIndex++;
        }
    }

    prevSlide(): void {
        if (this.carouselIndex > 0) {
            this.carouselIndex--;
        }
    }

    goToSlide(index: number): void {
        this.carouselIndex = index;
    }

    private _extractImageUrls(value: string): string[] {
        const regex = /!\[image\]\(((?:https?:\/\/|\/)[^)]+)\)/g;
        const urls: string[] = [];
        let match;
        while ((match = regex.exec(value)) !== null) {
            urls.push(match[1]);
        }
        return urls;
    }
}
