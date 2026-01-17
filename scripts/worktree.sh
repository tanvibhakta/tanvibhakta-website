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
  echo "Usage: pnpm worktree <branch-name>"
  exit 1
fi

# Get the repo root and name
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename "$REPO_ROOT")
PARENT_DIR=$(dirname "$REPO_ROOT")

# Create worktree path as sibling directory
WORKTREE_PATH="$PARENT_DIR/${REPO_NAME}-${BRANCH_NAME}"

# Check if worktree already exists
if [ -d "$WORKTREE_PATH" ]; then
  echo -e "${YELLOW}Worktree already exists at: $WORKTREE_PATH${NC}"
  echo ""
  echo -e "${GREEN}To enter and start Claude:${NC}"
  echo "  cd $WORKTREE_PATH && claude"
  exit 0
fi

# Check if branch exists locally or remotely
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME" 2>/dev/null; then
  echo -e "${GREEN}Using existing local branch: $BRANCH_NAME${NC}"
  git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH_NAME" 2>/dev/null; then
  echo -e "${GREEN}Using existing remote branch: origin/$BRANCH_NAME${NC}"
  git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
else
  echo -e "${YELLOW}Branch '$BRANCH_NAME' doesn't exist, creating from current HEAD${NC}"
  git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH"
fi

echo -e "${GREEN}Worktree created at: $WORKTREE_PATH${NC}"

# Copy local files
echo "Copying local files..."

# Copy .env if it exists
if [ -f "$REPO_ROOT/.env" ]; then
  cp "$REPO_ROOT/.env" "$WORKTREE_PATH/.env"
  echo "  - Copied .env"
fi

# Copy .claude directory if it exists
if [ -d "$REPO_ROOT/.claude" ]; then
  cp -r "$REPO_ROOT/.claude" "$WORKTREE_PATH/.claude"
  echo "  - Copied .claude/"
fi

# Install dependencies in the new worktree
echo "  - Installing dependencies..."
(cd "$WORKTREE_PATH" && pnpm install)
echo "  - Installed node_modules/"

echo ""
echo -e "${GREEN}Done! To enter and start Claude:${NC}"
echo "  cd $WORKTREE_PATH && claude"
