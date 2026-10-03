# Hand-written pages

Each `.html` file here is the source of one public page (About, Contact, Privacy Policy, Affiliate Disclosure, Transportation, 404, and the Road to Hana article).

- Edit the content here, never the `.html` files in the site root. Those are generated and get overwritten.
- The header, footer, fonts, favicon and social tags are added automatically from `admin/src/ssr/layout.js`.
- Contact details come from **Admin → Settings → Site Info**. Write `{{phone}}`, `{{email}}`, `{{hours}}` or `{{address}}` instead of typing them.
- After editing, deploy and run `npm run regenerate-all` in `admin/`.

The header format and the full list of tokens are documented at the top of `admin/src/ssr/pageTemplate.js`.
