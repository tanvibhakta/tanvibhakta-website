import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [".claude/worktrees/**", ".worktrees/**", "node_modules/**"],
  },
});
