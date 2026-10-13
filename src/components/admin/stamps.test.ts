import { describe, expect, it } from "vitest";
import type { Stamps } from "@/lib/content/parts";
import {
  changedAfterCheck,
  combineStamps,
  describeParts,
  mergeStamps,
  refusalAction,
  sendSave,
  settleSave,
  staleMessage,
} from "./stamps";
import type { SaveResult } from "./useDraftEditor";

// The browser side of the part stamps (U4): the editor's stamp bookkeeping,
// what a refusal offers, and the return banner's check and text. The browser
// behavior itself (two tabs, AE1 and AE4) is proven by the two-tab e2e spec (U8).

const keep = <T>(_stored: T, _sent: T, latest: T) => latest;
const takeStored = <T>(stored: T, sent: T, latest: T) => (latest === sent ? stored : latest);

describe("stamps after a save", () => {
  it("replaces the held stamps with the stamps of a successful result", () => {
    const held: Stamps = { "card:windaid": "c1", "page:windaid": "p1" };
    const result: SaveResult<string> = { ok: true, savedAt: "2026-10-12T10:00:00Z", stamps: { "card:windaid": "c2", "page:windaid": "p2" } };
    const outcome = settleSave(result, "sent", "sent", held, takeStored);
    expect(outcome.stamps).toEqual({ "card:windaid": "c2", "page:windaid": "p2" });
    // The next save sends what the editor now holds.
    expect(mergeStamps(held, result.ok ? result.stamps! : {})).toEqual(outcome.stamps);
  });

  it("stores a kept part's base stamp exactly as the server returned it (KTD2)", () => {
    const held: Stamps = { "card:windaid": "c1", "page:windaid": "p1" };
    // The server wrote the card and kept the page from a newer draft: the page keeps the tab's base stamp.
    const result: SaveResult<string> = { ok: true, savedAt: "t", stamps: { "card:windaid": "c2", "page:windaid": "p1" } };
    expect(settleSave(result, "v", "v", held, keep).stamps).toEqual({ "card:windaid": "c2", "page:windaid": "p1" });
  });

  it("keeps stamps of other parts and keeps all stamps after a success without stamps (labels)", () => {
    expect(mergeStamps({ profile: "a", software: "s" }, { profile: "b" })).toEqual({ profile: "b", software: "s" });
    const held: Stamps = { profile: "a" };
    expect(settleSave({ ok: true, savedAt: "t" }, "v", "v", held, keep).stamps).toBe(held);
  });

  it("marks the value saved only when the owner did not edit while the save ran", () => {
    const result: SaveResult<string> = { ok: true, savedAt: "t", stamps: { profile: "b" } };
    expect(settleSave(result, "sent", "sent", { profile: "a" }, keep)).toMatchObject({ markSaved: true, value: "sent", status: { kind: "saved", at: "t" } });
    expect(settleSave(result, "sent", "typed more", { profile: "a" }, keep)).toMatchObject({ markSaved: false, value: "typed more" });
  });

  it("takes a stored value through adopt", () => {
    const result: SaveResult<string> = { ok: true, savedAt: "t", value: "stored" };
    expect(settleSave(result, "sent", "sent", {}, takeStored).value).toBe("stored");
  });

  it("covers AE1: an other-tab refusal keeps the value, the unsaved marker, and the stamps, and offers Reload", () => {
    const held: Stamps = { "card:windaid": "c1", "page:windaid": "p1" };
    const result: SaveResult<string> = {
      ok: false,
      message: "Not saved: another tab changed this part after you opened it.",
      reason: "other-tab",
    };
    const outcome = settleSave(result, "my edits", "my edits", held, takeStored);
    expect(outcome.value).toBe("my edits");
    expect(outcome.markSaved).toBe(false);
    expect(outcome.stamps).toBe(held);
    expect(outcome.status).toEqual({ kind: "refused", message: result.message, reason: "other-tab" });
    expect(refusalAction("other-tab")).toBe("reload");
  });
});

describe("what a refusal offers", () => {
  it("offers Reload for an out-of-date tab, Retry for a busy store, and nothing else otherwise", () => {
    expect(refusalAction("other-tab")).toBe("reload");
    expect(refusalAction("out-of-date")).toBe("reload");
    expect(refusalAction("busy")).toBe("retry");
    expect(refusalAction("missing-file")).toBe("none");
    expect(refusalAction(undefined)).toBe("none");
  });

  it("keeps the issues and the reason of a refusal in the status", () => {
    const outcome = settleSave({ ok: false, message: "Not saved: the change is not valid.", issues: ["x"] }, "v", "v", {}, keep);
    expect(outcome.status).toEqual({ kind: "refused", message: "Not saved: the change is not valid.", issues: ["x"] });
  });
});

describe("the return check (KTD5)", () => {
  it("combines the stamps that the editors registered into one check", () => {
    expect(combineStamps([{ profile: "a" }, { "card:windaid": "c" }, { software: "s" }])).toEqual({
      profile: "a",
      "card:windaid": "c",
      software: "s",
    });
    expect(combineStamps([])).toEqual({});
  });

  it("covers AE4: shows the parts that the check reports as changed", () => {
    const sent: Stamps = { "card:victaulic": "c1", "page:victaulic": "p1" };
    expect(changedAfterCheck({ ok: true, changed: ["page:victaulic"] }, sent, sent)).toEqual(["page:victaulic"]);
  });

  it("shows nothing when the check reports no change", () => {
    const sent: Stamps = { profile: "a" };
    expect(changedAfterCheck({ ok: true, changed: [] }, sent, sent)).toEqual([]);
  });

  it("ignores a failed check", () => {
    expect(changedAfterCheck({ ok: false, message: "There is no draft yet." }, {}, {})).toBeNull();
  });

  it("does not warn about a save that this tab made while the check ran", () => {
    const sent: Stamps = { "card:windaid": "c1", "page:windaid": "p1" };
    // This tab saved the page during the check: the editor now holds the new page stamp.
    const now: Stamps = { "card:windaid": "c1", "page:windaid": "p2" };
    expect(changedAfterCheck({ ok: true, changed: ["card:windaid", "page:windaid"] }, sent, now)).toEqual(["card:windaid"]);
  });

  it("shows no banner after a save in this tab, because the check sends the new stamps", () => {
    // After the save, the editor registers the result's stamps; the draft holds the same stamps.
    const afterSave = mergeStamps({ profile: "a" }, { profile: "b" });
    const draft: Stamps = { profile: "b" };
    const changed = Object.keys(afterSave).filter((key) => afterSave[key] !== draft[key]);
    expect(changedAfterCheck({ ok: true, changed: changed as never[] }, afterSave, afterSave)).toEqual([]);
  });
});

describe("the banner text", () => {
  const titles = { windaid: "WindAid", victaulic: "Victaulic" };

  it("names each changed section in plain words", () => {
    expect(describeParts(["profile", "card:windaid", "page:windaid", "software"], titles)).toEqual([
      "the profile",
      "the WindAid card",
      "the WindAid page",
      "the software cards",
    ]);
  });

  it("uses the slug when no title is known", () => {
    expect(describeParts(["page:new-page"], titles)).toEqual(['the "new-page" page']);
  });

  it("joins the names into one sentence", () => {
    expect(staleMessage(["page:victaulic"], titles)).toBe(
      "Another tab saved a newer version of the Victaulic page. Reload this page before you edit it.",
    );
    expect(staleMessage(["profile", "software"], titles)).toBe(
      "Another tab saved a newer version of the profile and the software cards. Reload this page before you edit it.",
    );
    expect(staleMessage(["profile", "card:windaid", "software"], titles)).toBe(
      "Another tab saved a newer version of the profile, the WindAid card, and the software cards. Reload this page before you edit it.",
    );
  });
});

// A save whose response was lost (the network failed after the server stored
// it) leaves the editor with the stamps from before that save. The next save
// would then be refused as "another tab changed this part", so it first sends
// the lost value again: the server accepts an identical resend.
describe("the save after a network failure sends the lost value first", () => {
  type Call = { value: string; base: Stamps };
  function server(answers: Array<SaveResult<string> | "network">) {
    const calls: Call[] = [];
    const persist = async (value: string, base: Stamps): Promise<SaveResult<string>> => {
      calls.push({ value, base });
      const answer = answers.shift();
      if (answer === undefined || answer === "network") throw new Error("network");
      return answer;
    };
    return { calls, persist };
  }
  const saved = (stamp: string): SaveResult<string> => ({ ok: true, savedAt: "now", stamps: { "page:a": stamp } });
  const otherTab: SaveResult<string> = { ok: false, message: "other tab", reason: "other-tab" };
  const held: Stamps = { "page:a": "S0" };

  it("sends only the new value when no save was lost", async () => {
    const { calls, persist } = server([saved("S1")]);
    const sent = await sendSave(persist, "X", held, null);
    expect(calls).toEqual([{ value: "X", base: held }]);
    expect(sent).toEqual({ kind: "done", result: saved("S1"), base: held });
  });

  it("resends the lost value first, then sends the new value with the stamps it returned", async () => {
    const { calls, persist } = server([saved("S1"), saved("S2")]);
    const sent = await sendSave(persist, "X2", held, "X1");
    expect(calls).toEqual([
      { value: "X1", base: held },
      { value: "X2", base: { "page:a": "S1" } },
    ]);
    expect(sent).toEqual({ kind: "done", result: saved("S2"), base: { "page:a": "S1" } });
  });

  it("sends once when the new value is the lost value (Retry)", async () => {
    const { calls, persist } = server([saved("S1")]);
    await sendSave(persist, "X1", held, "X1");
    expect(calls).toHaveLength(1);
  });

  it("stops with the refusal when the lost value is refused, and does not send the new value", async () => {
    const { calls, persist } = server([otherTab]);
    const sent = await sendSave(persist, "X2", held, "X1");
    expect(calls).toHaveLength(1);
    expect(sent).toEqual({ kind: "done", result: otherTab, base: held });
  });

  it("keeps the first lost value when its resend fails again", async () => {
    const { persist } = server(["network"]);
    expect(await sendSave(persist, "X2", held, "X1")).toEqual({ kind: "failed", lost: "X1", base: held });
  });

  it("keeps the stamps of a resend that landed when the new value is then lost", async () => {
    const { persist } = server([saved("S1"), "network"]);
    expect(await sendSave(persist, "X2", held, "X1")).toEqual({ kind: "failed", lost: "X2", base: { "page:a": "S1" } });
  });
});
