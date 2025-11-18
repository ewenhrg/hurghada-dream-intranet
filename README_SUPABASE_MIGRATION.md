# Migration Supabase - Ajout des colonnes client_arrival_date et client_departure_date

## Problème
L'erreur suivante apparaît lors de la création d'un devis :
```
Could not find the 'client_arrival_date' column of 'quotes' in the schema cache
```

## Solution
Les colonnes `client_arrival_date` et `client_departure_date` n'existent pas dans la table `quotes` de Supabase.

## Instructions

1. **Ouvrir Supabase Dashboard**
   - Aller sur https://app.supabase.com
   - Sélectionner votre projet

2. **Ouvrir l'éditeur SQL**
   - Cliquer sur "SQL Editor" dans le menu de gauche
   - Cliquer sur "New query"

3. **Exécuter le script de migration**
   - Copier le contenu du fichier `supabase_migration_add_client_dates.sql`
   - Coller dans l'éditeur SQL
   - Cliquer sur "Run" ou appuyer sur `Ctrl+Enter` (Windows) ou `Cmd+Enter` (Mac)

4. **Vérifier que les colonnes ont été ajoutées**
   - Le script affichera un message de confirmation
   - Vous pouvez vérifier dans "Table Editor" > "quotes" que les nouvelles colonnes sont présentes

## Notes
- Le script vérifie si les colonnes existent déjà avant de les créer (idempotent)
- Les colonnes sont de type `DATE` (peuvent être NULL)
- La colonne `updated_at` sera également créée si elle n'existe pas déjà

## Après la migration
Une fois le script exécuté, vous pourrez créer des devis sans erreur. Les dates d'arrivée et de départ du client seront correctement enregistrées dans Supabase.

