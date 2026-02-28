import { CommonModule } from "@angular/common";
import { Component, Input, OnChanges, OnDestroy, Output, EventEmitter } from "@angular/core";
import { animate, style, transition, trigger } from "@angular/animations";

@Component({
    selector: 'app-sidebar',
    templateUrl: './sidebar.component.html',
    styleUrls: ['./sidebar.component.scss'],
    standalone: true,
    imports: [CommonModule],
    animations: [
        trigger('slideInOut', [
            transition(':enter', [
                style({ transform: 'translateX(100%)' }),
                animate('300ms ease-out', style({ transform: 'translateX(0)' }))
            ]),
            transition(':leave', [
                animate('300ms ease-in', style({ transform: 'translateX(100%)' }))
            ])
        ]),
        trigger('fadeInOut', [
            transition(':enter', [
                style({ opacity: 0 }),
                animate('200ms ease-out', style({ opacity: 1 }))
            ]),
            transition(':leave', [
                animate('200ms ease-in', style({ opacity: 0 }))
            ])
        ])
    ]
})
export class SidebarComponent implements OnChanges, OnDestroy {
    @Input() isOpen: boolean = false;
    @Input() title: string = '';
    @Input() width: string = '400px';
    @Output() closed = new EventEmitter<void>();

    ngOnChanges(): void {
        this.updateBodyScrollLock();
    }

    ngOnDestroy(): void {
        this.setBodyScrollLock(false);
    }

    private updateBodyScrollLock(): void {
        this.setBodyScrollLock(this.isOpen);
    }

    private setBodyScrollLock(lock: boolean): void {
        const overflow = lock ? 'hidden' : '';
        document.documentElement.style.overflow = overflow;
        document.body.style.overflow = overflow;
        const pageWrapper = document.querySelector('.page-wrapper');
        if (pageWrapper instanceof HTMLElement) {
            pageWrapper.style.overflow = overflow;
        }
    }

    onClose(): void {
        this.setBodyScrollLock(false);
        this.closed.emit();
    }

    onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('sidebar-backdrop')) {
            this.onClose();
        }
    }

    onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Escape') {
            this.onClose();
        }
    }
}

