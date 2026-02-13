import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { BakabooruService } from '@services/api/bakabooru/bakabooru.service';
import { BakabooruSystemInfoDto } from '@services/api/bakabooru/models';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FileSizePipe } from '@shared/pipes/file-size.pipe';

@Component({
    selector: 'app-info',
    standalone: true,
    imports: [CommonModule, DecimalPipe, DatePipe, FileSizePipe],
    templateUrl: './info.component.html',
    styleUrl: './info.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InfoComponent implements OnInit {
    private readonly bakabooru = inject(BakabooruService);

    info = signal<BakabooruSystemInfoDto | null>(null);

    ngOnInit() {
        this.bakabooru.getGlobalInfo().subscribe(info => {
            this.info.set(info);
        });
    }
}
