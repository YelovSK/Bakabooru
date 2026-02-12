import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { BakabooruService } from '@services/api/bakabooru/bakabooru.service';
import { AppPaths } from '@app/app.paths';

export const authGuard: CanActivateFn = (route, state) => {
  const bakabooru = inject(BakabooruService);
  const router = inject(Router);

  // TODO: I think I should have the user role and based on that validate shit.
  if (bakabooru.isLoggedIn()) {
    return true;
  }

  return router.parseUrl(`/${AppPaths.login}`);
};
