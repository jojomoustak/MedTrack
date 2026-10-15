// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { UNDO_WINDOW_MS, useUndoableDelete } from "@/components/lists/use-undoable-delete";

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

describe("useUndoableDelete", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("deletes once the undo window closes", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableDelete(onConfirm));

    act(() => result.current.start());
    expect(result.current.pending).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Αναίρεση inside the window: nothing is deleted", () => {
    const onConfirm = vi.fn();
    const { result } = renderHook(() => useUndoableDelete(onConfirm));

    act(() => result.current.start());
    act(() => result.current.undo());
    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    });

    expect(result.current.pending).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("leaving inside the window still deletes: it used to be dropped silently (Flagyl, 2026-10-15)", () => {
    const onConfirm = vi.fn();
    const { result, unmount } = renderHook(() => useUndoableDelete(onConfirm));

    act(() => result.current.start());
    unmount();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS);
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a second tap inside the window doesn't schedule a second delete", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndoableDelete(onConfirm));

    act(() => result.current.start());
    act(() => result.current.start());
    await act(async () => {
      vi.advanceTimersByTime(UNDO_WINDOW_MS);
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
