import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, take } from "rxjs";
import { API_BASE_URL } from "../../api.global";
import { ITodoCreate, ITodoUpdate, ITodoResponse, ITodoListResponse, ITodoComment, ITodoCommentListResponse } from "../interfaces/todo.interface";

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

    getTodo(userId: number, todoId: number): Observable<ITodoResponse> {
        return this._http
            .get<ITodoResponse>(`${this._baseUrl}/${todoId}?user_id=${userId}`, {
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

    getTodoComments(userId: number, todoId: number): Observable<ITodoCommentListResponse> {
        return this._http
            .get<ITodoCommentListResponse>(`${this._baseUrl}/${todoId}/comments?user_id=${userId}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    addTodoComment(userId: number, todoId: number, content: string, mentionedUserIds?: number[]): Observable<ITodoComment> {
        const body = mentionedUserIds?.length
            ? { content, mentioned_user_ids: mentionedUserIds }
            : { content };
        return this._http
            .post<ITodoComment>(`${this._baseUrl}/${todoId}/comments?user_id=${userId}`, body, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    updateTodoComment(userId: number, todoId: number, commentId: number, content: string): Observable<ITodoComment> {
        return this._http
            .put<ITodoComment>(`${this._baseUrl}/${todoId}/comments/${commentId}?user_id=${userId}`, { content }, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    deleteTodoComment(userId: number, todoId: number, commentId: number): Observable<void> {
        return this._http
            .delete<void>(`${this._baseUrl}/${todoId}/comments/${commentId}?user_id=${userId}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }
}

