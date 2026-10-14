import type { CSSProperties, ReactNode, Ref } from "react";

/**
 * Frame width: 86% of the screen like the native package-reading screen,
 * but never so tall that it crowds the bar above or the controls below
 * (19rem is their height plus the line under the frame), nor huge on a
 * tablet. Its height follows from the 3:4 aspect.
 */
const FRAME_STYLE: CSSProperties = { width: "min(86vw, calc((100dvh - 19rem) * 0.75), 26rem)" };

/**
 * The white guide corners: 4px strokes centred on the frame's edge, curving
 * with its 22px corner and running 30px along each side, as on the native
 * scanner screens (`CameraFrameOverlay`, Android repo).
 */
function FrameCorners() {
  const corner = "pointer-events-none absolute size-8 border-white";
  return (
    <>
      <span aria-hidden="true" className={`${corner} -top-0.5 -left-0.5 rounded-tl-3xl border-t-4 border-l-4`} />
      <span aria-hidden="true" className={`${corner} -top-0.5 -right-0.5 rounded-tr-3xl border-t-4 border-r-4`} />
      <span aria-hidden="true" className={`${corner} -bottom-0.5 -left-0.5 rounded-bl-3xl border-b-4 border-l-4`} />
      <span aria-hidden="true" className={`${corner} -right-0.5 -bottom-0.5 rounded-br-3xl border-r-4 border-b-4`} />
    </>
  );
}

export interface CameraViewfinderProps {
  /** Top row: close, title. Stays above the dimming. */
  top?: ReactNode;
  /** Fills the whole screen behind everything: the live camera. */
  background?: ReactNode;
  /** Inside the clear frame: the photo, or what to do. */
  children?: ReactNode;
  /** Just under the frame: the instruction, or what's happening. */
  below?: ReactNode;
  /** The bottom row of buttons. */
  controls?: ReactNode;
  /** Dims everything but the frame, over a live camera. */
  dimmed?: boolean;
  frameRef?: Ref<HTMLDivElement>;
}

/**
 * A full-screen camera screen in the style of the native scanner screens
 * (2026-10-15): black edge to edge, the camera dimmed everywhere except a
 * clear rounded frame with white corners, the instruction under the frame
 * and the buttons along the bottom. Only the layout: what's shown and what
 * the buttons do belong to the screen using it.
 */
export function CameraViewfinder({ top, background, children, below, controls, dimmed = false, frameRef }: CameraViewfinderProps) {
  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-black text-white">
      {background && <div className="absolute inset-0">{background}</div>}
      {top && <div className="relative z-20">{top}</div>}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4">
        <div
          ref={frameRef}
          style={FRAME_STYLE}
          className={`relative aspect-3/4 shrink-0 rounded-[22px] ${dimmed ? "shadow-[0_0_0_100vmax_rgb(0_0_0/0.59)]" : ""}`}
        >
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[22px]">{children}</div>
          <FrameCorners />
        </div>
        {/* Positioned, so it paints above the frame's dimming rather than under it. */}
        <div className="relative mt-5.5 flex min-h-12 w-full max-w-sm flex-col items-center gap-1.5 px-6 text-center text-[16px] leading-snug text-white/85">
          {below}
        </div>
      </div>
      {controls && <div className="relative z-20 px-6 pt-2 pb-7">{controls}</div>}
    </div>
  );
}
