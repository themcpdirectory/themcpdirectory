import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "./better-auth.js";
import { publisherClaims } from "./publisher-claims.js";

export const claimVerificationNonces = pgTable(
  "claim_verification_nonces",
  {
    id: uuid().primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => publisherClaims.id, { onDelete: "cascade" }),
    requesterUserId: uuid("requester_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    stateRef: text("state_ref").notNull(),
    stateHash: text("state_hash").notNull(),
    pkceVerifierCiphertext: text("pkce_verifier_ciphertext").notNull(),
    returnTo: text("return_to").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("claim_verification_nonces_state_ref_uidx").on(t.stateRef),
    uniqueIndex("claim_verification_nonces_state_hash_uidx").on(t.stateHash),
    index("claim_verification_nonces_requester_user_id_idx").on(t.requesterUserId),
    index("claim_verification_nonces_claim_id_idx").on(t.claimId),
  ],
);
