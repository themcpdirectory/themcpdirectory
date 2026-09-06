"use client";

import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Button, TextField } from "@radix-ui/themes";
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
      className="directory-search"
      action="/search"
      method="GET"
      onSubmit={handleSubmit}
    >
      <label htmlFor="search-input" className="directory-search__label">
        Search MCP servers
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
      <Button type="submit" size="3">
        Search
      </Button>
    </form>
  );
}
