# 🔴 Problème : Activités qui disparaissent de la base de données

## Causes identifiées

### 1. ⚠️ **PROBLÈME CRITIQUE CORRIGÉ** : Vidage automatique si Supabase vide
**Fichier** : `src/App.jsx` (lignes 222-227)

**Problème** : Si Supabase retournait un tableau vide (erreur de connexion, problème temporaire, etc.), le code vidait **TOUTES** les activités locales sans vérification.

**Solution appliquée** : Le code vérifie maintenant s'il y a des activités locales avant de les vider. Si des activités locales existent et que Supabase est vide, elles sont conservées avec un avertissement dans les logs.

### 2. 🔓 Politique RLS trop permissive
**Fichier** : `supabase_activities_table.sql` (lignes 68-73)

**Problème** : La politique DELETE permet à **n'importe qui** (`TO public`) de supprimer des activités. C'est un problème de sécurité majeur.

**Solution proposée** : 
- Script `supabase_fix_activities_security.sql` créé avec :
  - Table d'audit pour tracer toutes les suppressions
  - Trigger automatique pour sauvegarder les activités avant suppression
  - Fonction de restauration des activités supprimées
  - Vue pour consulter les suppressions récentes

### 3. 🔄 Synchronisation Realtime
**Fichier** : `src/App.jsx` (lignes 784-794)

**Problème** : Si une activité est supprimée dans Supabase (via l'interface Supabase, un script SQL, ou une autre instance de l'application), toutes les instances synchronisées suppriment automatiquement l'activité via Realtime.

**Solution appliquée** : Ajout de logs détaillés pour tracer toutes les suppressions via Realtime.

### 4. 🧹 Script de suppression des doublons
**Fichier** : `supabase_remove_duplicates_activities.sql`

**Problème** : Ce script supprime automatiquement les activités considérées comme des doublons (même `site_key`, `name`, et `category`). Si ce script est exécuté, il peut supprimer des activités légitimes.

**Recommandation** : 
- Ne pas exécuter ce script automatiquement
- Toujours vérifier les doublons avant suppression
- Utiliser le script de diagnostic pour voir les suppressions

## Solutions appliquées

### ✅ Corrections de code
1. **Protection contre le vidage** : Les activités locales sont conservées si Supabase retourne un tableau vide
2. **Logs améliorés** : Toutes les suppressions sont maintenant tracées avec des détails complets
3. **Audit Realtime** : Les suppressions via Realtime sont loggées avec toutes les informations

### 📋 Scripts SQL créés

#### `supabase_fix_activities_security.sql`
**À exécuter immédiatement** dans l'éditeur SQL de Supabase pour :
- Créer une table d'audit des suppressions
- Créer un trigger pour sauvegarder automatiquement les activités avant suppression
- Créer une fonction pour restaurer les activités supprimées
- Créer une vue pour consulter les suppressions récentes

#### `supabase_diagnose_activity_deletions.sql`
**À exécuter** pour diagnostiquer les suppressions :
- Compter les suppressions récentes
- Lister les activités supprimées
- Vérifier les doublons
- Vérifier l'état des politiques RLS
- Identifier les activités pouvant être restaurées

## Actions à effectuer

### 1. Immédiatement
```sql
-- Exécuter dans Supabase SQL Editor
-- Copier-coller le contenu de supabase_fix_activities_security.sql
```

### 2. Diagnostic
```sql
-- Exécuter dans Supabase SQL Editor
-- Copier-coller le contenu de supabase_diagnose_activity_deletions.sql
```

### 3. Restauration (si nécessaire)
Si des activités ont été supprimées récemment, vous pouvez les restaurer :

```sql
-- Voir les activités supprimées récemment
SELECT * FROM public.activities_deletion_audit 
WHERE deleted_at >= NOW() - INTERVAL '7 days'
ORDER BY deleted_at DESC;

-- Restaurer une activité spécifique (remplacer AUDIT_ID par l'ID de l'audit)
SELECT public.restore_deleted_activity(AUDIT_ID);
```

### 4. Vérification des politiques RLS
Pour une sécurité maximale, restreindre les suppressions aux utilisateurs authentifiés :

```sql
-- Dans Supabase SQL Editor
DROP POLICY IF EXISTS "Allow delete activities" ON public.activities;
CREATE POLICY "Allow delete activities"
ON public.activities
FOR DELETE
TO authenticated
USING (true);
```

**Note** : Cette modification nécessite que les utilisateurs soient authentifiés dans Supabase. Si votre application n'utilise pas l'authentification Supabase, gardez la politique actuelle mais surveillez les suppressions via l'audit.

## Prévention future

1. **Ne jamais exécuter de scripts SQL de suppression sans vérification préalable**
2. **Vérifier régulièrement les logs de suppression** via la vue `recent_activity_deletions`
3. **Sauvegarder régulièrement** la base de données Supabase
4. **Surveiller les suppressions** via les logs de l'application (console du navigateur)

## Vérification

Après avoir appliqué les corrections, vérifiez :

1. ✅ Les activités ne disparaissent plus si Supabase a un problème temporaire
2. ✅ Toutes les suppressions sont tracées dans `activities_deletion_audit`
3. ✅ Les logs de l'application montrent des détails complets sur les suppressions
4. ✅ Vous pouvez restaurer les activités supprimées récemment

## Support

Si le problème persiste :
1. Exécutez le script de diagnostic
2. Vérifiez les logs de l'application (console du navigateur)
3. Vérifiez la table d'audit dans Supabase
4. Contactez le support avec les informations collectées
