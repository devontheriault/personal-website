/*
  The first thing to run: the Journal's contents, and the studio that
  draws its pages (art/studio.js), started while Three.js, by far the
  largest download, is still arriving. index.html loads this ahead of
  main.js, which picks both up from here.
*/

import { Studio } from "./art/studio.js";
import { buildJournal } from "./data/journal-data.js";
import { BINDING_SIZES } from "./scene/dimensions.js";
import { clamp } from "./util.js";

const OWNER = "Devon Theriault";

// phones in portrait read one page at a time; everything else, the Spread
export function layoutMode() {
  return innerWidth / innerHeight < 0.9 && innerWidth < 900 ? "page" : "spread";
}

// how tall a page is drawn, in pixels, for this screen
export function textureHeight(mode) {
  const dpr = Math.min(devicePixelRatio || 1, 2.5);
  const onScreen = mode === "page" ? Math.max(innerHeight, innerWidth * 1.42) : innerHeight;
  return Math.round(clamp(onScreen * dpr * 0.95, 1024, 2048));
}

export const journal = buildJournal(window.BOOKS, window.ReadingStats, { owner: OWNER });

export const studio = new Studio({
  journal,
  titleStyle: new URLSearchParams(location.search).get("titles") === "hand" ? "hand" : "serif",
  largePrint: layoutMode() === "page",
  height: textureHeight(layoutMode()),
});

// the binding first: it's all the closed Journal shows
export const binding = {
  covers: studio.request("covers", BINDING_SIZES, -2).done,
  insides: studio.request("insides", BINDING_SIZES, -1).done,
};
