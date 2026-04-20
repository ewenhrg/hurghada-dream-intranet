# 🏖️ Hurghada Dream - Intranet

Application web de gestion des devis et activités touristiques pour **Hurghada Dream**. Cette application permet de créer des devis, gérer les activités, suivre les paiements et imprimer des documents professionnels.

## 📋 Table des matières

- [Fonctionnalités](#-fonctionnalités)
- [Technologies](#-technologies)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Utilisation](#-utilisation)
- [Structure du projet](#-structure-du-projet)
- [Développement](#-développement)

## ✨ Fonctionnalités

### 📝 Gestion des Devis
- Création de devis professionnels avec multiples activités
- Calcul automatique des prix (espèces et carte avec frais de 3%)
- Gestion des extras (Speed Boat, Buggy, etc.)
- Génération de devis HTML imprimables
- Validation des horaires et disponibilités
- Stockage automatique du formulaire en cours

### 🎫 Gestion des Tickets
- Enregistrement des numéros de tickets
- Suivi des paiements (espèces/carte)
- Visualisation des statuts (payé/en attente)
- Export pour comptabilité

### 🏃 Gestion des Activités
- Création et modification d'activités
- Catégorisation (Désert, Aquatique, Exploration/Bien-être, Louxor & Le Caire)
- Définition des prix (adulte/enfant/bébé)
- Jours de disponibilité
- Configuration des transferts par quartier
- Suppléments selon le lieu de prise en charge

### 👥 Gestion des Utilisateurs
- Système d'authentification par code
- Gestion des permissions granulaires
- Accès contrôlé par fonctionnalité

### 📊 Historique
- Consultation de tous les devis
- Filtrage par statut de paiement
- Recherche par numéro de téléphone
- Modification des devis existants

### 🔄 Synchronisation Supabase
- Sauvegarde automatique dans le cloud
- Synchronisation temps réel entre utilisateurs
- Mode dégradé (fonctionne sans Supabase pour tests)
- Scripts SQL du schéma : dossier **`supabase/`** à la racine du dépôt

## 🛠️ Technologies

- **React 19** - Bibliothèque UI
- **Vite 7** - Build tool et dev server
- **Tailwind CSS** - Framework CSS
- **Supabase** - Backend as a Service
- **ESLint** - Linter JavaScript
- **LocalStorage** - Persistance locale

## 📦 Prérequis

- **Node.js** >= 18
- **npm** ou **yarn**
- Compte Supabase (optionnel pour le développement)

## 🚀 Installation

1. **Cloner le dépôt**
```bash
git clone https://github.com/ewenhrg/hurghada-dream-intranet.git
cd hurghada-dream-intranet
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer les variables d'environnement** (voir section Configuration)

4. **Lancer l'application**
```bash
npm run dev
```

L'application sera accessible sur `http://localhost:5173`

## ⚙️ Configuration

### Variables d'environnement

Créez un fichier `.env` à la racine du projet :

```env
# URL de votre projet Supabase
VITE_SUPABASE_URL=https://votre-projet.supabase.co

# Clé anonyme de Supabase
VITE_SUPABASE_ANON_KEY=votre_cle_anonyme

# Clé du site (optionnel, default: hurghada_dream_0606)
VITE_SITE_KEY=hurghada_dream_0606
```

**Note** : Si Supabase n'est pas configuré, l'application fonctionnera en mode dégradé avec un code d'accès de développement : `040203`.

### Configuration Supabase

Créez les tables suivantes dans votre base Supabase :

#### Table `users`
```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  can_delete_quote BOOLEAN DEFAULT false,
  can_add_activity BOOLEAN DEFAULT false,
  can_edit_activity BOOLEAN DEFAULT false,
  can_delete_activity BOOLEAN DEFAULT false,
  can_reset_data BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Table `activities`
```sql
CREATE TABLE activities (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'desert',
  price_adult DECIMAL(10,2) DEFAULT 0,
  price_child DECIMAL(10,2) DEFAULT 0,
  price_baby DECIMAL(10,2) DEFAULT 0,
  age_child TEXT,
  age_baby TEXT,
  currency TEXT DEFAULT 'EUR',
  available_days BOOLEAN[] DEFAULT ARRAY[false,false,false,false,false,false,false],
  notes TEXT,
  transfers JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Table `quotes`
```sql
CREATE TABLE quotes (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  client_name TEXT,
  client_phone TEXT,
  client_hotel TEXT,
  client_room TEXT,
  client_neighborhood TEXT,
  notes TEXT,
  created_by_name TEXT,
  items JSONB NOT NULL,
  total_cash DECIMAL(10,2),
  total_card DECIMAL(10,2),
  currency TEXT DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Activez **Realtime** sur la table `quotes` pour la synchronisation en temps réel.

## 📖 Utilisation

### Créer un Devis

1. Allez dans l'onglet **"Devis"**
2. Remplissez les informations client (nom, téléphone, hôtel, chambre, quartier)
3. Ajoutez des activités avec leurs dates et participants
4. Configurez les extras si nécessaire
5. Cliquez sur **"Créer le devis"**

Le formulaire est automatiquement sauvegardé au fur et à mesure (débounce 300ms).

### Enregistrer un Paiement

1. Dans la liste des devis, cliquez sur **"💰 Payer"**
2. Entrez les numéros de tickets pour chaque activité
3. Sélectionnez le mode de paiement (Espèces ou Carte)
4. Validez

### Imprimer un Devis

Cliquez sur le bouton **"🖨️ Imprimer"** sur n'importe quel devis. Une nouvelle fenêtre s'ouvre avec le devis formaté, prêt à imprimer ou enregistrer en PDF.

### Gérer les Activités

1. Allez dans **"Activités"**
2. Cliquez sur **"Nouvelle activité"**
3. Remplissez les informations (nom, catégorie, prix, jours disponibles)
4. Configurez les transferts par quartier
5. Enregistrez

### Gérer les Utilisateurs

1. Allez dans **"Utilisateurs"**
2. Créez un nouvel utilisateur avec un code à 6 chiffres
3. Configurez les permissions selon les besoins
4. Sauvegardez

## 📁 Structure du projet

```
hurghada-dream/
├── docs/                 # Notes techniques, optimisations, procédures (Markdown)
├── supabase/             # Scripts SQL à exécuter dans l’éditeur Supabase (migrations, tables)
├── src/
│   ├── components/       # Composants réutilisables
│   │   ├── ui.jsx       # Composants UI de base
│   │   ├── DaysSelector.jsx
│   │   └── TransfersEditor.jsx
│   ├── hooks/           # Hooks personnalisés
│   │   ├── useDebounce.js
│   │   └── useDebouncedCallback.js
│   ├── lib/            # Bibliothèques externes
│   │   └── supabase.js # Configuration Supabase
│   ├── pages/          # Pages de l'application
│   │   ├── ActivitiesPage.jsx
│   │   ├── HistoryPage.jsx
│   │   ├── LoginPage.jsx
│   │   ├── QuotesPage.jsx
│   │   ├── TicketPage.jsx
│   │   └── UsersPage.jsx
│   ├── App.jsx         # Composant principal
│   ├── main.jsx        # Point d'entrée
│   ├── constants.js    # Constantes de l'application
│   └── utils.js        # Fonctions utilitaires
├── public/
│   └── logo.png        # Logo de l'entreprise
├── .env.example        # Exemple de configuration
├── package.json
├── tailwind.config.js
└── README.md
```

Les migrations et schémas SQL ne sont plus à la racine : tout est regroupé sous **`supabase/`**. La documentation hors README principal est dans **`docs/`** (ex. `docs/README_SUPABASE_MIGRATION.md`).

## 🧑‍💻 Développement

### Scripts disponibles

```bash
# Lancer le serveur de développement
npm run dev

# Build de production
npm run build

# Aperçu du build de production
npm run preview

# Linter le code
npm run lint
```

### Mode développement sans Supabase

Si vous n'avez pas configuré Supabase, l'application fonctionne en mode dégradé avec :
- **Code d'accès** : `040203`
- **Utilisateur** : Ewen (toutes les permissions)
- **Données** : Stockage local uniquement (LocalStorage)

### Bonnes pratiques

- Utilisez le débounce pour les champs de saisie
- Vérifiez toujours la disponibilité des activités avant de créer un devis
- Nettoyez les numéros de téléphone avant stockage
- Sauvegardez régulièrement vos modifications

## 🔒 Sécurité

- L'authentification se fait par code à 6 chiffres
- Les données sensibles sont stockées dans Supabase
- Les permissions sont gérées au niveau utilisateur
- Les numéros de téléphone sont normalisés avant stockage

## 📝 Licence

Ce projet est privé et propriété de Hurghada Dream.

## 👤 Auteur

**Hurghada Dream**

---

**Version** : 1.0.0  
**Dernière mise à jour** : 2024
