"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "bookmark-theme";

const listeners = new Set<() => void>();
const order: ThemePreference[] = ["system", "light", "dark"];
const meta: Record<
  ThemePreference,
  { label: string; Icon: typeof Sun }
> = {
  system: { label: "跟随系统", Icon: Desktop },
  light: { label: "浅色", Icon: Sun },
  dark: { label: "深色", Icon: Moon },
};

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function serverPreference(): ThemePreference {
  return "system";
}

function applyPreference(preference: ThemePreference): void {
  const resolved =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  document.documentElement.dataset.theme = resolved;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handleMediaChange = () => {
    applyPreference(readPreference());
    onStoreChange();
  };
  media.addEventListener("change", handleMediaChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    media.removeEventListener("change", handleMediaChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function setPreference(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // 隐私模式下 localStorage 不可写，仍然应用到当前会话。
  }
  applyPreference(preference);
  for (const listener of listeners) {
    listener();
  }
}

export function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    serverPreference,
  );
  const { label, Icon } = meta[preference];
  const next = order[(order.indexOf(preference) + 1) % order.length];
  const description = `外观：${label}，点击切换为${meta[next].label}`;

  return (
    <button
      className="theme-toggle"
      type="button"
      title={description}
      aria-label={description}
      onClick={() => setPreference(next)}
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}
