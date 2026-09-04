"use client";

import { useEffect, useRef } from "react";

interface ErrorSummaryProps {
  readonly errors: readonly string[];
  readonly id?: string;
}

export function ErrorSummary({ errors, id }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length > 0) {
      ref.current?.focus();
    }
  }, [errors]);

  if (errors.length === 0) {
    return null;
  }

  return (
    <div
      id={id}
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="publisher-panel"
      style={{
        border: "1px solid var(--error-fg)",
        background: "var(--error-bg)",
        padding: "1rem",
        marginBottom: "1.25rem",
      }}
    >
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "0.9375rem" }}>There is a problem</h2>
      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}
