-- Table for persisting message templates and exterior hotel lists
CREATE TABLE IF NOT EXISTS public.message_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key TEXT NOT NULL,
  settings_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_settings_site_type
  ON public.message_settings (site_key, settings_type);

ALTER TABLE public.message_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert message_settings" ON public.message_settings;
DROP POLICY IF EXISTS "Allow select message_settings" ON public.message_settings;
DROP POLICY IF EXISTS "Allow update message_settings" ON public.message_settings;
DROP POLICY IF EXISTS "Allow delete message_settings" ON public.message_settings;

CREATE POLICY "Allow insert message_settings"
ON public.message_settings
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow select message_settings"
ON public.message_settings
FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow update message_settings"
ON public.message_settings
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow delete message_settings"
ON public.message_settings
FOR DELETE
TO public
USING (true);

