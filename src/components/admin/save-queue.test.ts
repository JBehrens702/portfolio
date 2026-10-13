import { describe, expect, it } from "vitest";
import { saveQueue } from "./save-queue";

// Two uploads in a row each start a save. The second save must wait for the
// first one's result, because only that result carries the new stamps of the
// part; sent at once, it carries the old stamps and is refused as out of date.

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("an editor's saves run one after another", () => {
  it("starts a second save only after the first one has finished", async () => {
    const enqueue = saveQueue();
    const first = deferred();
    const order: string[] = [];
    const a = enqueue(async () => {
      order.push("first starts");
      await first.promise;
      order.push("first ends");
      return "a";
    });
    const b = enqueue(async () => {
      order.push("second starts");
      return "b";
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["first starts"]);
    first.resolve();
    expect(await a).toBe("a");
    expect(await b).toBe("b");
    expect(order).toEqual(["first starts", "first ends", "second starts"]);
  });

  it("reads what to send when the save starts, not when it is queued", async () => {
    const enqueue = saveQueue();
    const first = deferred();
    let stamp = "old";
    const firstSave = enqueue(async () => {
      await first.promise;
      stamp = "new";
    });
    const secondSent = enqueue(async () => stamp);
    first.resolve();
    await firstSave;
    expect(await secondSent).toBe("new");
  });

  it("still runs the next save when the one before it fails", async () => {
    const enqueue = saveQueue();
    const failed = enqueue(async () => {
      throw new Error("network");
    });
    const next = enqueue(async () => "saved");
    await expect(failed).rejects.toThrow("network");
    expect(await next).toBe("saved");
  });
});
