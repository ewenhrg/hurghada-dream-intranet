-- Ajoute un drapeau "populaire" pour afficher un badge sur le catalogue public.
ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS popular BOOLEAN NOT NULL DEFAULT false;

-- Index partiel utile si vous filtrez/ordonnez plus tard sur les activités populaires.
CREATE INDEX IF NOT EXISTS idx_activities_popular_true
ON public.activities (site_key, id DESC)
WHERE popular = true;
