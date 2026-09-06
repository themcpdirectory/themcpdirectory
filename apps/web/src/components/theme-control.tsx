"use client";

import { DesktopIcon, MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { Select } from "@radix-ui/themes";
import { useEffect, useSyncExternalStore } from "react";
import {
  applyThemePreference,
  readThemePreference,
  THEME_CHANGE_EVENT,
  writeThemePreference,
  type ThemePreference,
} from "@/components/theme-provider";

const themeOptions = [
  { value: "system", label: "System", icon: <DesktopIcon aria-hidden="true" /> },
  { value: "light", label: "Light", icon: <SunIcon aria-hidden="true" /> },
  { value: "dark", label: "Dark", icon: <MoonIcon aria-hidden="true" /> },
] as const;

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function subscribeToThemePreference(onStoreChange: () => void): () => void {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function ThemeControl() {
  const preference = useSyncExternalStore<ThemePreference>(
    subscribeToThemePreference,
    () => readThemePreference(window.localStorage),
    () => "system",
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if (readThemePreference(window.localStorage) === "system") {
        applyThemePreference("system");
      }
    };

    applyThemePreference(preference);
    mediaQuery.addEventListener("change", syncSystemTheme);

    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, [preference]);

  function updatePreference(value: string) {
    if (!isThemePreference(value)) return;

    writeThemePreference(window.localStorage, value);
    applyThemePreference(value);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: value }));
  }

  return (
    <label className="theme-control">
      <span className="theme-control__label">Theme</span>
      <Select.Root value={preference} onValueChange={updatePreference}>
        <Select.Trigger aria-label={`Theme: ${preference}`} variant="soft" />
        <Select.Content position="popper">
          {themeOptions.map((option) => (
            <Select.Item key={option.value} value={option.value}>
              <span className="theme-control__option">
                {option.icon}
                {option.label}
              </span>
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </label>
  );
}
