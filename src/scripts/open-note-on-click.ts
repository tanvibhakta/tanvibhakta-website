// Clicking anywhere on a note opens its own page, like a post in a social
// feed. Each note wrapper carries the page's URL in data-href; the note's
// "permalink" link stays the keyboard and no-JavaScript route.
//
// Links, photos (the lightbox opens them) and selecting text keep their
// own behaviour.
document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const note = target.closest<HTMLElement>("[data-href]");
  if (!note || target.closest("a, button, img, figure")) return;
  if (getSelection()?.toString()) return;
  location.href = note.dataset.href!;
});
