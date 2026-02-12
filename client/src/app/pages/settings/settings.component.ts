import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TabsComponent } from '@shared/components/tabs/tabs.component';
import { TabComponent } from '@shared/components/tabs/tab.component';
import { AutoTaggingSettingsComponent } from './auto-tagging/auto-tagging-settings.component';
import { PostSettingsComponent } from './post/post-settings.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, TabsComponent, TabComponent, AutoTaggingSettingsComponent, PostSettingsComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent {}
