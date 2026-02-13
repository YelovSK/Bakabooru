import { DestroyRef, Directive, ElementRef, Renderer2, effect, inject, input } from '@angular/core';

@Directive({
  selector: 'img[appProgressiveImage]',
  standalone: true,
})
export class ProgressiveImageDirective {
  readonly fullSrc = input<string | null>(null, { alias: 'appProgressiveImage' });

  private requestId = 0;
  private readonly destroyRef = inject(DestroyRef);
  private readonly unlistenLoad: () => void;

  constructor(
    private readonly el: ElementRef<HTMLImageElement>,
    private readonly renderer: Renderer2,
  ) {
    // Show image once whichever source currently assigned to the host finishes loading.
    this.unlistenLoad = this.renderer.listen(this.el.nativeElement, 'load', () => {
      this.renderer.setStyle(this.el.nativeElement, 'opacity', '1');
    });

    effect(() => {
      const src = this.fullSrc();
      if (!src?.trim()) {
        this.renderer.setStyle(this.el.nativeElement, 'opacity', '1');
        return;
      }

      // Hide while swapping to avoid "old image in new layout" flash.
      this.renderer.setStyle(this.el.nativeElement, 'opacity', '0');
      this.loadFullImage(src);
    });

    this.destroyRef.onDestroy(() => {
      this.unlistenLoad();
      this.requestId++;
    });
  }

  private loadFullImage(fullSrc: string | null): void {
    const target = fullSrc?.trim();
    if (!target) return;

    const host = this.el.nativeElement;
    
    // Full source already displayed.
    if (host.getAttribute('src') === target) {
      this.renderer.setStyle(host, 'opacity', '1');
      return;
    }

    const req = ++this.requestId;
    const loader = new Image();
    
    loader.onload = async () => {
      if (req !== this.requestId) return;
      try { await loader.decode(); } catch {}
      if (req !== this.requestId) return;

      this.renderer.setAttribute(host, 'src', target);
      // In case full load resolves before host emits its own load event.
      this.renderer.setStyle(host, 'opacity', '1');
    };

    loader.onerror = () => {
      if (req !== this.requestId) return;
      // Keep thumbnail visible if full image fails.
      this.renderer.setStyle(host, 'opacity', '1');
    };

    loader.src = target;
  }
}
