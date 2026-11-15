declare namespace App {
  interface Locals {
    // Set by EntryPage for <TableOfContents /> in MDX posts.
    headings?: import("astro").MarkdownHeading[];
  }
}
