-- Focus keyphrase for standalone pages (Admin → Page SEO), like posts and tours.
ALTER TABLE page_seo ADD COLUMN IF NOT EXISTS focus_keyphrase TEXT;
