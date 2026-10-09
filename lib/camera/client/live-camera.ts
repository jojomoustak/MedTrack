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
export interface LiveCamera {
  /** Whether this browser can show a camera inside the page at all. */
  supported(): boolean;
  /** The rear camera, asking for permission the first time. */
  open(): Promise<MediaStream>;
  /** What the viewfinder shows right now (`aspect` = its width / height), as a JPEG. */
  capture(video: HTMLVideoElement, aspect: number): Promise<Blob>;
}

/** Longest side of a captured photo — well under the 8 MB upload limit as a JPEG, and plenty to read a package. */
const MAX_SIDE_PX = 2000;
const JPEG_QUALITY = 0.9;

/**
 * The centred part of a `width`×`height` frame that fills an `aspect`
 * viewfinder (CSS `object-fit: cover`), so the photo is exactly what the
 * user saw framed.
 */
export function coverCrop(width: number, height: number, aspect: number): { x: number; y: number; width: number; height: number } {
  if (width / height > aspect) {
    const cropWidth = Math.round(height * aspect);
    return { x: Math.round((width - cropWidth) / 2), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.round(width / aspect);
  return { x: 0, y: Math.round((height - cropHeight) / 2), width, height: cropHeight };
}

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

  capture(video, aspect) {
    const crop = coverCrop(video.videoWidth, video.videoHeight, aspect);
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
};

export function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}
