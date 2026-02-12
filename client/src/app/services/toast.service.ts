import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  duration?: number;
  progress?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private nextId = 0;
  toasts = signal<Toast[]>([]);

  show(message: string, type: ToastType = 'success', duration = 5000) {
    const id = this.nextId++;
    const toast: Toast = { id, message, type, duration };
    
    this.toasts.update(t => [...t, toast]);

    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
    return id;
  }

  update(id: number, updates: Partial<Toast>) {
    this.toasts.update(toasts => toasts.map(t => t.id === id ? { ...t, ...updates } : t));
    if (updates.duration && updates.duration > 0) {
      setTimeout(() => this.remove(id), updates.duration);
    }
  }

  success(message: string, duration?: number) {
    return this.show(message, 'success', duration);
  }

  warning(message: string, duration?: number) {
    return this.show(message, 'warning', duration);
  }

  error(message: string, duration?: number) {
    return this.show(message, 'error', duration);
  }

  info(message: string, duration?: number) {
    return this.show(message, 'info', duration);
  }

  remove(id: number) {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }
}
