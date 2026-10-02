/*
  The few pieces of the page around the Journal: the "Scroll to open"
  hint, the way back to the bookshelf, the close mark that takes its
  corner once the Journal lies open, and the caption that says what a
  focused (hidden) Contents link would do.
*/

import { smoothstep } from "../util.js";

// fade a piece of chrome; once mostly gone it can't be clicked or tabbed to
function reveal(el, amount) {
  el.style.opacity = String(amount);
  const away = amount < 0.5;
  if (el.classList.contains("is-away") === away) return;
  el.classList.toggle("is-away", away);
  el.tabIndex = away ? -1 : 0;
  if (away && document.activeElement === el) el.blur();
}

export class Chrome {
  constructor({ stage, hint, edition, shut, caption }) {
    Object.assign(this, { stage, hint, edition, shut, caption });
  }

  // follow the Journal's state (before the pointer and hands move it)
  update(s) {
    this.stage.style.opacity = String(s.fade ?? 1);
    const closedness = s.close > 0 ? 0 : 1 - smoothstep(0, 0.08, s.open);
    this.hint.style.opacity = String(closedness);
    reveal(this.edition, closedness);
    // lying open (not opening, not folding shut at the end)
    reveal(this.shut, smoothstep(0.75, 1, s.open) * (1 - smoothstep(0, 0.08, s.close)));
  }

  // how much of the screen the chrome takes above and below the closed
  // Journal (with a little air above the hint, for the ribbon's tail), on
  // a stage `height` tall
  margins(height) {
    return {
      top: this.edition.getBoundingClientRect().bottom,
      bottom: height - this.hint.getBoundingClientRect().top + 16,
    };
  }

  showCaption(text) {
    this.caption.textContent = text;
    this.caption.classList.add("is-visible");
  }

  hideCaption() {
    this.caption.classList.remove("is-visible");
  }
}
