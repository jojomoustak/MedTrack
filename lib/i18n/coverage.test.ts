import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EN } from "@/lib/i18n/en";

/**
 * English coverage (2026-10-21). The app is translated in stages; each
 * converted file is listed here, and from then on every Greek text in it
 * must have its English (`lib/i18n/en.ts`), and Greek written straight
 * into a screen must sit inside `<T>…</T>`. A changed Greek sentence with
 * no matching English entry fails here instead of quietly showing Greek
 * to someone who chose English.
 */
const TRANSLATED = [
  // Stage 1 (2026-10-21): the shell, Today, Welcome and the sign-in screens.
  "components/shell/ScreenHeader.tsx",
  "components/shell/BackButton.tsx",
  "components/shell/BottomNav.tsx",
  "components/shell/AppBar.tsx",
  "components/shell/ScreenSkeletons.tsx",
  "components/shell/LanguageToggle.tsx",
  "components/ui/AlertBanner.tsx",
  "components/ui/Skeleton.tsx",
  "components/sync/OfflineBanner.tsx",
  "components/sync/SyncStatusChip.tsx",
  "components/sync/sync-state-config.ts",
  "components/doses/DoseStatus.tsx",
  "app/(app)/today/page.tsx",
  "components/today/TodayDoseRow.tsx",
  "components/today/DayStrip.tsx",
  "app/welcome/page.tsx",
  "app/login/page.tsx",
  "app/register/page.tsx",
  "app/forgot-password/page.tsx",
  "app/reset-password/page.tsx",
  "app/email-verified/page.tsx",
  "components/auth/AuthBackLink.tsx",
  "components/auth/CheckEmailPanel.tsx",
  "components/auth/ForgotPasswordForm.tsx",
  "components/auth/GoogleAuthButton.tsx",
  "components/auth/LoginForm.tsx",
  "components/auth/PasswordInput.tsx",
  "components/auth/PasswordRule.tsx",
  "components/auth/RegisterForm.tsx",
  "components/auth/RegisterScreen.tsx",
  "components/auth/ResendVerificationButton.tsx",
  "components/auth/ResetPasswordForm.tsx",
  "lib/auth/client/google-auth-errors.ts",
  // Stage 2 (2026-10-21): Medicines, a medicine's screens and Add medicine.
  "app/(app)/medications/page.tsx",
  "app/(app)/medications/item/page.tsx",
  "app/(app)/medications/item/edit/page.tsx",
  "app/(app)/medications/item/inventory/correct/page.tsx",
  "app/(app)/medications/item/packages/add/page.tsx",
  "app/medications/add/page.tsx",
  "app/medications/item/photo/page.tsx",
  "components/medications/AddMedicationFlow.tsx",
  "components/medications/AddPackageForm.tsx",
  "components/medications/CandidateConfirmation.tsx",
  "components/medications/DeleteMedicationSection.tsx",
  "components/medications/DetailsStep.tsx",
  "components/medications/EditMedicationForm.tsx",
  "components/medications/ElapsedScheduleBuilder.tsx",
  "components/medications/EntryChooser.tsx",
  "components/medications/FormPicker.tsx",
  "components/medications/InventoryCorrectionForm.tsx",
  "components/medications/InventorySummary.tsx",
  "components/medications/ManualEntryForm.tsx",
  "components/medications/MedicationHeader.tsx",
  "components/medications/MedicationPhotoAttach.tsx",
  "components/medications/MedicationThumbnail.tsx",
  "components/medications/PackageList.tsx",
  "components/medications/PackageOcrCandidateFlow.tsx",
  "components/medications/PrnScheduleBuilder.tsx",
  "components/medications/ReviewStep.tsx",
  "components/medications/ScanDiagnosticsPanel.tsx",
  "components/medications/ScanStep.tsx",
  "components/medications/ScheduleDatesReview.tsx",
  "components/medications/ScheduleKindChooser.tsx",
  "components/medications/SearchStep.tsx",
  "components/medications/StockUnitField.tsx",
  "components/medications/WallClockScheduleBuilder.tsx",
  "components/medications/form-options.ts",
  "components/ui/DateField.tsx",
  "components/ui/FilterTabs.tsx",
  "components/ui/SegmentedControl.tsx",
  "components/ui/SelectField.tsx",
  "components/ui/Tabs.tsx",
  "components/ui/TimeField.tsx",
  "lib/medications/labels.ts",
  "lib/medications/client/photo-api.ts",
  "lib/medications/client/use-display-names.ts",
  "lib/medications/server/photo.ts",
  "lib/validation/medication-photo.ts",
  "app/api/medications/[id]/photo/route.ts",
];

/** Greek that's deliberately Greek in every language (the Greek branch of a language-aware function, and similar). */
const GREEK_ONLY = new Set(["Αλλαγή σε Ελληνικά"]);

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const ROOT = join(__dirname, "..", "..");

function withoutComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s\/\/ .*$/gm, "");
}

interface Found {
  text: string;
  kind: "string" | "template" | "jsx";
  wrapped: boolean;
}

function greekIn(source: string): Found[] {
  let code = withoutComments(source);
  const found: Found[] = [];
  // Text inside <T>…</T> first, then taken out, so whatever Greek JSX text is left is unwrapped.
  code = code.replace(/<T>([^<]*)<\/T>/g, (_whole, inner: string) => {
    const text = inner.trim().replace(/\s+/g, " ");
    if (GREEK.test(text) && !text.startsWith("{")) found.push({ text, kind: "jsx", wrapped: true });
    // A ternary inside <T>{…}</T> keeps its string literals for the scan below.
    return text.startsWith("{") ? inner : "";
  });
  for (const m of code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    const text = m[1] ?? m[2] ?? m[3] ?? "";
    if (!GREEK.test(text)) continue;
    found.push({ text, kind: m[3] !== undefined && text.includes("${") ? "template" : "string", wrapped: true });
  }
  for (const m of code.matchAll(/>([^<>{}"'`]*[Ͱ-Ͽἀ-῿][^<>{}"'`]*)(?=<)/g)) {
    found.push({ text: m[1].trim().replace(/\s+/g, " "), kind: "jsx", wrapped: false });
  }
  return found;
}

describe("English coverage of the translated screens", () => {
  for (const file of TRANSLATED) {
    it(file, () => {
      const found = greekIn(readFileSync(join(ROOT, file), "utf8")).filter((f) => !GREEK_ONLY.has(f.text));
      const problems = [
        ...found.filter((f) => f.kind === "template").map((f) => `Greek in a template string (use t("…{name}…", { name })): ${f.text}`),
        ...found.filter((f) => f.kind === "jsx" && !f.wrapped).map((f) => `Greek on screen outside <T>…</T>: ${f.text}`),
        ...found.filter((f) => f.kind !== "template" && !(f.text in EN)).map((f) => `No English for: ${f.text}`),
      ];
      expect(problems).toEqual([]);
    });
  }

  it("every English entry keeps its Greek's {placeholders}", () => {
    const mismatched = Object.entries(EN).filter(([greek, english]) => {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
      return names(greek) !== names(english);
    });
    expect(mismatched).toEqual([]);
  });
});
