-- Heure serveur pour la prise en charge des devis public (évite horloges client/agent fausses).
CREATE OR REPLACE FUNCTION public.mark_public_quote_treated(p_id bigint, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.public_quotes%ROWTYPE;
  v_name text := nullif(btrim(p_name), '');
BEGIN
  IF p_id IS NULL OR v_name IS NULL THEN
    RAISE EXCEPTION 'id ou nom manquant';
  END IF;

  UPDATE public.public_quotes
  SET
    treated_by_name = v_name,
    treated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'demande introuvable';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'treated_by_name', v_row.treated_by_name,
    'treated_at', v_row.treated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_public_quote_treated(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_public_quote_treated(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_public_quote_treated(bigint, text) TO anon;
