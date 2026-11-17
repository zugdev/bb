import { describe, expect, it } from "vitest";
import {
  checkoutSessionName,
  rustPathHash,
  rustStringHash,
  sharedSessionName,
} from "./session-name.js";

describe("haven session names match the haven CLI's Rust DefaultHasher", () => {
  it.each([
    ["admin", "4fe012b943a8949a"],
    ["client-viewer", "36b71b429fc440eb"],
    ["haven_admin_long_profile_name_x", "c1075d36aaa31a88"],
  ])("hashes profile %s", (profile, expected) => {
    expect(rustStringHash(profile).toString(16).padStart(16, "0")).toBe(
      expected,
    );
  });

  it.each([
    ["/Users/gus/prog/hav/haven", "286bfe90048ed91f"],
    ["/Users/gus/prog/hav/haven/.trees/some-branch", "68087ba0bd8a1824"],
    ["/a", "5efaa56e1b6d9df7"],
  ])("hashes checkout path %s", (path, expected) => {
    expect(rustPathHash(path).toString(16).padStart(16, "0")).toBe(expected);
  });

  it("builds both session name schemes", () => {
    expect(sharedSessionName("admin")).toBe("profile-4fe012b943a8949a");
    expect(checkoutSessionName("admin", "/Users/gus/prog/hav/haven")).toBe(
      "checkout-43a8949a048ed91f",
    );
  });
});
