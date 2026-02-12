import { Injectable, OnDestroy } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, Subject, takeUntil, BehaviorSubject, interval } from "rxjs";
import { API_URLS } from "../../api.global";
import { INotificationResponse, INotificationListResponse } from "../interfaces/notification.interface";
import { AuthService } from "../../auth/services/auth.service";

@Injectable({
    providedIn: 'root',
})
export class NotificationService implements OnDestroy {
    private readonly _destroy$ = new Subject<void>();
    private ws: WebSocket | null = null;
    private reconnectTimeout: any = null;
    private isConnecting: boolean = false;
    private pollingInterval: any = null;
    private intervalValue: any = null;

    private readonly _notifications$ = new BehaviorSubject<INotificationResponse[]>([]);
    private readonly _unreadCount$ = new BehaviorSubject<number>(0);
    private readonly _notificationEvents$ = new Subject<INotificationResponse>();
    
    public notifications$ = this._notifications$.asObservable();
    public unreadCount$ = this._unreadCount$.asObservable();
    public notificationEvents$ = this._notificationEvents$.asObservable();

    constructor(
        private readonly _http: HttpClient,
        private readonly _authService: AuthService
    ) {
        this.checkAndConnect();
    }

    ngOnDestroy(): void {
        this._destroy$.next();
        this._destroy$.complete();
        this.disconnect();
    }

    private checkAndConnect(): void {
        let lastUserId: number | null = null;
        
        interval(1000).pipe(takeUntil(this._destroy$)).subscribe(() => {
            const userId = this._authService.getCurrentUserId();
            const isAuthenticated = this._authService.isAuthenticated();
            
            // If user changed, disconnect and clear notifications
            if (lastUserId !== null && userId !== lastUserId && this.ws) {
                this.disconnect();
                this._notifications$.next([]);
                this._unreadCount$.next(0);
            }
            
            if (isAuthenticated && userId && !this.ws && !this.isConnecting) {
                this.initializeWebSocket();
                lastUserId = userId;
            } else if (!isAuthenticated && this.ws) {
                this.disconnect();
                // Clear notifications when user logs out
                this._notifications$.next([]);
                this._unreadCount$.next(0);
                lastUserId = null;
            } else if (isAuthenticated && userId) {
                lastUserId = userId;
            }
        });
        
        interval(10000).pipe(takeUntil(this._destroy$)).subscribe(() => {
            const isAuthenticated = this._authService.isAuthenticated();
            if (isAuthenticated && (!this.ws || this.ws.readyState !== WebSocket.OPEN)) {
                this.loadNotifications();
            }
        });
    }

    private initializeWebSocket(): void {
        const userId = this._authService.getCurrentUserId();
        const token = this._authService.getToken();
        
        if (!userId || !token || this.isConnecting || this.ws) {
            return;
        }

        this.isConnecting = true;
        const wsUrl = API_URLS.notifications.websocket(userId);
        const wsTokenUrl = `${wsUrl}?token=${token}`;
        
        try {
            this.ws = new WebSocket(wsTokenUrl);
            
            const connectionTimeout = setTimeout(() => {
                if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.close();
                    this.isConnecting = false;
                    if (!this.pollingInterval) {
                        this.startPolling();
                    }
                }
            }, 5000);
            
            // Store timeout reference for cleanup
            (this.ws as any)._connectionTimeout = connectionTimeout;
            
            this.ws.onopen = () => {
                clearTimeout(connectionTimeout);
                this.isConnecting = false;
                this.stopPolling();
                this.loadNotifications();
                this.startInterval();
            };
            
            this.ws.onmessage = (event) => {
                if(event.data === "pong") {
                    return;
                }
                
                try {
                    const notification: INotificationResponse = JSON.parse(event.data);
                    this.addNotification(notification);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };
            
            this.ws.onerror = (error) => {
                clearTimeout(connectionTimeout);
                this.isConnecting = false;
                // Don't log WebSocket errors to console as they're expected during connection attempts
                if (!this.pollingInterval) {
                    this.startPolling();
                }
            };
            
            this.ws.onclose = (event) => {
                clearTimeout(connectionTimeout);
                this.stopInterval();
                this.ws = null;
                this.isConnecting = false;
                
                // Start polling as fallback if WebSocket is not available
                if (!this.pollingInterval) {
                    this.startPolling();
                }
                
                // Don't reconnect for policy violations (1008) - these are authentication failures
                // Don't reconnect for normal closures (1000) or going away (1001)
                // Only reconnect for unexpected closures
                const shouldReconnect = this._authService.isAuthenticated() && 
                    event.code !== 1000 && // Normal closure
                    event.code !== 1001 && // Going away
                    event.code !== 1008 && // Policy violation (auth failure)
                    event.code !== 4001 && // Custom: user logged out
                    event.code !== 4003 && // Custom: session expired
                    event.code !== 4004;   // Custom: invalid token
                
                if (shouldReconnect) {
                    if (this.reconnectTimeout) {
                        clearTimeout(this.reconnectTimeout);
                    }
                    // Exponential backoff: wait longer on each retry
                    const delay = Math.min(30000, 10000 * Math.pow(2, 0)); // Start with 10s, max 30s
                    this.reconnectTimeout = setTimeout(() => {
                        if (this._authService.isAuthenticated() && !this.ws && !this.isConnecting) {
                            this.initializeWebSocket();
                        }
                    }, delay);
                }
            };
        } catch (error) {
            this.isConnecting = false;
            // If WebSocket creation fails, fall back to polling
            if (!this.pollingInterval) {
                this.startPolling();
            }
        }
    }

    private addNotification(notification: INotificationResponse): void {
        // Only add notification if it belongs to the current logged-in user
        const currentUserId = this._authService.getCurrentUserId();
        if (!currentUserId || notification.user_id !== currentUserId) {
            return; // Ignore notifications for other users
        }
        
        const current = this._notifications$.value;
        const exists = current.some(n => n.id === notification.id);
        if (!exists) {
            this._notifications$.next([notification, ...current]);
            
            if (!notification.is_read) {
                this._unreadCount$.next(this._unreadCount$.value + 1);
            }
            this._notificationEvents$.next(notification);
        }
    }

    getNotifications(skip: number = 0, limit: number = 100): Observable<INotificationListResponse> {
        return this._http
            .get<INotificationListResponse>(`${API_URLS.notifications.getNotifications}?skip=${skip}&limit=${limit}`, {
                withCredentials: true
            })
            .pipe(takeUntil(this._destroy$));
    }

    markAsRead(notificationId: number): Observable<INotificationResponse> {
        return this._http
            .put<INotificationResponse>(
                API_URLS.notifications.markAsRead(notificationId),
                {},
                { withCredentials: true }
            )
            .pipe(takeUntil(this._destroy$));
    }

    markAllAsRead(): Observable<{ message: string }> {
        return this._http
            .put<{ message: string }>(
                API_URLS.notifications.markAllAsRead,
                {},
                { withCredentials: true }
            )
            .pipe(takeUntil(this._destroy$));
    }

    deleteNotification(notificationId: number): Observable<{ message: string }> {
        return this._http
            .delete<{ message: string }>(
                API_URLS.notifications.deleteNotification(notificationId),
                { withCredentials: true }
            )
            .pipe(takeUntil(this._destroy$));
    }

    loadNotifications(): void {
        const currentUserId = this._authService.getCurrentUserId();
        if (!currentUserId) {
            // Clear notifications if user is not authenticated
            this._notifications$.next([]);
            this._unreadCount$.next(0);
            return;
        }
        
        this.getNotifications().subscribe({
            next: (response) => {
                // Double-check: filter notifications by current user ID (backend should already do this, but extra safety)
                const currentUserId = this._authService.getCurrentUserId();
                const filteredNotifications = response.notifications.filter(
                    n => n.user_id === currentUserId
                );
                
                const currentNotifications = this._notifications$.value;
                const currentIds = new Set(currentNotifications.map(n => n.id));
                const newIds = new Set(filteredNotifications.map(n => n.id));
                
                // Find new notifications that weren't in the current list
                const newlyAddedNotifications = filteredNotifications.filter(n => !currentIds.has(n.id));
                
                // Emit events for newly added notifications
                newlyAddedNotifications.forEach(notification => {
                    this._notificationEvents$.next(notification);
                });
                
                this._notifications$.next(filteredNotifications);
                this._unreadCount$.next(response.unread_count);
            },
            error: (error) => {
                // Silently fail - polling will retry on next interval
                // WebSocket will handle real-time updates when available
            }
        });
    }

    connectWebSocket(): void {
        if (!this.ws && !this.isConnecting) {
            this.initializeWebSocket();
        }
    }

    private startInterval(): void {
        this.stopInterval();
        this.intervalValue = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send("ping");
            }
        }, 30000);
    }

    private stopInterval(): void {
        if (this.intervalValue) {
            clearInterval(this.intervalValue);
            this.intervalValue = null;
        }
    }

    disconnect(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnecting = false;
        this.stopPolling();
        this.stopInterval();
        // Clear notifications when disconnecting
        this._notifications$.next([]);
        this._unreadCount$.next(0);
    }

    private startPolling(): void {
        if (this.pollingInterval) {
            return;
        }
        this.pollingInterval = setInterval(() => {
            if (this._authService.isAuthenticated()) {
                this.loadNotifications();
            } else {
                this.stopPolling();
            }
        }, 10000);
    }

    private stopPolling(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }
}