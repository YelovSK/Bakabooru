import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BakabooruService } from '@services/api/bakabooru/bakabooru.service';
import {
  DeleteSameFolderDuplicateRequest,
  DuplicateGroup,
  DuplicatePost,
  ExcludedFile,
  ResolveSameFolderGroupRequest,
  SameFolderDuplicateGroup,
  SameFolderDuplicatePost
} from '@models';
import { FileNamePipe } from '@shared/pipes/file-name.pipe';
import { FileSizePipe } from '@shared/pipes/file-size.pipe';
import { getFileNameFromPath } from '@shared/utils/utils';
import { ConfirmService } from '@services/confirm.service';
import { ToastService } from '@services/toast.service';
import { TabsComponent } from '@shared/components/tabs/tabs.component';
import { TabComponent } from '@shared/components/tabs/tab.component';


@Component({
  selector: 'app-duplicates-page',
  standalone: true,
  imports: [CommonModule, RouterLink, FileNamePipe, FileSizePipe, TabsComponent, TabComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './duplicates.component.html',
})
export class DuplicatesPageComponent implements OnInit {
  private readonly bakabooru = inject(BakabooruService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  // Duplicate groups state
  groups = signal<DuplicateGroup[]>([]);
  loading = signal(true);
  exactCount = signal(0);
  perceptualCount = signal(0);

  // Excluded files state
  excludedFiles = signal<ExcludedFile[]>([]);
  excludedLoading = signal(true);

  // Same-folder duplicate groups state
  sameFolderGroups = signal<SameFolderDuplicateGroup[]>([]);
  sameFolderLoading = signal(true);


  ngOnInit() {
    this.loadGroups();
    this.loadExcludedFiles();
    this.loadSameFolderGroups();
  }

  // --- Duplicate Groups ---

  loadGroups() {
    this.loading.set(true);
    this.bakabooru.getDuplicateGroups().subscribe({
      next: (groups) => {
        this.groups.set(groups);
        this.recountTypes();
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  keepAll(group: DuplicateGroup) {
    this.bakabooru.keepAllInGroup(group.id).subscribe(() => {
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

      this.bakabooru.keepOneInGroup(group.id, post.id).subscribe(() => {
        this.groups.update(groups => groups.filter(g => g.id !== group.id));
        this.recountTypes();
        this.loadExcludedFiles();
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

      this.bakabooru.resolveAllExactDuplicates().subscribe({
        next: (result) => {
          this.loadGroups();
          this.loadExcludedFiles();
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

  // --- Same-Folder Duplicate Groups ---

  loadSameFolderGroups() {
    this.sameFolderLoading.set(true);
    this.bakabooru.getSameFolderDuplicateGroups().subscribe({
      next: (groups) => {
        this.sameFolderGroups.set(groups);
        this.sameFolderLoading.set(false);
      },
      error: () => this.sameFolderLoading.set(false)
    });
  }

  resolveAllSameFolder() {
    const groupCount = this.sameFolderGroups().length;
    this.confirmService.confirm({
      title: 'Resolve All Same-Folder Groups',
      message: `Auto-resolve all ${groupCount} same-folder duplicate group(s)? This keeps the highest-quality post and deletes the rest from disk.`,
      confirmText: 'Resolve All',
      variant: 'danger',
    }).subscribe(confirmed => {
      if (!confirmed) return;

      this.bakabooru.resolveAllSameFolderDuplicates().subscribe({
        next: (result) => {
          this.loadSameFolderGroups();
          this.loadGroups();
          this.loadExcludedFiles();
          this.toast.success(`Resolved ${result.resolvedGroups} group(s), deleted ${result.deletedPosts} post(s), skipped ${result.skippedGroups}.`);
        },
        error: () => this.toast.error('Failed to resolve same-folder duplicates.')
      });
    });
  }

  resolveSameFolderGroup(group: SameFolderDuplicateGroup) {
    const request: ResolveSameFolderGroupRequest = {
      parentDuplicateGroupId: group.parentDuplicateGroupId,
      libraryId: group.libraryId,
      folderPath: group.folderPath,
    };

    this.confirmService.confirm({
      title: 'Auto Resolve Folder Group',
      message: `Auto-resolve "${this.getFolderDisplayPath(group)}"? This keeps the highest-quality post and deletes ${Math.max(group.posts.length - 1, 0)} post(s) from disk.`,
      confirmText: 'Auto Resolve',
      variant: 'danger',
    }).subscribe(confirmed => {
      if (!confirmed) return;

      this.bakabooru.resolveSameFolderGroup(request).subscribe({
        next: (result) => {
          if (result.resolvedGroups > 0 || result.deletedPosts > 0) {
            this.sameFolderGroups.update(groups =>
              groups.filter(g =>
                !(g.parentDuplicateGroupId === group.parentDuplicateGroupId
                  && g.libraryId === group.libraryId
                  && g.folderPath === group.folderPath)));
          } else {
            this.loadSameFolderGroups();
          }

          this.loadGroups();
          this.loadExcludedFiles();
          this.toast.success(`Resolved ${result.resolvedGroups} group(s), deleted ${result.deletedPosts} post(s), skipped ${result.skippedGroups}.`);
        },
        error: () => this.toast.error('Failed to auto-resolve same-folder group.')
      });
    });
  }

  deleteSameFolderPost(group: SameFolderDuplicateGroup, post: SameFolderDuplicatePost) {
    const request: DeleteSameFolderDuplicateRequest = {
      parentDuplicateGroupId: group.parentDuplicateGroupId,
      libraryId: group.libraryId,
      folderPath: group.folderPath,
      postId: post.id,
    };

    this.confirmService.confirm({
      title: 'Delete Duplicate Post',
      message: `Delete "${getFileNameFromPath(post.relativePath)}" from disk and remove it from the booru?`,
      confirmText: 'Delete This',
      variant: 'danger',
    }).subscribe(confirmed => {
      if (!confirmed) return;

      this.bakabooru.deleteSameFolderDuplicate(request).subscribe({
        next: () => {
          this.removeSameFolderPostLocally(group, post.id);
          this.loadGroups();
          this.loadExcludedFiles();
          this.toast.success('Duplicate post deleted.');
        },
        error: () => this.toast.error('Failed to delete duplicate post.')
      });
    });
  }

  trackSameFolderGroup(_: number, group: SameFolderDuplicateGroup) {
    return `${group.parentDuplicateGroupId}:${group.libraryId}:${group.folderPath}`;
  }

  trackSameFolderPost(_: number, post: SameFolderDuplicatePost) {
    return post.id;
  }

  getFolderDisplayPath(group: SameFolderDuplicateGroup): string {
    return group.folderPath || '(library root)';
  }

  getSameFolderPostCount(): number {
    return this.sameFolderGroups().reduce((sum, group) => sum + group.posts.length, 0);
  }

  getRecommendedKeepFileName(group: SameFolderDuplicateGroup): string {
    const recommended = group.posts.find(post => post.id === group.recommendedKeepPostId);
    return recommended ? getFileNameFromPath(recommended.relativePath) : 'Unknown';
  }

  isRecommendedKeep(group: SameFolderDuplicateGroup, post: SameFolderDuplicatePost): boolean {
    return group.recommendedKeepPostId === post.id;
  }

  // --- Excluded Files ---

  loadExcludedFiles() {
    this.excludedLoading.set(true);
    this.bakabooru.getExcludedFiles().subscribe({
      next: (files) => {
        this.excludedFiles.set(files);
        this.excludedLoading.set(false);
      },
      error: () => this.excludedLoading.set(false)
    });
  }

  onExcludedRowClick(file: ExcludedFile) {
    this.confirmService.confirm({
      title: 'Restore Excluded File',
      message: `Remove "${getFileNameFromPath(file.relativePath)}" from the exclusion list? It will be re-imported on the next scan.`,
      confirmText: 'Restore',
      variant: 'warning',
    }).subscribe(confirmed => {
      if (!confirmed) return;

      this.bakabooru.unexcludeFile(file.id).subscribe({
        next: () => {
          this.excludedFiles.update(files => files.filter(f => f.id !== file.id));
          this.toast.success('File removed from exclusion list.');
        },
        error: () => this.toast.error('Failed to restore file.')
      });
    });
  }

  getExcludedFileContentUrl(file: ExcludedFile): string {
    return this.bakabooru.getExcludedFileContentUrl(file.id);
  }

  getThumbnailUrl(post: DuplicatePost | SameFolderDuplicatePost): string {
    return this.bakabooru.getThumbnailUrl(post.thumbnailLibraryId, post.thumbnailContentHash);
  }

  onExcludedImageError(event: Event) {
    (event.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23374151" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="%239CA3AF" font-size="12">No image</text></svg>';
  }

  private removeSameFolderPostLocally(group: SameFolderDuplicateGroup, postId: number) {
    this.sameFolderGroups.update(groups => {
      const updated: SameFolderDuplicateGroup[] = [];

      for (const current of groups) {
        const isTargetGroup =
          current.parentDuplicateGroupId === group.parentDuplicateGroupId
          && current.libraryId === group.libraryId
          && current.folderPath === group.folderPath;

        if (!isTargetGroup) {
          updated.push(current);
          continue;
        }

        const remainingPosts = current.posts.filter(p => p.id !== postId);
        if (remainingPosts.length < 2) {
          continue;
        }

        const recommendedKeepPostId = this.selectBestQualityPostId(remainingPosts);
        updated.push({
          ...current,
          recommendedKeepPostId,
          posts: remainingPosts,
        });
      }

      return updated;
    });
  }

  private selectBestQualityPostId(posts: SameFolderDuplicatePost[]): number {
    return [...posts]
      .sort((a, b) => {
        const pixelsA = a.width * a.height;
        const pixelsB = b.width * b.height;
        if (pixelsA !== pixelsB) return pixelsB - pixelsA;
        if (a.sizeBytes !== b.sizeBytes) return b.sizeBytes - a.sizeBytes;
        const fileModifiedA = Date.parse(a.fileModifiedDate);
        const fileModifiedB = Date.parse(b.fileModifiedDate);
        if (fileModifiedA !== fileModifiedB) return fileModifiedB - fileModifiedA;
        return b.id - a.id;
      })[0].id;
  }

  private recountTypes() {
    const groups = this.groups();
    this.exactCount.set(groups.filter(g => g.type === 'exact').length);
    this.perceptualCount.set(groups.filter(g => g.type === 'perceptual').length);
  }
}
