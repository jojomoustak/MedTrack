/** How long a saved file's in-memory address stays valid. */
const RELEASE_AFTER_MS = 60_000;

/**
 * Saves a file made on the phone: the browser downloads it; the Android app
 * (Median) stores it and opens it. Median reads the file from its address a
 * moment after the tap, so the address is released later rather than right
 * away, which would leave it nothing to read.
 */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), RELEASE_AFTER_MS);
}
