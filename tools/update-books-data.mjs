// Rewrite the BOOKS export in v2/data.js from the Reading Room's books.js.
//   node tools/update-books-data.mjs <books.js> <data.js>
import fs from 'node:fs';
import vm from 'node:vm';

const [booksFile, dataFile] = process.argv.slice(2);
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(booksFile, 'utf8'), sandbox);
const books = sandbox.window.BOOKS;
if (!Array.isArray(books) || !books.length) throw new Error(`No books found in ${booksFile}`);

// the first sentence of the first paragraph of the notes, for the tooltip
const firstSentence = (text) => {
  if (!text) return '';
  const para = text.split('\n\n')[0];
  let s = (para.match(/^.*?[.!?](\s|$)/)?.[0] ?? para).trim();
  if (s.length > 170) s = s.slice(0, 167).replace(/\s+\S*$/, '') + '…';
  return s;
};

const rows = books
  .slice()
  .sort((a, b) => a.dateRead.localeCompare(b.dateRead))
  .map((b) => [b.dateRead, b.title, b.author, b.pages, b.rating, b.genre, !!b.favorite, b.cover, b.accent, firstSentence(b.notes)]);

const data = fs.readFileSync(dataFile, 'utf8');
const line = /^export const BOOKS = .*;$/m;
if (!line.test(data)) throw new Error(`No BOOKS export in ${dataFile}`);
fs.writeFileSync(dataFile, data.replace(line, () => `export const BOOKS = ${JSON.stringify(rows)};`));
console.log(`Updated ${rows.length} books in ${dataFile}`);
