import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

export type DataTableSortDirection = 'asc' | 'desc';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  value: (row: T) => string | number | null | undefined;
}

export interface DataTableSort {
  key: string;
  direction: DataTableSortDirection;
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  templateUrl: './data-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent<T extends object> {
  columns = input.required<DataTableColumn<T>[]>();
  rows = input<T[]>([]);
  emptyText = input('No data');
  rowClickable = input(true);
  initialSort = input<DataTableSort | null>(null);
  trackBy = input<(row: T, index: number) => string | number>((_row, index) => index);

  rowClick = output<T>();
  sortChange = output<DataTableSort>();

  private sortState = signal<DataTableSort | null>(null);

  sortedRows = computed(() => {
    const rows = this.rows();
    const sort = this.sortState() ?? this.initialSort();
    if (!sort) return rows;

    const column = this.columns().find(col => col.key === sort.key);
    if (!column?.sortable) return rows;

    return [...rows].sort((a, b) => {
      const aValue = column.value(a);
      const bValue = column.value(b);
      const aNormalized = typeof aValue === 'string' ? aValue.toLowerCase() : aValue ?? '';
      const bNormalized = typeof bValue === 'string' ? bValue.toLowerCase() : bValue ?? '';

      if (aNormalized < bNormalized) return sort.direction === 'asc' ? -1 : 1;
      if (aNormalized > bNormalized) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });
  });

  onHeaderClick(column: DataTableColumn<T>): void {
    if (!column.sortable) return;

    const current = this.sortState() ?? this.initialSort();
    const next: DataTableSort =
      current?.key === column.key
        ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key: column.key, direction: 'asc' };

    this.sortState.set(next);
    this.sortChange.emit(next);
  }

  onRowClick(row: T): void {
    if (!this.rowClickable()) return;
    this.rowClick.emit(row);
  }

  getAlignClass(column: DataTableColumn<T>): string {
    if (column.align === 'center') return 'text-center';
    if (column.align === 'right') return 'text-right';
    return 'text-left';
  }

  isSorted(column: DataTableColumn<T>): boolean {
    const sort = this.sortState() ?? this.initialSort();
    return sort?.key === column.key;
  }

  sortDirection(column: DataTableColumn<T>): DataTableSortDirection | null {
    const sort = this.sortState() ?? this.initialSort();
    return sort?.key === column.key ? sort.direction : null;
  }
}
