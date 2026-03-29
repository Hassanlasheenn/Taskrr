import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ToastService, IToast } from '../../../core/services/toast.service';
import { trackById } from '../../helpers/trackByFn.helper';

@Component({
    selector: 'app-toast',
    templateUrl: './toast.component.html',
    styleUrls: ['./toast.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class ToastComponent implements OnInit, OnDestroy {
    toasts: IToast[] = [];
    private _destroy$ = new Subject<void>();
    trackById = trackById;

    constructor(
        private toastService: ToastService,
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit(): void {
        this.toastService.toasts$
            .pipe(takeUntil(this._destroy$))
            .subscribe(toasts => {
                this.toasts = toasts;
                this.cdr.detectChanges();
            });
    }

    removeToast(id: string, event?: Event): void {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        this.toastService.remove(id);
    }

    getIcon(type: string): string {
        switch (type) {
            case 'success': return 'bi-check-circle-fill';
            case 'error': return 'bi-x-circle-fill';
            case 'warning': return 'bi-exclamation-triangle-fill';
            case 'info': return 'bi-info-circle-fill';
            default: return 'bi-info-circle-fill';
        }
    }

    getTitle(type: string): string {
        switch (type) {
            case 'success': return 'Success';
            case 'error': return 'Error';
            case 'warning': return 'Warning';
            case 'info': return 'Info';
            default: return 'Notification';
        }
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}
