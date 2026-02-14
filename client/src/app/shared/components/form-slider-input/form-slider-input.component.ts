import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-form-slider-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './form-slider-input.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FormSliderInputComponent {
  label = input<string>('');
  value = input<number>(0);
  min = input<number>(0);
  max = input<number>(100);
  step = input<number>(1);
  disabled = input<boolean>(false);
  emitMode = input<'input' | 'change'>('input');
  suffix = input<string>('');
  prefix = input<string>('');
  trackWidthClass = input<string>('w-36');
  valueMinWidthClass = input<string>('min-w-[3.5rem]');

  valueChange = output<number>();

  displayValue = computed(() => `${this.prefix()}${this.value()}${this.suffix()}`);

  handleInput(event: Event): void {
    if (this.emitMode() !== 'input') {
      return;
    }
    this.emitFromEvent(event);
  }

  handleChange(event: Event): void {
    if (this.emitMode() !== 'change') {
      return;
    }
    this.emitFromEvent(event);
  }

  private emitFromEvent(event: Event): void {
    const target = event.target as HTMLInputElement;
    const next = Number(target.value);
    if (Number.isNaN(next)) {
      return;
    }

    this.valueChange.emit(next);
  }
}
