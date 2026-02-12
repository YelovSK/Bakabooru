import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { BakabooruService } from '@services/api/bakabooru/bakabooru.service';
import { GlobalInfo } from '@services/api/oxibooru/models';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';

@Component({
    selector: 'app-info',
    standalone: true,
    imports: [CommonModule, DecimalPipe, DatePipe],
    templateUrl: './info.component.html',
    styleUrl: './info.component.css'
})
export class InfoComponent implements OnInit, OnDestroy {
    private readonly bakabooru = inject(BakabooruService);

    info = signal<GlobalInfo | null>(null);
    activeJobs = signal<any[]>([]);
    private refreshInterval: any;

    ngOnInit() {
        this.bakabooru.getGlobalInfo().subscribe(info => {
            this.info.set(info);
        });

        this.loadJobs();
        this.refreshInterval = setInterval(() => this.loadJobs(), 5000);
    }

    ngOnDestroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }

    loadJobs() {
        this.bakabooru.getJobs().subscribe(jobs => {
            this.activeJobs.set(jobs);
        });
    }

    onScanAll() {
        this.bakabooru.scanAllLibraries().subscribe(() => {
            this.loadJobs();
        });
    }

    onCancelJob(jobId: string) {
        this.bakabooru.cancelJob(jobId).subscribe(() => {
            this.loadJobs();
        });
    }

    formatSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
