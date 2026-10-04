import { describe, expect, test } from "vitest";
import { createGitHub } from "../src/utils/github-commit";

type Call = { method: string; path: string; body?: Record<string, unknown> };

// A fake GitHub API: routes "METHOD /path" to canned responses (a function
// may vary by call count) and records every call.
function fakeGitHub(routes: Record<string, (n: number) => [number, unknown]>): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const counts: Record<string, number> = {};
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace("/repos/me/site", "") + url.search;
    const key = `${method} ${path}`;
    calls.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const route = routes[key];
    if (!route) throw new Error(`unexpected ${key}`);
    counts[key] = (counts[key] ?? 0) + 1;
    const [status, json] = route(counts[key]);
    return new Response(JSON.stringify(json), { status });
  };
  return { fetch: fakeFetch as typeof fetch, calls };
}

const commitRoutes = (refUpdate: (n: number) => [number, unknown]) => ({
  "GET /git/ref/heads/main": (n: number): [number, unknown] => [
    200,
    { object: { sha: n === 1 ? "head1" : "head2" } },
  ],
  "GET /git/commits/head1": (): [number, unknown] => [
    200,
    { tree: { sha: "tree1" } },
  ],
  "GET /git/commits/head2": (): [number, unknown] => [
    200,
    { tree: { sha: "tree2" } },
  ],
  "POST /git/blobs": (): [number, unknown] => [201, { sha: "blob1" }],
  "POST /git/trees": (): [number, unknown] => [201, { sha: "newtree" }],
  "POST /git/commits": (): [number, unknown] => [201, { sha: "newcommit" }],
  "PATCH /git/refs/heads/main": refUpdate,
});

const files = [
  { path: "posts/notes/a.md", content: "note text" },
  { path: "posts/notes/images/a.webp", content: Buffer.from([1, 2, 3]) },
];

describe("commitFiles", () => {
  test("commits text inline and binaries as blobs, in one commit", async () => {
    const gh = fakeGitHub(commitRoutes(() => [200, {}]));
    const client = createGitHub({
      repo: "me/site",
      token: "t",
      fetch: gh.fetch,
    });
    await client.commitFiles(files, "note: photo", "main");

    expect(gh.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /git/ref/heads/main",
      "GET /git/commits/head1",
      "POST /git/blobs",
      "POST /git/trees",
      "POST /git/commits",
      "PATCH /git/refs/heads/main",
    ]);
    const [blob, tree, commit, ref] = gh.calls.slice(2).map((c) => c.body);
    expect(blob).toEqual({ content: "AQID", encoding: "base64" });
    expect(tree).toEqual({
      base_tree: "tree1",
      tree: [
        {
          path: "posts/notes/a.md",
          mode: "100644",
          type: "blob",
          content: "note text",
        },
        {
          path: "posts/notes/images/a.webp",
          mode: "100644",
          type: "blob",
          sha: "blob1",
        },
      ],
    });
    expect(commit).toEqual({
      message: "note: photo",
      tree: "newtree",
      parents: ["head1"],
    });
    expect(ref).toEqual({ sha: "newcommit", force: false });
  });

  test("rebuilds on the new head once if the branch moved", async () => {
    const gh = fakeGitHub(
      commitRoutes((n) =>
        n === 1 ? [422, { message: "not a fast forward" }] : [200, {}],
      ),
    );
    const client = createGitHub({
      repo: "me/site",
      token: "t",
      fetch: gh.fetch,
    });
    await client.commitFiles(files, "note: photo", "main");

    const commits = gh.calls.filter((c) => c.path === "/git/commits");
    expect(commits.map((c) => c.body?.parents)).toEqual([["head1"], ["head2"]]);
  });

  test("gives up after a second conflict", async () => {
    const gh = fakeGitHub(commitRoutes(() => [422, { message: "nope" }]));
    const client = createGitHub({
      repo: "me/site",
      token: "t",
      fetch: gh.fetch,
    });
    await expect(client.commitFiles(files, "m", "main")).rejects.toThrow(/422/);
  });

  test("throws on any other API error", async () => {
    const gh = fakeGitHub({
      ...commitRoutes(() => [200, {}]),
      "POST /git/blobs": () => [500, { message: "boom" }],
    });
    const client = createGitHub({
      repo: "me/site",
      token: "t",
      fetch: gh.fetch,
    });
    await expect(client.commitFiles(files, "m", "main")).rejects.toThrow(/500/);
  });
});

describe("readFile", () => {
  test("decodes UTF-8 content from the branch", async () => {
    const gh = fakeGitHub({
      "GET /contents/posts/notes/a.md?ref=topic": () => [
        200,
        {
          content: Buffer.from("héllo").toString("base64"),
          encoding: "base64",
        },
      ],
    });
    const client = createGitHub({
      repo: "me/site",
      token: "t",
      fetch: gh.fetch,
    });
    expect(await client.readFile("posts/notes/a.md", "topic")).toBe("héllo");
  });

  test("a missing file is null", async () => {
    const gh = fakeGitHub({
      "GET /contents/posts/notes/a.md?ref=main": () => [
        404,
        { message: "Not Found" },
      ],
    });
    const client = createGitHub({
      repo: "me/site",
      token: "t",
      fetch: gh.fetch,
    });
    expect(await client.readFile("posts/notes/a.md", "main")).toBeNull();
  });
});

describe("listDir", () => {
  test("returns entry names", async () => {
    const gh = fakeGitHub({
      "GET /contents/posts/notes?ref=main": () => [
        200,
        [{ name: "a.md" }, { name: "images" }],
      ],
    });
    const client = createGitHub({
      repo: "me/site",
      token: "t",
      fetch: gh.fetch,
    });
    expect(await client.listDir("posts/notes", "main")).toEqual([
      "a.md",
      "images",
    ]);
  });
});

describe("createFile", () => {
  test("creates a file on the branch", async () => {
    const gh = fakeGitHub({
      "PUT /contents/posts/notes/a.md": () => [201, {}],
    });
    const client = createGitHub({
      repo: "me/site",
      token: "t",
      fetch: gh.fetch,
    });
    expect(
      await client.createFile("posts/notes/a.md", "hi", "note: x", "topic"),
    ).toBe(true);
    expect(gh.calls[0].body).toEqual({
      message: "note: x",
      content: "aGk=",
      branch: "topic",
    });
  });

  test("returns false when the path is already taken", async () => {
    const gh = fakeGitHub({
      "PUT /contents/posts/notes/a.md": () => [
        422,
        { message: "sha wasn't supplied" },
      ],
    });
    const client = createGitHub({
      repo: "me/site",
      token: "t",
      fetch: gh.fetch,
    });
    expect(await client.createFile("posts/notes/a.md", "hi", "m", "main")).toBe(
      false,
    );
  });

  test("throws on other errors", async () => {
    const gh = fakeGitHub({
      "PUT /contents/posts/notes/a.md": () => [
        403,
        { message: "rate limited" },
      ],
    });
    const client = createGitHub({
      repo: "me/site",
      token: "t",
      fetch: gh.fetch,
    });
    await expect(
      client.createFile("posts/notes/a.md", "hi", "m", "main"),
    ).rejects.toThrow(/403/);
  });
});
