import { describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("../better-auth.js", () => ({
  getAuth: () => ({ api: { getSession: getSessionMock } }),
}));

import { AuthRequiredError } from "../errors.js";
import { getSessionOrNull, requireSession } from "../session.js";

const RAW_SESSION = {
  user: {
    id: "user-1",
    email: "user@example.com",
    emailVerified: true,
    name: "User One",
    image: null,
    createdAt: new Date("2029-01-01T00:00:00.000Z"),
    updatedAt: new Date("2029-06-01T00:00:00.000Z"),
  },
  session: {
    id: "session-1",
    token: "session-token",
    userId: "user-1",
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    createdAt: new Date("2029-06-01T00:00:00.000Z"),
    updatedAt: new Date("2029-06-01T00:00:00.000Z"),
    ipAddress: null,
    userAgent: null,
  },
};

const PROJECTED_SESSION = {
  user: {
    id: "user-1",
    email: "user@example.com",
    name: "User One",
    image: null,
  },
  session: {
    id: "session-1",
    token: "session-token",
    userId: "user-1",
    expiresAt: RAW_SESSION.session.expiresAt,
  },
};

describe("getSessionOrNull", () => {
  it("returns null when Better Auth has no active session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(getSessionOrNull(new Headers())).resolves.toBeNull();
  });

  it("projects the Better Auth result down to the exposed AuthenticatedSession shape", async () => {
    getSessionMock.mockResolvedValueOnce(RAW_SESSION);
    await expect(getSessionOrNull(new Headers())).resolves.toEqual(PROJECTED_SESSION);
  });

  it("normalises an undefined image field to null", async () => {
    getSessionMock.mockResolvedValueOnce({
      ...RAW_SESSION,
      user: { ...RAW_SESSION.user, image: undefined },
    });
    const result = await getSessionOrNull(new Headers());
    expect(result?.user.image).toBeNull();
  });
});

describe("requireSession", () => {
  it("throws AuthRequiredError when there is no session", async () => {
    getSessionMock.mockResolvedValueOnce(null);
    await expect(requireSession(new Headers())).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("returns the projected session when one exists", async () => {
    getSessionMock.mockResolvedValueOnce(RAW_SESSION);
    await expect(requireSession(new Headers())).resolves.toEqual(PROJECTED_SESSION);
  });
});
