// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetSoundCacheForTests, playSound } from "@/lib/sound/client/play-sound";

describe("playSound", () => {
  let playSpy: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let pauseSpy: ReturnType<typeof vi.fn<() => void>>;
  let constructedSrcs: string[];

  beforeEach(() => {
    constructedSrcs = [];
    playSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    pauseSpy = vi.fn<() => void>();
    class FakeAudio {
      src: string;
      preload = "";
      constructor(src: string) {
        this.src = src;
        constructedSrcs.push(src);
      }
      play() {
        return playSpy();
      }
      pause() {
        pauseSpy();
      }
      cloneNode() {
        const clone = new FakeAudio(this.src);
        return clone as unknown as HTMLAudioElement;
      }
    }
    vi.stubGlobal("Audio", FakeAudio);
    // Re-armed after the Audio stub is in place, since it primes every
    // cached effect through that same constructor.
    __resetSoundCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays the correct file for each effect", () => {
    playSound("button");
    expect(constructedSrcs.some((s) => s.includes("button.mp3"))).toBe(true);

    playSound("success");
    expect(constructedSrcs.some((s) => s.includes("success.mp3"))).toBe(true);

    playSound("notification");
    expect(constructedSrcs.some((s) => s.includes("notification.mp3"))).toBe(true);
  });

  it("calls play() on the cloned instance", () => {
    playSound("button");
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it("never throws when play() rejects", () => {
    playSpy.mockRejectedValue(new Error("autoplay blocked"));
    expect(() => playSound("button")).not.toThrow();
  });

  it("never throws when the Audio constructor itself throws", () => {
    vi.stubGlobal(
      "Audio",
      class {
        constructor() {
          throw new Error("no audio hardware");
        }
      },
    );
    expect(() => playSound("button")).not.toThrow();
  });

  it("primes and immediately pauses every effect on the first real tap", async () => {
    document.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    await Promise.resolve();

    expect(constructedSrcs.some((s) => s.includes("button.mp3"))).toBe(true);
    expect(constructedSrcs.some((s) => s.includes("success.mp3"))).toBe(true);
    expect(constructedSrcs.some((s) => s.includes("notification.mp3"))).toBe(true);
    expect(pauseSpy).toHaveBeenCalledTimes(3);
  });

  it("only unlocks once — a later tap doesn't re-prime", async () => {
    document.dispatchEvent(new Event("pointerdown"));
    await Promise.resolve();
    await Promise.resolve();
    const callsAfterFirstTap = playSpy.mock.calls.length;

    document.dispatchEvent(new Event("pointerdown"));
    document.dispatchEvent(new Event("touchstart"));
    await Promise.resolve();

    expect(playSpy.mock.calls.length).toBe(callsAfterFirstTap);
  });
});

describe("playSound — decoded once, then played from memory (2026-10-09)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetSoundCacheForTests();
  });

  it("after the first tap decodes the sounds, a tap plays from memory without loading the file again", async () => {
    const started: unknown[] = [];
    class FakeAudioContext {
      state = "running";
      destination = {};
      resume() {
        return Promise.resolve();
      }
      decodeAudioData() {
        return Promise.resolve({ decodedBuffer: true });
      }
      createBufferSource() {
        const source = { buffer: null as unknown, connect: vi.fn(), start: vi.fn(() => started.push(source.buffer)) };
        return source;
      }
    }
    const fetchMock = vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
    const audioConstructed = vi.fn();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "Audio",
      class {
        constructor() {
          audioConstructed();
        }
        play() {
          return Promise.resolve();
        }
        pause() {}
        cloneNode() {
          return this;
        }
      },
    );
    __resetSoundCacheForTests();

    document.dispatchEvent(new Event("pointerdown"));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const fetchesAfterUnlock = fetchMock.mock.calls.length;
    const elementsAfterUnlock = audioConstructed.mock.calls.length;

    playSound("button");
    playSound("button");

    expect(started).toEqual([{ decodedBuffer: true }, { decodedBuffer: true }]);
    expect(fetchMock.mock.calls.length).toBe(fetchesAfterUnlock);
    expect(audioConstructed.mock.calls.length).toBe(elementsAfterUnlock);
  });
});
