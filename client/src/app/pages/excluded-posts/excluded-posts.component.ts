import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BakabooruService } from '@services/api/bakabooru/bakabooru.service';
import { ExcludedFile } from '@models';
import { ButtonComponent } from '@shared/components/button/button.component';

@Component({
    selector: 'app-excluded-posts-page',
    standalone: true,
    imports: [CommonModule, ButtonComponent],
    templateUrl: './excluded-posts.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExcludedPostsPageComponent {
    private readonly bakabooru = inject(BakabooruService);

    readonly files = signal<ExcludedFile[]>([]);
    readonly loading = signal(true);

    constructor() {
        this.loadFiles();
    }

    private loadFiles(): void {
        this.loading.set(true);
        this.bakabooru.getExcludedFiles().subscribe({
            next: files => {
                this.files.set(files);
                this.loading.set(false);
            },
            error: () => this.loading.set(false),
        });
    }

    restore(file: ExcludedFile): void {
        this.bakabooru.unexcludeFile(file.id).subscribe({
            next: () => this.files.update(list => list.filter(f => f.id !== file.id)),
        });
    }

    trackFile(_: number, file: ExcludedFile): number {
        return file.id;
    }
}
