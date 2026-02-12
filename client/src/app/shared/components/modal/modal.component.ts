import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalComponent {
  open = input(false);
  title = input('');
  maxWidthClass = input('max-w-xl');
  closeOnBackdrop = input(true);
  showCloseButton = input(true);

  closed = output<void>();

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(): void {
    if (!this.closeOnBackdrop()) return;
    this.close();
  }
}
