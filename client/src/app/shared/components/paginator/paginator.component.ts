import { Component, input, output, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type PageItem = number | '...';

@Component({
  selector: 'app-paginator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './paginator.component.html',
  styleUrl: './paginator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaginatorComponent {
  // Inputs
  currentPage = input.required<number>();
  totalPages = input.required<number>();
  visibleRange = input<number>(2);

  // Outputs
  pageChange = output<number>();

  // Computed
  pages = computed(() => {
    const current = this.currentPage();
    const total = this.totalPages();
    const range = this.visibleRange();
    
    const items: PageItem[] = [];
    
    if (total <= 1) return items;

    // Always show first page
    items.push(1);

    // Calculate middle range
    const start = Math.max(2, current - range);
    const end = Math.min(total - 1, current + range);

    // Add ellipsis if needed before the range
    if (start > 2) {
      items.push('...');
    }

    // Add the range
    for (let i = start; i <= end; i++) {
      items.push(i);
    }

    // Add ellipsis if needed after the range
    if (end < total - 1) {
      items.push('...');
    }

    // Always show last page
    items.push(total);

    return items;
  });

  onPageClick(page: PageItem) {
    if (page === '...') return;
    this.pageChange.emit(page);
  }

  onPrev() {
    if (this.currentPage() > 1) {
      this.pageChange.emit(this.currentPage() - 1);
    }
  }

  onNext() {
    if (this.currentPage() < this.totalPages()) {
      this.pageChange.emit(this.currentPage() + 1);
    }
  }
}
