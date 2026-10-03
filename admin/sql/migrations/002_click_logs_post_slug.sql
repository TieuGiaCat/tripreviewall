-- D8: affiliate links pasted inside an article are now counted too.
-- Those clicks have no tour, so they record the article's slug instead.
ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS post_slug TEXT;
CREATE INDEX IF NOT EXISTS idx_click_logs_post_slug ON click_logs(post_slug) WHERE post_slug IS NOT NULL;
