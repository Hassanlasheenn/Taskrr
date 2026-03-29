import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface IToast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

@Injectable({
    providedIn: 'root'
})
export class ToastService {
    private _toasts = new BehaviorSubject<IToast[]>([]);
    public readonly toasts$ = this._toasts.asObservable();

    private generateId(): string {
        return Math.random().toString(36).substring(2, 9);
    }

    show(message: string, type: ToastType = 'info', duration: number = 4000): void {
        const toast: IToast = {
            id: this.generateId(),
            message,
            type,
            duration
        };

        this._toasts.next([...this._toasts.value, toast]);

        if (duration > 0) {
            setTimeout(() => this.remove(toast.id), duration);
        }
    }

    success(message: string, duration?: number): void {
        this.show(message, 'success', duration ?? 4000);
    }

    error(message: string, duration?: number): void {
        this.show(message, 'error', duration ?? 5000);
    }

    warning(message: string, duration?: number): void {
        this.show(message, 'warning', duration);
    }

    info(message: string, duration?: number): void {
        this.show(message, 'info', duration);
    }

    remove(id: string): void {
        this._toasts.next(this._toasts.value.filter(t => t.id !== id));
    }

    clear(): void {
        this._toasts.next([]);
    }
}

