---
title: 'Week of Nov 1st, 2026: Collaboration, man era, flash cards with friends'
publishedOn: 2026-11-01T22:42:00+05:30
draft: false
tags: []
---

## Work

New product at work. What this means is

1. New codebase to learn the intricacies of. We've ported a lot of the hard stuff over - our eval framework, our admin definitions and privileges, the way we do auth. But there's a new architecture here and I don't yet know what it is.
2. New way of writing code. We rebuilt [Claude Tag](https://www.anthropic.com/news/introducing-claude-tag) (we're calling it a software factory) and load balancing all the work across all our machines. This way the work and the prompting happens on slack - which means it is much easier for us to pull in each other when we want more detail.

This is an attempt to

1. Circumvent the cycle of building something that is subtly different from what is good for the product
2. Accept that the LLM is mostly good at what we want it to do if provided with very strong defaults and constraints (the constraints are built into the factory)
3. Move the process of building from being very individualistic to being more collaborative.

LLMs have made it easier than ever for people to disappear down a rabbit hole, learn what they need to, and come up for breath with a strong opinion. As a young engineer, if I told baby Tanvi that my instinct would be to not ask a human questions and for collaboration, I would be appalled! But ngl, I really enjoy the process of understanding and building a new thing with an LLM. I am able to [shed my ego](https://tanvibhakta.in/2026oct28-01/) and ask about the same thing from different angles, or find different [points of relation](https://tanvibhakta.in/2026oct20-05/), or work all the different angles so that I have a take and the understanding to back it up. This may also be a consultant tendency. I'm learning that when you work in an organization, it might be more valuable to go on this journey with your peers, as a more effective way to build consensus.

The new product is in the space of community-building - a space that is very dear to my heart. I am very excited to be more of a product thinker in this context. When I was younger, I wanted to be a product manager! But I'm really glad I stayed the path and acquired technical chops - I feel much more informed about executing my (or any) vision now.

I have at least 5 drafts that just need time to be polished and published (including those two eval explainers the way I use them) and several more in the outlines stage. I have allotted 2h a day this week to work on them. It's going to be intense but I am curious if I find it useful and keep the habit or tiresome and figure out a new thing. But one thing is clear - just like I now regularly allocate and spend weekend time thinking, I need to spend weekday time writing.

## Life

This week has been very social! I went out for several meals, courtesy [Restaurant Week](https://www.district.in/campaigns/restaurant-week)

1. [Baan Phad Thai](https://www.baanphadthai.com/bengaluru) with a gang of 6, followed by coffee and excellent cake at [Ondu Plate](https://www.onduplate.com/) (happy birthday!)
2. [Boteco](https://boteco.co.in/) for a team lunch
3. [Mai Mai](https://www.maimaiindia.com/) with [Kenneth](https://kenneth.dsouza.im/), Noopur, and [Ankur](https://ankursethi.com/) for a mostly sushi and pork dinner
4. [Bistro Cameo](https://map-india.org/cameo/) for a sunny sunday lunch

We also had several people over, and I played entirely too many hours of [Unrailed](https://unrailed-game.com/unrailed.html) on the couch, classic co-op style.

I spent 5 shameful but glorious hours on [dietsabya](https://www.instagram.com/dietsabya/) this week. Learnt about [Komolika](https://www.utsavpedia.com/bollywood-beyond/the-tv-show/komolika/), whose style [Lara Raj](https://en.wikipedia.org/wiki/Lara_Raj) seems to have lifted as inspiration recently. I think - maybe - I would tentatively like to be on social media if the consumption is of culture curators like this (I am similarly partial to [r/popheads](https://www.reddit.com/r/popheads/)) as opposed to meme content or comedy/influencer skits? I feel like there is more to think about and I feel better about it. Who are the current culture curators in our upper-class, english-speaking context lately?

Early in the week, I was still recovering from the sickness, and [Devanjal](https://devanjal.mataroa.blog/) and my aunt both insisted on feeding me, which I am very grateful for. Mum also came by and made me a [tambali](https://en.wikipedia.org/wiki/Thambuli) from the [sambarballi](https://en.wikipedia.org/wiki/Coleus_amboinicus) growing in my balcony! Proud Plant Parent moment for sure (though my gardener and my help should take most of the credit for pruning and watering respectively).

I have not cooked for several weeks now. I am surprisingly happy and okay with this. A combination of people feeding me, frozen food from meal prepped large batches (that mom generously supplied!), and going out have kept me pretty happy and well fed. I have occasionally made eggs, maggi, or soup that would take less than 10 minutes (and less than 1 cycle of brain power). I am very happy to slowly morph into the [straight raja beta](https://tanvibhakta.in/blog/whats-in-a-name/#p-7) I was meant to be. Being free of responsibilities - even for yourself and your house - frees up so much of the brain cycle time for thinking, doing, or recovering from all the thinking and doing.

## Health

The flare continuous to flare. It is horrible. When will I be released from this mortal coil?? I have been exhausted. Today I took a general painkiller for the first time in I don't know how many months. Forget running, even walking 4k steps one day exhausted me so much I slept for ten hours that night.

A friend has recommended a new, different personal trainer who supposedly has a good track record and experience working with people with chronic illness. Do I trust them? In the last few years, I have been disillusioned by the fitness training world the way I was disillusioned by the medical field in my early twenties. Nothing can be outsourced. I have to do all the reading, research, collating, myself. I have to recognize the various interactions and contraindications, understand the implications, and make my own decisions. Some days I feel like I should get rid of this section entirely - thinking about this reminds me how nerfed I am. But I must remember. I must do something about this. Without my health I have nothing. I have fought so hard, and come so far, that regression is no longer a possibility. But I have plateaued - sacrificing the progress of better health for the ability to dive deeper at work.

I don't regret it yet? But I need to balance this now. I have a Very Large painscience.org article to read through (without getting distracted and following all the footnotes this time!). And i am getting back on gfdf. Let us hope the sacrifices please the inflammation gods.

## Learning

Did my flash cards only three days of this week, but progress continues to be excellent. I spent an evening doing the flashcard recall with a friend who has also spent some time learning the kannada script. They had actually taken classes, so I learnt about how some letter forms are written in a way that is different from the font - there is not nearly as many twists and turns as print kannada makes it look like! I also found that reading handwritten kannada was much harder than reading the font. I am unsure where to practice this second skill from, apart from perhaps writing letters to my mother back and forth?

Things I need to spend time learning this week (there is urgency)

1. The vagaries of various models that ai-sdk smooths out (and what it doesn't)
2. How the router on our custom software factory works
3. How to design a good benchmark for a model
4. How steroids work, and what long-term usage does to a body
5. Network reliability instrumentation

there really aren't enough hours in the day.

## Media Diet

girl where is the time. I did visit the [A Moving Line exhibit at MAP](https://map-india.org/exhibition/a-moving-line-1500-years-of-indian-visual-storytelling/) and added about 20 graphic novels to my to-read list, but I doubt a dent is being made in it any time soon. I would like to pick up [India After Gandhi](https://www.goodreads.com/en/book/show/356824.India_After_Gandhi), and I would really like to read well-reported fashion ethnographies, but I don't think any exist in popular culture? I miss catching up on music videos as they come out. I have only been listening to singles, but they are all good. All the pop girlies are doing good.

