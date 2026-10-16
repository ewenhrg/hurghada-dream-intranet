-- Espace agences : demandes d'identifiant, comptes, devis sans prix.
-- Le mot de passe est hashé (pgcrypto) avant d'être stocké.
-- La connexion passe par b2b_login, qui ne renvoie jamais le hash.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.b2b_access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  company_name TEXT NOT NULL DEFAULT '',
  legal_name TEXT NOT NULL DEFAULT '',
  siret TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.b2b_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES public.b2b_access_requests(id) ON DELETE SET NULL,
  login TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT b2b_accounts_login_unique UNIQUE (login)
);

CREATE TABLE IF NOT EXISTS public.b2b_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.b2b_accounts(id) ON DELETE SET NULL,
  agency_name TEXT NOT NULL DEFAULT '',
  agency_login TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  client_phone TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',
  client_hotel TEXT NOT NULL DEFAULT '',
  arrival_date TEXT NOT NULL DEFAULT '',
  departure_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_requests_created ON public.b2b_access_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_accounts_login ON public.b2b_accounts (lower(login));
CREATE INDEX IF NOT EXISTS idx_b2b_quotes_created ON public.b2b_quotes (created_at DESC);

CREATE OR REPLACE FUNCTION public.b2b_hash_password()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.password_hash IS NOT NULL AND NEW.password_hash <> '' AND NEW.password_hash NOT LIKE '$2%' THEN
    NEW.password_hash := crypt(NEW.password_hash, gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS b2b_accounts_hash_password ON public.b2b_accounts;
CREATE TRIGGER b2b_accounts_hash_password
  BEFORE INSERT OR UPDATE OF password_hash ON public.b2b_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.b2b_hash_password();

CREATE OR REPLACE FUNCTION public.b2b_login(p_login TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  acc public.b2b_accounts%ROWTYPE;
BEGIN
  IF p_login IS NULL OR p_password IS NULL OR length(trim(p_login)) < 2 OR length(p_password) < 4 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO acc
  FROM public.b2b_accounts
  WHERE lower(login) = lower(trim(p_login))
    AND active = TRUE
  LIMIT 1;

  IF acc.id IS NULL OR acc.password_hash IS DISTINCT FROM crypt(p_password, acc.password_hash) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', acc.id,
    'login', acc.login,
    'companyName', acc.company_name,
    'contactName', acc.contact_name,
    'email', acc.email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.b2b_login(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.b2b_login(TEXT, TEXT) TO anon, authenticated;

ALTER TABLE public.b2b_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2b_requests_all" ON public.b2b_access_requests;
CREATE POLICY "b2b_requests_all" ON public.b2b_access_requests FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "b2b_accounts_all" ON public.b2b_accounts;
CREATE POLICY "b2b_accounts_all" ON public.b2b_accounts FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "b2b_quotes_all" ON public.b2b_quotes;
CREATE POLICY "b2b_quotes_all" ON public.b2b_quotes FOR ALL TO public USING (true) WITH CHECK (true);

REVOKE SELECT (password_hash) ON public.b2b_accounts FROM anon, authenticated;
