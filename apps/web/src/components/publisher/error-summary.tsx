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
    <div id={id} ref={ref} role="alert" tabIndex={-1} className="publisher-error-summary">
      <h2>There is a problem</h2>
      <ul>
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}
