import { describe, expect, it } from "vitest";
import { roleHasCapability } from "../capabilities.js";

describe("roleHasCapability", () => {
  it("grants owner every capability, including ownership transfer and destroy", () => {
    expect(roleHasCapability("owner", "publisher.read")).toBe(true);
    expect(roleHasCapability("owner", "publisher.edit")).toBe(true);
    expect(roleHasCapability("owner", "claims.manage")).toBe(true);
    expect(roleHasCapability("owner", "members.manage")).toBe(true);
    expect(roleHasCapability("owner", "ownership.transfer")).toBe(true);
    expect(roleHasCapability("owner", "publisher.destroy")).toBe(true);
  });

  it("grants admin management capabilities but withholds ownership transfer and destroy", () => {
    expect(roleHasCapability("admin", "publisher.read")).toBe(true);
    expect(roleHasCapability("admin", "publisher.edit")).toBe(true);
    expect(roleHasCapability("admin", "claims.manage")).toBe(true);
    expect(roleHasCapability("admin", "members.manage")).toBe(true);
    expect(roleHasCapability("admin", "ownership.transfer")).toBe(false);
    expect(roleHasCapability("admin", "publisher.destroy")).toBe(false);
  });

  it("grants editor read and edit only", () => {
    expect(roleHasCapability("editor", "publisher.read")).toBe(true);
    expect(roleHasCapability("editor", "publisher.edit")).toBe(true);
    expect(roleHasCapability("editor", "claims.manage")).toBe(false);
    expect(roleHasCapability("editor", "members.manage")).toBe(false);
    expect(roleHasCapability("editor", "ownership.transfer")).toBe(false);
  });

  it("grants viewer read-only access", () => {
    expect(roleHasCapability("viewer", "publisher.read")).toBe(true);
    expect(roleHasCapability("viewer", "publisher.edit")).toBe(false);
    expect(roleHasCapability("viewer", "claims.manage")).toBe(false);
    expect(roleHasCapability("viewer", "members.manage")).toBe(false);
    expect(roleHasCapability("viewer", "ownership.transfer")).toBe(false);
    expect(roleHasCapability("viewer", "publisher.destroy")).toBe(false);
  });
});
