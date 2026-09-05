import type { Database } from "@themcpdirectory/db";
import {
  resumeRetryableAccountErasure,
  type AccountErasureDeps,
} from "@themcpdirectory/domain";

export const PUBLISHER_ERASURE_QUEUE = "publisher.erasure";

export function createAccountErasureDeps(
  disconnectOwnedInstallations: AccountErasureDeps["githubApp"]["disconnectOwnedInstallations"] =
    async () => {
      throw new Error("GITHUB_APP_DISCONNECT_NOT_CONFIGURED");
    },
): AccountErasureDeps {
  return {
    githubApp: {
      disconnectOwnedInstallations,
    },
  };
}

export async function processPublisherErasureJob(
  db: Database,
  checkedAt = new Date(),
  deps: AccountErasureDeps = createAccountErasureDeps(),
): Promise<{ resumed: number; completed: number; retryScheduled: number }> {
  return resumeRetryableAccountErasure(db, { now: checkedAt }, deps);
}
