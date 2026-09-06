"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@radix-ui/themes";

export default function SignInPage() {
  return (
    <main id="main-content" tabIndex={-1} className="status-layout">
      <div className="auth-panel">
        <h1 className="page-title">Sign in</h1>
        <p className="page-description">
          Sign in with GitHub to manage publisher listings. GitHub sign-in only requests your
          identity (username and verified email). A separate, narrower GitHub App permission is
          requested later, only when you verify a claim on a specific repository or organisation.
        </p>
        <Button
          type="button"
          size="3"
          onClick={() => {
            void authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" });
          }}
        >
          Sign in with GitHub
        </Button>
      </div>
    </main>
  );
}
