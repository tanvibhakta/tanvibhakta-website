---
title: "Update on my llm usage patterns (Jan 2026)"
publishedOn: 2026-01-31
---

Since [my last update](/blog/thoughts-on-ai-june-2025), I’ve gone all-in on [git worktrees](https://code.claude.com/docs/en/common-workflows#run-parallel-claude-code-sessions-with-git-worktrees).

I typically have between 2 to 4 tabs running, one for each worktree. Each tab will have between two to four “sections” running - one plain terminal for commands (I really dislike using [the ! thing](https://code.claude.com/docs/en/interactive-mode#quick-commands) in Claude because I can't seem to view the complete output), one with Claude for the primary issue of this worktree, perhaps one secondary Claude thing going with me trying to understand how some part of the codebase is implemented or doing a different exploration path of the solution myself. On the base worktree (which mostly points to `main`) I'll sometimes have a fourth pane doing some larger exploration/some update to the dev experience/some update to the ci etc, but the moment it becomes a change I want to keep an issue gets created and I branch + worktree.

I also have a few instances of Webstorm open, one for each worktree. [This (paid) plugin](https://plugins.jetbrains.com/plugin/23813-git-worktree) to add worktree switching support has been invaluable, but given how llms forefront worktree-based workflows I think this feature should go Webstorm’s base offering soon. I use the IDE to review changesets, make minor changes, and to store the scratch files... but that’s about it. I definitely don’t rely on it as much as I used to. Colleagues have gone entire days without needing to open an IDE. I’ve had to leave my beloved Github Desktop behind because while I love the intuitive and simple interface, there is simply no easy way to make it work with worktrees.

Here’s a detailed breakdown of how I use worktrees to tackle issues of different sizes.

## the small stuff

1. Spec out a small feature/bug on linear.
2. Create a worktree using the linear branch name. Since we work with in a monorepo with microservices, we have a custom script that clones the existing directory, and then copies the `.env` including a port offset, and the `.claude` folder. We do fresh installs of `pnpm` for every worktree but we use the same docker volumes and databases to reduce resources needed.
3. The llm already has most of the context it needs from the issue, pulled out via the linear cli. It knows to use [Explore](https://code.claude.com/docs/en/sub-agents#built-in-subagents) to figure out the relevant parts of the codebase. We have solid `Claude.md`s and `README`s for our services that the llm knows to use to jump off of.
4. The llm does the fix. I run claude in yolo mode, most permissions turned on via `.claude.settings.json` . If it's a UI change, in my initial prompt I ask the llm to take a screenshot of the result via the playwright mcp, and I just check that result before the commit. If it's any kind of backend/api change, I get the llm to use a [tdd skill](https://github.com/obra/superpowers/blob/main/skills/test-driven-development/SKILL.md) during the implementation. Both of these things get defined in the initial prompt.
5. ~~Review~~, manually tweak/confirm/test, commit + push + merge + deploy (I have [a skill called `/end`](https://raw.githubusercontent.com/Alt-AI-Inc/Base/refs/heads/main/.claude/skills/end/SKILL.md?token=GHSAT0AAAAAAC7VOCHCZ3XH36MD4Q6SVOE22L5532A) that does the last bits automatically and just alerts me if something reds on the ci)

### Scope for improvement

1. At work on a different project we're using [beads](https://github.com/steveyegge/beads), which is a cli-first task management tool that claude can use instead of its internal todo list. You can essentially run an agent to automatically pick up and do a lot of the manual stuff I'm doing around deciding to work on a task, creating a worktree etc. I don’t know if I _want_ to go _even faster_, but it’s certainly an option!

## the big stuff

1. Lay out the barebones with claude. I'm NOT using planning mode. I want it to go explore the codebase, find relevant files etc, and present a high level overview of what we're doing. I might even ask it to explain the problem statement to me/reframe the problem statement so that I can make sure all the initial constraints I have are represented.
2. Then I'll tweak the problem statement/the general problem area, sometimes with 2 or 3 back-and-forths until I'm happy with the way the question/task is framed at all[^1].
3. THEN I open a new claude code thread, paste in the refined high level problem statement, and use a [brainstorm](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md) skill I have to actually think through all of the large implementation details. This is where most of my time goes. I can spend 4 to 6 hours on this step. This brainstorm skill essentially does the work of defining the specifics of the implementation, covering all primary surface areas. The skill tries to be comprehensive and is reasonable, but it heavily relies on the prompt to understand where to go deep. I will sometimes introduce new considerations for it to "think" about, or look up the stuff it's suggesting myself. This step also spawns a few claude on the web sessions in learning mode where I'm trying to conceptually understand something, and some tabs where I’m reading the docs myself to confirm the statements Claude is making.
4. The brainstorm skill works by proposing a series of decisions, thinking through a few possible paths, and recording that path. When I'm happy with the majority of the decisions I’ve made, the LLM writes it all out in a document in `docs/plan/epic-name/YYYY-MM-DD-feature-name-design-document`. This is the design doc.
5. If the task is gnarly enough, I get a [writing plans](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md) skill to actually do the work of figuring out the implementation. The skill breaks down the proposed solution into very granular phases, and tasks. It finds the relevant files to change, the line numbers to change, the types to add, the functions to call. I only cursorily review the output of this skill/subagent. This work gets written into a much large implementation details document.
6. Sometimes I'll get a [code review agent](https://github.com/obra/superpowers/blob/main/skills/requesting-code-review/code-reviewer.md) to go over the plan. Depending on how complex the task is, I might ask it to go over the design decision document before accepting it, or the implementation details document. With the latter, the skill almost always catch functions that have been hallucinated, some esoteric but obvious bug in the implementation details, some security concern etc. The relevant file is updated with these observations.
7. Then I'll kill the last claude thread and open a new thread, just telling the llm to implement the file we’ve created using the [senior software engineer subagent](https://raw.githubusercontent.com/Alt-AI-Inc/Base/refs/heads/main/.claude/agents/senior-software-engineer.md?token=GHSAT0AAAAAAC7VOCHCEEWVQHL7D5QDYE742L56SVQ) with the tdd skill, spawning them to run in parallel. Then the LLM does its thing! This can take a while. Sometimes it will ping me 1/3rd of the way through to do a manual check of how things are going, but mostly I just let it runbe. The subagents know to commit after they finishes each task.
8. When it's all done, I get the code review agent to also look at the implementation. It catches some more things, but they'll often be irrelevant or over-engineering.
9. Then I'll do a manual test, and discover some extremely dumb thing missing - some flavour of the LLM implementing all the individual parts but forgetting to wire it together, etc, so I'll describe the issue and let the main agent fix it. I’ll do a few more manual tests for interactions with existing features that I didn’t talk about during the implementation. There will almost always be three obvious things to take care of. They will go in my scratch file or in new threads to fix immediately.
10. Then I create the PR, wait for nobody to review my PR for two days, and merge it in!

### Scope for improvement

1. I feel like I could be defining much better tests but I don't understand enough about how to do that yet, soon inshallah. I want to go through the [learn tests with book](https://quii.gitbook.io/learn-go-with-tests) but I’ve also been saying that for a bit now.
2. Ideally I also define the e2e playwright test in the design doc stage so that the llm can do it itself, but right now we have auth that doesn’t work with worktrees that blocks it, and I know I'll need to build some scaffolding to handle it that I don't have the time for rn.
3. Personally, I don't remember streets that I don't walk on - even if I've (been) driven around them many times. Similarly, I've noticed that details and context for the things I've worked on using the llm flow slip away from me much faster week-on-week than it used to. There are several possible reasons - I am working on a much larger surface area, I’m simply working on more issues than I normally would, I'm not having to figure out how the internals of something are to be able to use it - but it's still an issue. I'm going to have to figure out how to do a big-picture review and small-picture review for myself - or figure out other ways to revisit small systems within my codebase.

## More general notes

I think [skills](https://claude.com/docs/skills/overview) were the game changer for me. They're essentially just markdown files with some frontmatter that contain all those "You are a Senior Software Engineer" prompts we used to keep around in the clipboard from a few months ago.

I know a lot of people use [workflows](), which are essentially more invokable versions of [my ten-step program]() from above. A workflow allows one to attach a type of subagent and a type of skill to every task, and is often used to set claude loose on the codebase overnight. At work a colleague uses them extensively but they're a little to out of control for me right now - or maybe I'm not confident enough in my ability to spec a problem out well enough without oversight :)

## More general improvements I want to make

I feel like I need to move to [ghostty](https://ghostty.org/) because I hear it's much better with the flicker issues than iterm is. But claude has gotten a lot better about that in the recent updates, from what I can see. I don’t know what iterm features I’m locked into (probably just keyboard shortcuts?) but I’m loathe to make too many changes to my workflows as is.

I feel like I also need to move to Zed over Webstorm because, unfortunately, Webstorm just takes up too much RAM, and I can’t justify the cost (of losing memory). I really don’t want to do this though. Most other IDEs are horrible at [implementing JetBrains shortcuts](/blog/cursor-ux-issues#:~:text=Cursor%20is,symbol) and no, I don’t want to learn ~~VS Code~~ ~~Sublime Text~~ ~~TextMate~~ keybindings. I also fundamentally have a problem with an editor that prioritises [putting me in an audio channel with every other current user of their product](/blog/cursor-ux-issues#:~:text=Footnotes) over letting me talk to the robot the editor was built around.

## Addendum

I was recently made aware of [skills.sh](https://skills.sh/) which is a good place to start exploring available skills. Right now the leaderboards are full of the anthropic base skills + [obra's superpowers](https://github.com/obra/superpowers-marketplace), but it will be good to keep an eye on this over the next few months.

[^1]: I’m almost always working with a scratch file here, with a todo section and a list of problem spaces I am not yet ready to tackle but need to make a note of.
