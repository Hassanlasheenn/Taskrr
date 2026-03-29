import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ITodo } from '../interfaces/todo.interface';

@Injectable({
    providedIn: 'root'
})
export class TodoDetailDialogService {
    private readonly _todo$ = new BehaviorSubject<ITodo | null>(null);
    private readonly _todoUpdated$ = new BehaviorSubject<ITodo | null>(null);

    getTodo(): Observable<ITodo | null> {
        return this._todo$.asObservable();
    }

    get todoUpdated$(): Observable<ITodo | null> {
        return this._todoUpdated$.asObservable();
    }

    open(todo: ITodo): void {
        this._todo$.next(todo);
    }

    close(): void {
        this._todo$.next(null);
    }

    notifyUpdate(todo: ITodo): void {
        this._todoUpdated$.next(todo);
    }
}
