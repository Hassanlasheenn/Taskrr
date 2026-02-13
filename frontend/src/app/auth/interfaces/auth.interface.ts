export interface IRegisterPayload {
    username: string;
    email: string;
    password: string;
}

export interface IRegisterResponse {
    access_token?: string;
    token_type: string;
    data: IUserResponse;
}

export interface ILoginPayload {
    email: string;
    password: string;
}

export interface ILoginResponse {
    access_token?: string;
    token_type: string;
    data: IUserResponse;
}

export interface IUserResponse {
    id: number;
    username: string;
    email: string;
    photo?: string | null;
    role?: string;
}

export interface IUserListResponse {
    id: number;
    username: string;
    email: string;
    photo?: string | null;
    role: string;
}

export interface IUserRoleUpdate {
    role: "user" | "admin";
}