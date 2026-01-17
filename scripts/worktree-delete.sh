#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the branch name from argument
BRANCH_NAME="$1"

if [ -z "$BRANCH_NAME" ]; then
  echo -e "${RED}Error: Please provide a branch name${NC}"
  echo "Usage: pnpm worktree:delete <branch-name>"
  exit 1
fi

# Get the repo root and name
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
PARENT_DIR=$(dirname "$REPO_ROOT")

# Calculate worktree path
WORKTREE_PATH="$PARENT_DIR/${REPO_NAME}-${BRANCH_NAME}"

# Check if worktree exists
if [ ! -d "$WORKTREE_PATH" ]; then
  echo -e "${RED}Error: Worktree not found at: $WORKTREE_PATH${NC}"
  exit 1
fi

# Convert paths to Claude project directory names
# /Users/foo/bar becomes -Users-foo-bar
WORKTREE_CLAUDE_NAME=$(echo "$WORKTREE_PATH" | sed 's/\//-/g')
WORKTREE_CLAUDE_DIR="$HOME/.claude/projects/$WORKTREE_CLAUDE_NAME"

MAIN_REPO_CLAUDE_NAME=$(echo "$REPO_ROOT" | sed 's/\//-/g')
MAIN_REPO_CLAUDE_DIR="$HOME/.claude/projects/$MAIN_REPO_CLAUDE_NAME"

echo -e "${YELLOW}Moving Claude conversation history to main repo...${NC}"

# Move worktree Claude history to main repo's Claude directory
if [ -d "$WORKTREE_CLAUDE_DIR" ]; then
  mkdir -p "$MAIN_REPO_CLAUDE_DIR"
  # Copy all files from worktree claude dir to main repo claude dir
  cp -r "$WORKTREE_CLAUDE_DIR"/* "$MAIN_REPO_CLAUDE_DIR"/ 2>/dev/null || true
  rm -rf "$WORKTREE_CLAUDE_DIR"
  echo "  - Moved conversation history to main repo"
  echo "  - Conversations will appear in /resume from main repo"
else
  echo "  - No Claude conversation history found"
fi

# Remove the git worktree
echo -e "${YELLOW}Removing git worktree...${NC}"
git worktree remove "$WORKTREE_PATH"
echo "  - Removed worktree at $WORKTREE_PATH"

echo ""
echo -e "${GREEN}Done!${NC}"
echo ""
echo -e "${YELLOW}Note: The branch '$BRANCH_NAME' still exists. To delete it:${NC}"
echo "  git branch -d $BRANCH_NAME"
