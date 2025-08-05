---
title: "Digital Garden: process optimization"
publishedOn: 2025-07-14
---

This garden will contain notes for various hacks, scripts, systems, and configurations I build/tweak/deploy to make some part of existing in a world with technology easier for me.

Headings that don't have body text are yet to be started.
Sometimes things will be in progress, and marked as such.

This is by no means an exhaustive list, merely a list of notes for things I tackle in this realm starting July 2025

# Technology devices

## [ ] Add tasks to my todoist via voice commands (google assistant)

I want to be able to add tasks to todoist in specific without having to touch a device. This is mostly for when I am driving, but I suspect will be quite useful when I have a cat sitting on my lap with the phone too far away, etc.

There isn't a native todoist <> Goggle Assistant because google wants everybody to use it's subpar [tasks app](https://tasks.google.com/tasks/) instead. But you _can_ ask it to add something to a list, and it will add the thing to a list on google keep.

Enter this script someone has written and so kindly made available to the rest of us: [keep2todoist](https://github.com/flecmart/keep2todoist)

The workflow is simple

1. You create a note on [keep.google.com](https://keep.google.com) titled "Task".
2. You say "Add an important task to the task list"
3. Gemini will connect to keep and do the thing
4. This script will check that particular note every M minutes and create a new task for that list in todoist via the todoist api
5. Ta da!

It needs to be hosted somewhere and requires a lot of extremely private credentials so I should be doing this myself as opposed to asking for a friend's box. Will update details here.

## [ ] Set up Dropbox sync so my writing can exist on all my devices

- My dropbox sync can also be source of truth for my obsidian vault
- So far the only time I use vault (and not ia writer) is when I need to serach through all my notes
- Dropbox sync stopped working suddenly, why?

## [ ] Write a script to add this site as the referrer for links I give it

## [ ] Write a script to return archive links of links I give it

## [ ] Write a script to frontmatter-ify exports from mataroa

# Car

## [ ] Phone calls I make move the screen away from navigation

This happens when I

1. Place a phone call
2. The person answers
3. The call is cut

Obviously this is really dangerous because I need navigation to see where I am going, and when the screen gets captured by the phone app I am wildly pressing a touch screen device with only half an eye on the road trying not to add 20 minutes to my commute by missing a turn.
