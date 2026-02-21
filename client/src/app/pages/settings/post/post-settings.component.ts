import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SettingsService } from '@services/settings.service';
import { FormCheckboxComponent } from '@shared/components/form-checkbox/form-checkbox.component';
import { FormNumberInputComponent } from '@shared/components/form-number-input/form-number-input.component';

@Component({
  selector: 'app-post-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, FormCheckboxComponent, FormNumberInputComponent],
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

  onHoverPreviewChange(value: boolean): void {
    this.settingsService.updatePostSettings({ enablePostPreviewOnHover: value });
  }

  onHoverPreviewDelayChange(value: number | null): void {
    const normalized = value === null || Number.isNaN(value)
      ? 700
      : Math.max(0, Math.min(5000, Math.round(value)));
    this.settingsService.updatePostSettings({ postPreviewDelayMs: normalized });
  }
}
