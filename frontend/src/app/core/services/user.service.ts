import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, take } from "rxjs";
import { API_URLS } from "../../api.global";
import { IUserResponse } from "../../auth/interfaces";

@Injectable({
    providedIn: 'root',
})
export class UserService {

    constructor(
        private readonly _http: HttpClient,
    ) {}

    getUserById(userId: number): Observable<IUserResponse> {
        return this._http
        .get<IUserResponse>(`${API_URLS.user.getUserById}/${userId}`, {
            withCredentials: true
        })
        .pipe(take(1));
    }

    updateUser(userId: number, formData: FormData): Observable<IUserResponse> {
        return this._http
        .put<IUserResponse>(`${API_URLS.user.updateUser}/${userId}`, formData, {
            withCredentials: true
        })
        .pipe(take(1));
    }
}