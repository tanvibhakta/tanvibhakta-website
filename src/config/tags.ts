/**
 * This file contains an exhaustive list of all the tags used across this website.
 */

export const TAGS = [
  { name: "code", description: "TILs of the everyday technical variety." },
  {
    name: "llms",
    description:
      "Strong opinions around llm usage, typically towards writing code",
  },
  {
    name: "software engineering",
    description: "the process of building product (teams)",
  },
  { name: "bangers", description: "this would do numbers on twtr" },
] as const;

export type Tag = (typeof TAGS)["name"];
