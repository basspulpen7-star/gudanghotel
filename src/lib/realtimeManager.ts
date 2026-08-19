/**
 * Centralized Realtime & Tab Visibility Governor for Supabase Free Tier
 * Features:
 * - Shared singleton event bus to prevent opening redundant WebSocket connections
 * - Automatically pauses background listeners when document.visibilityState === 'hidden'
 * - Debounces rapid reload triggers
 */

type ListenerCallback = (payload?: any) => void;

class RealtimeGovernor {
  private listeners: Map<string, Set<ListenerCallback>> = new Map();
  private debounceTimers: Map<string, any> = new Map();
  private isVisible: boolean = !document.hidden;

  constructor() {
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.isVisible = document.visibilityState === 'visible';
        if (this.isVisible) {
          // Trigger a global gentle refresh on tab refocus if needed
          this.emit('tab_refocused');
        }
      });
    }
  }

  /**
   * Subscribe a component callback to an event
   */
  subscribe(event: string, callback: ListenerCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return cleanup function
    return () => {
      const set = this.listeners.get(event);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  /**
   * Emit an event to all active listeners (debounced by default to prevent burst refetches)
   */
  emit(event: string, payload?: any, debounceMs: number = 300): void {
    if (!this.isVisible && event !== 'tab_refocused') {
      // Defer execution if tab is hidden to save battery and network bandwidth
      return;
    }

    if (debounceMs > 0) {
      if (this.debounceTimers.has(event)) {
        clearTimeout(this.debounceTimers.get(event));
      }
      const timer = setTimeout(() => {
        this.debounceTimers.delete(event);
        this.notifyListeners(event, payload);
      }, debounceMs);
      this.debounceTimers.set(event, timer);
    } else {
      this.notifyListeners(event, payload);
    }
  }

  private notifyListeners(event: string, payload?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`[REALTIME GOVERNOR ERROR] event: ${event}`, err);
        }
      });
    }
  }

  /**
   * Check if current tab is active and visible
   */
  isTabActive(): boolean {
    return this.isVisible;
  }
}

export const realtimeGovernor = new RealtimeGovernor();
