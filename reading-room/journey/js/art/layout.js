/*
  The page grid, in page units: every page is drawn on a 1000 × 1420 sheet
  (a squat A5, the proportion of a hand-bound journal) and scaled to
  whatever resolution the screen needs.

  Margins follow a book, not a screen: the gutter margin is the wider one,
  because the paper curves away into the binding there.
*/

export const PAGE = {
  width: 1000,
  height: 1420,
  gutter: 128,
  outer: 108,
  top: 122,
  bottom: 142,
  runningHead: 74,
  folio: 1350,
};

// Contents pagination. Heights of each kind of line, and where the list
// starts and stops on a page, so the Journal can be paginated from the
// data alone before anything is drawn.
export const CONTENTS = {
  firstStart: 286, // below the "Contents" heading
  start: 150,
  limit: 1268,
  month: 58,
  entry: 60,
};

export function isRecto(pageIndex) {
  return pageIndex % 2 === 1;
}

// the text block of a page, which flips with the side of the gutter
export function textBlock(pageIndex) {
  const recto = isRecto(pageIndex);
  const left = recto ? PAGE.gutter : PAGE.outer;
  const right = PAGE.width - (recto ? PAGE.outer : PAGE.gutter);
  return { left, right, width: right - left, recto };
}
