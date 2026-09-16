-- ============================================================
-- Tripreviewall.com — Admin Panel Core Schema (v0.1)
-- Covers: admin_users + tours (per master-technical-architecture.md §3.1, §3.4)
-- Other tables (posts, destinations, leads, click_logs, settings, media)
-- are NOT created here yet — add them as their admin modules are built,
-- following the same id + JSONB "data" pattern.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
  -- data shape: { "name": "...", "avatarUrl": null, "lastLoginAt": "..." }
);

-- ---------------------------------------------------------------
-- tours
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  island TEXT,
  price_from NUMERIC,
  duration_minutes INTEGER,
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES admin_users(id),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
  -- data shape (subset implemented in this MVP module — see
  -- tripreviewall-tour-detail-brief.md §13 for the full future shape):
  -- {
  --   "name": "...", "company": "...", "city": "...", "tourType": "...",
  --   "durationLabel": "...", "fareharborShortname": "...",
  --   "highlights": ["..."], "fullDescription": "...",
  --   "verdict": { "headline": "...", "goodFor": ["..."],
  --                "worthKnowing": ["..."], "closingNote": "...",
  --                "reviewedByDate": "..." },
  --   "googleSnapshot": { "summaryText": "...", "lastCheckedDate": "..." },
  --   "aggregatedRating": 4.5, "reviewCountTotal": 250,
  --   "ratingDistribution": { "star5": 70, "star4": 20, "star3": 6, "star2": 3, "star1": 1 }
  -- }
);

CREATE INDEX IF NOT EXISTS idx_tours_status ON tours(status);
CREATE INDEX IF NOT EXISTS idx_tours_island ON tours(island);
CREATE INDEX IF NOT EXISTS idx_tours_updated_at ON tours(updated_at DESC);

-- ---------------------------------------------------------------
-- posts (Blog)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  category TEXT,
  island_tag TEXT,
  content_format TEXT NOT NULL DEFAULT 'listicle' CHECK (content_format IN ('listicle', 'comparison', 'deep_dive_review', 'honest_take')),
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES admin_users(id),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
  -- data shape (MVP subset — see tripreviewall-blog-details-brief.md §5 for
  -- the full future shape, e.g. TOC entries, inline tour embeds):
  -- {
  --   "title": "...", "excerpt": "...", "authorName": "...",
  --   "featuredImage": "/uploads/posts/....jpg",
  --   "body": "...", "disclosureText": "...", "readTimeMinutes": 7,
  --   "tags": ["..."], "pillarPageDestinationSlug": "maui"
  -- }
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts(updated_at DESC);
