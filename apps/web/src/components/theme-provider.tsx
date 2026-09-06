"use client";

import { Theme } from "@radix-ui/themes";
import type { ReactNode } from "react";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "mcp-directory-theme";
export const THEME_CHANGE_EVENT = "mcp-directory-theme-change";

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
