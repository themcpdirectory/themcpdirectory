"use client";

import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Button, TextField } from "@radix-ui/themes";
import { useEffect, useRef } from "react";

interface SearchFormProps {
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly variant?: "default" | "hero";
  readonly showShortcutHint?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

export function SearchForm({
  defaultValue = "",
  placeholder = "Search MCP servers…",
  submitLabel = "Search",
  variant = "default",
  showShortcutHint = false,
}: SearchFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "/") {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      inputRef.current?.focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <form
      role="search"
      className={`directory-search${variant === "hero" ? " directory-search--hero" : ""}`}
      action="/search"
      method="GET"
    >
      <label htmlFor="search-input" className="directory-search__label">
        <span>Search MCP servers</span>
        {showShortcutHint ? (
          <span className="directory-search__shortcut" aria-hidden="true">
            /
          </span>
        ) : null}
      </label>
      <TextField.Root
        ref={inputRef}
        id="search-input"
        type="search"
        name="q"
        role="searchbox"
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={200}
        size="3"
        aria-label="Search MCP servers"
      >
        <TextField.Slot>
          <MagnifyingGlassIcon aria-hidden="true" />
        </TextField.Slot>
      </TextField.Root>
      <Button type="submit" size="3" className="directory-search__submit">
        {submitLabel}
      </Button>
    </form>
  );
}
