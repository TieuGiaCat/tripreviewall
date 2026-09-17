-- ============================================================
-- Tripreviewall.com — Admin Panel Core Schema
-- Covers: admin_users, tours, posts, settings, leads, destinations, authors
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
  --   "title": "...", "excerpt": "...", "authorName": "...", "authorSlug": null,
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

-- ---------------------------------------------------------------
-- destinations  (Island pillar page content — exactly 4 rows,
-- auto-seeded by migrate.js; not creatable/deletable from Admin)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
  -- data shape:
  -- { "islandName": "Maui", "heroImage": "/uploads/destinations/....jpg",
  --   "introText": "...",
  --   "seo": { "metaTitle": "...", "metaDescription": "..." } }
);

-- ---------------------------------------------------------------
-- authors
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
  -- data shape:
  -- { "name": "...", "roleTitle": "...", "photoUrl": "/uploads/authors/....jpg",
  --   "experienceStatement": "...", "statsLine": "...", "profileLink": null }
);

CREATE INDEX IF NOT EXISTS idx_authors_status ON authors(status);

-- ---------------------------------------------------------------
-- click_logs  (affiliate booking-link clicks — Analytics module)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS click_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_slug TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('fareharbor', 'tripadvisor', 'getyourguide', 'viator')),
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_click_logs_tour_slug ON click_logs(tour_slug);
CREATE INDEX IF NOT EXISTS idx_click_logs_platform ON click_logs(platform);
CREATE INDEX IF NOT EXISTS idx_click_logs_clicked_at ON click_logs(clicked_at DESC);

-- ---------------------------------------------------------------
-- categories  (Blog Post categories — editable list, replaces the
-- hardcoded 5-category array)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- admin_sessions  (DB-backed login sessions — survive `pm2 restart`
-- and would work across multiple app processes, unlike the old
-- in-memory Map. Row per active session; expired rows are swept
-- periodically by the app and also filtered out on every read.)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

-- ---------------------------------------------------------------
-- audit_log  ("who changed what and when" — now that multiple
-- admin/editor accounts exist. Fire-and-forget writes from
-- src/auditLog.js; never blocks or fails the operation it records.)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  target_type TEXT NOT NULL,
  target_id TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target_type ON audit_log(target_type);


