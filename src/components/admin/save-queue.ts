// The admin page's saves run one after another (U4, KTD1). A save sends the
// stamps that the last save returned, so a second save that started while the
// first was still on its way would send the old stamps, and the server would
// refuse it as if another tab had changed the part. This happened on two uploads
// in a row: each upload saves the page at once. Saves from different editors
// also wait for each other, so they never race for one draft version and run
// out of the server's single retry.

/**
 * Returns a function that runs each save after the save before it has
 * finished, whether that one succeeded or failed. A save decides what it sends
 * when it starts, so it sees the stamps that the previous save returned.
 */
export function saveQueue(): <R>(save: () => Promise<R>) => Promise<R> {
  let last: Promise<unknown> = Promise.resolve();
  return (save) => {
    const run = last.then(save, save);
    last = run.catch(() => undefined);
    return run;
  };
}
