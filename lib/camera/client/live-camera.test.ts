import { describe, expect, it } from "vitest";
import { coverCrop } from "@/lib/camera/client/live-camera";

describe("coverCrop — the photo is exactly what the 3:4 viewfinder showed", () => {
  it("trims the sides of a frame wider than the viewfinder", () => {
    expect(coverCrop(1920, 1080, 3 / 4)).toEqual({ x: 555, y: 0, width: 810, height: 1080 });
  });

  it("trims top and bottom of a frame taller than the viewfinder (a phone held upright)", () => {
    expect(coverCrop(1080, 1920, 3 / 4)).toEqual({ x: 0, y: 240, width: 1080, height: 1440 });
  });

  it("keeps a frame that already matches", () => {
    expect(coverCrop(1440, 1920, 3 / 4)).toEqual({ x: 0, y: 0, width: 1440, height: 1920 });
  });
});
