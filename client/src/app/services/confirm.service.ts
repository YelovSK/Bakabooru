import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { take } from 'rxjs/operators';

import { ButtonVariant } from '@shared/components/button/button.component';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ButtonVariant;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmService {
  private result$ = new Subject<boolean>();

  options = signal<ConfirmOptions | null>(null);

  confirm(options: ConfirmOptions): Observable<boolean> {
    this.options.set(options);

    return this.result$.pipe(take(1));
  }

  resolve(result: boolean): void {
    this.result$.next(result);
    this.options.set(null);
  }
}
