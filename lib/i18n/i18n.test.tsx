// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/sound/client/play-sound", () => ({ playSound: vi.fn() }));

const { translate } = await import("@/lib/i18n/translate");
const { T, useLanguage } = await import("@/lib/i18n/client");
const { LanguageToggle } = await import("@/components/shell/LanguageToggle");
const { LANGUAGE_STORAGE_KEY } = await import("@/lib/i18n/language");

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("translate", () => {
  it("Greek stays as written; English comes from the dictionary", () => {
    expect(translate("el", "Σήμερα")).toBe("Σήμερα");
    expect(translate("en", "Σήμερα")).toBe("Today");
  });

  it("fills {placeholders} in either language", () => {
    expect(translate("el", "{taken} από {total} ελήφθησαν", { taken: 2, total: 3 })).toBe("2 από 3 ελήφθησαν");
    expect(translate("en", "{taken} από {total} ελήφθησαν", { taken: 2, total: 3 })).toBe("2 of 3 taken");
  });

  it("text with no English yet shows in Greek rather than blank", () => {
    expect(translate("en", "Κάτι που δεν έχει μεταφραστεί ακόμα")).toBe("Κάτι που δεν έχει μεταφραστεί ακόμα");
  });
});

function Probe() {
  return (
    <p>
      <span data-testid="language">{useLanguage()}</span> <T>Σήμερα</T>
    </p>
  );
}

// Owner's request 2026-10-21: tap the flag, English; tap again, Greek.
describe("LanguageToggle", () => {
  it("switches between Greek and English, showing the screen in the new language at once and remembering it", () => {
    render(
      <>
        <LanguageToggle />
        <Probe />
      </>,
    );
    expect(screen.getByText("Σήμερα")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Switch to English" }));
    expect(screen.getByText("Today")).toBeTruthy();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
    expect(document.documentElement.lang).toBe("en");

    fireEvent.click(screen.getByRole("button", { name: "Αλλαγή σε Ελληνικά" }));
    expect(screen.getByText("Σήμερα")).toBeTruthy();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("el");
  });

  it("opens in the language chosen before", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "en");
    render(<Probe />);
    expect(screen.getByTestId("language").textContent).toBe("en");
    expect(screen.getByText("Today")).toBeTruthy();
  });
});
