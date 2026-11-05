# KIZUNA — finitions supplémentaires

5 novembre 2026. Ce bilan complète ART-DIRECTION-D-E.md, qui décrit la première reprise.

## Travail réalisé

- **Outils staff** : nouvelle feuille `kizuna-art-admin.css`, identité encre/ivoire/or/turquoise, scène des coulisses, boutons et champs de 44 px, textes des formulaires de 13–14 px et annotations de 12 px. L’ancienne interface contenait des textes de 7–10 px. Les outils inscriptions, AniList, boosters, récompenses, équipe, liens/missions, marché, Studio, Nexus et Anomalies partagent désormais cette présentation.
- **Marché connecté** : son interface `keExchange` était distincte du marché invité et conservait l’ancien thème violet. Nouvelle feuille `kizuna-art-exchange.css` pour le comptoir, les annonces, filtres, états vides, fenêtres de vente/historique et boîte de notifications.
- **Accessibilité** : correction du statut d’avatar et des groupes de filtres Wiki/marché ; contraste des petits textes du palmarès renforcé. L’accent corail passe de `#ff7185` à `#ff8295` pour respecter le seuil de contraste des textes sur la surface ardoise de référence. Les couleurs des raretés ne changent pas.
- **Profil** : fermeture du formulaire lors du changement ou du chargement d’un compte, y compris pendant une sauvegarde ; réponse de l’ancien compte ignorée. Retour du focus vers le bouton Modifier après fermeture/rendu. Les chiffres dépliés restent ouverts après rafraîchissement. Cliquer dans la marge intérieure du dialogue ne ferme plus le brouillon.
- **Dialogues du marché connecté** : nom accessible explicite et distinction entre clic dans la marge intérieure et clic extérieur.
- **Responsive staff** : colonnes empilées, onglets et tables défilant dans leurs propres conteneurs, décor contenu ; un débordement du document constaté à 360 px a été corrigé.

## Performances et construction

Les sources CSS sont conservées pour l’édition. `src/style-bundles.json` déclare leur ordre exact ; `scripts/build-ui.mjs` produit deux fichiers minifiés. Les styles inline intercalés et la feuille catalogue restent à leur position d’origine. Aucun sélecteur d’une vue dynamique n’est supprimé.

La page passe de **39 requêtes de feuilles CSS à 3**, malgré l’ajout de deux nouvelles feuilles source. Les deux bundles représentent environ **673 ko bruts / 130 ko gzip** (le poids gzip est calculé localement ; la compression effective dépend de l’hébergement). La réduction porte surtout sur le nombre de requêtes, pas sur une suppression massive du CSS hérité.

Le build est reproductible : exécuter deux fois les mêmes sources ne modifie pas les fichiers livrés. Les sources CSS et les bundles ne doivent pas être édités indépendamment : après modification d’une feuille source, lancer le build.

## Vérifications effectuées

**24 suites réussies au total** : les 15 de la reprise précédente, plus finish, staff-panel, staff-server, studio, studio-build, nexus-admin, nexus-admin-account, adventure-admin et economy-interface. Le runner `node scripts/verify-phases-de.mjs` les regroupe. Les derniers changements de palette et de CSS staff ont été revérifiés avec finish, economy-interface et studio-build ; aucune transaction distante n’a été effectuée.

La suite finish vérifie notamment le formulaire de profil, le changement de compte pendant une sauvegarde, les réponses tardives, le focus après rendu, les chiffres dépliés, l’ordre et la reproductibilité des bundles, l’exclusion des outils QA du HTML publié et un contraste d’au moins 4,5:1 pour les cinq couleurs de texte partagées sur `#283953`.

**Audit axe-core 4.10.2 dans un vrai navigateur** : sept espaces joueurs et dix outils staff contrôlés. Deux textes du palmarès ont initialement échoué au contraste (3,92:1 et 3,31:1) ; corrigés. Dernière passe : aucune violation automatique remontée sur ces vues. L’éditeur de profil ouvert a également été contrôlé ; Échap le ferme et le focus revient sur Modifier.

Les résultats contiennent encore des contrôles manuels : axe ne peut pas calculer tous les contrastes sur des fonds illustrés ou dégradés, et demande de vérifier la relation du bouton de navigation avec son dialogue fermé. Le dialogue existe, son identifiant correspond à `aria-controls`, et les tests couvrent ouverture/fermeture/focus. **Zéro violation automatique ne signifie pas certification WCAG.**

Les dix onglets staff ont été vérifiés à **360 × 800**, sans débordement horizontal du document après correction. Tables et onglets disposent de leur propre défilement horizontal. Le marché connecté et l’éditeur de profil ont été inspectés avec des données QA clairement identifiées. Les services simulés rejettent les écritures. Ils sont servis uniquement par `scripts/preview-local.mjs`, jamais inclus dans `dist/index.html`.

Les observations de performance locales sont conservées dans les résultats QA. Elles ne constituent pas une mesure de terrain : changement de droits simulé, redimensionnement et navigation peuvent augmenter le CLS de la session. Aucun score Lighthouse, INP de terrain ou résultat sur réseau mobile n’est revendiqué.

Preuves locales : `outputs/audit-finitions.json`, `outputs/kizuna-finitions-staff.png` et `outputs/kizuna-marche-connecte.png`. Les captures staff/marché utilisent exclusivement les simulations QA.

## Reproduire

```sh
npm ci
npm run build
npm run test:phases-de
npm run preview:local
```

Ouvrir `http://127.0.0.1:4173/?qa=guest` pour les vues invitées auditées ou `http://127.0.0.1:4173/?qa=staff` pour les outils simulés. Sans paramètre `qa`, l’aperçu conserve une configuration de compte vide. Les comptes réels restent accessibles uniquement sur une installation configurée normalement.

## Limites restantes

Les corrections de cette reprise sont intégrées et testées localement. Restent la recette sur un compte réel et un environnement de staging configuré, les transactions multijoueurs réelles, la vérification avec lecteur d’écran et appareil tactile, le zoom réel à 200 % et les mesures de performance en conditions de production. Le classement global reste indisponible et n’a pas été ajouté par cette finition. Aucun déploiement ni changement Supabase n’a été réalisé.

La refonte globale ne doit toujours pas être présentée comme définitivement validée tant que cette recette n’est pas passée.
