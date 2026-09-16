-- ============================================================
-- Tripreviewall.com — Admin Panel Core Schema
-- Covers: admin_users, tours, posts, settings, leads
-- Other tables (destinations, click_logs, media) are NOT created
-- here yet — add them as their admin modules are built, following
-- the same id + JSONB "data" pattern.
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

-- ---------------------------------------------------------------
-- settings  (added for Leads + Settings→Email module)
-- Generic key/value JSONB store — one row per named setting group.
-- First consumer: key = 'email_smtp' (see admin/src/lib/mailer.js).
-- The SMTP password is never stored in plaintext — see
-- admin/src/lib/crypto-secret.js (AES-256-GCM, key from .env).
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  -- data shape for key='email_smtp':
  -- { "host": "smtp.gmail.com", "port": 587, "secure": false,
  --   "authUser": "you@gmail.com", "authPassEncrypted": "iv:tag:cipher",
  --   "fromName": "Tripreviewall", "fromEmail": "you@gmail.com",
  --   "notifyToEmail": "you@gmail.com" }
);

-- ---------------------------------------------------------------
-- leads  (Contact + Transportation form submissions)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL CHECK (source IN ('contact', 'transportation')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
  -- data shape (fields vary slightly by source):
  -- { "name": "...", "email": "...", "phone": "...", "message": "...",
  --   "service": "...", "date": "...", "pickup": "...", "passengers": 2,
  --   "notes": "...", "ipAddress": "...", "userAgent": "...",
  --   "emailSentAt": "...", "emailError": null }
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
