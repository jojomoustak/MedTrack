import { describe, expect, it } from "vitest";
import { shortCatalogName } from "@/lib/domain/catalog-short-name";

// Every input below is a real description from the Ministry bulletins (`data/raw/ministry/`).
describe("shortCatalogName", () => {
  it.each([
    ["FLAGYL CAPS 500MG/CAP BTX30", "FLAGYL 500mg"],
    ["CYMBALTA GR.CAP 30MG/CAP BTX28(BLISTERS)", "CYMBALTA 30mg"],
    ["LANAMONT TABLET 10MG/TAB BTx30 (BLIST 3x10)", "LANAMONT 10mg"],
    ["MIGRALIN F.C.TAB 2,5 MG/TAB BTx 6 (BLIST 1 x 6 )", "MIGRALIN 2,5mg"],
    ["D READY SOFT.CAPS 75MCG/CAP BT X 4 ΣΕ BLISTER PVC/PVDC//ALU", "D READY 75mcg"],
    ["TECENTRIQ C/S.SOL.IN 840MG/VIAL (14ML) 1 VIAL x 14ML", "TECENTRIQ 840mg"],
  ])("brand and strength: %s", (full, short) => {
    expect(shortCatalogName(full)).toBe(short);
  });

  it.each([
    ["MAXARTAN F.C.TAB (50+12,5)MG/TAB BT x 28 (BLIST 2x14)", "MAXARTAN (50+12,5)mg"],
    ["COMBIPRESS PLUS® F.C.TAB (10 + 300 + 12,5) MG/TAB BTx30 TABS", "COMBIPRESS PLUS (10+300+12,5)mg"],
    ["COMBIPRESS PLUS® F.C.TAB (5 + 300 + 12,5) MG/TAB BTx30 TABS", "COMBIPRESS PLUS (5+300+12,5)mg"],
    ["ACTELSAR HCT TABLET (80+25) mg/ΤΑΒ BTx28 (Blister Alu/Alu)", "ACTELSAR HCT (80+25)mg"],
    ["BRIMICA GENUAIR PD.INH.MD 340mcg+12mcg BTx1 inhaler", "BRIMICA GENUAIR 340mcg+12mcg"],
  ])("combination strengths keep every amount: %s", (full, short) => {
    expect(shortCatalogName(full)).toBe(short);
  });

  it.each([
    ["PROCEF PD.ORA.SUS 250MG/5ML FLX60ML", "PROCEF 250mg/5ml"],
    ["IMRALDI INJ.SOL 40MG/0,8ML BTx2 PF. PENx0.8 ML", "IMRALDI 40mg/0,8ml"],
    ["HUMALOG (MIX 25 KWIKPEN) INJ.SUSP 100 U/ML BTx 5 PF PEN x 3ML", "HUMALOG (MIX 25 KWIKPEN) 100U/ml"],
    ["PAIN-OUT CUT.SOL 4% W/W BTx1 BOTTLEx30ML", "PAIN-OUT 4%"],
  ])("a per-volume strength keeps its volume: %s", (full, short) => {
    expect(shortCatalogName(full)).toBe(short);
  });

  it("keeps an irregular strength exactly as written instead of dropping it", () => {
    expect(shortCatalogName("CLEXANE INJ.SOL 15000anti-XaIU/1,0ML PF.SYR BT x10PF.SYR.x1,0ML")).toBe("CLEXANE 15000anti-XaIU/1,0ML");
    expect(shortCatalogName("HEMAFER EF.TAB 357(Fe+++100)MG/TAB BTx12 (STRIPS 3x4)")).toBe("HEMAFER 357(Fe+++100)MG/TAB");
  });

  it("anchors on the form code a strength follows, not a lookalike in the brand", () => {
    expect(shortCatalogName("STREPSILS® ORANGE VIT.C LOZ (1,2+0,6)MG/LOZ BTx24(BLIST 2x12LOZ)")).toBe("STREPSILS ORANGE VIT.C (1,2+0,6)mg");
    expect(shortCatalogName("ROPIVACAIN HCL/B. BRAUN INJ.SOL 7,5MG/ML BTx20PLASTIC AMPSx 10ML")).toBe("ROPIVACAIN HCL/B. BRAUN 7,5mg/ml");
    expect(shortCatalogName("TANTUM VERDE® MOUTH SPR 0.30% W/V FLx15 ML")).toBe("TANTUM VERDE 0.30%");
  });

  it("is just the brand when the description has no strength", () => {
    expect(shortCatalogName("STERILLIUM CUT.SOL BOTTLE x 1000 ML")).toBe("STERILLIUM");
    expect(shortCatalogName("VICKS VAPORUB OINTMENT VASE x 50 G")).toBe("VICKS VAPORUB");
  });

  it("leaves anything that isn't an official description unchanged", () => {
    expect(shortCatalogName("Metformin")).toBe("Metformin");
    expect(shortCatalogName("Panadol 500mg")).toBe("Panadol 500mg");
    expect(shortCatalogName("  ")).toBe("");
  });
});
