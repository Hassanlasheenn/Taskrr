import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, take } from "rxjs";
import { API_BASE_URL } from "../../api.global";

export interface ITodoCreate {
    title: string;
    description?: string;
    priority: 'low' | 'medium' | 'high';
}

export interface ITodoUpdate {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    completed?: boolean;
}


export interface ITodoResponse {
    id: number;
    title: string;
    description?: string;
    completed: boolean;
    priority: string;
    order_index: number;
    created_at?: string;
    updated_at?: string;
    user_id: number;
}

export interface ITodoListResponse {
    todos: ITodoResponse[];
    total: number;
}

@Injectable({
    providedIn: 'root',
})
export class TodoService {
    private readonly _baseUrl = `${API_BASE_URL}/todos`;

    constructor(private readonly _http: HttpClient) {}

    getTodos(userId: number): Observable<ITodoListResponse> {
        return this._http
            .get<ITodoListResponse>(`${this._baseUrl}?user_id=${userId}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    createTodo(userId: number, todo: ITodoCreate): Observable<ITodoResponse> {
        return this._http
            .post<ITodoResponse>(`${this._baseUrl}?user_id=${userId}`, todo, {
                withCredentials: true
            })
            .pipe(take(1));
    }
    
    updateTodo(userId: number, todoId: number, todo: ITodoUpdate): Observable<ITodoResponse> {
        return this._http
            .put<ITodoResponse>(`${this._baseUrl}/${todoId}?user_id=${userId}`, todo, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    deleteTodo(userId: number, todoId: number): Observable<{ message: string }> {
        return this._http
            .delete<{ message: string }>(`${this._baseUrl}/${todoId}?user_id=${userId}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }
}

