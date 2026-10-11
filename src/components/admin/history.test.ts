import { describe, expect, it } from "vitest";
import { EMPTY_HISTORY, record, redo, undo, type History } from "./history";

/** Applies a list of changes to a start value, as the editor does. */
function run(start: string, changes: { value: string; key?: string; at: number }[]) {
  let history: History<string> = EMPTY_HISTORY;
  let value = start;
  for (const change of changes) {
    history = record(history, value, change.key, change.at);
    value = change.value;
  }
  return { history, value };
}

describe("undo history (KTD10)", () => {
  it("undoes three changes back to the start and redoes them in order (AE3)", () => {
    let { history, value } = run("start", [
      { value: "moved", at: 0 },
      { value: "moved twice", at: 2000 },
      { value: "layout", at: 4000 },
    ]);
    const undone: string[] = [];
    for (let i = 0; i < 3; i++) {
      const step = undo(history, value)!;
      ({ history, value } = step);
      undone.push(value);
    }
    expect(undone).toEqual(["moved twice", "moved", "start"]);
    expect(undo(history, value)).toBeNull();
    const redone: string[] = [];
    for (let i = 0; i < 3; i++) {
      ({ history, value } = redo(history, value)!);
      redone.push(value);
    }
    expect(redone).toEqual(["moved", "moved twice", "layout"]);
    expect(redo(history, value)).toBeNull();
  });

  it("clears the redo steps after a new change", () => {
    let { history, value } = run("a", [{ value: "b", at: 0 }]);
    ({ history, value } = undo(history, value)!);
    history = record(history, value, undefined, 5000);
    expect(redo(history, "c")).toBeNull();
  });

  it("counts a burst of typing in one field as one step", () => {
    const changes = "hello world".split("").map((_, i) => ({ value: "hello world".slice(0, i + 1), key: "field:t1", at: i * 100 }));
    const { history, value } = run("", changes);
    expect(history.past).toEqual([""]);
    expect(undo(history, value)!.value).toBe("");
  });

  it("starts a new step when the typing pauses or moves to another field", () => {
    const { history } = run("", [
      { value: "a", key: "field:t1", at: 0 },
      { value: "ab", key: "field:t1", at: 3000 },
      { value: "abc", key: "field:t2", at: 3100 },
    ]);
    expect(history.past).toEqual(["", "a", "ab"]);
  });
});
