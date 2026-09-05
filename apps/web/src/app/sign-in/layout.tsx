import type { Metadata } from "next";
import { buildDocumentMetadata } from "@/lib/metadata";

export const metadata: Metadata = buildDocumentMetadata({
  title: "Publisher sign-in",
  description: "Sign in with GitHub to manage publisher listings.",
  path: "/sign-in",
  index: true,
});

export default function SignInLayout({ children }: LayoutProps<"/sign-in">) {
  return children;
}
