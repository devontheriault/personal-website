/*
  The Journal as text. The pages themselves are drawn (docs/adr/0002), so
  this is what screen readers read and keyboards reach: the same content
  in plain, properly structured HTML, visually hidden. Its Contents links
  are the keyboard's way into the Journal.
*/

import { MONTHS } from "../util.js";

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

const plural = (n, word) => `${n.toLocaleString("en-GB")} ${word}${n === 1 ? "" : "s"}`;

export function buildMirror(root, journal) {
  const { year, owner, stats, entries } = journal;
  root.replaceChildren();

  root.append(
    el("h1", { text: `My Reading Journey, ${year}` }),
    owner ? el("p", { text: `A record of books read, kept by ${owner}.` }) : null
  );

  const numbers = el("section", { "aria-labelledby": "numbers-heading" });
  numbers.append(el("h2", { id: "numbers-heading", text: "The Year in Numbers" }));
  const list = el("ul");
  list.append(
    el("li", { text: `${plural(stats.books, "book")} read` }),
    el("li", { text: `${plural(stats.pages, "page")} read` }),
    el("li", { text: `${stats.booksPerMonth.toFixed(1)} books a month` }),
    el("li", { text: `${Math.round(stats.pagesPerDay)} pages a day` })
  );
  if (journal.longest) list.append(el("li", { text: `Longest: ${journal.longest.title}, ${journal.longest.pages} pages` }));
  if (journal.shortest) list.append(el("li", { text: `Shortest: ${journal.shortest.title}, ${journal.shortest.pages} pages` }));
  numbers.append(list);
  root.append(numbers);

  const nav = el("nav", { "aria-labelledby": "contents-heading" });
  nav.append(el("h2", { id: "contents-heading", text: "Contents" }));
  const ol = el("ol");
  for (const e of entries) {
    const a = el("a", {
      href: `#${e.id}`,
      "data-entry": e.id,
      "data-caption": `${e.numeral}. ${e.book.title} · page ${e.folio}`,
      text: `${e.book.title}, by ${e.book.author}, page ${e.folio}`,
    });
    ol.append(el("li", {}, a));
  }
  nav.append(ol);
  root.append(nav);

  for (const e of entries) {
    const b = e.book;
    const article = el("article", { "aria-labelledby": `title-${e.id}` });
    article.append(el("h2", { id: `title-${e.id}`, text: `${e.numeral}. ${b.title}` }), el("p", { text: `by ${b.author}` }));
    const details = [`Rated ${b.rating} out of 5`];
    if (b.favorite) details.push("a favourite");
    article.append(el("p", { text: `${details.join(", ")}.` }));
    const facts = [`Read ${e.day} ${MONTHS[e.month]} ${year}`];
    if (b.pages) facts.push(`${b.pages} pages`);
    if (b.genre) facts.push(b.genre);
    article.append(el("p", { text: `${facts.join(". ")}.` }));
    for (const para of String(b.notes || "").split(/\n\s*\n/)) {
      if (para.trim()) article.append(el("p", { text: para.trim() }));
    }
    root.append(article);
  }

  if (stats.inProgress) root.append(el("p", { text: "To be continued." }));

  const ribbon = el("button", {
    type: "button",
    "data-ribbon": "",
    "data-caption": "Back to the Contents",
    text: "Back to the Contents",
  });
  root.append(ribbon);
  return root;
}
