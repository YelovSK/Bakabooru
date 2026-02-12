import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";

import { AutoTaggingService } from "@services/auto-tagging/auto-tagging.service";
import { TaggingProvider } from "@app/services/auto-tagging/models";
import { FormInputComponent } from "@shared/components/form-input/form-input.component";
import { FormCheckboxComponent } from "@shared/components/form-checkbox/form-checkbox.component";
import { FormNumberInputComponent } from "@shared/components/form-number-input/form-number-input.component";
import { ButtonComponent } from "@shared/components/button/button.component";
import { CollapsibleComponent } from "@shared/components/collapsible/collapsible.component";

@Component({
  selector: "app-auto-tagging-settings",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormInputComponent,
    FormCheckboxComponent,
    FormNumberInputComponent,
    ButtonComponent,
    CollapsibleComponent,
  ],
  templateUrl: "./auto-tagging-settings.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutoTaggingSettingsComponent {
  private readonly autoTaggingService = inject(AutoTaggingService);
  private readonly fb = inject(FormBuilder);

  providers = signal<TaggingProvider[]>([]);
  providerForms = new Map<string, FormGroup>();
  expandedProviders: Record<string, boolean> = {};

  constructor() {
    this.providers.set(this.autoTaggingService.getProviders());
    this.initializeForms();
    // Expand first provider by default
    const first = this.providers()[0];
    if (first) {
      this.expandedProviders[first.id] = true;
    }
  }

  private initializeForms() {
    this.providers().forEach((provider) => {
      const group: Record<string, unknown> = {};
      const currentSettings = provider.getSettings();

      provider.getSettingsSchema().forEach((schema) => {
        group[schema.key] = [
          currentSettings[schema.key] ?? schema.defaultValue,
          schema.validators ?? [],
        ];
      });

      this.providerForms.set(provider.id, this.fb.group(group));
    });
  }

  getFormGroup(providerId: string): FormGroup | undefined {
    return this.providerForms.get(providerId);
  }

  isSettingVisible(providerId: string, schemaKey: string): boolean {
    const form = this.getFormGroup(providerId);
    if (!form) return true;

    if (providerId === "saucenao-provider") {
      if (schemaKey === "danbooruUsername" || schemaKey === "danbooruApiKey") {
        return form.get("useDanbooru")?.value === true;
      }
      if (schemaKey === "gelbooruUserId" || schemaKey === "gelbooruApiKey") {
        return form.get("useGelbooru")?.value === true;
      }
    }

    return true;
  }

  saveSettings(provider: TaggingProvider) {
    const form = this.getFormGroup(provider.id);
    if (form && form.valid) {
      this.autoTaggingService.saveSettings(provider.id, form.value);
      form.markAsPristine();
    }
  }

  isProviderEnabled(providerId: string): boolean {
    return this.autoTaggingService.isProviderEnabled(providerId);
  }

  toggleProviderEnabled(providerId: string): void {
    const current = this.autoTaggingService.isProviderEnabled(providerId);
    this.autoTaggingService.setProviderEnabled(providerId, !current);
  }
}
