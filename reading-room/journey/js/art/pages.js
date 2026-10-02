/*
  The page renderer: draws any page of the Journal onto a canvas.

  The same drawing is used whether the page lies still or its Leaf is
  turning (docs/adr/0002), so there is nothing to swap mid-turn. Pages are
  laid out in page units (layout.js) and drawn at whatever resolution the
  screen needs.

  Printed matter (titles, reviews, labels) is set in the site's typefaces;
  what a person would add by hand (figures, tallies, stars, captions, the
  owner's name) is in ink.
*/

import { CONTENTS, PAGE, isRecto, textBlock } from "./layout.js";
import { INK, inkStar, penRule, penStroke, rgba, tally } from "./ink.js";
import { makePaper } from "./paper.js";
import { drawSketch } from "./sketch.js";
import { FONTS, fitText, makeCanvas, spaced, wrap } from "./text.js";
import { MONTHS, seeded } from "../util.js";

const PRINT = "#2b231e";
const MUTED = "#76695b";

function formatDate(entry, year) {
  return `${entry.day} ${MONTHS[entry.month]} ${year}`;
}

const number = (n) => Math.round(n).toLocaleString("en-GB");

export class PageArt {
  /*
    `largePrint` is for phones, where one page fills the screen's width:
    the review is set larger (and allowed to fill more of the page) so it
    reads comfortably at arm's length.
  */
  constructor(journal, { titleStyle = "serif", largePrint = false } = {}) {
    this.journal = journal;
    this.titleStyle = titleStyle;
    this.largePrint = largePrint;
    this.height = 0;
  }

  // a new texture resolution: the paper is remade when next wanted
  setResolution(height) {
    if (height === this.height) return;
    this.height = height;
    this.width = Math.round((height * PAGE.width) / PAGE.height);
    this.sheets = null;
  }

  // the paper, recto and verso, at the current resolution
  get paper() {
    if (!this.sheets) {
      const recto = makePaper(this.width, this.height, { soft: true });
      const verso = makeCanvas(this.width, this.height, { soft: true });
      const v = verso.getContext("2d");
      v.translate(this.width, 0);
      v.scale(-1, 1);
      v.drawImage(recto, 0, 0);
      this.sheets = { recto, verso };
    }
    return this.sheets;
  }

  /*
    Draw page `index`. Returns the canvas and, for Contents pages, the
    rectangle (in page units) of every line that turns to an Entry.
  */
  render(index, { highlight = null, canvas = null } = {}) {
    const page = this.journal.pages[index];
    const cv = canvas || makeCanvas(this.width, this.height, { soft: true });
    // (a canvas being redrawn is cleared by resizing it)
    cv.width = this.width;
    cv.height = this.height;
    const ctx = cv.getContext("2d");
    const recto = isRecto(index);
    const paper = recto ? this.paper.recto : this.paper.verso;
    ctx.drawImage(paper, 0, 0);

    const s = this.width / PAGE.width;
    ctx.save();
    ctx.scale(s, s);
    ctx.textBaseline = "alphabetic";
    const hits = [];
    const paperRect = { x: 0, y: 0, w: PAGE.width, h: PAGE.height };
    const rand = seeded(`page-${index}`, 11);

    switch (page.kind) {
      case "title":
        this.titlePage(ctx, rand);
        break;
      case "numbers":
        this.numbersPage(ctx, index, rand);
        break;
      case "contents":
        this.contentsPage(ctx, index, page, highlight, hits, rand);
        break;
      case "sketch":
        this.sketchPage(ctx, index, page.entry, paper, paperRect, rand);
        break;
      case "record":
        this.recordPage(ctx, index, page.entry, rand);
        break;
      case "continued":
        this.continuedPage(ctx, index, rand);
        break;
      default:
        break;
    }

    if (index > 0) this.folio(ctx, index);
    ctx.restore();
    return { canvas: cv, hits };
  }

  // a page for the Leaves that riffle past during a jump: a suggestion of
  // writing, never read, drawn once
  generic(recto) {
    const cv = makeCanvas(this.width, this.height, { soft: true });
    const ctx = cv.getContext("2d");
    ctx.drawImage(recto ? this.paper.recto : this.paper.verso, 0, 0);
    const s = this.width / PAGE.width;
    ctx.scale(s, s);
    const rand = seeded(recto ? "riffle-r" : "riffle-v", 5);
    const { left, right } = textBlock(recto ? 1 : 2);
    // a title, then lines of "words": seen only in passing, as a blur of type
    const words = (y, from, to, height, alpha) => {
      ctx.fillStyle = rgba(PRINT, alpha);
      let x = from;
      while (x < to) {
        const w = Math.min(to - x, 14 + rand() * 70);
        ctx.fillRect(x, y, w, height);
        x += w + 9 + rand() * 4;
      }
    };
    words(236, left, left + (right - left) * 0.55, 26, 0.16);
    words(300, left, left + (right - left) * 0.3, 12, 0.12);
    for (let y = 420; y < 1100; y += 43) {
      if (rand() < 0.08) continue;
      const end = rand() < 0.15 ? 0.4 + rand() * 0.4 : 0.93 + rand() * 0.07;
      words(y, left, left + (right - left) * end, 9, 0.11);
    }
    return cv;
  }

  folio(ctx, index) {
    const { left, right, recto } = textBlock(index);
    ctx.fillStyle = MUTED;
    ctx.font = `400 19px ${FONTS.mono}`;
    ctx.textAlign = recto ? "right" : "left";
    ctx.fillText(String(index), recto ? right : left, PAGE.folio);
    ctx.textAlign = "left";
  }

  runningHead(ctx, index, text) {
    const { left, right, recto } = textBlock(index);
    ctx.fillStyle = MUTED;
    ctx.font = `400 14px ${FONTS.mono}`;
    spaced(ctx, text.toUpperCase(), recto ? right : left, PAGE.runningHead, 4.2, recto ? "right" : "left");
  }

  titlePage(ctx, rand) {
    const { year, owner } = this.journal;
    const cx = (PAGE.outer + PAGE.width - PAGE.gutter) / 2;

    ctx.fillStyle = MUTED;
    ctx.font = `400 16px ${FONTS.mono}`;
    spaced(ctx, "A RECORD OF BOOKS READ", cx, 330, 5.5, "center");

    ctx.fillStyle = PRINT;
    ctx.textAlign = "center";
    ctx.font = `italic 400 124px ${FONTS.display}`;
    ctx.fillText("My Reading", cx, 590);
    ctx.fillText("Journey", cx, 712);
    ctx.textAlign = "left";

    ctx.font = `400 24px ${FONTS.mono}`;
    ctx.fillStyle = PRINT;
    spaced(ctx, String(year), cx, 812, 9, "center");

    // a small printed ornament
    ctx.fillStyle = rgba(PRINT, 0.7);
    ctx.beginPath();
    ctx.moveTo(cx, 862);
    ctx.lineTo(cx + 7, 869);
    ctx.lineTo(cx, 876);
    ctx.lineTo(cx - 7, 869);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 70, 868.4, 52, 1.2);
    ctx.fillRect(cx + 18, 868.4, 52, 1.2);

    if (owner) {
      ctx.fillStyle = MUTED;
      ctx.font = `400 13px ${FONTS.mono}`;
      spaced(ctx, "THIS JOURNAL BELONGS TO", cx, 1050, 4.5, "center");
      ctx.save();
      ctx.translate(cx, 1150);
      ctx.rotate(-0.025);
      ctx.fillStyle = rgba(INK, 0.9);
      ctx.textAlign = "center";
      ctx.font = `400 44px ${FONTS.hand}`;
      ctx.fillText(owner, 0, 0);
      ctx.restore();
      penRule(ctx, cx - 210, cx + 200, 1188, rand, { width: 1.3, alpha: 0.55 });
    }
  }

  numbersPage(ctx, index, rand) {
    const j = this.journal;
    const { left, right, width } = textBlock(index);
    const stats = j.stats;

    ctx.fillStyle = PRINT;
    ctx.font = `500 64px ${FONTS.display}`;
    ctx.fillText("The Year in Numbers", left, 222);

    ctx.fillStyle = MUTED;
    ctx.font = `400 14px ${FONTS.mono}`;
    const span = stats.inProgress
      ? `JANUARY TO ${MONTHS[j.monthsElapsed - 1].toUpperCase()} ${j.year}`
      : `THE WHOLE OF ${j.year}`;
    spaced(ctx, span, left, 268, 4.2);
    penRule(ctx, left, right, 306, rand, { alpha: 0.5 });

    const cells = [
      ["BOOKS READ", number(stats.books)],
      ["PAGES READ", number(stats.pages)],
      ["BOOKS A MONTH", stats.booksPerMonth.toFixed(1)],
      ["PAGES A DAY", number(stats.pagesPerDay)],
    ];
    cells.forEach(([label, value], i) => {
      const x = left + (i % 2) * (width / 2);
      const y = 368 + Math.floor(i / 2) * 178;
      ctx.fillStyle = MUTED;
      ctx.font = `400 14px ${FONTS.mono}`;
      spaced(ctx, label, x, y, 4.2);
      ctx.save();
      ctx.translate(x - 4, y + 104);
      ctx.rotate(-0.02 + rand() * 0.02);
      ctx.fillStyle = rgba(INK, 0.9);
      ctx.font = `400 58px ${FONTS.hand}`;
      ctx.fillText(value, 0, 0);
      ctx.restore();
    });

    // month by month, as tallies
    let y = 760;
    ctx.fillStyle = MUTED;
    ctx.font = `400 14px ${FONTS.mono}`;
    spaced(ctx, "MONTH BY MONTH", left, y, 4.2);
    penRule(ctx, left, right, y + 20, rand, { alpha: 0.35, width: 1.1 });
    y += 72;
    j.monthCounts.forEach((count, m) => {
      const col = m < 6 ? 0 : 1;
      const x = left + col * (width / 2);
      const row = m % 6;
      const ry = y + row * 50;
      const future = m >= j.monthsElapsed;
      ctx.fillStyle = future ? rgba(MUTED, 0.5) : PRINT;
      ctx.font = `italic 400 27px ${FONTS.display}`;
      ctx.fillText(MONTHS[m].slice(0, 3), x, ry);
      if (!future && count) tally(ctx, x + 78, ry - 26, count, rand, 30);
      else if (!future) {
        ctx.fillStyle = rgba(MUTED, 0.6);
        ctx.font = `400 20px ${FONTS.hand}`;
        ctx.fillText("—", x + 80, ry - 2);
      }
    });

    // the extremes
    y = 1170;
    const extremes = [
      ["LONGEST", j.longest],
      ["SHORTEST", j.shortest],
    ];
    extremes.forEach(([label, book], i) => {
      if (!book) return;
      const x = left + i * (width / 2);
      const colW = width / 2 - 28;
      ctx.fillStyle = MUTED;
      ctx.font = `400 14px ${FONTS.mono}`;
      spaced(ctx, label, x, y, 4.2);
      ctx.fillStyle = PRINT;
      ctx.font = `italic 400 27px ${FONTS.display}`;
      const lines = wrap(ctx, book.title, colW).filter(Boolean).slice(0, 2);
      lines.forEach((line, k) => ctx.fillText(fitText(ctx, line, colW), x, y + 40 + k * 30));
      ctx.fillStyle = rgba(INK, 0.85);
      ctx.font = `400 22px ${FONTS.hand}`;
      ctx.fillText(`${number(book.pages)} pages`, x, y + 52 + lines.length * 30);
    });
  }

  contentsPage(ctx, index, page, highlight, hits, rand) {
    const { left, right, width } = textBlock(index);
    if (page.first) {
      ctx.fillStyle = PRINT;
      ctx.font = `500 64px ${FONTS.display}`;
      ctx.fillText("Contents", left, 222);
      penRule(ctx, left, right, 256, rand, { alpha: 0.5 });
    } else if (page.items.length) {
      this.runningHead(ctx, index, "Contents");
    }

    const numW = 58;
    const folioW = 64;
    for (const item of page.items) {
      const y = item.y;
      if (item.type === "month") {
        ctx.fillStyle = MUTED;
        ctx.font = `400 14px ${FONTS.mono}`;
        const w = spaced(ctx, MONTHS[item.month].toUpperCase(), left + numW + 16, y + 36, 4.2);
        ctx.fillStyle = rgba(MUTED, 0.3);
        ctx.fillRect(left + numW + 16 + w + 16, y + 31, right - (left + numW + 16 + w + 16), 1);
        continue;
      }

      const e = item.entry;
      const base = y + 32;
      const tx = left + numW + 16;

      ctx.fillStyle = MUTED;
      ctx.font = `italic 400 25px ${FONTS.display}`;
      ctx.textAlign = "right";
      ctx.fillText(e.numeral, left + numW, base);

      ctx.font = `400 19px ${FONTS.mono}`;
      ctx.fillText(String(e.folio), right, base);
      ctx.textAlign = "left";

      ctx.fillStyle = PRINT;
      ctx.font = `500 29px ${FONTS.display}`;
      const title = fitText(ctx, e.book.title, width - numW - 16 - folioW - 30);
      const tw = ctx.measureText(title).width;
      ctx.fillText(title, tx, base);

      // dot leaders
      ctx.fillStyle = rgba(MUTED, 0.55);
      const from = tx + tw + 14;
      const to = right - folioW + 18;
      for (let x = Math.ceil(from / 10) * 10; x < to; x += 10) ctx.fillRect(x, base - 2, 2, 2);

      ctx.fillStyle = MUTED;
      ctx.font = `italic 400 17px ${FONTS.body}`;
      ctx.fillText(e.book.author, tx, base + 23);

      if (highlight === e.id) {
        const hr = seeded(`hl-${e.id}`, 2);
        penStroke(ctx, [[tx - 4, base + 6], [tx + tw * 0.5, base + 7.5], [tx + tw + 6, base + 5]], hr, {
          width: 1.9,
          wobble: 1.2,
          alpha: 0.8,
        });
        // a small hand-drawn pointer in the margin
        const mx = left - 40;
        penStroke(ctx, [[mx - 18, base - 10], [mx + 6, base - 10]], hr, { width: 2, alpha: 0.8 });
        penStroke(ctx, [[mx - 3, base - 18], [mx + 7, base - 10], [mx - 3, base - 2]], hr, { width: 2, alpha: 0.8 });
      }

      hits.push({ id: e.id, rect: [left - 20, y + 4, right + 10, y + CONTENTS.entry - 2] });
    }
  }

  sketchPage(ctx, index, entry, paper, paperRect, rand) {
    const { left, right } = textBlock(index);
    this.runningHead(ctx, index, "My Reading Journey");

    ctx.save();
    // re-laying paper inside the Sketch needs page units → canvas pixels
    drawSketch(ctx, entry, { x: left, y: 170, w: right - left, h: 960 }, paper, paperRect);
    ctx.restore();

    ctx.save();
    ctx.translate((left + right) / 2, 1228);
    ctx.rotate(-0.02 + rand() * 0.015);
    ctx.fillStyle = rgba(INK, 0.82);
    ctx.textAlign = "center";
    ctx.font = `400 30px ${FONTS.hand}`;
    ctx.fillText(`${entry.day} ${MONTHS[entry.month]}`, 0, 0);
    ctx.restore();
  }

  recordPage(ctx, index, entry, rand) {
    const { left, right, width } = textBlock(index);
    const book = entry.book;
    this.runningHead(ctx, index, MONTHS[entry.month]);

    ctx.fillStyle = MUTED;
    ctx.font = `italic 400 38px ${FONTS.display}`;
    ctx.fillText(entry.numeral, left, 210);

    // title
    let y;
    if (this.titleStyle === "hand") {
      let size = 54;
      let lines;
      do {
        ctx.font = `400 ${size}px ${FONTS.hand}`;
        lines = wrap(ctx, book.title, width - 10).filter(Boolean);
        size -= 3;
      } while (lines.length > 3 && size > 34);
      size += 3;
      y = 300 + size * 0.2;
      ctx.save();
      ctx.fillStyle = rgba(INK, 0.9);
      lines.forEach((line, i) => {
        ctx.save();
        ctx.translate(left, y + i * size * 1.42);
        ctx.rotate(-0.012);
        ctx.fillText(line, 0, 0);
        ctx.restore();
      });
      ctx.restore();
      y += (lines.length - 1) * size * 1.42 + size * 0.55;
    } else {
      let size = 76;
      let lines;
      do {
        ctx.font = `500 ${size}px ${FONTS.display}`;
        lines = wrap(ctx, book.title, width).filter(Boolean);
        size -= 4;
      } while (lines.length > 3 && size > 48);
      size += 4;
      ctx.fillStyle = PRINT;
      y = 296;
      lines.forEach((line, i) => ctx.fillText(line, left, y + i * size * 1.0));
      y += (lines.length - 1) * size + size * 0.18;
    }
    const titleTop = 250;

    ctx.fillStyle = MUTED;
    ctx.font = `italic 400 30px ${FONTS.body}`;
    y += 50;
    ctx.fillText(book.author, left, y);

    // stars, in ink
    y += 50;
    const rating = Math.max(0, Math.min(5, Math.round(Number(book.rating) || 0)));
    const sr = seeded(`stars-${entry.id}`, 1);
    for (let i = 0; i < 5; i++) inkStar(ctx, left + 14 + i * 36, y - 10, 13, i < rating, sr);

    if (book.favorite) this.favouriteMark(ctx, index, titleTop + 40, rand);

    y += 38;
    penRule(ctx, left, left + width * 0.34, y, rand, { alpha: 0.55 });

    // the metadata sits at the foot of the page
    const metaTop = 1168;
    const reviewTop = y + 62;
    const reviewBottom = metaTop - 58;
    const notes = (book.notes || "").trim();
    if (notes) {
      let size = this.largePrint ? 38 : 28;
      let lines;
      let lh;
      do {
        ctx.font = `400 ${size}px ${FONTS.body}`;
        lines = wrap(ctx, notes, width);
        lh = size * 1.56;
        size -= 1;
      } while (lines.length * lh > reviewBottom - reviewTop && size > 20);
      ctx.fillStyle = PRINT;
      let ly = reviewTop;
      for (const line of lines) {
        if (line === null) {
          ly += lh * 0.5;
          continue;
        }
        ctx.fillText(line, left, ly);
        ly += lh;
      }
    }

    ctx.fillStyle = rgba(MUTED, 0.35);
    ctx.fillRect(left, metaTop, width, 1);
    const cols = [
      ["READ", formatDate(entry, this.journal.year)],
      ["LENGTH", book.pages ? `${number(book.pages)} pages` : "—"],
      ["GENRE", book.genre || "—"],
    ];
    const colW = [0.38, 0.27, 0.35];
    let cx = left;
    cols.forEach(([label, value], i) => {
      ctx.fillStyle = MUTED;
      ctx.font = `400 13px ${FONTS.mono}`;
      spaced(ctx, label, cx, metaTop + 44, 4);
      ctx.fillStyle = PRINT;
      ctx.font = `400 ${this.largePrint ? 27 : 23}px ${FONTS.body}`;
      ctx.fillText(fitText(ctx, value, width * colW[i] - 14), cx, metaTop + 82);
      cx += width * colW[i];
    });
  }

  // a favourite gets a mark in the outer margin beside its title
  favouriteMark(ctx, index, y, rand) {
    const recto = isRecto(index);
    const x = recto ? PAGE.width - PAGE.outer / 2 : PAGE.outer / 2;
    const r = 17;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3 + (rand() - 0.5) * 0.2 + 0.3;
      penStroke(
        ctx,
        [[x - Math.cos(a) * r, y - Math.sin(a) * r], [x + Math.cos(a) * r, y + Math.sin(a) * r]],
        rand,
        { width: 2.6, wobble: 0.4, alpha: 0.85, taper: 0.2 }
      );
    }
  }

  continuedPage(ctx, index, rand) {
    const { left, right } = textBlock(index);
    const cx = (left + right) / 2;
    ctx.save();
    ctx.translate(cx, 650);
    ctx.rotate(-0.04);
    ctx.fillStyle = rgba(INK, 0.86);
    ctx.textAlign = "center";
    ctx.font = `400 42px ${FONTS.hand}`;
    ctx.fillText("to be continued…", 0, 0);
    ctx.restore();
    penStroke(ctx, [[cx - 120, 712], [cx - 20, 706], [cx + 60, 710], [cx + 110, 700]], rand, {
      width: 1.6,
      wobble: 1.2,
      alpha: 0.55,
    });
  }
}
