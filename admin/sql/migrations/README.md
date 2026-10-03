# Database migrations

`schema.sql` creates the tables on a fresh database. It only uses `CREATE … IF NOT EXISTS`, so it can never change a table that already exists.

To change an existing table (add a column, change a constraint…), add a new numbered file here, e.g. `002_add_xyz.sql`. Then run `npm run migrate`.

- Files run in name order, each in its own transaction.
- Each file runs **once**. Applied files are recorded in the `schema_migrations` table.
- Never edit a file that has already been applied. Add a new one instead.
