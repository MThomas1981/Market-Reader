'use client';

import { useSyncExternalStore } from 'react';

/** Small notifications ("Sold 10 MSFT at $517.53", "Insufficient shares to sell"). Call toast() from anywhere. */
export interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info';
  title: string;
  body?: string;
}

let list: Toast[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let next = 1;

export function dismissToast(id: number) {
  list = list.filter((t) => t.id !== id);
  emit();
}

export function toast(t: Omit<Toast, 'id'>, ms = t.tone === 'error' ? 7000 : 4500) {
  const id = next++;
  list = [...list.slice(-3), { ...t, id }];
  emit();
  setTimeout(() => dismissToast(id), ms);
  return id;
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => list,
    () => list,
  );
}
