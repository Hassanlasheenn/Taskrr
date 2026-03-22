import { Injectable } from "@angular/core";
import { API_URLS } from "../../api.global";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { Observable, take } from "rxjs";
import { ILoginPayload, ILoginResponse, IRegisterPayload, IRegisterResponse } from "../interfaces";

@Injectable({
    providedIn: 'root',
})
export class AuthHttpService {
    private readonly oauth2Headers = new HttpHeaders({
        'Content-Type': 'application/x-www-form-urlencoded'
    });

    constructor(
        private readonly _http: HttpClient,
    ) {}

    registerUser(payload: IRegisterPayload): Observable<IRegisterResponse> {
        return this._http
        .post<IRegisterResponse>(API_URLS.auth.register, payload, { 
            withCredentials: true 
        })
        .pipe(take(1));
    }

    loginUser(payload: ILoginPayload): Observable<ILoginResponse> {
        const body = new HttpParams()
            .set('username', payload.username)
            .set('password', payload.password)
            .set('grant_type', 'password');

        return this._http
        .post<ILoginResponse>(
            API_URLS.auth.login, 
            body.toString(), 
            { 
                headers: this.oauth2Headers,
                withCredentials: true
            }
        )
        .pipe(take(1));
    }

    logout(): Observable<void> {
        return this._http
        .post<void>(API_URLS.auth.logout, {}, { withCredentials: true })
        .pipe(take(1));
    }
}

