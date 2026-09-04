import { getAuth } from "@themcpdirectory/auth";
import { toNextJsHandler } from "better-auth/next-js";

// getAuth() must not run at import time (e.g. during `next build`'s route
// discovery), since it eagerly validates the full WebEnv; defer it to request time.
export async function GET(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).POST(request);
}
