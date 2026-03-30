import { HttpErrorResponse } from '@angular/common/http';
import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  Optional,
  Output,
  Self,
} from '@angular/core';
import { NgControl } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ImageUploadService } from '../../core/services/image-upload.service';
import { ToastService } from '../../core/services/toast.service';

@Directive({
  selector: 'textarea[appPasteImage]',
  standalone: true,
})
export class PasteImageDirective implements OnDestroy {
  @Output() imageUploading = new EventEmitter<boolean>();

  private readonly _destroy$ = new Subject<void>();

  constructor(
    private readonly _el: ElementRef<HTMLTextAreaElement>,
    private readonly _imageUploadService: ImageUploadService,
    private readonly _toastService: ToastService,
    @Optional() @Self() private readonly _ngControl: NgControl,
  ) {}

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) return;
        this._uploadAndInsert(file);
        return;
      }
    }
  }

  private _uploadAndInsert(file: File): void {
    this.imageUploading.emit(true);
    this._imageUploadService
      .uploadImage(file)
      .pipe(takeUntil(this._destroy$))
      .subscribe({
        next: url => {
          this._insertAtCursor(`![image](${url})`);
          this.imageUploading.emit(false);
        },
        error: (error: HttpErrorResponse) => {
          let errorMessage = 'Failed to upload image';
          if (error.status === 503) {
            if (error.error && typeof error.error.detail === 'string') {
              errorMessage = `Image upload failed: ${error.error.detail}`;
            } else {
              errorMessage =
                'Image upload failed: Service is unavailable. Please contact support.';
            }
          } else if (error.error && typeof error.error.detail === 'string') {
            errorMessage = error.error.detail;
          }
          this._toastService.error(errorMessage);
          this.imageUploading.emit(false);
        },
      });
  }

  private _insertAtCursor(text: string): void {
    const el = this._el.nativeElement;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const newValue = el.value.slice(0, start) + text + el.value.slice(end);

    if (this._ngControl?.control) {
      this._ngControl.control.setValue(newValue);
      this._ngControl.control.markAsDirty();
    } else {
      el.value = newValue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }

    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + text.length;
      el.focus();
    });
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }
}
