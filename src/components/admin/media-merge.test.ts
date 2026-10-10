import { describe, expect, it } from "vitest";
import { media } from "@/lib/content/test-fixtures";
import type { ImagesBlock } from "@/lib/content/schema";
import { placeUploadedImage, withCurrentAlt } from "./media-merge";

type Items = ImagesBlock["items"];

describe("an uploaded file takes the alt text of the image it replaces, as it is now", () => {
  it("copies the current alt text onto the uploaded file", () => {
    const uploaded = media("new.jpg");
    expect(withCurrentAlt(uploaded, media("old.jpg", { alt: "Typed during the upload" }))).toEqual({
      ...uploaded,
      alt: "Typed during the upload",
    });
  });

  it("leaves the uploaded file as it is without a current image or alt text", () => {
    const uploaded = media("new.jpg");
    expect(withCurrentAlt(uploaded, undefined)).toBe(uploaded);
    expect(withCurrentAlt(uploaded, media("old.jpg"))).toBe(uploaded);
    expect(withCurrentAlt(uploaded, media("old.jpg", { alt: "" }))).toBe(uploaded);
  });
});

describe("an image upload replaces the item it started on, wherever that item is now", () => {
  const a = { image: media("a.jpg", { alt: "A" }) };
  const b = { image: media("b.jpg", { alt: "B" }) };
  const empty = {};
  const uploaded = media("new.jpg");

  it("replaces the item that moved during the upload, with its latest alt text", () => {
    // The upload started on item a (index 0); the owner moved it down and changed its alt text.
    const aNow = { image: { ...a.image, alt: "A, changed" } };
    const list: Items = [b, aNow];
    expect(placeUploadedImage(list, a, uploaded)).toEqual([b, { image: { ...uploaded, alt: "A, changed" } }]);
  });

  it("replaces an item without an image by identity, even after a move", () => {
    const list: Items = [a, b, empty];
    expect(placeUploadedImage(list, empty, uploaded)).toEqual([a, b, { image: uploaded }]);
  });

  it("adds nothing when the item was removed during the upload", () => {
    const list: Items = [b];
    expect(placeUploadedImage(list, a, uploaded)).toBe(list);
    expect(placeUploadedImage(list, empty, uploaded)).toBe(list);
  });

  it("never puts the upload on the item that took the old index", () => {
    // The upload started on b (index 1); a was removed, so index 1 no longer exists and index 0 is b.
    const list: Items = [b];
    expect(placeUploadedImage(list, b, uploaded)).toEqual([{ image: { ...uploaded, alt: "B" } }]);
  });
});
