# Tour page content (researched, October 2026)

One JSON array per island. Each object follows the research schema
(`slug`, `name`, `seo`, `cards`, `overview`, `location`, `review`, `verdict`,
`faq`, `contact`, `sources`, `needsData`, `confidence`).

Load into the database and rebuild the pages:

    npm run import-tour-content

Options (add after `--`):

    npm run import-tour-content -- --dry-run            # report only
    npm run import-tour-content -- --keep-names         # don't apply the clearer tour names
    npm run import-tour-content -- --overwrite-prices   # replace "from" prices with the researched ones
    npm run import-tour-content -- --no-regenerate      # skip the page rebuild

The import is repeatable: running it again re-applies the files (later edits
made in Admin → Tours → "4. Page content" are overwritten for those tours, so
edit the JSON instead, or remove a tour from the file to keep the admin version).

Coverage: all 265 tours. 47 of them are marked `confidence: "low"` (thin
sources) and listed in `LOW-CONFIDENCE.txt` — review those first. Each tour's
`needsData` array says exactly which facts could not be verified online.
