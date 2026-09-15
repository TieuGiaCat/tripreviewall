# Tripreviewall Admin Panel — Core (Setup)

This is the **core** of the admin panel: authentication/sessions + a complete
**Tours** CRUD module. It matches the tech stack decided in
`master-technical-architecture.md` §1: Node.js with the built-in `http`
module (no Express), PostgreSQL with the `id + data JSONB` pattern.

It has been tested end-to-end (login, session, create/edit/delete a tour,
duplicate-slug handling, logout) against a mock database — see the
conversation this was delivered in for the test output. It has **not** been
run against a real PostgreSQL instance yet, since this environment has no
network/DB access. Run the steps below and tell me about any error you hit —
straightforward to fix quickly since the logic itself is already verified.

## 1. Install dependencies

```
cd admin
npm install
```

## 2. Configure environment

```
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — your PostgreSQL connection string
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` — used once, to create your first login

## 3. Create the database (if it doesn't exist yet)

```
createdb tripreviewall
```

(Or create it however you normally do — pgAdmin, a hosting panel, etc.)

## 4. Run the migration (creates tables + seeds your first admin login)

```
npm run migrate -- --seed-admin
```

You should see:
```
✓ Schema applied (tables created if they didn't already exist).
✓ Seeded first admin user: you@tripreviewall.com
```

If you only want to (re-)apply the schema without seeding a user, run
`npm run migrate` without the flag.

## 5. Start the server

```
npm start
```

Then open **http://localhost:4000/admin/login** and log in with the email/password
from your `.env`.

## What's built vs. not yet built

**Built and tested:** login, session handling (logout, session expiry),
Tours list (search + status filter), New Tour, Edit Tour, Delete Tour.

**Scaffolded in the sidebar but not built yet:** Blog Posts, Destinations,
Authors, Leads, Analytics, Media Library, Settings, Users. These are listed
in the nav (as `#` links) so the shape matches the full sitemap in
`master-technical-architecture.md` §2 and §6, but clicking them does nothing yet.

## Known limitations of this MVP core (intentional, not oversights)

- **Sessions are in-memory** — they're lost on server restart, and won't work
  if you ever run more than one server process (e.g. a PM2 cluster). Fine for
  now; upgrading to a `sessions` Postgres table later is a small, isolated change.
- **No image upload yet** — the Tours form doesn't have a gallery/media field.
  That's tied to the Media Library module, not built in this pass.
- **Rich text is plain `<textarea>`**, not the Quill.js WYSIWYG editor
  mentioned in the architecture doc — swapping that in is a front-end-only
  change to the form template, doesn't touch the data model.
- Only the fields your real tour data currently has are in the form
  (see `sql/schema.sql` comment) — itinerary, policies, FAQ, meeting point
  and individual reviews aren't in the form yet since none of your 265 real
  tours have that data either (matches the decision from earlier in this project).

## Next step

Once you've run this and confirmed login + Tours CRUD work against your real
database, tell me and I'll build the next module (Blog Posts is the natural
next one, matching the build order in §12) the same way — code it, then
verify it end-to-end before handing it over.
