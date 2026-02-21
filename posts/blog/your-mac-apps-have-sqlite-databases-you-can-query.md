---
title: "Your Mac apps have SQLite databases you can just query"
publishedOn: 2026-02-16
draft: true
---

I had an unsaved file in Zed - just a scratch buffer with some notes from a meeting. The tab title said "Mon, 9th Feb 2026" but I'd never saved it to disk. I needed that content somewhere else.

Turns out, getting it back was a five-minute SQLite exercise.

## What I did

Mac applications store their local state in `~/Library/Application Support/<AppName>/`. For Zed, that's:

```
~/Library/Application Support/Zed/
```

Inside, there's a `db/` folder with SQLite databases:

```
db/0-stable/db.sqlite
db/0-global/db.sqlite
```

I opened the stable one and listed the tables:

```bash
sqlite3 ~/Library/Application\ Support/Zed/db/0-stable/db.sqlite ".tables"
```

```
breakpoints             keybinding_editors      toolchains
center_panes            kv_store                trusted_worktrees
command_invocations     migrations              vim_global_marks_paths
editor_folds            pane_groups             vim_marks
editor_selections       panes                   workspaces
editors                 project_diffs
items                   remote_connections
items                   terminals
```

The `editors` table had what I needed. Looking at its schema:

```bash
sqlite3 ... "PRAGMA table_info(editors);"
```

```
item_id         INTEGER
workspace_id    INTEGER
path            BLOB
scroll_top_row  INTEGER
...
contents        TEXT
language        TEXT
buffer_path     TEXT
```

There it is - a `contents` column. Unsaved buffers get persisted here so Zed can restore them after a crash or restart. I filtered for rows where `contents` was non-empty:

```bash
sqlite3 ... "SELECT item_id, language, length(contents) FROM editors
              WHERE contents IS NOT NULL AND length(contents) > 0;"
```

One result. 3,378 characters of Plain Text. I dumped it out and there were my notes.

## What's interesting about this

Most native Mac apps (and Electron apps, and really any desktop app that needs to persist state) use SQLite internally. It's everywhere:

- **Zed** stores editor state, unsaved buffers, vim marks, workspace layout
- **Safari** stores history, bookmarks, and more in SQLite
- **Messages** stores your entire chat history in `~/Library/Messages/chat.db`
- **Photos** keeps its library metadata in SQLite
- **Chrome** stores history, cookies, autofill data in SQLite files in `~/Library/Application Support/Google/Chrome/Default/`

This isn't a secret or a hack. SQLite is genuinely the most deployed database engine in the world - it ships on every phone, every browser, every Mac. Apps use it because it's a single file, needs no server process, handles concurrent reads well, and is rock solid. Apple even recommends it via Core Data (which uses SQLite as its default backing store).

## How to explore any app's local database

1. Find the app's data directory:

   ```bash
   ls ~/Library/Application\ Support/
   ```

2. Look for `.sqlite`, `.db`, or `.sqlite3` files:

   ```bash
   find ~/Library/Application\ Support/<AppName> -name "*.sqlite" -o -name "*.db"
   ```

3. List the tables:

   ```bash
   sqlite3 <path-to-db> ".tables"
   ```

4. Check a table's schema:

   ```bash
   sqlite3 <path-to-db> "PRAGMA table_info(<table_name>);"
   ```

5. Query away:
   ```bash
   sqlite3 <path-to-db> "SELECT * FROM <table> LIMIT 5;"
   ```

`sqlite3` comes pre-installed on every Mac. No setup needed.

## The takeaway

Your apps aren't black boxes. Their local state is sitting right there in `~/Library/Application Support/`, often in a format you can read with a tool that's already on your machine. Next time you need to recover something, debug an app's behaviour, or just satisfy your curiosity about how an app works internally - crack open the SQLite database and have a look around.
