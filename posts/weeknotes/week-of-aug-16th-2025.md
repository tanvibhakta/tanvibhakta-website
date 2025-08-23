---
title: "Week of Aug 16th, 2025"
publishedOn: 2025-08-16
---

## Work

I’ve been working on more editors! A few weeks ago I built a toy app on top of [Lexical](https://lexical.dev/); this week I’ve been working with [Prose Mirror](https://prosemirror.net/). I can appreciate the [complexity of some of the issues Haverbeke](https://marijnhaverbeke.nl/blog/prosemirror.html) came up on that prompted him to build it.

Two (two!!) different projects I’ve worked on recently have had engineers decide that they can just reinvent the wheel and handle text editing functions themselves... though I don’t think it’s the engineer that actually made the decision, it’s the LLM they were using. They didn’t know better. I think this is what we will see a lot of in the next few years - codebases that have a lot of unnecessary complexity (and therefore fragility) because senior leadership thought it was okay to throw a bunch of junior developers with code agents at a problem and trust the outputs.

It’s not the fault of the junior developer, of course. They [don’t know what they don’t know](https://en.wikipedia.org/wiki/Dunning%E2%80%93Kruger_effect)! It took me a while too, to understand the kinds of complexities that can exist in any technical problem space, and how to best tackle them. They haven’t thought about how to prompt the llm to tell them what they _should_ know.

I think I understand the hype that surrounded “prompt engineering” a while ago. Knowing how to tell [person/machine/blob] exactly what to do, what not to do, what to consider, and how to respond, all in one go is a skill of clarity that very few have. At the time the hype felt like snake oil. Now I still side eye people who use it unironically, but it’s interesting problem to solve: In a world where llms are a normal part of the toolkit, how can we help people ~craft better prompts~ arrive at levers for manipulating an information machine better?

Some solutions off the top of my head, specific to engineering contexts:

1. All codebases should have an [agents.md](https://agent-rules.org/) that contains only the intentional patterns in your app. This thing should be more instructive than whatever Claude puts on an `/init`.
2. Maybe, at an org level, senior engineers regularly review prompts instead of reviewing (just) code.
3. I think [pair programming](https://martinfowler.com/articles/on-pair-programming.html) gets more important (not less) because the levers to manipulate the tool of “prompt” is more amorphous than the tool of “IDE” or “terminal” or “search engine”.

---

Reader, after my last post I did in fact get sick. This means that some work stuff that was supposed to end last week has only ended this week. I’m unhappy about it but what to do? It’s a good reminder that with contracting, I need to schedule at 60% to 80% capacity _no matter what_.

I’ve been going _fast_ for a few weeks now. I am really enjoying it and myself. This feels like one of those skills that compound with time. In the near future I’m hoping to work with more people who can unlock that for me.

## Life

I hosted a TTRPG with the [Museum of Art and Photography](https://map-india.org/) last Saturday. I haven’t been back since my disastrous attempt at a staycation[^1] in 2023, but realised that the [exhibit I saw then](https://map-india.org/exhibition/visible-invisible/) halfway through is up for two more months! I hope I can go back again... but as I’m typing this, I’m realizing that work is going to get SO hectic over the next three months that I should be shelving even some of the community stuff I’m doing, not adding more things to my calendar.

I hosted a friend’s birthday board game (yes that’s a thing) on Friday, in the third room. I love the feeling of knowing I have a house full of people I love. The person I’m living with is likely to move houses soon, and I thought I’d need to get a flatmate - but do I? I don’t want to live with strangers, I want to live with friends. So either I do flatmate interviews (haha) or I get people from all over to come visit me. I would very much like to do the latter. If you know me, even tangentially, please know that right now is a GREAT time to come live in my house for a little bit. I will even offer this: Do you have a project you’ve been putting off doing that is important? Come home and don’t leave until it’s done. I’m working all the time so you won’t laze (body! doubling!), and I have a spare desk in my office too. And if you’re a friend with a friend who is cool and might benefit from this, send this to them. Offer valid for all of September (to begin with).

## Health

My upper respiratory infection wiped me out, man. I was fine with the actual infection (which lasted Thu to Sat), but the week since then I have just been _tired_.

I’ve also been strangely itchy. Is there an allergen in my house that I don’t know about? Or am I getting more sensitive to the cats?

Week three of pushing getting the inflammation tests done. I am writing this on a Sunday with nothing scheduled. I wish Todoist had an “important but not urgent” filter so I could find the important things to get done on my nothing days.

Maybe I’m ready to start moving again. Maybe parts of this tiredness are my body yelling at me to move again.

## Learning

Last Sunday some of us did a small home lab meet-up at Underline Center. The primary (selfish) goal was for me to get back into building tools for myself. I was feeling very tired and low; and yet:

1. I ssh-ed into another machine. The last time I did this was five years ago. There was so much raw power at my fingertips.
2. Person A complained that they couldn’t run meet.google.com on firefox because it ran the machine so hot. Person B responded that it was a problem with A’s chosen flavour of linux - they should just use a desktop environment based on Wayland like the rest of us. Aaah, the Fight of the Window Managers. It feels like 2008 in here :)

This was a balm to my soul.

## Media Diet

### Reading

Probably going to DNF [Interstellar Megachef](https://www.goodreads.com/book/show/207299482-interstellar-megachef). My rant about [South Asian writers needing better editors](https://tanvibhakta.mataroa.blog/blog/week-of-july-16th-2025/) continues to hold here. The plot is compelling, but the metaphors are transparent, some conflict seems to have very little emotional depth, most characters feel one-dimensional. I want to like this book. I’m going to continue to read the author though, I’ve heard that [this short story of hers](https://storythings.com/work/your-cup-runneth-over/) has much nicer prose.

### Listening

Love love love [this groovy playlist](https://open.spotify.com/playlist/0duSO2mEYuv0g3yLaSQL4J?si=UYTTy7jLQMmdisKOcdxZ6g&pi=ebnqvzBmRG-Gi) Ankush shared with me. I’m looking for more music!

[^1]: I took a Thu Fri off of work so I’d have 4 days and planned out all the different museums in the city that I would go out to. On day 2, at MAP, _while looking at a giant banana leaf vagina_ I started cramping, and realised I got my period. The rest of my vacation, of course, was spent in bed with a hot water bottle and some science fiction. I live inside a sitcom.
