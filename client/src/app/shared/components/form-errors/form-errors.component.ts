import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgControl } from '@angular/forms';

@Component({
  selector: 'app-form-errors',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './form-errors.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FormErrorsComponent {
  control = input.required<NgControl | null>();
  label = input<string>();
}
