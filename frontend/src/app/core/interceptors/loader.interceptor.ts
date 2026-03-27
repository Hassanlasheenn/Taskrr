import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { LoaderService } from '../services/loader.service';
import { Observable } from 'rxjs';

export const loaderInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const loaderService = inject(LoaderService);
  
  // Optionally skip loader for specific URLs if needed
  // if (req.url.includes('/notifications')) return next(req);

  loaderService.show();

  return next(req).pipe(
    finalize(() => {
      loaderService.hide();
    })
  );
};
