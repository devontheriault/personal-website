/*
  From book data to a Journal: which Entries it holds, what is printed on
  each page, and the Folio every page carries.

  The Journal is a bound object, so pages come in Leaves. Page 0 is the
  inside of the front cover (the title page is written there); after it,
  Leaf i carries page 2i + 1 on its front and page 2i + 2 on its back.
  Spread k therefore shows page 2k on the left and page 2k + 1 on the
  right, and every Entry starts on a left-hand page so its Sketch and its
  review face each other.
*/

import { CONTENTS } from "../art/layout.js";
import { MONTHS, roman } from "../util.js";

// a hand-bound journal is thicker than its content; the rest stays blank
const MIN_LEAVES = 44;
const SPARE_LEAVES = 10;

function yearOf(book) {
  return Number(book.year) || Number(String(book.dateRead).slice(0, 4));
}

function paginateContents(entries) {
  const items = [];
  let month = -1;
  for (const entry of entries) {
    if (entry.month !== month) {
      month = entry.month;
      items.push({ type: "month", month });
    }
    items.push({ type: "entry", entry });
  }

  const pages = [[]];
  let y = CONTENTS.firstStart;
  items.forEach((item) => {
    const height = item.type === "month" ? CONTENTS.month : CONTENTS.entry;
    // a month heading never sits alone at the foot of a page
    const needs = item.type === "month" ? height + CONTENTS.entry : height;
    if (y + needs > CONTENTS.limit && pages[pages.length - 1].length) {
      pages.push([]);
      y = CONTENTS.start;
    }
    pages[pages.length - 1].push({ ...item, y });
    y += height;
  });

  // Entries must begin on a left-hand page: the Contents starts on one
  // (page 2), so it has to fill a whole number of Spreads.
  if (pages.length % 2) pages.push([]);
  return pages;
}

export function buildJournal(books, readingStats, { today = new Date(), owner } = {}) {
  const year = Math.max(...books.map(yearOf));
  const read = books
    .filter((book) => yearOf(book) === year)
    .sort((a, b) => String(a.dateRead).localeCompare(String(b.dateRead)));

  const entries = read.map((book, index) => {
    const [, m, d] = String(book.dateRead).split("-").map(Number);
    return {
      id: book.id,
      book,
      index,
      numeral: roman(index + 1),
      month: m - 1,
      day: d,
    };
  });

  const stats = readingStats.forYear(read, year, today);
  const withPages = read.filter((b) => Number(b.pages) > 0);
  const byLength = [...withPages].sort((a, b) => b.pages - a.pages);
  const monthCounts = MONTHS.map((_, m) => entries.filter((e) => e.month === m).length);
  // months that haven't happened yet are left blank rather than "0"
  const monthsElapsed = stats.inProgress ? today.getMonth() + 1 : 12;

  const pages = [{ kind: "title" }, { kind: "numbers" }];

  const contentsPages = paginateContents(entries);
  contentsPages.forEach((items, i) => {
    pages.push({ kind: "contents", items, first: i === 0 });
  });

  for (const entry of entries) {
    entry.folio = pages.length;
    entry.spread = pages.length / 2;
    pages.push({ kind: "sketch", entry });
    pages.push({ kind: "record", entry });
  }

  // a year still being read ends on a blank Spread that waits for the rest
  if (stats.inProgress) {
    pages.push({ kind: "blank" }, { kind: "continued" });
  }

  const lastSpread = Math.floor((pages.length - 1) / 2);
  const contentLeaves = Math.ceil((pages.length - 1) / 2);
  const leafCount = Math.max(MIN_LEAVES, contentLeaves + SPARE_LEAVES);
  while (pages.length < 1 + leafCount * 2) pages.push({ kind: "blank" });
  pages.forEach((page, index) => {
    page.index = index;
  });

  return {
    year,
    owner,
    entries,
    pages,
    leafCount,
    lastSpread,
    contentsSpread: 1,
    stats,
    monthCounts,
    monthsElapsed,
    longest: byLength[0],
    shortest: byLength[byLength.length - 1],
    entryById: new Map(entries.map((e) => [e.id, e])),
  };
}
