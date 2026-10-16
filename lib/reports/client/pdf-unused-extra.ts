/**
 * Stands in for jsPDF's optional extras (html2canvas, canvg, DOMPurify:
 * drawing HTML and SVG into a PDF), aliased in `next.config.ts`. The doctor's
 * report draws neither, and the extras were ~385 KB more for every phone to
 * save for offline use (2026-10-16).
 */
export default function unavailable(): never {
  throw new Error("Not included in MedTrack: see next.config.ts.");
}
