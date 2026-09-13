import { describe, expect, it, vi } from "vitest";
import { notifySessionRestored, onSessionRestored } from "@/lib/auth/client/session-restored-signal";

describe("session-restored-signal", () => {
  it("calls every subscribed listener when notified", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = onSessionRestored(a);
    const unsubB = onSessionRestored(b);

    notifySessionRestored();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });

  it("stops calling a listener once unsubscribed", () => {
    const listener = vi.fn();
    const unsubscribe = onSessionRestored(listener);
    unsubscribe();

    notifySessionRestored();

    expect(listener).not.toHaveBeenCalled();
  });
});
