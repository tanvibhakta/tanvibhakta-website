---
title: "Rebase doesn't work for modern development teams"
publishedOn: 2025-10-18
---

# Rebase doesn’t work for modern development teams

Note: this is an opinionated post I wrote to try and understand my own thinking. I welcome opinions and my own as held here are subject to change.

I don’t think teams should standardise on using git rebase. I think it’s a fantastic idea in theory, but most teams shouldn’t use it.

### 1. Rebase rewrites history.

This is fine if you’re merging PRs every 4 hours - but the moment you’re doing things that take even a day or two, you lose context and it’s hard to redo conflict. This gets much worse if you’re doing feature branches. Often, a few different developers are working on a feature branch and it’s one developer who is responsible for rebasing on main every few hours. But that developer might not always have context for the (large!) changes that are coming in. I don’t think developers should be given the power to lose history in a workflow that involves multiple people.

### 2. Rebase isn’t built for codegen practices.

Rebase optimises for code preservation - but with Claude code and the ilk, code generation is cheap. We should be optimising for reduced code management time instead.

### 3. You cannot confirm the atomicity of a commit.

Since a merge commit is a new commit, you can run precommit hooks and other validators and confirm that your merge works as intended. That’s not true for rebase ([precommit doesn’t run after every conflict fixed]()). It’s hard to fix conflicts correctly when you have 112 commits in one branch and 52 commits in the other and they touch a lot of the same services. (This commit flow seems to be normal for teams heavily relying on codegen practices!). What this means is that you’ll often have a commit at the end anyway that “fixes something” - yes you could track down what commit the issue originated from and do a [fixup](), but how likely are you to to this at 8pm before your kid’s birthday party and you want to just get the PR in?

I suspect rebase can work well if

1. Developers work in different parts of the codebase with very little/no overlap
2. Or if developers work in highly synchronous teams where people know what’s going on in all parts of the codebase
3. Or if people are truly able to have very short-lived branches.

## Associated material

This is a bit of a hot take at work, and I want to know that I’m wrong. But I have spent at least 30 hours from Sept 1st to Oct 15th rebasing branches so I keenly feel the pain. What did I do wrong? I would like to change my mind. Here’s some material I have found that I need to respond to, to finish the mental model in my head.

1. Julia Evans on What can go wrong with [Git Rebase](https://jvns.ca/blog/2023/11/06/rebasing-what-can-go-wrong-/)
2. https://graphite.com/blog/why-ban-merge-commits
