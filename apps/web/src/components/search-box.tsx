"use client";

import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import type {
  CollectionSummary,
  DiscoveryCategorySummary,
  SearchSuggestionServer,
} from "@themcpdirectory/domain";
import { Button, TextField } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

interface SearchBoxProps {
  readonly action: string;
  readonly defaultValue?: string;
  readonly hiddenFields?: readonly { name: string; value: string }[];
  readonly inputId?: string;
  readonly placeholder?: string;
  readonly showShortcutHint?: boolean;
  readonly submitLabel?: string;
  readonly variant?: "default" | "hero";
}

interface SearchSuggestionsPayload {
  readonly servers: readonly SearchSuggestionServer[];
  readonly categories: readonly DiscoveryCategorySummary[];
  readonly collections: readonly CollectionSummary[];
}

interface SearchSuggestionOption {
  readonly id: string;
  readonly href: string;
  readonly group: "Servers" | "Categories" | "Collections";
  readonly label: string;
  readonly meta: string;
}

const SUGGESTION_DEBOUNCE_MS = 180;
const EMPTY_SUGGESTIONS: SearchSuggestionsPayload = {
  servers: [],
  categories: [],
  collections: [],
};

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

function buildOptions(payload: SearchSuggestionsPayload): readonly SearchSuggestionOption[] {
  return [
    ...payload.servers.map((server) => ({
      id: `search-suggestion-server-${server.slug}`,
      href: `/${server.slug}`,
      group: "Servers" as const,
      label: server.title,
      meta: server.shortDescription,
    })),
    ...payload.categories.map((category) => ({
      id: `search-suggestion-category-${category.slug}`,
      href: `/browse?category=${encodeURIComponent(category.slug)}`,
      group: "Categories" as const,
      label: category.name,
      meta: `${category.serverCount} servers`,
    })),
    ...payload.collections.map((collection) => ({
      id: `search-suggestion-collection-${collection.slug}`,
      href: `/collections/${collection.slug}`,
      group: "Collections" as const,
      label: collection.name,
      meta: collection.description,
    })),
  ];
}

export function SearchBox({
  action,
  defaultValue = "",
  hiddenFields = [],
  inputId = "search-input",
  placeholder = "Search MCP servers…",
  showShortcutHint = false,
  submitLabel = "Search",
  variant = "default",
}: SearchBoxProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const listboxId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestionsPayload>(EMPTY_SUGGESTIONS);

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

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    if (normalizedQuery.length === 0) {
      abortControllerRef.current?.abort();
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);

      try {
        const response = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(normalizedQuery)}`,
          {
            signal: controller.signal,
            headers: { accept: "application/json" },
          },
        );
        if (!response.ok) {
          setSuggestions(EMPTY_SUGGESTIONS);
          setOpen(false);
          setActiveIndex(-1);
          return;
        }

        const payload = (await response.json()) as SearchSuggestionsPayload;
        setSuggestions(payload);
        setOpen(
          payload.servers.length > 0 ||
            payload.categories.length > 0 ||
            payload.collections.length > 0,
        );
        setActiveIndex(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions(EMPTY_SUGGESTIONS);
          setOpen(false);
          setActiveIndex(-1);
        }
      } finally {
        setLoading(false);
      }
    }, SUGGESTION_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const options = useMemo(() => buildOptions(suggestions), [suggestions]);
  const activeOption = activeIndex >= 0 ? options[activeIndex] : undefined;

  function closeSuggestions() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function commitSelection(option: SearchSuggestionOption) {
    closeSuggestions();
    router.push(option.href as Route);
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);

    if (nextQuery.trim().length === 0) {
      abortControllerRef.current?.abort();
      setSuggestions(EMPTY_SUGGESTIONS);
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
    }
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current < 0 ? 0 : (current + 1) % options.length));
      return;
    }

    if (event.key === "ArrowUp" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length,
      );
      return;
    }

    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        closeSuggestions();
      }
      return;
    }

    if (event.key === "Enter" && open && activeOption) {
      event.preventDefault();
      commitSelection(activeOption);
    }
  }

  function onInputBlur() {
    blurTimeoutRef.current = window.setTimeout(() => {
      closeSuggestions();
    }, 120);
  }

  function onInputFocus() {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    if (options.length > 0) {
      setOpen(true);
    }
  }

  const visibleOptions = open && options.length > 0;
  const liveRegionText = loading
    ? "Loading suggestions."
    : visibleOptions
      ? `${options.length} suggestions available.`
      : query.trim().length > 0
        ? "No suggestions available. Press Enter to search."
        : "";

  return (
    <form
      role="search"
      className={`directory-search search-box${variant === "hero" ? " directory-search--hero" : ""}`}
      action={action}
      method="GET"
    >
      {hiddenFields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}

      <label htmlFor={inputId} className="directory-search__label">
        <span>Search MCP servers</span>
        {showShortcutHint ? (
          <span className="directory-search__shortcut" aria-hidden="true">
            /
          </span>
        ) : null}
      </label>

      <div className="search-box__field">
        <TextField.Root
          ref={inputRef}
          id={inputId}
          type="search"
          name="q"
          role="combobox"
          value={query}
          onChange={(event) => handleQueryChange(event.currentTarget.value)}
          onKeyDown={onInputKeyDown}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          placeholder={placeholder}
          autoComplete="off"
          maxLength={200}
          size="3"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={visibleOptions}
          aria-activedescendant={activeOption?.id}
          aria-label="Search MCP servers"
        >
          <TextField.Slot>
            <MagnifyingGlassIcon aria-hidden="true" />
          </TextField.Slot>
        </TextField.Root>

        {visibleOptions ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Search suggestions"
            className="search-suggestions"
          >
            {(["Servers", "Categories", "Collections"] as const).map((group) => {
              const groupOptions = options.filter((option) => option.group === group);
              if (groupOptions.length === 0) return null;

              return (
                <li key={group} role="presentation" className="search-suggestions__group">
                  <p className="search-suggestions__heading">{group}</p>
                  <ul className="search-suggestions__group-list">
                    {groupOptions.map((option) => {
                      const optionIndex = options.findIndex(
                        (candidate) => candidate.id === option.id,
                      );
                      const active = optionIndex === activeIndex;

                      return (
                        <li
                          key={option.id}
                          id={option.id}
                          role="option"
                          aria-selected={active}
                          className={`search-suggestions__option${active ? " search-suggestions__option--active" : ""}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => commitSelection(option)}
                        >
                          <span className="search-suggestions__label">{option.label}</span>
                          <span className="search-suggestions__meta">{option.meta}</span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <Button type="submit" size="3" className="directory-search__submit">
        {submitLabel}
      </Button>

      <p className="search-box__status" aria-live="polite" aria-atomic="true">
        {liveRegionText}
      </p>
    </form>
  );
}
