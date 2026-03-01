import { Component, OnInit, OnDestroy, Input, ElementRef, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { NotificationService } from "../../../core/services/notification.service";
import { INotificationResponse } from "../../../core/interfaces/notification.interface";
import { LayoutPaths } from "../../../layouts/enums/layout-paths.enum";
import { Subject, takeUntil } from "rxjs";
import { trackById } from "../../helpers/trackByFn.helper";

@Component({
    selector: 'app-notifications',
    templateUrl: './notifications.component.html',
    styleUrls: ['./notifications.component.scss'],
    standalone: true,
    imports: [CommonModule]
})
export class NotificationsComponent implements OnInit, OnDestroy {
    @Input() maxVisible: number = 5;
    
    private readonly _destroy$ = new Subject<void>();
    notifications: INotificationResponse[] = [];
    unreadCount: number = 0;
    isOpen: boolean = false;
    trackById = trackById;

    constructor(
        private readonly _notificationService: NotificationService,
        private readonly _router: Router,
        private readonly _elementRef: ElementRef
    ) {}

    ngOnInit(): void {
        this._notificationService.notifications$.pipe(
            takeUntil(this._destroy$)
        ).subscribe(notifications => {
            this.notifications = notifications.slice(0, this.maxVisible);
        });

        this._notificationService.unreadCount$.pipe(
            takeUntil(this._destroy$)
        ).subscribe(count => {
            this.unreadCount = count;
        });

        this._notificationService.loadNotifications();
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
    }

    toggleDropdown(): void {
        this.isOpen = !this.isOpen;
    }

    @HostListener('document:click', ['$event'])
    onClickOutside(event: MouseEvent): void {
        if (this.isOpen && !this._elementRef.nativeElement.contains(event.target)) {
            this.isOpen = false;
        }
    }

    markAsRead(notification: INotificationResponse): void {
        if (!notification.is_read) {
            this._notificationService.markAsRead(notification.id).subscribe({
                next: () => {
                    const index = this.notifications.findIndex(n => n.id === notification.id);
                    if (index !== -1) {
                        this.notifications[index].is_read = true;
                        this._notificationService.loadNotifications();
                    }
                }
            });
        }
    }

    onNotificationClick(notification: INotificationResponse): void {
        this.markAsRead(notification);
        if (notification.todo_id != null) {
            this.isOpen = false;
            this._router.navigate([LayoutPaths.TODO_VIEW, notification.todo_id]);
        }
    }

    onNotificationKeyDown(event: KeyboardEvent, notification: INotificationResponse): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.onNotificationClick(notification);
        }
    }

    markAllAsRead(): void {
        this._notificationService.markAllAsRead().subscribe({
            next: () => {
                this._notificationService.loadNotifications();
            }
        });
    }

    deleteNotification(notificationId: number, event: Event): void {
        event.stopPropagation();
        this._notificationService.deleteNotification(notificationId).subscribe({
            next: () => {
                this.notifications = this.notifications.filter(n => n.id !== notificationId);
                this._notificationService.loadNotifications();
            }
        });
    }

    formatDate(dateString: string | null | undefined): string {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }
}
