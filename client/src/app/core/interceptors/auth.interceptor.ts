import type { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    if (!environment.apiKey) {
        return next(req);
    }

    const authed = req.clone({
        setHeaders: {
            Authorization: `Bearer ${environment.apiKey}`,
        },
    });

    return next(authed);
};
