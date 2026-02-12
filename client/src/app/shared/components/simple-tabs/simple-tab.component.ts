import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-simple-tab',
  standalone: true,
  imports: [CommonModule],
  template: `<ng-content></ng-content>`,
  host: {
    'class': 'flex-1 min-h-0 flex flex-col overflow-y-auto',
    '[class.hidden]': '!visible()'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SimpleTabComponent {
  /** Unique identifier for the tab */
  id = input.required<string>();

  /** Display label for the tab */
  label = input.required<string>();

  /** Whether this tab is hidden from the tab list */
  hidden = input<boolean>(false);

  /** Whether this tab's content is visible (set by parent) */
  visible = signal(false);
}
