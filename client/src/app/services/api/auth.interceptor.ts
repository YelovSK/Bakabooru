import { HttpInterceptorFn } from "@angular/common/http";
import { inject } from "@angular/core";
import { BakabooruService } from "./bakabooru/bakabooru.service";
import { environment } from "@env/environment";

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const bakabooru = inject(BakabooruService);
  const auth = bakabooru.authHeader();

  // Only add auth header to internal API requests
  const isInternalApi = req.url.startsWith(environment.apiBaseUrl);

  if (isInternalApi && auth && !req.headers.has("Authorization")) {
    req = req.clone({
      setHeaders: {
        Authorization: auth,
      },
    });
  }

  return next(req);
};
