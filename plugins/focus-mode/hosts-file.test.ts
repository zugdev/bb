import { describe, expect, it } from "vitest";
import { isBlocking, parseDomains, withFocusBlock } from "./hosts-file.js";

const HOSTS = "127.0.0.1\tlocalhost\n::1 localhost\n";

describe("focus mode hosts file", () => {
  it("adds the block once and removes it back to the original file", () => {
    const domains = parseDomains("x.com\nYouTube.com, www.reddit.com\nbad_domain!");
    expect(domains).toEqual(["x.com", "www.x.com", "youtube.com", "www.youtube.com", "www.reddit.com"]);
    const blocked = withFocusBlock(HOSTS, domains);
    expect(isBlocking(blocked)).toBe(true);
    expect(blocked).toContain("0.0.0.0 www.youtube.com\n:: www.youtube.com\n");
    expect(withFocusBlock(blocked, domains)).toBe(blocked);
    expect(withFocusBlock(blocked, null)).toBe(HOSTS);
    expect(isBlocking(HOSTS)).toBe(false);
  });
});
