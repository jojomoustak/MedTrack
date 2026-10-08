import { describe, expect, it } from "vitest";
import { backTarget } from "@/lib/navigation/back-target";

describe("backTarget", () => {
  it("offers no back on the root tabs", () => {
    for (const path of ["/today", "/medications", "/calendar", "/lists", "/profile", "/medications/"]) {
      expect(backTarget(path)).toEqual({ kind: "none" });
    }
  });

  it("goes up to the fixed parent on hierarchical screens", () => {
    expect(backTarget("/medications/abc")).toEqual({ kind: "parent", href: "/medications" });
    expect(backTarget("/medications/add")).toEqual({ kind: "parent", href: "/medications" });
    expect(backTarget("/medications/abc/edit")).toEqual({ kind: "parent", href: "/medications/abc" });
    expect(backTarget("/medications/abc/photo")).toEqual({ kind: "parent", href: "/medications/abc" });
    expect(backTarget("/medications/abc/inventory/correct")).toEqual({ kind: "parent", href: "/medications/abc" });
    expect(backTarget("/medications/abc/packages/add")).toEqual({ kind: "parent", href: "/medications/abc" });
    expect(backTarget("/lists/xyz")).toEqual({ kind: "parent", href: "/lists" });
    expect(backTarget("/profile/delete")).toEqual({ kind: "parent", href: "/profile" });
    expect(backTarget("/calendar/day")).toEqual({ kind: "parent", href: "/calendar" });
  });

  it("returns to wherever Dose Detail was opened from", () => {
    expect(backTarget("/calendar/dose/d1")).toEqual({ kind: "history", fallback: "/today" });
  });

  it("still offers a way out of an inner screen with no rule", () => {
    expect(backTarget("/somewhere/new")).toEqual({ kind: "history", fallback: "/today" });
  });
});
