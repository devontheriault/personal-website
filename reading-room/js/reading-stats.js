/*
  The year's figures, worked out from the book data alone.

  Rates are measured over the part of the year that has actually passed:
  a finished year counts all of its days, the current one only runs to
  today — otherwise every September would look like a slow year.
*/

window.ReadingStats = (function () {
  const DAY = 24 * 60 * 60 * 1000;

  function daysElapsed(year, today) {
    const start = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year + 1, 0, 1);
    // today counts as a day read, so the first of January isn't a zero
    const todayEnd = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return Math.max(1, Math.round((Math.min(yearEnd, todayEnd) - start) / DAY));
  }

  function daysInYear(year) {
    return Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY);
  }

  function forYear(books, year, today = new Date()) {
    const days = daysElapsed(year, today);
    // an average month of this year, so a finished year is exactly books / 12
    const month = daysInYear(year) / 12;
    const pages = books.reduce((sum, b) => sum + (Number(b.pages) || 0), 0);

    return {
      books: books.length,
      pages,
      booksPerMonth: (books.length / days) * month,
      pagesPerDay: pages / days,
      inProgress: year === today.getFullYear(),
    };
  }

  return { forYear };
})();
