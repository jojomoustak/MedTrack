import { describe, expect, it } from "vitest";
import { regionCrop } from "@/lib/camera/client/live-camera";

describe("regionCrop — the photo is exactly what the viewfinder's frame showed", () => {
  it("a phone held upright: a portrait camera image filling the screen, cropped to the frame", () => {
    // 390×844 screen, 1080×1920 camera image: scaled ×0.4396 to cover, 42px cut off each side.
    expect(regionCrop(1080, 1920, 390, 844, { x: 27, y: 150, width: 336, height: 448 })).toEqual({ x: 158, y: 341, width: 764, height: 1019 });
  });

  it("the whole of a 3:4 element over a landscape image is its centred 3:4 part", () => {
    expect(regionCrop(1920, 1080, 300, 400, { x: 0, y: 0, width: 300, height: 400 })).toEqual({ x: 555, y: 0, width: 810, height: 1080 });
  });

  it("never reaches outside the camera image", () => {
    expect(regionCrop(1440, 1920, 300, 400, { x: -20, y: -20, width: 340, height: 440 })).toEqual({ x: 0, y: 0, width: 1440, height: 1920 });
  });

  it("an element not laid out yet gives an empty crop, not a division by zero", () => {
    expect(regionCrop(1080, 1920, 0, 0, { x: 0, y: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
