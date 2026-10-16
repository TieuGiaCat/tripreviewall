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

Coverage: 227 of 265 tours. The 38 tours not yet researched are listed in
`NOT-DONE.txt`; their pages keep the old description until content is added.
