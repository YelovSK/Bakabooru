import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SettingsService } from '@services/settings.service';
import { FormCheckboxComponent } from '@shared/components/form-checkbox/form-checkbox.component';

@Component({
  selector: 'app-post-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, FormCheckboxComponent],
  templateUrl: './post-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostSettingsComponent {
  private readonly settingsService = inject(SettingsService);

  readonly settings = this.settingsService.postSettings;

  onAutoPlayChange(value: boolean): void {
    this.settingsService.updatePostSettings({ autoPlayVideos: value });
  }

  onStartMutedChange(value: boolean): void {
    this.settingsService.updatePostSettings({ startVideosMuted: value });
  }
}
