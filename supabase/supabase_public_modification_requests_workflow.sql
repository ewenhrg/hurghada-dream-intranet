-- Workflow demandes modif : pending → to_send → sent / to_refund → done (+ refused).
-- Anciens « accepted » restent lisibles ; les nouvelles validations utilisent to_send.

ALTER TABLE public.public_modification_requests
  DROP CONSTRAINT IF EXISTS public_modification_requests_status_ok;

ALTER TABLE public.public_modification_requests
  ADD CONSTRAINT public_modification_requests_status_ok
  CHECK (
    status IN (
      'pending',
      'accepted',
      'refused',
      'to_send',
      'sent',
      'to_refund',
      'done'
    )
  );

-- Migrate anciennes validations vers « confirmation à envoyer ».
UPDATE public.public_modification_requests
SET status = 'to_send'
WHERE status = 'accepted';

NOTIFY pgrst, 'reload schema';
