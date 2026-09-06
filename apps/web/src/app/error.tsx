"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@radix-ui/themes";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" tabIndex={-1} role="main" className="status-layout">
      <div className="status-panel">
        <h1 className="page-title">Something went wrong</h1>
        <p className="page-description">An unexpected error occurred. Please try again.</p>
        <div className="status-actions">
          <Button type="button" onClick={retry} size="3">
            Try again
          </Button>
          <Link href="/" className="text-link-action">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
