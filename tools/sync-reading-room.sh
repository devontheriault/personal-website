#!/usr/bin/env bash
# Copy the Reading Room's Journal from the Books project into /reading-room/, point its way
# out back to this site, and refresh the bookshelf chart's data in data.js.
# The Books project stays the source of truth: add books there, then rerun this.
#   tools/sync-reading-room.sh [path-to-Books]   (default: ~/Projects/Books)
set -euo pipefail

src="${1:-$HOME/Projects/Books}"
root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$root/reading-room"

[[ -f "$src/index.html" && -f "$src/js/books.js" ]] || { echo "No Reading Room build at $src" >&2; exit 1; }

# Only what the Journal loads in the browser: its own files plus the book data and fonts it
# shares with the bookshelf. The bookshelf page itself isn't published here; the site only
# links to the Journal. No notes, docs, tools or the unminified Three.js sources either.
rsync -a --delete --delete-excluded \
  --exclude '.git' --exclude '.gitignore' \
  --exclude 'CLAUDE.md' --exclude 'CONTEXT-MAP.md' --exclude '/tools/' \
  --exclude '/index.html' --exclude '/css/' --exclude '/assets/og-image.jpg' \
  --include '/js/books.js' --include '/js/reading-stats.js' --exclude '/js/*' \
  --exclude 'journey/tools/' --exclude 'journey/docs/' --exclude 'journey/serve.js' \
  --exclude 'journey/README.md' --exclude 'journey/CONTEXT.md' \
  --exclude 'journey/vendor/three.core.js' --exclude 'journey/vendor/three.module.js' \
  "$src/" "$dest/"

# /reading-room/ itself forwards to the Journal.
cat > "$dest/index.html" <<'HTML'
<!doctype html>
<meta charset="utf-8">
<title>My Reading Journey</title>
<meta http-equiv="refresh" content="0; url=journey/">
<link rel="canonical" href="journey/">
<p><a href="journey/">My Reading Journey</a></p>
HTML

# In the copy only (the Books project stays standalone): every way out of the Journal that
# led to the bookshelf leads back to this site instead.
home="../../"
journal="$dest/journey/index.html"
swap() { # <file> <perl substitution> <what, for the error>
  perl -0pi -e "$2" "$1"
  grep -q "$home" "$1" || { echo "Couldn't repoint $3 in $1; has the Journal changed?" >&2; exit 1; }
}
swap "$journal" 's{<a class="edition" id="edition" href="\.\./">The Bookshelf</a>}{<a class="edition" id="edition" href="'"$home"'">Devon Theriault</a>}' 'the corner link'
perl -0pi -e 's{<a href="\.\./">Taking you to the bookshelf instead →</a>}{<a href="'"$home"'">Taking you back to my site →</a>}; s{<a href="\.\./">The bookshelf</a> works without it\.}{<a href="'"$home"'">Back to my site</a>.}' "$journal"
grep -q 'href="\.\./"' "$journal" && { echo "A link to the bookshelf is still in $journal" >&2; exit 1; }
swap "$dest/journey/js/main.js" 's{location\.assign\("\.\./"\)}{location.assign("'"$home"'")}' 'the no-WebGL redirect'

# Who Touched My Server counts the Journal's visits, as it does the home page's.
tracker='<script src="/monitor/js/track.js" defer></script>'
perl -0pi -e 's{^(\s*)(<script type="module" src="js/main\.js"></script>\n)}{$1$2$1'"$tracker"'\n}m' "$journal"
grep -qF "$tracker" "$journal" || { echo "Couldn't add the visit tracker to $journal; has the Journal changed?" >&2; exit 1; }

# The bookshelf chart on the home page reads the same books.
node "$root/tools/update-books-data.mjs" "$src/js/books.js" "$root/data.js"

echo "Synced $(grep -c 'dateRead:' "$dest/js/books.js") books from $src"
