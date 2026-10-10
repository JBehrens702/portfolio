import { describe, expect, it } from "vitest";
import { adoptStoredLabels, withBaseText } from "./labels-state";

describe("label editor state (KTD9)", () => {
  it("loads each label with its text as the loaded text", () => {
    expect(withBaseText({ resume: { text: "Resume", approved: false } })).toEqual({
      resume: { text: "Resume", approved: false, baseText: "Resume" },
    });
  });

  it("shows the stored approval after a save, and keeps an edit made while the save ran", () => {
    const sent = withBaseText({
      resume: { text: "Resume", approved: false },
      readMore: { text: "Read more", approved: false },
    });
    sent.resume = { ...sent.resume, text: "Download my resume" };
    // While the save runs, the owner edits readMore; resume stays as sent.
    const latest = { ...sent, readMore: { ...sent.readMore, text: "More" } };
    const stored = withBaseText({
      resume: { text: "Download my resume", approved: true },
      readMore: { text: "Read more", approved: false },
    });

    const next = adoptStoredLabels(stored, sent, latest);
    expect(next.resume).toEqual({ text: "Download my resume", approved: true, baseText: "Download my resume" });
    expect(next.readMore).toEqual({ text: "More", approved: false, baseText: "Read more" });
  });
});
