import { TestBed } from '@angular/core/testing';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
    provideHttpClient,
    withInterceptors,
    HttpErrorResponse,
} from '@angular/common/http';

import { ApiService } from './api.service';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { environment } from '../../../environments/environment';

describe('ApiService', () => {
    let service: ApiService;
    let httpTesting: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(withInterceptors([authInterceptor])),
                provideHttpClientTesting(),
            ],
        });

        service = TestBed.inject(ApiService);
        httpTesting = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpTesting.verify();
    });

    // ──────────────────────────────────────────────
    // GET
    // ──────────────────────────────────────────────
    describe('get()', () => {
        it('should send a GET request to the correct URL', () => {
            const mockData = { id: 1, name: 'test' };

            service.get<typeof mockData>('/agents').subscribe((data) => {
                expect(data).toEqual(mockData);
            });

            const req = httpTesting.expectOne(`${environment.apiUrl}/agents`);
            expect(req.request.method).toBe('GET');
            req.flush(mockData);
        });

        it('should prepend the base URL from environment', () => {
            service.get('/sessions/abc').subscribe();

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/sessions/abc`,
            );
            expect(req.request.url).toBe(`${environment.apiUrl}/sessions/abc`);
            req.flush({});
        });

        it('should propagate HTTP errors to the subscriber', () => {
            let receivedError: HttpErrorResponse | undefined;

            service.get('/fail').subscribe({
                error: (err: HttpErrorResponse) => {
                    receivedError = err;
                },
            });

            const req = httpTesting.expectOne(`${environment.apiUrl}/fail`);
            req.flush('Not Found', {
                status: 404,
                statusText: 'Not Found',
            });

            expect(receivedError).toBeDefined();
            expect(receivedError!.status).toBe(404);
        });

        it('should return typed response data', () => {
            interface Agent {
                id: string;
                name: string;
            }

            const mockAgent: Agent = { id: 'a1', name: 'CorvidAgent' };

            service.get<Agent>('/agents/a1').subscribe((agent) => {
                expect(agent.id).toBe('a1');
                expect(agent.name).toBe('CorvidAgent');
            });

            const req = httpTesting.expectOne(`${environment.apiUrl}/agents/a1`);
            req.flush(mockAgent);
        });
    });

    // ──────────────────────────────────────────────
    // POST
    // ──────────────────────────────────────────────
    describe('post()', () => {
        it('should send a POST request with body', () => {
            const body = { content: 'hello' };
            const mockResponse = { success: true };

            service
                .post<typeof mockResponse>('/messages', body)
                .subscribe((res) => {
                    expect(res).toEqual(mockResponse);
                });

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/messages`,
            );
            expect(req.request.method).toBe('POST');
            expect(req.request.body).toEqual(body);
            req.flush(mockResponse);
        });

        it('should default to empty object body when none provided', () => {
            service.post('/actions').subscribe();

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/actions`,
            );
            expect(req.request.body).toEqual({});
            req.flush({});
        });

        it('should propagate server errors on POST', () => {
            let receivedError: HttpErrorResponse | undefined;

            service
                .post('/sessions', { name: 'test' })
                .subscribe({
                    error: (err: HttpErrorResponse) => {
                        receivedError = err;
                    },
                });

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/sessions`,
            );
            req.flush(
                { message: 'Validation failed' },
                { status: 422, statusText: 'Unprocessable Entity' },
            );

            expect(receivedError).toBeDefined();
            expect(receivedError!.status).toBe(422);
        });
    });

    // ──────────────────────────────────────────────
    // PUT
    // ──────────────────────────────────────────────
    describe('put()', () => {
        it('should send a PUT request with body', () => {
            const body = { name: 'updated' };

            service.put('/agents/a1', body).subscribe();

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/agents/a1`,
            );
            expect(req.request.method).toBe('PUT');
            expect(req.request.body).toEqual(body);
            req.flush({ name: 'updated' });
        });

        it('should default to empty object body when none provided', () => {
            service.put('/agents/a1').subscribe();

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/agents/a1`,
            );
            expect(req.request.body).toEqual({});
            req.flush({});
        });

        it('should propagate 500 errors on PUT', () => {
            let receivedError: HttpErrorResponse | undefined;

            service.put('/agents/a1', { name: 'fail' }).subscribe({
                error: (err: HttpErrorResponse) => {
                    receivedError = err;
                },
            });

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/agents/a1`,
            );
            req.flush(null, {
                status: 500,
                statusText: 'Internal Server Error',
            });

            expect(receivedError).toBeDefined();
            expect(receivedError!.status).toBe(500);
        });
    });

    // ──────────────────────────────────────────────
    // DELETE
    // ──────────────────────────────────────────────
    describe('delete()', () => {
        it('should send a DELETE request to the correct URL', () => {
            service.delete('/sessions/s1').subscribe();

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/sessions/s1`,
            );
            expect(req.request.method).toBe('DELETE');
            req.flush(null);
        });

        it('should return response data from DELETE', () => {
            const mockResponse = { deleted: true };

            service
                .delete<typeof mockResponse>('/agents/a1')
                .subscribe((res) => {
                    expect(res).toEqual(mockResponse);
                });

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/agents/a1`,
            );
            req.flush(mockResponse);
        });

        it('should propagate 403 errors on DELETE', () => {
            let receivedError: HttpErrorResponse | undefined;

            service.delete('/agents/a1').subscribe({
                error: (err: HttpErrorResponse) => {
                    receivedError = err;
                },
            });

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/agents/a1`,
            );
            req.flush(
                { error: 'Forbidden' },
                { status: 403, statusText: 'Forbidden' },
            );

            expect(receivedError).toBeDefined();
            expect(receivedError!.status).toBe(403);
        });
    });

    // ──────────────────────────────────────────────
    // Auth header injection (via authInterceptor)
    // ──────────────────────────────────────────────
    describe('auth header injection', () => {
        it('should attach Authorization header when apiKey is present', () => {
            // The environment.apiKey is set at module load time.
            // If a key is configured, requests should include it.
            service.get('/agents').subscribe();

            const req = httpTesting.expectOne(`${environment.apiUrl}/agents`);

            if (environment.apiKey) {
                expect(req.request.headers.get('Authorization')).toBe(
                    `Bearer ${environment.apiKey}`,
                );
            } else {
                // When no key is set, no Authorization header should be added
                expect(req.request.headers.has('Authorization')).toBe(false);
            }

            req.flush([]);
        });

        it('should send requests to the environment base URL', () => {
            service.get('/health').subscribe();

            const req = httpTesting.expectOne(`${environment.apiUrl}/health`);
            expect(req.request.url).toContain('/api');
            req.flush({ status: 'ok' });
        });
    });

    // ──────────────────────────────────────────────
    // Edge cases
    // ──────────────────────────────────────────────
    describe('edge cases', () => {
        it('should handle empty response body on GET', () => {
            let result: unknown;

            service.get('/empty').subscribe((data) => {
                result = data;
            });

            const req = httpTesting.expectOne(`${environment.apiUrl}/empty`);
            req.flush(null);

            expect(result).toBeNull();
        });

        it('should handle array response body', () => {
            const mockList = [{ id: 1 }, { id: 2 }];

            service.get<typeof mockList>('/list').subscribe((data) => {
                expect(data).toHaveLength(2);
                expect(data[0]['id']).toBe(1);
            });

            const req = httpTesting.expectOne(`${environment.apiUrl}/list`);
            req.flush(mockList);
        });

        it('should handle network error (status 0)', () => {
            let receivedError: HttpErrorResponse | undefined;

            service.get('/network-fail').subscribe({
                error: (err: HttpErrorResponse) => {
                    receivedError = err;
                },
            });

            const req = httpTesting.expectOne(
                `${environment.apiUrl}/network-fail`,
            );
            req.error(
                new ProgressEvent('error'),
                { status: 0, statusText: 'Unknown Error' },
            );

            expect(receivedError).toBeDefined();
            expect(receivedError!.status).toBe(0);
        });

        it('should handle POST with complex nested body', () => {
            const complexBody = {
                agent: { id: 'a1', config: { model: 'claude', temperature: 0.7 } },
                messages: [{ role: 'user', content: 'hello' }],
            };

            service.post('/chat', complexBody).subscribe();

            const req = httpTesting.expectOne(`${environment.apiUrl}/chat`);
            expect(req.request.body).toEqual(complexBody);
            req.flush({ sessionId: 's1' });
        });
    });
});
