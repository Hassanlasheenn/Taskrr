import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, take } from "rxjs";
import { API_BASE_URL } from "../../api.global";
import { ITodoCreate, ITodoUpdate, ITodoResponse, ITodoListResponse, ITodoComment, ITodoCommentListResponse, ITodoCommentHistoryResponse, ITodoHistoryResponse, ITodoFilter } from "../interfaces/todo.interface";

@Injectable({
    providedIn: 'root',
})
export class TodoService {
    private readonly _baseUrl = `${API_BASE_URL}/todos`;

    constructor(private readonly _http: HttpClient) {}

    getTodos(userId: number, skip: number = 0, limit: number = 100, sortOrder: 'asc' | 'desc' = 'desc', filter?: ITodoFilter, todoType?: string, includeSubtasks: boolean = false): Observable<ITodoListResponse> {
        let url = `${this._baseUrl}?user_id=${userId}&skip=${skip}&limit=${limit}&sort_order=${sortOrder}`;
        if (filter?.title) url += `&title=${encodeURIComponent(filter.title)}`;
        if (filter?.priority) url += `&priority=${encodeURIComponent(filter.priority)}`;
        if (filter?.status) url += `&status=${encodeURIComponent(filter.status)}`;
        if (filter?.created_from) url += `&created_from=${filter.created_from}`;
        if (filter?.created_to) url += `&created_to=${filter.created_to}`;
        if (filter?.type) url += `&todo_type=${encodeURIComponent(filter.type)}`;
        if (todoType) url += `&todo_type=${encodeURIComponent(todoType)}`;
        if (includeSubtasks) url += `&include_subtasks=true`;
        return this._http
            .get<ITodoListResponse>(url, { withCredentials: true })
            .pipe(take(1));
    }

    getAssignedTodos(userId: number, skip: number = 0, limit: number = 100): Observable<ITodoListResponse> {
        return this._http
            .get<ITodoListResponse>(`${this._baseUrl}?assigned_user_id=${userId}&skip=${skip}&limit=${limit}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    getTodo(userId: number, todoId: number, includeSubtasks: boolean = false): Observable<ITodoResponse> {
        let url = `${this._baseUrl}/${todoId}?user_id=${userId}`;
        if (includeSubtasks) {
            url += '&include_subtasks=true';
        }
        return this._http
            .get<ITodoResponse>(url, {
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

    addTodoComment(userId: number, todoId: number, content: string, mentionedUserIds?: number[], attachment?: File): Observable<ITodoComment> {
        const formData = new FormData();
        formData.append('content', content);
        if (mentionedUserIds?.length) {
            formData.append('mentioned_user_ids', JSON.stringify(mentionedUserIds));
        }
        if (attachment) {
            formData.append('attachment', attachment);
        }

        return this._http
            .post<ITodoComment>(`${this._baseUrl}/${todoId}/comments?user_id=${userId}`, formData, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    updateTodoComment(userId: number, todoId: number, commentId: number, content: string, deleteAttachment: boolean = false, attachment?: File): Observable<ITodoComment> {
        const formData = new FormData();
        formData.append('content', content);
        if (attachment) {
            formData.append('attachment', attachment);
        }

        return this._http
            .put<ITodoComment>(`${this._baseUrl}/${todoId}/comments/${commentId}?user_id=${userId}&delete_attachment=${deleteAttachment}`, formData, {
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

    getCommentHistory(userId: number, todoId: number): Observable<ITodoCommentHistoryResponse> {
        return this._http
            .get<ITodoCommentHistoryResponse>(`${this._baseUrl}/${todoId}/comment-history?user_id=${userId}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    getTodoHistory(userId: number, todoId: number): Observable<ITodoHistoryResponse> {
        return this._http
            .get<ITodoHistoryResponse>(`${this._baseUrl}/${todoId}/history?user_id=${userId}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    getSubtasks(userId: number, todoId: number): Observable<ITodoListResponse> {
        return this._http
            .get<ITodoListResponse>(`${this._baseUrl}/${todoId}/subtasks?user_id=${userId}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    createSubtask(userId: number, parentId: number, subtask: ITodoCreate): Observable<ITodoResponse> {
        return this._http
            .post<ITodoResponse>(`${this._baseUrl}/${parentId}/subtasks?user_id=${userId}`, subtask, {
                withCredentials: true
            })
            .pipe(take(1));
    }
}

