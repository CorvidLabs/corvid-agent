import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import type { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = environment.apiUrl;

    get<Result>(path: string): Observable<Result> {
        return this.http.get<Result>(`${this.baseUrl}${path}`);
    }

    post<Result>(path: string, body: unknown = {}): Observable<Result> {
        return this.http.post<Result>(`${this.baseUrl}${path}`, body);
    }

    put<Result>(path: string, body: unknown = {}): Observable<Result> {
        return this.http.put<Result>(`${this.baseUrl}${path}`, body);
    }

    delete<Result>(path: string): Observable<Result> {
        return this.http.delete<Result>(`${this.baseUrl}${path}`);
    }
}
