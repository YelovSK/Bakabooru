import { Component, input, output, signal, HostListener, ElementRef, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface DropdownOption<T> {
  label: string;
  value: T;
}

@Component({
  selector: 'app-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dropdown.component.html',
  styleUrl: './dropdown.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DropdownComponent<T> {
  private elementRef = inject(ElementRef);

  // Inputs
  options = input.required<DropdownOption<T>[]>();
  value = input<T | null>(null);
  placeholder = input<string>('Select an option');
  label = input<string>('');

  // Outputs
  valueChange = output<T>();

  // State
  isOpen = signal(false);

  // Derived
  selectedOption = computed(() => {
    return this.options().find(opt => opt.value === this.value()) || null;
  });

  toggle() {
    this.isOpen.update(v => !v);
  }

  select(option: DropdownOption<T>) {
    this.valueChange.emit(option.value);
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }
}
