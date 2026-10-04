-- Topics: the "Island tag" on blog posts becomes a managed list of topics
-- (Admin → Blog Posts → Topics). Posts keep storing the value in
-- posts.island_tag, so nothing about existing posts changes.
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Start with the four islands plus any value posts already use.
INSERT INTO topics (name) VALUES ('Big Island'), ('Kauai'), ('Maui'), ('Oahu') ON CONFLICT (name) DO NOTHING;
INSERT INTO topics (name)
  SELECT DISTINCT island_tag FROM posts WHERE island_tag IS NOT NULL AND island_tag <> ''
  ON CONFLICT (name) DO NOTHING;
