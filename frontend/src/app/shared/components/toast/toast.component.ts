import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ToastService, IToast } from '../../../core/services/toast.service';

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

    constructor(private toastService: ToastService) {}

    ngOnInit(): void {
        this.toastService.toasts$
            .pipe(takeUntil(this._destroy$))
            .subscribe(toasts => {
                this.toasts = toasts;
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

    trackById(index: number, toast: IToast): string {
        return toast.id;
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }
}

