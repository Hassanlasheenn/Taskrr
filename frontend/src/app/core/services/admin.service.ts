import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, take, map } from "rxjs";
import { API_URLS } from "../../api.global";
import { IUserListResponse, IUserRoleUpdate } from "../../auth/interfaces";
import { ITodoResponse } from "../interfaces/todo.interface";

export interface IUserWithTodos {
    user: IUserListResponse;
    todos: ITodoResponse[];
    todo_count: number;
}

export interface IUserListPaginatedResponse {
    users: IUserListResponse[];
    total: number;
}

@Injectable({
    providedIn: 'root',
})
export class AdminService {
    constructor(private readonly _http: HttpClient) {}

    listUsers(skip: number = 0, limit: number = 5): Observable<IUserListPaginatedResponse> {
        return this._http
            .get<IUserListPaginatedResponse>(`${API_URLS.admin.listUsers}?skip=${skip}&limit=${limit}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    getUsersWithTodos(skip: number = 0, limit: number = 6): Observable<IUserWithTodos[]> {
        return this._http
            .get<IUserWithTodos[]>(`${API_URLS.admin.listUsersWithTodos}?skip=${skip}&limit=${limit}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    deleteUser(userId: number): Observable<{ message: string }> {
        return this._http
            .delete<{ message: string }>(`${API_URLS.admin.deleteUser}/${userId}`, {
                withCredentials: true
            })
            .pipe(take(1));
    }

    updateUserRole(userId: number, role: "user" | "admin"): Observable<IUserListResponse> {
        return this._http
            .patch<IUserListResponse>(
                `${API_URLS.admin.updateUserRole}/${userId}/role`,
                { role } as IUserRoleUpdate,
                { withCredentials: true }
            )
            .pipe(take(1));
    }
}
