import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BakabooruPostDto } from '@models';
import { ProgressiveImageComponent } from '@shared/components/progressive-image/progressive-image.component';

@Component({
    selector: 'app-post-preview-overlay',
    imports: [CommonModule, ProgressiveImageComponent],
    templateUrl: './post-preview-overlay.component.html',
    styleUrl: './post-preview-overlay.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostPreviewOverlayComponent {
    readonly post = input.required<BakabooruPostDto>();
    readonly mediaBaseUrl = input.required<string>();
    readonly closed = output<void>();

    getMediaType(contentType: string): 'image' | 'animation' | 'video' {
        if (contentType.startsWith('video/')) return 'video';
        if (contentType === 'image/gif') return 'animation';
        return 'image';
    }

    onCardLeave(): void {
        this.closed.emit();
    }

    onClick(): void {
        this.closed.emit();
    }
}
