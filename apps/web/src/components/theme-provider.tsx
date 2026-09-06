"use client";

import { Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "mcp-directory-theme";
export const THEME_CHANGE_EVENT = "mcp-directory-theme-change";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function getThemeStorage(source: Pick<Window, "localStorage">): Storage | null {
  try {
    return source.localStorage;
  } catch {
    return null;
  }
}

export function readThemePreference(storage: Pick<Storage, "getItem"> | null): ThemePreference {
  if (!storage) return "system";

  try {
    const preference = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(preference) ? preference : "system";
  } catch {
    return "system";
  }
}

export function writeThemePreference(
  storage: Pick<Storage, "setItem"> | null,
  preference: ThemePreference,
): void {
  if (!storage) return;

  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme selection still applies for this page when persistent storage is unavailable.
  }
}

export function applyThemePreference(preference: ThemePreference) {
  const resolvedTheme =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;

  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <Theme accentColor="green" grayColor="gray" radius="small" scaling="100%" appearance="inherit">
      {children}
    </Theme>
  );
}
