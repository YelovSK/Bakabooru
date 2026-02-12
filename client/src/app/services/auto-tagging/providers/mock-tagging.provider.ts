import { Validators } from "@angular/forms";
import { delay, Observable, of } from "rxjs";
import { AutoTaggingResult, ProviderSetting, TaggingProvider, SettingValue } from "../models";

export interface MockSettings {
  apiKey: string;
  deepSearch: boolean;
  minConfidence: number;
  [key: string]: SettingValue;
}

export class MockTaggingProvider implements TaggingProvider<MockSettings> {
  readonly id = "mock-provider";
  readonly name = "Mock";
  readonly priority = 0;
  readonly defaultEnabled = false; // Disabled by default (testing only)

  private enabled = false;
  private settings: MockSettings = {
    apiKey: "",
    deepSearch: false,
    minConfidence: 0.5,
  };

  private readonly schema: ProviderSetting[] = [
    {
      key: "apiKey",
      label: "API Key",
      type: "text",
      description: "Enter your API key for the mock service.",
      defaultValue: "",
      validators: [Validators.required, Validators.minLength(8)],
    },
    {
      key: "deepSearch",
      label: "Enable Deep Search",
      type: "boolean",
      description: "Whether to use deep search for tags.",
      defaultValue: false,
    },
    {
      key: "minConfidence",
      label: "Min Confidence",
      type: "number",
      description: "Minimum confidence score (0 to 1).",
      defaultValue: 0.5,
      validators: [Validators.required, Validators.min(0), Validators.max(1)],
    },
  ];

  getSettingsSchema(): ProviderSetting[] {
    return this.schema;
  }

  getSettings(): MockSettings {
    return this.settings;
  }

  updateSettings(settings: MockSettings): void {
    this.settings = { ...this.settings, ...settings };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  canHandle(file: File): boolean {
    // Handle only images for this mock
    return file.type.startsWith("image/");
  }

  tag(file: File): Observable<AutoTaggingResult> {
    const mockResult: AutoTaggingResult = {
      provider: this.name,
      providerId: this.id,
      confidence: 0.95,
      safety: "safe",
      categorizedTags: [
        { name: "mock-tag-1", category: "general" },
        { name: "mock-tag-2", category: "general" },
        { name: "blue_eyes", category: "general" },
        { name: "solo", category: "general" },
      ],
      sources: ["https://example.com/source1", "https://example.com/source2"],
    };

    // Simulate network delay
    const delayMs = Math.random() * 2000 + 500;
    return of(mockResult).pipe(delay(delayMs));
  }
}
