# KIZUNA — Lot 2 : Boosters, Collection et Wiki

État du 4 novembre 2026. Ce lot améliore les vues et leurs interactions en conservant le moteur, les comptes et les données existants. Référence de départ : Sites **v18**, commit `980a87a2d4207aee0b90e583950a9a8f7e8dc041`.

**Livraison : validée pour publication** sur le site Kizuna existant, à partir de v18. Le numéro de version et le résultat effectifs sont ceux renvoyés par la publication native Sites et consignés dans le rapport de livraison `outputs/kizuna-lot2-publication.json` du workspace.

## Fonctions livrées

### Boosters

L’aperçu permet de choisir ×1, ×5 ou ×10 avant tout débit. L’ouverture conserve les cinq cartes par booster, les garanties et l’ordre du moins rare au plus rare. La présentation distingue les raretés et réserve l’effet Mythique aux cartes réellement Mythiques.

Les commandes permettent d’avancer, de passer à la prochaine Épique ou mieux et de révéler tout le résultat. Le récapitulatif affiche les cartes effectivement enregistrées, les nouvelles découvertes et les raretés obtenues. Les préférences d’ouverture rapide et de son sont stockées séparément, dans `kizuna_reveal_preferences_v1` ; le son est désactivé par défaut. Le mode de réduction des mouvements supprime les délais d’animation sans modifier le tirage.

Les boutons sont utilisables au clavier. Les fenêtres gèrent Échap, le maintien du focus et son retour à la fermeture. Des jetons d’annulation empêchent une transition retardée de rouvrir une fenêtre fermée ou d’afficher les cartes du compte précédent. Un double clic ne lance pas deux ouvertures. Fermer après le tirage conserve les cartes, déjà enregistrées par le moteur historique.

### Collection et albums

Les contrôles portent des libellés visibles. La recherche accepte les accents, le nom du personnage, son nom natif et son univers. Les filtres utilisent les données existantes : exemplaires disponibles, cartes manquantes, doublons disponibles, liste d’envies et copies réservées. Les tris par nom et dernière acquisition complètent les tris conservés par numéro, rareté et puissance. Un bouton efface les filtres sans quitter l’album consulté.

Les cartes affichent des états lisibles et des commandes explicites **Fiche**, **Verso** et, quand un exemplaire est disponible, **Vendre**. Une copie réservée ne réapparaît pas comme exemplaire libre ou vendable. Le lien de source du verso reste accessible au clavier. Le rendu commence par 60 cartes ; chaque chargement supplémentaire ajoute 60 cartes et place le focus sur la première nouvelle carte.

Les albums restent classés de A à Z en français. Les albums implicites par anime et les albums administrés conservent leurs membres exacts, leur progression et leurs identifiants. L’ouverture, le retour à la liste, le rétablissement de la recherche et du focus, ainsi que les modifications de membres d’un album ouvert restent opérationnels.

Le recyclage demande désormais une confirmation indiquant le nombre réel de doublons disponibles et le Chakra obtenu. L’annulation ne modifie rien. La confirmation conserve un exemplaire disponible de chaque carte et utilise les valeurs de recyclage existantes ; les copies en réserve restent intactes.

### Wiki et consultation des cartes

Le Wiki parcourt le catalogue enregistré. Il propose la recherche française ou japonaise, les univers A–Z, la rareté, les cartes possédées/manquantes, les doublons et la liste d’envies. Le tri par popularité utilise les favoris AniList déjà enregistrés. Le rendu est limité initialement à 60 personnages, puis étendu par lots de 60, avec conservation du focus lorsque le contenu ne change pas.

Le changement de compte réinitialise les filtres personnels et masque l’ancienne possession pendant le chargement du nouveau compte. Les états vides permettent de revenir au catalogue. Les cartes ouvrent la fiche personnage existante, complétée par une commande **Examiner la carte**.

La consultation grand format possède des commandes natives pour retourner et agrandir la carte, des faces annoncées correctement et une gestion du clavier/focus entre fenêtres imbriquées. Les fiches publiques ne déclenchent plus d’enrichissement AniList en direct ; l’import reste dans le circuit administrateur existant. Les illustrations externes et les liens de source sont conservés.

L’historique de prix repose uniquement sur les transactions datées effectivement enregistrées dans l’espace de jeu. Les valeurs de recyclage et les prix demandés dans les annonces ne servent pas à inventer des ventes. Les médianes portent sur 7 ou 30 jours et le graphique demande au moins deux ventes sur la période. Cet historique reste local à la sauvegarde ; il ne constitue pas un indice mondial du marché.

## Sources et intégration

| Source | Rôle |
| --- | --- |
| `src/booster-views.inc.js` et `dist/kizuna-boosters-v2.css` | Aperçu, ouverture, navigation, préférences et récapitulatif. |
| `src/collection-view.inc.js` et `dist/kizuna-collection-v2.css` | Collection, états, filtres, pagination et albums. |
| `src/wiki-view.inc.js` et `dist/kizuna-wiki-v2.css` | Catalogue consultable, recherche et filtres du Wiki. |
| `src/card-viewer.inc.js` et `dist/kizuna-viewer-v2.css` | Inspection des cartes, focus et affichage factuel des ventes. |
| `scripts/sync-feature-views.mjs` | Injecte les modules dans des blocs délimités de `dist/index.html`, après synchronisation du pont de jeu. |
| `src/game-bridge.inc.js` | Réinitialise la vue Wiki lors de l’application d’un instantané, sans ajouter de champ économique. |
| `dist/index.html` | Contrôles et routage historiques conservés, intégration des commandes, confirmation du recyclage et rendu des réservations sans règlement implicite. |
| `dist/kizuna-preserve.js` | Sauvegarde brute locale avant le moteur, désormais identifiée par `lot2-v19`. |

`node scripts/build.mjs` synchronise le pont, les vues et les fichiers générés. Les fichiers `.inc.js` sont les sources des blocs injectés : ne pas corriger uniquement leurs copies dans le HTML. Aucun framework ou paquet supplémentaire n’a été ajouté.

## Données et économie conservées

Le lot n’ajoute **aucune migration SQL**, aucune table et aucune modification d’Auth, de rôle ou de politique RLS. Le projet Supabase existant reste utilisé. Le format des instantanés, leurs limites historiques, les identifiants des cartes et les clés de stockage existantes sont conservés. Les nouvelles préférences d’animation sont distinctes des données de jeu.

Les poids de rareté, les minima par slot, le classement des personnages par popularité, le pity Légendaire/Mythique, les prix en Chakra, la réserve gratuite et les rerolls bonus ne sont pas modifiés. Le moteur existant effectue toujours le débit, le tirage et l’enregistrement avant la révélation. Les tests utilisent des fixtures isolées et ne distribuent rien à des comptes réels.

Filtrer, trier, retourner une carte ou parcourir un album ne consomme ni n’accorde de copie, de Chakra ou de booster. Le rendu de Collection ne réclame plus de livraisons ni ne règle d’enchère implicitement. Le règlement périodique, les opérations de marché et la récupération à l’entrée de la Collection conservent leurs circuits existants. Les réservations sont lues séparément de l’inventaire libre. Un test avance l’horloge au-delà de l’échéance d’une enchère puis vérifie que les interactions de Collection laissent l’instantané complet identique.

L’économie et le marché demeurent ceux décrits dans `LOT1-AUDIT.md` : calculs dans le navigateur et sauvegarde personnelle, sans nouveau registre serveur autoritaire ni marché partagé entre joueurs. Le Lot 2 ne prétend pas résoudre ces limites d’architecture.

## Sauvegarde et retour arrière

L’archive préalable est [kizuna-before-lot2-v18.zip](../../../outputs/kizuna-before-lot2-v18.zip), dans le dossier `outputs/` à la racine du workspace : **28 913 438 octets**. Elle conserve la source v18 avant ce lot. Un retour arrière consiste à republier cette source sur le même site, sans supprimer les données de joueurs.

Cette archive n’est pas une sauvegarde de la base Supabase. Aucune copie de secrets, de comptes Auth ou de collections privées n’a été ajoutée au site publiable. Le dispositif local capture les valeurs brutes autorisées dans IndexedDB `kizuna_preservation`, magasin `backups`, sous la version `lot2-v19`, avant leur normalisation par le moteur. Il exclut Auth, ne remplace pas une sauvegarde existante et ne réécrit pas les clés de jeu. Si le stockage est indisponible, les données originales restent intactes. Aucune restauration automatique n’est introduite.

## Validation

Les commandes ci-dessous s’exécutent depuis la racine du projet. « Réussi » décrit les contrôles locaux réellement exécutés avant la publication, sur fixtures ou code isolé.

| Commande | Résultat / couverture |
| --- | --- |
| `node scripts/build.mjs` | Réussi : génération et intégration des modules. |
| `node scripts/verify-boosters-v2.mjs` | Réussi : aperçu sans débit, annulation, double clic, enregistrement avant révélation, 25/50 cartes en mode rapide, ordre, changement de compte, courses entre transitions, clavier, mouvements réduits et CSS. |
| `node scripts/verify-collection-v2.mjs` | Réussi : filtres réels, réservations non vendables, tri nom/date, verso et lien de source, focus 60→120, albums et conservation de l’instantané complet. |
| `node scripts/verify-wiki-v2.mjs` | Réussi : filtres, recherche accentuée/japonaise, tri, pagination, isolation du compte, état vide, échappement HTML, navigation et absence d’enrichissement AniList public. |
| `node scripts/verify-card-viewer-v2.mjs` | Réussi : recto/verso, agrandissement, clavier, fenêtres imbriquées, focus, ventes factuelles et recyclage confirmé/annulé sans toucher aux réservations. |
| `node scripts/verify-albums.mjs` | Réussi : ordre A–Z, membres exacts, progression, retour, actualisation, album vide/supprimé et absence de cartes accordées. |
| `node scripts/verify-interface.mjs` | Réussi : chargement et interactions principales, ouverture sur fixture, accès au catalogue administrateur. |
| `node scripts/verify-lot1.mjs` | Réussi : sauvegarde brute, navigation, états et conservation des données du Lot 1. |
| `node scripts/verify-home.mjs` | Réussi : régression de l’accueil. |
| `node scripts/verify-reveal-order.mjs` | Réussi : révélation de 5/25/50 cartes en rareté croissante. |
| `node scripts/verify-rarity.mjs` | Réussi : raretés, minima et garanties/pity existants. |
| `node scripts/verify-free-stock.mjs` | Réussi : stock gratuit et conservation des réserves supérieures à dix. |
| `node scripts/verify-account.mjs` | Réussi : Discord/PKCE, pseudonyme, isolation, rôles protégés, sauvegardes et récompenses idempotentes sur fixtures. |
| `node scripts/verify-popularity.mjs` | Réussi : 1124 éditions conservées, classement par anime, exception Madara, copies et dates conservées ; attente de couleur alignée sur la palette Kizuna. |
| `node scripts/verify-custom-boosters.mjs` | Réussi : packs publiés, pools exacts, garanties, débit, stock insuffisant et retrait. |
| Vérification statique de l’artefact et compilation répétée | Réussi : 15 scripts et 16 feuilles de style analysés, actifs locaux présents, deux compilations produisent le même HTML. Aperçu local HTTP 200. |

Les suites nouvelles vérifient le DOM, les interactions, les invariants de données et la syntaxe CSS. Les règles responsive/mobile et `prefers-reduced-motion` sont présentes et contrôlées statiquement. **La vérification visuelle réelle sur ordinateur et téléphone n’a pas été effectuée : Computer Use n’était pas disponible dans le cadre de la politique de navigateur de cette session.** Aucun test JSDOM ou contrôle CSS ne remplace une inspection du rendu, du débordement et des images chargées dans un navigateur réel.

## Hors de ce lot

Les Constellations, liens narratifs et récompenses de progression du Lot 3 ne sont pas activés. L’Éveil, les fragments, les missions d’exploration, les Sanctuaires publics, les événements administrables et un marché multijoueur autoritaire restent à construire dans leurs lots respectifs. Aucun faux succès, prix, joueur, événement ou récompense n’a été ajouté pour simuler ces fonctions.
