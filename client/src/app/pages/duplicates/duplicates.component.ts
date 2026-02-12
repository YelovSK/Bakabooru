import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DuplicateService, DuplicateGroup, DuplicatePost } from '../../services/api/duplicate.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-duplicates-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container mx-auto p-6">
      <h1 class="text-3xl font-bold mb-2 text-terminal-green">Duplicate Detection</h1>
      <p class="text-gray-400 mb-6">Review and resolve duplicate posts. Run "Find Duplicates" from the Jobs page to detect new groups.</p>

      <!-- Summary Bar -->
      <div class="flex gap-4 mb-6">
        <div class="bg-gray-900 border border-gray-700 rounded-lg px-6 py-4 flex-1">
          <div class="text-3xl font-bold text-white">{{ groups().length }}</div>
          <div class="text-sm text-gray-400">Unresolved Groups</div>
        </div>
        <div class="bg-gray-900 border border-gray-700 rounded-lg px-6 py-4 flex-1">
          <div class="text-3xl font-bold text-blue-400">{{ exactCount() }}</div>
          <div class="text-sm text-gray-400">Exact (Content Hash)</div>
        </div>
        <div class="bg-gray-900 border border-gray-700 rounded-lg px-6 py-4 flex-1">
          <div class="text-3xl font-bold text-purple-400">{{ perceptualCount() }}</div>
          <div class="text-sm text-gray-400">Perceptual (dHash)</div>
        </div>
      </div>

      <!-- Bulk Actions -->
      <div *ngIf="exactCount() > 0" class="mb-6">
        <button (click)="resolveAllExact()"
                class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition-colors">
          Deduplicate All Exact ({{ exactCount() }} groups)
        </button>
        <span class="text-xs text-gray-500 ml-3">Keeps the oldest post in each group</span>
      </div>

      <!-- Empty State -->
      <div *ngIf="!loading() && groups().length === 0" class="text-center py-16">
        <div class="text-6xl mb-4">✓</div>
        <h2 class="text-xl font-semibold text-white mb-2">No duplicates found</h2>
        <p class="text-gray-400">Run "Find Duplicates" from the Jobs page to scan for duplicates.</p>
      </div>

      <!-- Loading -->
      <div *ngIf="loading()" class="text-center py-16 text-gray-400">Loading...</div>

      <!-- Duplicate Groups -->
      <div *ngFor="let group of groups(); trackBy: trackGroup" class="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6 shadow-lg">
        <!-- Group Header -->
        <div class="flex justify-between items-center mb-4">
          <div class="flex items-center gap-3">
            <span [class]="group.type === 'exact'
              ? 'bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold'
              : 'bg-purple-600 text-white px-2 py-1 rounded text-xs font-bold'">
              {{ group.type === 'exact' ? 'EXACT' : 'PERCEPTUAL' }}
            </span>
            <span *ngIf="group.similarityPercent" class="text-sm text-gray-400">
              ~{{ group.similarityPercent }}% similar
            </span>
            <span class="text-sm text-gray-500">
              {{ group.posts.length }} posts · detected {{ group.detectedDate | date:'short' }}
            </span>
          </div>
          <button (click)="keepAll(group)"
                  class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm transition-colors">
            Keep All
          </button>
        </div>

        <!-- Thumbnails Grid -->
        <div class="grid gap-4" [style.gridTemplateColumns]="'repeat(' + Math.min(group.posts.length, 4) + ', 1fr)'">
          <div *ngFor="let post of group.posts; trackBy: trackPost"
               class="relative group/card bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-terminal-green transition-colors cursor-pointer"
               (click)="keepOne(group, post)">
            <!-- Thumbnail -->
            <div class="aspect-square overflow-hidden">
              <img [src]="mediaBase + post.thumbnailUrl" [alt]="post.relativePath"
                   class="w-full h-full object-cover" loading="lazy"
                   (error)="onImageError($event)">
            </div>
            <!-- Info overlay -->
            <div class="p-3">
              <div class="text-xs text-gray-400 truncate mb-1" [title]="post.relativePath">{{ getFileName(post.relativePath) }}</div>
              <div class="flex justify-between text-xs text-gray-500">
                <span>{{ post.width }}×{{ post.height }}</span>
                <span>{{ formatSize(post.sizeBytes) }}</span>
              </div>
            </div>
            <!-- Keep this overlay on hover -->
            <div class="absolute inset-0 bg-black/60 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center">
              <span class="bg-terminal-green text-black font-bold px-4 py-2 rounded text-sm">Keep This</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class DuplicatesPageComponent implements OnInit {
  groups = signal<DuplicateGroup[]>([]);
  loading = signal(true);

  exactCount = signal(0);
  perceptualCount = signal(0);

  mediaBase = environment.mediaBaseUrl;
  Math = Math;

  constructor(private duplicateService: DuplicateService) { }

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
    if (!confirm(`Keep "${this.getFileName(post.relativePath)}" and remove the other ${group.posts.length - 1} post(s) from the booru?`))
      return;

    this.duplicateService.keepOne(group.id, post.id).subscribe(() => {
      this.groups.update(groups => groups.filter(g => g.id !== group.id));
      this.recountTypes();
    });
  }

  resolveAllExact() {
    const count = this.exactCount();
    if (!confirm(`Resolve all ${count} exact duplicate groups? This keeps the oldest post and removes the others from the booru.`))
      return;

    this.duplicateService.resolveAllExact().subscribe({
      next: (result) => {
        this.loadGroups();
        alert(`Resolved ${result.resolved} exact duplicate groups.`);
      },
      error: (err) => alert('Failed: ' + err.message)
    });
  }

  getFileName(path: string): string {
    return path.split(/[/\\]/).pop() || path;
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
