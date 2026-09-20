import { describe, expect, it } from "vitest";
import {
  extractLanguageTag,
  heuristicDetectLanguage,
} from "../lib/language/detector";

describe("Language Detector", () => {
  it("detects Thai correctly", () => {
    expect(heuristicDetectLanguage("ช่วยตรวจ PR 1 ให้หน่อยครับ")).toBe("th-TH");
    expect(heuristicDetectLanguage("มีบั๊กตรงนี้ไหม")).toBe("th-TH");
  });

  it("strictly falls back to English for all non-Thai languages (Japanese, Spanish, French, etc.)", () => {
    expect(heuristicDetectLanguage("このPRをレビューしてください")).toBe("en-US");
    expect(heuristicDetectLanguage("¿Puedes revisar este PR por favor?")).toBe("en-US");
    expect(heuristicDetectLanguage("Bonjour, peux-tu vérifier cette PR s’il te plaît?")).toBe("en-US");
    expect(heuristicDetectLanguage("Hallo, bitte überprüfe diesen PR.")).toBe("en-US");
    expect(heuristicDetectLanguage("Ciao, puoi controllare questa PR?")).toBe("en-US");
  });

  it("defaults to English for standard developer English", () => {
    expect(heuristicDetectLanguage("Review PR 1, what needs to be fixed?")).toBe("en-US");
    expect(heuristicDetectLanguage("Is there a null check missing?")).toBe("en-US");
    expect(heuristicDetectLanguage("")).toBe("en-US");
  });

  it("extracts language tags and strips them cleanly", () => {
    const thai = extractLanguageTag("[LANG:th-TH] เรียบร้อยครับ ไม่มีบั๊ก");
    expect(thai.language).toBe("th-TH");
    expect(thai.cleanContent).toBe("เรียบร้อยครับ ไม่มีบั๊ก");

    const en = extractLanguageTag("[LANG:en-US] PR looks clean");
    expect(en.language).toBe("en-US");
    expect(en.cleanContent).toBe("PR looks clean");

    // Spaced tags: [ LANG:th-TH ]
    const spaced = extractLanguageTag("[ LANG:th-TH ] PR นี้เพิ่ม endpoint PUT");
    expect(spaced.language).toBe("th-TH");
    expect(spaced.cleanContent).toBe("PR นี้เพิ่ม endpoint PUT");

    // Multi-line and echoed question before tag
    const multiline = extractLanguageTag("PR 1 แก้อะไรบ้าง\n[ LANG:th-TH ]\nPR นี้เพิ่ม endpoint สำหรับคำนวณ", "PR 1 แก้อะไรบ้าง");
    expect(multiline.language).toBe("th-TH");
    expect(multiline.cleanContent).toBe("PR นี้เพิ่ม endpoint สำหรับคำนวณ");
  });

  it("falls back to heuristic detection if language tag is missing", () => {
    const result = extractLanguageTag("ตรวจแล้วเรียบร้อยครับ");
    expect(result.language).toBe("th-TH");
    expect(result.cleanContent).toBe("ตรวจแล้วเรียบร้อยครับ");
  });
});
