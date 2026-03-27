import { Injectable } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { first } from 'rxjs/operators';

export type SessionExpiryChoice = 'refresh' | 'logout';

@Injectable({ providedIn: 'root' })
export class SessionExpiryDialogService {
    private readonly _visibleSubject = new BehaviorSubject<boolean>(false);
    private readonly _choiceSubject = new Subject<SessionExpiryChoice>();

    // Used by the interceptor to prevent multiple simultaneous refresh attempts
    isRefreshing = false;
    readonly refreshResult$ = new Subject<boolean>();

    get isVisible$(): Observable<boolean> {
        return this._visibleSubject.asObservable();
    }

    show(): Observable<SessionExpiryChoice> {
        this._visibleSubject.next(true);
        return this._choiceSubject.asObservable().pipe(first());
    }

    choose(choice: SessionExpiryChoice): void {
        this._visibleSubject.next(false);
        this._choiceSubject.next(choice);
    }
}
