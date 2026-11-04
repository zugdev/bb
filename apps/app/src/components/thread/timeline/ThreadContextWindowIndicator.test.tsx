// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadContextWindowCard } from "./ThreadContextWindowIndicator";

const usage = { usedTokens: 1000, modelContextWindow: 10000, estimated: false };

describe("ThreadContextWindowCard compaction", () => {
  afterEach(cleanup);

  it("compacts when the button is enabled", () => {
    const onCompact = vi.fn();
    render(
      <ThreadContextWindowCard
        usage={usage}
        compaction={{ disabledReason: null, onCompact }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    expect(onCompact).toHaveBeenCalledOnce();
  });

  it("disables the button and shows why", () => {
    const onCompact = vi.fn();
    render(
      <ThreadContextWindowCard
        usage={usage}
        compaction={{
          disabledReason: "Available when the turn finishes",
          onCompact,
        }}
      />,
    );
    const button = screen.getByRole("button", { name: "Compact" });
    expect(button).toHaveProperty("disabled", true);
    expect(screen.getByText("Available when the turn finishes")).toBeTruthy();
    fireEvent.click(button);
    expect(onCompact).not.toHaveBeenCalled();
  });
});
