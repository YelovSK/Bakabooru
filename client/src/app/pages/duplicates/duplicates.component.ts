import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DuplicateService, DuplicateGroup, DuplicatePost } from '../../services/api/duplicate.service';
import { environment } from '../../../environments/environment';
import { FileNamePipe } from '@shared/pipes/file-name.pipe';
import { FileSizePipe } from '@shared/pipes/file-size.pipe';
import { getFileNameFromPath } from '@shared/utils/utils';
import { ConfirmService } from '@services/confirm.service';
import { ToastService } from '@services/toast.service';

@Component({
  selector: 'app-duplicates-page',
  standalone: true,
  imports: [CommonModule, RouterLink, FileNamePipe, FileSizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './duplicates.component.html',
})
export class DuplicatesPageComponent implements OnInit {
  groups = signal<DuplicateGroup[]>([]);
  loading = signal(true);

  exactCount = signal(0);
  perceptualCount = signal(0);

  mediaBase = environment.mediaBaseUrl;

  constructor(
    private duplicateService: DuplicateService,
    private confirmService: ConfirmService,
    private toast: ToastService,
  ) { }

  ngOnInit() {
    this.loadGroups();
  }

  loadGroups() {
    this.loading.set(true);
    this.duplicateService.getGroups().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.recountTypes();
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  keepAll(group: DuplicateGroup) {
    this.duplicateService.keepAll(group.id).subscribe(() => {
      this.groups.update(groups => groups.filter(g => g.id !== group.id));
      this.recountTypes();
    });
  }

  keepOne(group: DuplicateGroup, post: DuplicatePost) {
    this.confirmService.confirm({
      title: 'Keep One Post',
      message: `Keep "${getFileNameFromPath(post.relativePath)}" and remove the other ${group.posts.length - 1} post(s) from the booru?`,
      confirmText: 'Keep This',
      variant: 'danger',
    }).subscribe(confirmed => {
      if (!confirmed) return;

      this.duplicateService.keepOne(group.id, post.id).subscribe(() => {
        this.groups.update(groups => groups.filter(g => g.id !== group.id));
        this.recountTypes();
      });
    });
  }

  resolveAllExact() {
    const count = this.exactCount();

    this.confirmService.confirm({
      title: 'Resolve Exact Duplicates',
      message: `Resolve all ${count} exact duplicate groups? This keeps the oldest post and removes the others from the booru.`,
      confirmText: 'Resolve All',
      variant: 'danger',
    }).subscribe(confirmed => {
      if (!confirmed) return;

      this.duplicateService.resolveAllExact().subscribe({
        next: (result) => {
          this.loadGroups();
          this.toast.success(`Resolved ${result.resolved} exact duplicate groups.`);
        },
        error: (err) => this.toast.error('Failed: ' + (err?.message || 'Unknown error'))
      });
    });
  }

  onImageError(event: Event) {
    (event.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No image</text></svg>';
  }

  trackGroup(_: number, group: DuplicateGroup) { return group.id; }
  trackPost(_: number, post: DuplicatePost) { return post.id; }

  private recountTypes() {
    const groups = this.groups();
    this.exactCount.set(groups.filter(g => g.type === 'exact').length);
    this.perceptualCount.set(groups.filter(g => g.type === 'perceptual').length);
  }
}
