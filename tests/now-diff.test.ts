import { describe, expect, test } from "vitest";
import {
  diffMarkdown,
  diffParagraph,
  diffSequences,
  tokenize,
} from "../src/utils/now-diff";

describe("diffSequences", () => {
  test("keeps common items and marks the rest", () => {
    expect(diffSequences(["a", "b", "c"], ["a", "x", "c"])).toEqual([
      { type: "equal", value: "a" },
      { type: "del", value: "b" },
      { type: "ins", value: "x" },
      { type: "equal", value: "c" },
    ]);
  });
});

describe("tokenize", () => {
  test("keeps markdown links whole", () => {
    expect(tokenize("run [IndieWebClub](https://x.org/a b) now")).toEqual([
      "run",
      " ",
      "[IndieWebClub](https://x.org/a b)",
      " ",
      "now",
    ]);
  });
});

describe("diffParagraph", () => {
  test("joins changes separated only by whitespace", () => {
    expect(diffParagraph("I’m 28 this year.", "I’m 28 years old.")).toBe(
      'I’m 28 <del class="now-del">this year.</del><ins class="now-ins">years old.</ins>',
    );
  });

  test("marks a whole changed link", () => {
    expect(diffParagraph("see [a](/a)", "see [b](/b)")).toBe(
      'see <del class="now-del">[a](/a)</del><ins class="now-ins">[b](/b)</ins>',
    );
  });
});

describe("diffMarkdown", () => {
  test("collapses unchanged paragraphs to one ellipsis per run", () => {
    expect(
      diffMarkdown("one\n\ntwo\n\nthree\n\nfour", "one\n\ntwo\n\n3\n\nfour"),
    ).toBe(
      '…\n\n<del class="now-del">three</del><ins class="now-ins">3</ins>\n\n…',
    );
  });

  test("marks unpaired removed and added paragraphs whole", () => {
    expect(diffMarkdown("same\n\ngone", "same\n\nnew a\n\nnew b")).toBe(
      '…\n\n<del class="now-del">gone</del><ins class="now-ins">new a</ins>\n\n<ins class="now-ins">new b</ins>',
    );
  });
});
