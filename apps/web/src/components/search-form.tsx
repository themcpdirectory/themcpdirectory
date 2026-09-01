"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

interface SearchFormProps {
  defaultValue?: string;
  placeholder?: string;
}

export function SearchForm({
  defaultValue = "",
  placeholder = "Search MCP servers…",
}: SearchFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = inputRef.current?.value.trim() ?? "";
    if (q) {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/search");
    }
  }

  return (
    <form
      role="search"
      action="/search"
      method="GET"
      onSubmit={handleSubmit}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: "0.5rem",
        width: "100%",
      }}
    >
      <label
        htmlFor="search-input"
        style={{ gridColumn: "1 / -1", fontSize: "0.8125rem", fontWeight: 600, color: "var(--fg)" }}
      >
        Search MCP servers
      </label>
      <input
        ref={inputRef}
        id="search-input"
        type="search"
        name="q"
        role="searchbox"
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={200}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "0.5rem 0.75rem",
          border: "1px solid var(--control-border)",
          borderRadius: "var(--radius-sm)",
          background: "var(--surface)",
          color: "var(--fg)",
          fontSize: "0.9375rem",
          minHeight: "2.75rem",
        }}
        aria-label="Search MCP servers"
      />
      <button
        type="submit"
        style={{
          padding: "0.5rem 1rem",
          background: "var(--action-bg)",
          color: "var(--action-fg)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          fontSize: "0.875rem",
          fontWeight: 600,
          minHeight: "2.75rem",
          whiteSpace: "nowrap",
        }}
      >
        Search
      </button>
    </form>
  );
}
