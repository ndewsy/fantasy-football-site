-- Posts supported exactly one attachment (file_url). Extends to up to 10,
-- backfilling existing single-attachment posts into the new array column.
-- file_url is left in place (unused going forward) rather than dropped, in
-- case anything outside this app still reads it.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS file_urls text[];

UPDATE public.posts
SET file_urls = ARRAY[file_url]
WHERE file_url IS NOT NULL AND file_urls IS NULL;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_file_urls_max10 CHECK (file_urls IS NULL OR array_length(file_urls, 1) <= 10);
