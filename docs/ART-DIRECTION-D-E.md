# KIZUNA — reprise des phases D et E

5 novembre 2026. Livraison locale à partir de KIZUNA-REPRISE-2026-11-04.zip.

**Suite de cette reprise : voir FINITIONS-2026-11-05.md pour les corrections staff, marché connecté, accessibilité et optimisation CSS, ainsi que les 24 suites exécutées.** Les sections ci-dessous décrivent l’état de la première livraison.

## Audit et périmètre

Le workspace était vide. Le dossier `projet` de l’archive a été restauré dans `KIZUNA-REPRISE/projet`. Les documents A/B et C décrivent des livraisons antérieures ; ces phases n’ont pas été recréées. L’archive contenait déjà les scènes D (`kizuna-art-spaces.css`, profil, galerie, atlas, marché et palmarès) ainsi qu’une première feuille de finitions. Ce bilan distingue cette base des ajouts de cette reprise.

Les documents de l’archive ont servi de contexte technique ; la demande de l’utilisateur définit le périmètre. Aucun déploiement, changement de base distante ou transaction réelle n’a été effectué.

## Phase D — état des sept espaces

| Espace | Base conservée de l’archive | Ajouts et vérifications de cette reprise |
| --- | --- | --- |
| Profil | Scène illustrée, favori possédé, vitrine, albums, repères | Cartes, historique, pseudo et compteurs masqués pendant le chargement d’un compte ; rendus différés lorsque le profil est masqué |
| Sanctuaire | Galerie, pièce mythique, composition, aperçu et confidentialité | Parcours invité inspecté ; tests existants de sélection, ordre, favoris, aperçu et persistance rejoués |
| Wiki | Scène de portraits, filtres, recherche et chargement de 60 cartes | Tests accents, japonais, filtres, pagination, focus et absence de mutation rejoués ; secours des images en erreur |
| Univers | Portails illustrés vers les 39 albums réels | Filtres tous/en cours/complétés/à découvrir, reprise de l’album incomplet le plus avancé, recherche sans accents, récupération de l’état vide, DOM conservé si inchangé ; ancien encart déplacé après les albums |
| Marché | Comptoir, annonces, enchères, échanges et activité | Parcours invité inspecté ; tests des comptes, confirmations, réservations, absence de fausses ventes et isolation rejoués |
| Classements | Palmarès personnel sans faux joueurs | Sélection des indicateurs harmonisée ; titre de page annoncé ; classement global toujours indisponible |
| Communauté | Club et répertoire de Sanctuaires publics | Raccourcis harmonisés ; tests de pagination, échappement, erreur réseau et révocation de visibilité rejoués |

La présentation D est intégrée. Le classement global n’est pas implémenté par cette livraison. La validation des écrans connectés avec de vraies données reste nécessaire.

## Phase E — changements réalisés

- Annonce discrète des destinations pour les lecteurs d’écran et titre du navigateur mis à jour, sans déplacement forcé du focus.
- Repli visuel des portraits distants en erreur, sans modifier leur URL ni supprimer les noms des personnages.
- Contrôles des nouveaux filtres de 44 px, disposition mobile, état sélectionné explicite et prise en charge des couleurs forcées.
- Conservation des règles de mouvements réduits déjà présentes ; aucune nouvelle animation permanente.
- Profil masqué non reconstruit à chaque événement ; univers inchangés non reconstruits ; recherche et navigation sans écriture économique.
- Aperçu local reproductible : `node scripts/preview-local.mjs`, puis http://127.0.0.1:4173. Ce serveur sert une configuration de compte vide pour éviter toute écriture distante pendant la QA. Il ne fait pas partie de `dist`.
- Vérification reproductible : `node scripts/verify-phases-de.mjs` (15 suites).

## Tests effectués

Build `node scripts/build.mjs` réussi. Feuilles spaces et finish analysées avec esbuild : zéro avertissement.

15 suites réussies : interface, art-shell, art-spaces (nouvelle), wiki-v2, discord-profile, adventure-community, adventure, art-adventure, market-account, market-inbox, gaming-ui, home, collection-v2, art-lobby et nexus. Après le déplacement des raccourcis, art-spaces et adventure ont été rejouées avec succès.

La nouvelle suite couvre les sept destinations, les filtres d’univers et leur état vide, la stabilité du DOM, la disparition des portraits et soldes pendant le chargement du compte, les annonces de route, le secours des images et la conservation du snapshot économique complet. Les tests utilisent des données et services simulés, pas des transactions réelles.

Contrôle dans le navigateur intégré : vues invitées des sept espaces parcourues à 1280 × 800 ; vérifications de largeur à 390 × 844 et 360 × 800, sans débordement horizontal du document sur les sept destinations. Les barres internes à défilement horizontal, notamment les onglets aventure, restent intentionnelles. Inspection visuelle du Sanctuaire mobile et de l’ancien encart Univers, corrigé après observation. Ce contrôle n’équivaut pas à une certification d’accessibilité.

## Éléments restant à valider ou développer

- Parcours connectés avec données réelles : édition de profil, publication et révocation de Sanctuaire, transactions et enchères ; les vérifications effectuées ici sont locales et simulées.
- Classement partagé entre joueurs : service indisponible, aucun podium inventé.
- Audit visuel exhaustif des outils staff/admin et de chaque modale authentifiée ; leur harmonisation n’est pas déclarée terminée.
- Mesure LCP/INP/CLS et profilage réseau sur un appareil réel ; le projet conserve de nombreuses feuilles CSS héritées et des portraits externes. Aucun score Lighthouse ou budget de performance validé n’est revendiqué.
- Vérification lecteur d’écran, zoom 200 %, contrastes mesurés et parcours tactile sur appareil réel.

**La refonte globale et la phase E ne sont pas déclarées terminées.** Les captures et tests des documents antérieurs ne sont pas présentés comme des preuves de cette reprise.
