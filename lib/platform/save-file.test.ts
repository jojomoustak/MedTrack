// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveFile } from "@/lib/platform/save-file";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("saveFile", () => {
  it("downloads under the given name and keeps the file readable for the Android app to fetch afterwards", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:medtrack/1");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });

    const blob = new Blob(["%PDF-"], { type: "application/pdf" });
    saveFile(blob, "report.pdf");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual([{ href: "blob:medtrack/1", download: "report.pdf" }]);
    expect(document.querySelector("a")).toBeNull();
    // Median reads the file a moment after the tap: not released right away.
    vi.advanceTimersByTime(30_000);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:medtrack/1");
  });
});
