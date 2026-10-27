import { describe, expect, test, vi } from "vitest";
import {
  archiveKey,
  capture,
  collectLinks,
  findSnapshot,
  gatherLinks,
  serializeArchives,
  shouldArchive,
  SOCIAL_DOMAINS,
  updateArchives,
  type ArchiveMap,
} from "../sync.js";

describe("archiveKey", () => {
  test("drops the fragment and lowercases the host", () => {
    expect(archiveKey("https://Example.com/a?b=1#c")).toBe(
      "https://example.com/a?b=1",
    );
  });
  test.each(["/relative", "#frag", "mailto:a@b.c", "not a url"])(
    "%s has no key",
    (href) => expect(archiveKey(href)).toBeNull(),
  );
});

describe("shouldArchive", () => {
  const exclude = [...SOCIAL_DOMAINS, "goodreads.com", "me.example"];

  test.each([
    "https://ankursethi.com/blog/",
    "http://en.wikipedia.org/wiki/Bangalore",
    "https://notx.com/",
  ])("%s is archived", (href) =>
    expect(shouldArchive(href, exclude)).toBe(true),
  );

  test.each([
    "https://www.goodreads.com/book/show/1",
    "https://www.instagram.com/p/1",
    "https://in.linkedin.com/in/someone",
    "https://x.com/someone",
    "https://web.archive.org/web/2020/https://a.com",
    "https://archive.ph/abc",
    "https://www.me.example/",
    "/blog/",
  ])("%s is skipped", (href) =>
    expect(shouldArchive(href, exclude)).toBe(false),
  );
});

describe("collectLinks", () => {
  test("finds inline, reference, autolink and bare GFM URLs", () => {
    const md = [
      "[inline](https://a.com/x) and [ref][r] and <https://c.com>",
      "bare https://d.com/y here, [rel](/internal), ![img](https://e.com/i.png)",
      "",
      "[r]: https://b.com/",
    ].join("\n");
    expect(collectLinks(md).sort()).toEqual([
      "https://a.com/x",
      "https://b.com/",
      "https://c.com",
      "https://d.com/y",
    ]);
  });
});

describe("gatherLinks", () => {
  test("keeps archivable links with the earliest linking date", () => {
    const links = gatherLinks(
      [
        { markdown: "[a](https://a.com/#x)", date: "20240501" },
        { markdown: "[a](https://a.com/)", date: "20220101" },
        { markdown: "[g](https://goodreads.com/b)", date: "20230101" },
        { markdown: "[undated](https://b.com/)" },
      ],
      { exclude: ["goodreads.com"] },
    );
    expect(Object.fromEntries(links)).toEqual({
      "https://a.com/": "20220101",
      "https://b.com/": "",
    });
  });
});

test("serializeArchives sorts keys", () => {
  expect(serializeArchives({ "https://b/": "B", "https://a/": "A" })).toBe(
    '{\n  "https://a/": "A",\n  "https://b/": "B"\n}\n',
  );
});

/** A fetch stub answering from a URL pattern → JSON table, first match wins. */
function fakeFetch(
  responses: [RegExp, unknown | ((init?: RequestInit) => unknown)][],
) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const match = responses.find(([pattern]) => pattern.test(String(url)));
    if (!match) return new Response("not found", { status: 404 });
    const body = typeof match[1] === "function" ? match[1](init) : match[1];
    return Response.json(body);
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const available = (url: string, status = "200") => ({
  archived_snapshots: {
    closest: { available: true, status, timestamp: "20220101", url },
  },
});
const none = { archived_snapshots: {} };

describe("findSnapshot", () => {
  test("returns the closest snapshot over https, asking near the date", async () => {
    const f = fakeFetch([
      [/available/, available("http://web.archive.org/web/20220101/a.com")],
    ]);
    expect(await findSnapshot("https://a.com/", "20220101", f)).toBe(
      "https://web.archive.org/web/20220101/a.com",
    );
    const asked = new URL(String(f.mock.calls[0][0]));
    expect(asked.searchParams.get("url")).toBe("https://a.com/");
    expect(asked.searchParams.get("timestamp")).toBe("20220101");
  });
  test("ignores error-page captures", async () => {
    const f = fakeFetch([[/available/, available("http://x", "404")]]);
    expect(await findSnapshot("https://a.com/", "", f)).toBeNull();
  });
  test("returns null when nothing is archived", async () => {
    const f = fakeFetch([[/available/, none]]);
    expect(await findSnapshot("https://a.com/", "", f)).toBeNull();
  });
});

describe("capture", () => {
  const keys = { access: "AK", secret: "SK" };

  test("submits a job with the S3 keys and polls it to success", async () => {
    let polls = 0;
    const f = fakeFetch([
      [
        /\/save\/status\/job-1$/,
        () =>
          ++polls < 2
            ? { status: "pending" }
            : {
                status: "success",
                timestamp: "20261027",
                original_url: "https://a.com/",
              },
      ],
      [/\/save$/, { url: "https://a.com/", job_id: "job-1" }],
    ]);
    expect(await capture("https://a.com/", keys, { fetch: f, pollMs: 0 })).toBe(
      "https://web.archive.org/web/20261027/https://a.com/",
    );
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "LOW AK:SK",
    );
    expect(String(init.body)).toContain("url=https%3A%2F%2Fa.com%2F");
  });

  test("throws when the capture fails", async () => {
    const f = fakeFetch([
      [/\/save\/status\//, { status: "error", message: "blocked" }],
      [/\/save$/, { job_id: "j" }],
    ]);
    await expect(
      capture("https://a.com/", keys, { fetch: f, pollMs: 0 }),
    ).rejects.toThrow("blocked");
  });
});

describe("updateArchives", () => {
  test("prunes stale entries, skips known ones, and records new ones", async () => {
    const archives: ArchiveMap = {
      "https://old.com/": "https://web.archive.org/web/1/old",
      "https://known.com/": "https://web.archive.org/web/1/known",
    };
    const f = fakeFetch([
      [/new\.com/, available("https://web.archive.org/web/2/new")],
      [/available/, none],
    ]);
    const result = await updateArchives(
      archives,
      new Map([
        ["https://known.com/", ""],
        ["https://new.com/", ""],
        ["https://unarchived.com/", ""],
      ]),
      { fetch: f, paceMs: 0 },
    );
    expect(archives).toEqual({
      "https://known.com/": "https://web.archive.org/web/1/known",
      "https://new.com/": "https://web.archive.org/web/2/new",
    });
    expect(result).toEqual({
      added: 1,
      pruned: 1,
      missing: ["https://unarchived.com/"],
    });
    // known.com was never looked up.
    expect(f).toHaveBeenCalledTimes(2);
  });

  test("captures missing links only with keys, up to the cap", async () => {
    const f = fakeFetch([
      [/available/, none],
      [
        /\/save\/status\//,
        { status: "success", timestamp: "3", original_url: "u" },
      ],
      [/\/save$/, { job_id: "j" }],
    ]);
    const links = new Map([
      ["https://a.com/", ""],
      ["https://b.com/", ""],
    ]);
    const archives: ArchiveMap = {};
    const result = await updateArchives(archives, links, {
      fetch: f,
      paceMs: 0,
      pollMs: 0,
      keys: { access: "a", secret: "s" },
      maxCaptures: 1,
    });
    expect(Object.keys(archives)).toEqual(["https://a.com/"]);
    expect(result.missing).toEqual(["https://b.com/"]);

    const keyless: ArchiveMap = {};
    await updateArchives(keyless, links, { fetch: f, paceMs: 0 });
    expect(keyless).toEqual({});
  });

  test("a failing lookup is reported, not fatal", async () => {
    const f = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const log = vi.fn();
    const result = await updateArchives({}, new Map([["https://a.com/", ""]]), {
      fetch: f,
      paceMs: 0,
      log,
    });
    expect(result.missing).toEqual(["https://a.com/"]);
    expect(log).toHaveBeenCalledWith("✗ https://a.com/: offline");
  });
});
