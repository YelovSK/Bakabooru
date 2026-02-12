import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface FormSelectOption<T> {
  label: string;
  value: T;
}

@Component({
  selector: 'app-form-select',
  standalone: true,
  templateUrl: './form-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormSelectComponent<T extends string | number | null> {
  options = input<FormSelectOption<T>[]>([]);
  value = input<T | null>(null);
  placeholder = input('Select...');
  valueChange = output<T | null>();

  stringify(value: T | null): string {
    return value === null ? '' : `${value}`;
  }

  onChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const raw = select.value;
    if (raw === '') {
      this.valueChange.emit(null);
      return;
    }

    const matchingOption = this.options().find(option => String(option.value) === raw);
    this.valueChange.emit((matchingOption?.value ?? null) as T | null);
  }
}
