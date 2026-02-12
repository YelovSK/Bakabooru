import { Component, contentChildren, signal, computed, ChangeDetectionStrategy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SimpleTabComponent } from './simple-tab.component';

@Component({
  selector: 'app-simple-tabs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './simple-tabs.component.html',
  styleUrl: './simple-tabs.component.css',
  host: {
    'class': 'flex flex-col flex-1 min-h-0 overflow-hidden'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SimpleTabsComponent {
  /** Child tab components */
  tabs = contentChildren(SimpleTabComponent);

  /** Currently active tab ID */
  activeTabId = signal<string>('');

  /** The currently active tab component */
  activeTab = computed(() => {
    const activeId = this.activeTabId();
    const allTabs = this.tabs();
    return allTabs.find(t => t.id() === activeId) || allTabs[0];
  });

  constructor() {
    // Update tab visibility when active tab changes
    effect(() => {
      const active = this.activeTab();
      const allTabs = this.tabs();
      allTabs.forEach(tab => tab.visible.set(tab === active));
    });

    // Initialize first tab if none selected
    effect(() => {
      const allTabs = this.tabs();
      if (allTabs.length > 0 && !this.activeTabId()) {
        this.activeTabId.set(allTabs[0].id());
      }
    });
  }

  selectTab(tabId: string): void {
    this.activeTabId.set(tabId);
  }
}
