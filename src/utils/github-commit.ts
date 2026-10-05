import { Buffer } from "node:buffer";

export interface RepoFile {
  path: string;
  // Text is committed inline in the tree; a Buffer is uploaded as a blob.
  content: string | Buffer;
}

interface GitHubOptions {
  repo: string; // "owner/name"
  token: string;
  fetch?: typeof fetch;
}

/**
 * The slice of the GitHub API the notes webhook needs. `fetch` is
 * injectable so tests can record calls instead of hitting the network.
 */
export function createGitHub({
  repo,
  token,
  fetch: fetchImpl = fetch,
}: GitHubOptions) {
  const call = async (method: string, path: string, body?: unknown) =>
    fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "tanvibhakta-notes-webhook",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const json = async <T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const res = await call(method, path, body);
    if (!res.ok) {
      throw new Error(
        `GitHub ${method} ${path} failed: ${res.status} ${await res.text()}`,
      );
    }
    return res.json() as Promise<T>;
  };

  /** A text file's content on `branch`, or null if it doesn't exist. */
  async function readFile(
    path: string,
    branch: string,
  ): Promise<string | null> {
    const res = await call(
      "GET",
      `/contents/${path}?ref=${encodeURIComponent(branch)}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(
        `GitHub read ${path} failed: ${res.status} ${await res.text()}`,
      );
    }
    const { content } = (await res.json()) as { content: string };
    return Buffer.from(content, "base64").toString("utf8");
  }

  /** Names of the entries in a directory on `branch`. */
  async function listDir(path: string, branch: string): Promise<string[]> {
    const entries = await json<{ name: string }[]>(
      "GET",
      `/contents/${path}?ref=${encodeURIComponent(branch)}`,
    );
    return entries.map((entry) => entry.name);
  }

  /**
   * Creates one text file in its own commit (Contents API). Returns false
   * if the path is already taken — GitHub answers 422 when a write without
   * a sha would overwrite an existing file — so callers can pick another.
   */
  async function createFile(
    path: string,
    content: string,
    message: string,
    branch: string,
  ): Promise<boolean> {
    const res = await call("PUT", `/contents/${path}`, {
      message,
      content: Buffer.from(content).toString("base64"),
      branch,
    });
    if (res.status === 422) return false;
    if (!res.ok) {
      throw new Error(
        `GitHub commit failed: ${res.status} ${await res.text()}`,
      );
    }
    return true;
  }

  /**
   * Commits every file in ONE commit on top of `branch` (Git Data API —
   * the Contents API can only write one file per commit, which could
   * leave a note pointing at an image that never landed). The ref update
   * is not forced: if the branch moved in between (a Sveltia edit), the
   * commit is rebuilt once on the new head.
   */
  async function commitFiles(
    files: RepoFile[],
    message: string,
    branch: string,
  ) {
    for (let attempt = 1; ; attempt++) {
      const ref = await json<{ object: { sha: string } }>(
        "GET",
        `/git/ref/heads/${branch}`,
      );
      const head = ref.object.sha;
      const headCommit = await json<{ tree: { sha: string } }>(
        "GET",
        `/git/commits/${head}`,
      );

      const tree = [];
      for (const file of files) {
        if (typeof file.content === "string") {
          tree.push({
            path: file.path,
            mode: "100644",
            type: "blob",
            content: file.content,
          });
        } else {
          const blob = await json<{ sha: string }>("POST", "/git/blobs", {
            content: file.content.toString("base64"),
            encoding: "base64",
          });
          tree.push({
            path: file.path,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          });
        }
      }
      const newTree = await json<{ sha: string }>("POST", "/git/trees", {
        base_tree: headCommit.tree.sha,
        tree,
      });
      const commit = await json<{ sha: string }>("POST", "/git/commits", {
        message,
        tree: newTree.sha,
        parents: [head],
      });

      const update = await call("PATCH", `/git/refs/heads/${branch}`, {
        sha: commit.sha,
        force: false,
      });
      if (update.ok) return;
      if (update.status !== 422 || attempt === 2) {
        throw new Error(
          `GitHub ref update failed: ${update.status} ${await update.text()}`,
        );
      }
    }
  }

  return { readFile, listDir, createFile, commitFiles };
}
