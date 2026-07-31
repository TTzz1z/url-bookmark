"use client";

import {
  CheckCircle,
  Info,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";

export type ToastKind = "success" | "error" | "info";

export type ToastAction = {
  label: string;
  onAction: () => void | Promise<void>;
};

export type ToastInput = {
  kind?: ToastKind;
  message: string;
  /** 毫秒；传 0 表示只能手动关闭。 */
  duration?: number;
  action?: ToastAction;
};

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  duration: number;
  action?: ToastAction;
  exiting?: boolean;
};

const MAX_VISIBLE = 4;
const EXIT_MS = 180;
const emptyToasts: ToastItem[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

let toasts: ToastItem[] = emptyToasts;
let counter = 0;

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): ToastItem[] {
  return toasts;
}

function getServerSnapshot(): ToastItem[] {
  return emptyToasts;
}

function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export function dismissToast(id: string): void {
  clearTimer(id);
  const current = toasts.find((item) => item.id === id);
  if (!current || current.exiting) {
    return;
  }
  toasts = toasts.map((item) =>
    item.id === id ? { ...item, exiting: true } : item,
  );
  emit();
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      const next = toasts.filter((item) => item.id !== id);
      if (next.length !== toasts.length) {
        toasts = next;
        emit();
      }
    }, EXIT_MS),
  );
}

export function showToast(input: ToastInput): string {
  counter += 1;
  const id = `toast-${counter}`;
  const item: ToastItem = {
    id,
    kind: input.kind ?? "info",
    message: input.message,
    duration: input.duration ?? (input.action ? 8_000 : 4_000),
    action: input.action,
  };

  const combined = [...toasts.filter((toast) => !toast.exiting), item];
  for (const dropped of combined.slice(
    0,
    Math.max(0, combined.length - MAX_VISIBLE),
  )) {
    dismissToast(dropped.id);
  }
  toasts = [...toasts.filter((toast) => toast.exiting), ...combined.slice(-MAX_VISIBLE)];
  emit();

  if (item.duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), item.duration),
    );
  }
  return id;
}

const icons: Record<ToastKind, typeof Info> = {
  success: CheckCircle,
  error: WarningCircle,
  info: Info,
};

export function ToastViewport() {
  const items = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const hasError = items.some((item) => item.kind === "error" && !item.exiting);

  return (
    <div
      className="toast-viewport"
      aria-live={hasError ? "assertive" : "polite"}
      aria-relevant="additions text"
    >
      {items.map((item) => {
        const Icon = icons[item.kind];
        return (
          <div
            className={`toast toast-${item.kind}${item.exiting ? " is-exiting" : ""}`}
            key={item.id}
            role={item.kind === "error" ? "alert" : "status"}
          >
            <Icon
              className="toast-icon"
              size={18}
              weight="fill"
              aria-hidden="true"
            />
            <p className="toast-message">{item.message}</p>
            {item.action && !item.exiting && (
              <button
                className="toast-action"
                type="button"
                onClick={() => {
                  dismissToast(item.id);
                  void item.action?.onAction();
                }}
              >
                {item.action.label}
              </button>
            )}
            <button
              className="toast-close"
              type="button"
              aria-label="关闭通知"
              onClick={() => dismissToast(item.id)}
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
