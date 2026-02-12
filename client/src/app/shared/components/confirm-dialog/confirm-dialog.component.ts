import { Component, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ConfirmService } from '@services/confirm.service';
import { ButtonComponent } from '@shared/components/button/button.component';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css'
})
export class ConfirmDialogComponent {
  confirmService = inject(ConfirmService);

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.confirmService.options()) {
      this.cancel();
    }
  }

  confirm(): void {
    this.confirmService.resolve(true);
  }

  cancel(): void {
    this.confirmService.resolve(false);
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }
}
