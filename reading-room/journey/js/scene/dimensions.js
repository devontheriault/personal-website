/*
  The Journal's measurements, in scene units (a page is 1 wide). Kept
  apart from the geometry so the studio can be asked for the binding's
  pictures (early.js) before Three.js has even arrived.
*/

export const PAGE_W = 1;
export const PAGE_H = 1.42;
const SQUARE = 0.018; // boards overhang the pages at head, tail and fore-edge
export const BOARD_W = PAGE_W + SQUARE;
export const BOARD_H = PAGE_H + SQUARE * 2;
export const BOARD_T = 0.016;
export const BLOCK = 0.085; // every Leaf together

// what the studio needs to know to draw the binding (art/workshop.js)
export const BINDING_SIZES = { boardW: BOARD_W, boardH: BOARD_H, pageW: PAGE_W, pageH: PAGE_H };
