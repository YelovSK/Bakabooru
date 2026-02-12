import { Directive, ElementRef, DestroyRef, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent, merge, timer } from 'rxjs';
import { switchMap, takeUntil, tap } from 'rxjs/operators';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

@Directive({
  selector: '[appTooltip]',
  standalone: true,
})
export class TooltipDirective {
  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  /** Tooltip text content */
  appTooltip = input.required<string>();

  /** Tooltip position */
  tooltipPosition = input<TooltipPosition>('top');

  /** Delay before showing tooltip (ms) */
  tooltipDelay = input<number>(200);

  private tooltipElement: HTMLElement | null = null;

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    const el = this.el.nativeElement;

    const mouseEnter$ = fromEvent(el, 'mouseenter');
    const mouseLeave$ = fromEvent(el, 'mouseleave');
    const focus$ = fromEvent(el, 'focusin');
    const blur$ = fromEvent(el, 'focusout');

    const show$ = merge(mouseEnter$, focus$);
    const hide$ = merge(mouseLeave$, blur$);

    show$.pipe(
      switchMap(() => timer(this.tooltipDelay()).pipe(
        takeUntil(hide$),
        tap(() => this.show())
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();

    hide$.pipe(
      tap(() => this.hide()),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();

    // Cleanup on destroy
    this.destroyRef.onDestroy(() => this.hide());
  }

  private show(): void {
    if (this.tooltipElement || !this.appTooltip()) return;

    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = `app-tooltip app-tooltip-${this.tooltipPosition()}`;
    this.tooltipElement.textContent = this.appTooltip();
    document.body.appendChild(this.tooltipElement);

    this.positionTooltip();

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      this.tooltipElement?.classList.add('app-tooltip-visible');
    });
  }

  private hide(): void {
    if (!this.tooltipElement) return;

    const el = this.tooltipElement;
    el.classList.remove('app-tooltip-visible');
    this.tooltipElement = null;

    // Remove after fade-out animation
    setTimeout(() => el.remove(), 150);
  }

  private positionTooltip(): void {
    if (!this.tooltipElement) return;

    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const tooltipRect = this.tooltipElement.getBoundingClientRect();
    const gap = 8;
    const padding = 8;

    let top: number;
    let left: number;

    switch (this.tooltipPosition()) {
      case 'top':
        top = hostRect.top - tooltipRect.height - gap;
        left = hostRect.left + (hostRect.width - tooltipRect.width) / 2;
        break;
      case 'bottom':
        top = hostRect.bottom + gap;
        left = hostRect.left + (hostRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = hostRect.top + (hostRect.height - tooltipRect.height) / 2;
        left = hostRect.left - tooltipRect.width - gap;
        break;
      case 'right':
        top = hostRect.top + (hostRect.height - tooltipRect.height) / 2;
        left = hostRect.right + gap;
        break;
    }

    // Keep within viewport (using fixed positioning, no scroll offset needed)
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));
    top = Math.max(padding, top);

    this.tooltipElement.style.top = `${top}px`;
    this.tooltipElement.style.left = `${left}px`;
  }
}
