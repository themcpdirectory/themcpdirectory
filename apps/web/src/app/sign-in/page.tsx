"use client";

import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  return (
    <main id="main-content" tabIndex={-1} style={{ minHeight: "100vh", padding: "3rem 1rem" }}>
      <div style={{ maxWidth: "32rem", margin: "0 auto" }}>
        <h1>Sign in</h1>
        <p>
          Sign in with GitHub to manage publisher listings. GitHub sign-in only requests your
          identity (username and verified email). A separate, narrower GitHub App permission is
          requested later, only when you verify a claim on a specific repository or organisation.
        </p>
        <button
          type="button"
          onClick={() => {
            void authClient.signIn.social({ provider: "github", callbackURL: "/dashboard" });
          }}
        >
          Sign in with GitHub
        </button>
      </div>
    </main>
  );
}
