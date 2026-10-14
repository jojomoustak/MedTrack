"use client";

/**
 * A live camera inside the page — the photo screen's viewfinder (reference
 * mockup, screen 13). Before this (2026-10-09) that screen only looked like
 * a camera: its shutter opened the phone's own camera app, a second,
 * different camera screen. The Android WebView grants page camera access
 * through the app's own CAMERA permission (`GoNativeWebChromeClient.
 * onPermissionRequest`, Android repo), so the shutter can take the photo
 * right there; where a browser or WebView can't, the screen falls back to
 * the phone's camera as before.
 *
 * Frames never leave the device: only the one captured photo goes on, to
 * the same upload / offline-queue path as a picked file.
 */
/** A rectangle in the video element's own CSS pixels. */
export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LiveCamera {
  /** Whether this browser can show a camera inside the page at all. */
  supported(): boolean;
  /** The rear camera, asking for permission the first time. */
  open(): Promise<MediaStream>;
  /**
   * What the screen shows inside `region` right now, as a JPEG. The video
   * fills its element like CSS `object-fit: cover`; `region` is the
   * viewfinder's clear frame, so the photo is exactly what was framed.
   */
  capture(video: HTMLVideoElement, region: CaptureRegion): Promise<Blob>;
  /** Whether this stream's camera has a torch the page can switch (Chrome/Android WebView report it; others don't). */
  hasTorch?(stream: MediaStream): boolean;
  setTorch?(stream: MediaStream, on: boolean): Promise<void>;
}

/** Longest side of a captured photo — well under the 8 MB upload limit as a JPEG, and plenty to read a package. */
const MAX_SIDE_PX = 2000;
const JPEG_QUALITY = 0.9;

/**
 * The part of a `videoWidth`×`videoHeight` camera image that appears under
 * `region` of a `boxWidth`×`boxHeight` element the video fills like CSS
 * `object-fit: cover` (scaled to cover, centred, overflow cut off), in the
 * camera image's own pixels and kept inside it.
 */
export function regionCrop(videoWidth: number, videoHeight: number, boxWidth: number, boxHeight: number, region: CaptureRegion): CaptureRegion {
  if (videoWidth <= 0 || videoHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const scale = Math.max(boxWidth / videoWidth, boxHeight / videoHeight);
  const offsetX = (boxWidth - videoWidth * scale) / 2;
  const offsetY = (boxHeight - videoHeight * scale) / 2;
  const left = Math.max(0, Math.round((region.x - offsetX) / scale));
  const top = Math.max(0, Math.round((region.y - offsetY) / scale));
  const right = Math.min(videoWidth, Math.round((region.x + region.width - offsetX) / scale));
  const bottom = Math.min(videoHeight, Math.round((region.y + region.height - offsetY) / scale));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };

export const browserLiveCamera: LiveCamera = {
  supported() {
    return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function" && window.isSecureContext;
  },

  open() {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1920 } },
    });
  },

  capture(video, region) {
    const crop = regionCrop(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight, region);
    if (crop.width === 0 || crop.height === 0) return Promise.reject(new Error("camera not ready"));
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(crop.width, crop.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.width * scale);
    canvas.height = Math.round(crop.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return Promise.reject(new Error("no canvas"));
    context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("capture failed"))), "image/jpeg", JPEG_QUALITY);
    });
  },

  hasTorch(stream) {
    const track = stream.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as TorchCapabilities | undefined;
    return capabilities?.torch === true;
  },

  async setTorch(stream, on) {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
  },
};

export function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}
