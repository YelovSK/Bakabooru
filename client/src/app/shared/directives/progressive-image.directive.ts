import { Directive, ElementRef, Input, OnChanges, OnDestroy, Renderer2, SimpleChanges } from '@angular/core';

@Directive({
  selector: 'img[appProgressiveImage]',
  standalone: true,
})
export class ProgressiveImageDirective implements OnChanges, OnDestroy {
  @Input('appProgressiveImage') fullSrc: string | null = null;

  private requestId = 0;
  private currentLoader: HTMLImageElement | null = null;

  constructor(
    private readonly el: ElementRef<HTMLImageElement>,
    private readonly renderer: Renderer2,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ('fullSrc' in changes) {
      this.loadFullImage();
    }
  }

  ngOnDestroy(): void {
    this.currentLoader = null;
    this.requestId++;
  }

  private loadFullImage(): void {
    const target = this.fullSrc?.trim();
    if (!target) return;

    const host = this.el.nativeElement;
    const currentSrc = host.getAttribute('src') ?? '';
    if (currentSrc === target) return;

    const req = ++this.requestId;
    const loader = new Image();
    this.currentLoader = loader;

    loader.onload = async () => {
      if (req !== this.requestId) return;
      try {
        // Ensure the browser has decoded the target before src swap.
        await loader.decode();
      } catch {
        // decode() can reject for SVG/data-URI edge cases; fallback to swap anyway.
      }
      if (req !== this.requestId) return;
      this.renderer.setAttribute(host, 'src', target);
    };

    loader.src = target;
  }
}
