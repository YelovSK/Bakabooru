import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, tap } from 'rxjs';

import { BakabooruService, Library } from '@services/api/bakabooru/bakabooru.service';
import { ButtonComponent } from '@shared/components/button/button.component';
import { ToastService } from '@services/toast.service';

@Component({
    selector: 'app-libraries',
    standalone: true,
    imports: [CommonModule, FormsModule, ButtonComponent],
    templateUrl: './libraries.component.html',
    styleUrl: './libraries.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibrariesComponent {
    private readonly bakabooru = inject(BakabooruService);
    private readonly toast = inject(ToastService);

    newLibraryName = signal('');
    isLoading = signal(false);
    private refreshTrigger = signal(0);

    libraries = toSignal(
        toObservable(this.refreshTrigger).pipe(
            switchMap(() => this.bakabooru.getLibraries()),
            catchError(err => {
                console.error(err);
                this.toast.error('Failed to load libraries');
                return of([]);
            })
        ),
        { initialValue: [] as Library[] }
    );

    createLibrary() {
        const name = this.newLibraryName().trim();
        if (!name) return;

        this.isLoading.set(true);
        this.bakabooru.createLibrary(name).subscribe({
            next: () => {
                this.toast.success(`Library "${name}" created`);
                this.newLibraryName.set('');
                this.refreshTrigger.update(v => v + 1);
                this.isLoading.set(false);
            },
            error: (err) => {
                this.toast.error(err.error?.description || 'Failed to create library');
                this.isLoading.set(false);
            }
        });
    }

    deleteLibrary(lib: Library) {
        if (!confirm(`Are you sure you want to delete the library "${lib.path}"?`)) return;

        this.isLoading.set(true);
        this.bakabooru.deleteLibrary(lib.id).subscribe({
            next: () => {
                this.toast.success(`Library "${lib.path}" deleted`);
                this.refreshTrigger.update(v => v + 1);
                this.isLoading.set(false);
            },
            error: (err) => {
                this.toast.error(err.error?.description || 'Failed to delete library');
                this.isLoading.set(false);
            }
        });
    }
}
