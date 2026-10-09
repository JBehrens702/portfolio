import { describe, expect, it } from "vitest";
import {
  coordMark,
  isAllowedMarking,
  ofCount,
  pad,
  refMark,
  sectionMark,
  sheetMark,
  snap,
  ZONE_LETTERS,
} from "./markings";

describe("marking values", () => {
  it("zero-pads whole numbers and never goes below zero", () => {
    expect(pad(3)).toBe("03");
    expect(pad(240, 4)).toBe("0240");
    expect(pad(-5)).toBe("00");
    expect(pad(12.6)).toBe("13");
  });

  it("derives reference, section, and sheet numbers from an order and a count", () => {
    expect(ofCount(0, 5)).toBe("01/05");
    expect(refMark(2, 5)).toBe("REF 03/05");
    expect(sectionMark(0)).toBe("N°01");
    expect(sheetMark(1, 4)).toBe("SHT 02/04");
  });

  it("snaps coordinates to the 24 px grid", () => {
    expect(snap(250)).toBe(240);
    expect(snap(-8)).toBe(0);
    expect(coordMark(250, 130)).toBe("X 0240 · Y 0120");
  });

  it("uses drawing-sheet zone letters without I and O", () => {
    expect(ZONE_LETTERS).toHaveLength(24);
    expect(ZONE_LETTERS).not.toContain("I");
    expect(ZONE_LETTERS).not.toContain("O");
  });
});

describe("isAllowedMarking", () => {
  it.each([
    "01",
    "02/05",
    "A1",
    "B",
    "N°03",
    "REF 01/05",
    "REV A",
    "SCALE 1:1",
    "SHT 01/04 · SCALE 1:1 · REV A",
    "X 0240 · Y 0128",
    "±0.01",
    "Ø 24",
    "",
  ])("allows %j", (text) => {
    expect(isAllowedMarking(text)).toBe(true);
  });

  it.each([
    "SYSTEM ONLINE",
    "GPA 3.9",
    "YEARS 04",
    "Hello",
    "ref 01",
    "A B C",
    "I AM",
    "95%",
    "REF 01 — DONE",
    "X 0240, Y 0128",
  ])("rejects %j", (text) => {
    expect(isAllowedMarking(text)).toBe(false);
  });

  it("allows every value the helpers make", () => {
    for (let i = 0; i < 12; i++) {
      for (const text of [refMark(i, 12), sectionMark(i), sheetMark(i, 12), coordMark(i * 97, i * 53), ZONE_LETTERS[i]]) {
        expect(isAllowedMarking(text), text).toBe(true);
      }
    }
  });
});
