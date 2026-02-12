import {
  Component,
  inject,
  ChangeDetectionStrategy,
  HostListener,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { UploadService, UploadItem } from "@services/upload.service";
import { UploadItemComponent } from "./upload-item/upload-item.component";
import { ButtonComponent } from "@shared/components/button/button.component";

@Component({
  selector: "app-upload",
  standalone: true,
  imports: [CommonModule, UploadItemComponent, ButtonComponent],
  templateUrl: "./upload.component.html",
  styleUrl: "./upload.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadComponent {
  private readonly uploadService = inject(UploadService);

  uploadQueue = this.uploadService.uploadQueue;

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.uploadService.addFiles(Array.from(input.files));
      input.value = "";
    }
  }

  onFileDropped(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer?.files) {
      this.uploadService.addFiles(Array.from(event.dataTransfer.files));
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  // Note: Using @HostListener for paste events is correct here because
  // HotkeysService only handles keyboard events, not clipboard events.
  @HostListener("window:paste", ["$event"])
  onPaste(event: ClipboardEvent) {
    const items = event.clipboardData?.items;
    if (!items) return;

    // Check if we are focusing an input
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      this.uploadService.addFiles(files);
    }
  }

  uploadAll() {
    this.uploadService.uploadAll();
  }

  autoTagAll() {
    this.uploadService.autoTagAll();
  }

  checkDuplicates() {
    this.uploadService.checkDuplicates();
  }

  clearCompleted() {
    this.uploadService.clearCompleted();
  }

  clearDuplicates() {
    this.uploadService.clearDuplicates();
  }

  hasDuplicates() {
    return this.uploadService.hasDuplicates();
  }

  clearAll() {
    this.uploadService.clearAll();
  }

  trackById(_: number, item: UploadItem) {
    return item.id;
  }
}
