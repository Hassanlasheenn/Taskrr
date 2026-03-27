import { Injectable, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class UserActivityService implements OnDestroy {
    private _lastActivityTime = Date.now();
    private readonly _platformId = inject(PLATFORM_ID);
    private readonly _events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    private readonly _handler = () => { this._lastActivityTime = Date.now(); };

    constructor() {
        if (isPlatformBrowser(this._platformId)) {
            this._events.forEach(event =>
                document.addEventListener(event, this._handler, { passive: true })
            );
        }
    }

    // Returns true if the user has interacted within the given threshold (default 5 min)
    isUserActive(thresholdMs = 5 * 60 * 1000): boolean {
        return Date.now() - this._lastActivityTime < thresholdMs;
    }

    ngOnDestroy(): void {
        if (isPlatformBrowser(this._platformId)) {
            this._events.forEach(event =>
                document.removeEventListener(event, this._handler)
            );
        }
    }
}
