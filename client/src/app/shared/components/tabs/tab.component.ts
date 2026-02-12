import { Component, input, TemplateRef, contentChild, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-tab',
  standalone: true,
  template: ``,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TabComponent {
  /** Route segment for this tab (e.g., 'auto-tagging') */
  id = input.required<string>();

  /** Display label for the tab */
  label = input.required<string>();

  /** Optional icon class */
  icon = input<string>();

  /** Template content for this tab */
  content = contentChild(TemplateRef);
}
