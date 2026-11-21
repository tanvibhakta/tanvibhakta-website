import * as prettier from "prettier/standalone";
import * as markdown from "prettier/plugins/markdown";
import * as yaml from "prettier/plugins/yaml";

/**
 * Formats a whole markdown file, frontmatter included, the way the
 * pre-commit hook would. Writers that commit through the GitHub API (the
 * Telegram notes webhook) never pass through that hook, so without this CI's
 * `prettier --check` fails on their output. Uses the standalone build with
 * explicit plugins so the Netlify function bundle needs no dynamic plugin
 * loading. public/admin/index.html does the same for Sveltia saves.
 */
export function formatMarkdown(text: string): Promise<string> {
  return prettier.format(text, {
    parser: "markdown",
    plugins: [markdown, yaml],
  });
}
