# KIZUNA — Audit préalable au Lot 1

Audit du 4 novembre 2026. Référence de départ : Sites version 16, commit `9fbe0a41b0766cbb6dff8b840a466e187d1e6225`. Ce document décrit l'existant avant la refonte ; il ne présente pas les lots suivants comme disponibles.

## Périmètre et vérifications

Lecture du prompt fourni, du HTML principal, du pont de jeu, des modules compte, profil, catalogue, albums et staff, des fonctions serveur, du schéma SQL, de la compilation et des tests existants. Trois requêtes Supabase exclusivement en lecture ont vérifié les tables Kizuna, leurs politiques RLS et les comptes agrégés. Aucun compte individuel, collection privée, jeton, adresse e-mail ou historique privé n'a été exporté pour cet audit. Aucune mutation SQL, migration ou modification d'Auth n'a été effectuée.

Résultat observé : 1 124 éditions de cartes, 1 123 personnages AniList distincts, 39 groupes d'anime implicites, aucun album administré supplémentaire, deux profils et deux sauvegardes de joueurs, aucun booster personnalisé publié. Ces nombres décrivent cet instant, pas une contrainte ; les imports et inscriptions légitimes peuvent les faire évoluer.

## Architecture existante

| Élément | Implantation et rôle |
| --- | --- |
| Hébergement | Site public existant `appgprj_6aea56ac83dc81919ebba2d954130f62`, sortie statique `dist/`, même URL Kizuna. |
| Interface | JavaScript natif, HTML et CSS ; aucun framework React/Vue. `dist/index.html` contient encore le moteur historique, les vues et plusieurs surcharges successives. |
| Pont applicatif | `src/game-bridge.inc.js` est injecté dans le HTML par `scripts/sync-game-bridge.mjs`. Il expose `KizunaGame`, les instantanés, les événements et l'accès aux cartes/albums. Modifier sa source, pas seulement la copie injectée. |
| Modules séparés | `kizuna-account.js`, `kizuna-profile.js`, `kizuna-backend.js`, `kizuna-catalogue.js`, `kizuna-albums.js`, `kizuna-staff.js`, avec leurs feuilles de style. |
| Navigation historique | Onglets contrôlés par `body.dataset.tab`, `showTab` et le fragment URL. Routes existantes : `#home`, `#collection`, `#marketPage`, `#encyclopedia`, `#ranking`, `#profile`, `#staff`. `#boosters` désigne initialement une section de l'accueil. |
| Présentation | Styles inline historiques plus `v20.css`, thème, composants, profil, staff, catalogue, compte et surcharge `kizuna-bright.css`. Plusieurs règles `!important` rendent une simple modification des variables insuffisante. |
| Actifs | Logo Kizuna, logos SVG des boosters, illustrations originales du catalogue et polices locales. Les identités et illustrations des cartes sont conservées. |
| Compilation | `scripts/build.mjs` : bundle SDK, politique des raretés, synchronisation du pont, génération de `seed/catalogue.json`. |
| Dépendances | Versions verrouillées : `@supabase/supabase-js` 2.118.0 ; développement : esbuild 0.28.2, JSDOM 26.1.0. Aucune nouvelle dépendance nécessaire pour le Lot 1. |
| Backend | Projet Supabase existant Yugen Manga RP, `hxbujmdzidtwmalmqrwt`. Auth partagé avec Yugen, données Kizuna préfixées. Ne pas toucher aux tables studio de Yugen ni à sa configuration de connexion. |

## Ce qui fonctionne réellement

| Fonction | Réalité opérationnelle |
| --- | --- |
| Comptes | Discord OAuth/PKCE, choix d'un pseudo à l'inscription, profil privé et sauvegarde distante par propriétaire. Les conflits de révision sont détectés. |
| Collection | Copies et doublons conservés par identifiant ; filtres, tri, progression, albums A–Z cliquables et fiches grand format. |
| Boosters | Moteur de tirage existant dans le navigateur ; stock, recharge, achat en Chakra, ouverture ×1/×5/×10, garanties, pity, révélation du moins rare au plus rare. |
| Catalogue | Catalogue public Supabase ; import AniList et gestion d'albums réservés aux administrateurs et vérifiés côté serveur. |
| Staff | Rôles administrateur et modérateur protégés. Récompenses staff idempotentes, attribution des grades, suivi des inscriptions, préparation/publication de boosters. |
| Profil | Pseudo, bio, carte favorite/avatar, vitrine calculée à partir des cartes possédées, progression et objectifs simples. Ce n'est pas encore un Sanctuaire public. |
| Marché | Vente, enchère, échange, séquestre de copies, historique et wishlist exécutés localement ; leur état est inclus dans la sauvegarde personnelle. Ce n'est pas une place de marché partagée entre comptes. |
| Découvertes | Historique personnel des gros tirages enregistrés ; aucun flux mondial autoritaire. |
| Classement | Indicateurs du joueur courant ; les emplacements globaux sont explicitement indisponibles. Ne pas remplir ces espaces avec de faux joueurs. |

La présence de Supabase ne rend pas l'économie autoritaire. Les politiques RLS isolent les sauvegardes personnelles, mais le joueur peut mettre à jour son propre instantané. Tirages, Chakra et transactions locales ne constituent donc pas un registre serveur résistant aux modifications du navigateur. Avant tout vrai échange entre joueurs, il faudra un inventaire et un portefeuille autoritaires, des réservations, des transactions atomiques et des clés d'idempotence. Le Lot 1 conserve le mode existant sans l'élargir au multijoueur.

## Cartographie des données à préserver

| Données | Source / stockage |
| --- | --- |
| Identité et session | Supabase Auth, session navigateur `kizuna_auth_v1`, UUID stable ; aucune fusion de comptes fondée sur le pseudo. |
| Profil | `public.kizuna_profiles` : pseudo, bio, avatar et dates. |
| Sauvegarde personnelle | `public.kizuna_player_states` : `snapshot`, `revision`, `updated_at`, accès propriétaire seulement. |
| Catalogue canonique | `public.kizuna_cards` ; seeds et catalogue supplémentaire en cache. Identifiants des anciennes éditions conservés. |
| Albums | `public.kizuna_albums` et `kizuna_album_cards` ; groupes implicites calculés depuis `series`. Les définitions partagées sont exclues des sauvegardes personnelles. |
| Boosters partagés | `public.kizuna_boosters` ; seules les définitions publiées sont lisibles publiquement. |
| Grades | `public.kizuna_admins` et `kizuna_moderators` ; lecture de son propre rôle, aucune écriture libre depuis le navigateur. |
| Récompenses et contrôle staff | Tables privées `kizuna_staff_rewards`, `kizuna_account_reviews`, `kizuna_staff_audit`, invitations et réservations de pseudos. |
| Copies locales | `hoshi_owned_cards_v2` ; chaque copie possède son ID, sa date d'obtention et sa rareté/niveau. |
| Tirages / pseudo locaux | `hoshi_gross_tirages_v2`, `hoshi_display_name_v1`. |
| Monnaie / réserves / pity | `hoshi_chakra_v2`, `hoshi_stock_v2` : `free`, `t`, `inv`, `pm`, `pl`, `day`. |
| Cache catalogue | `hoshi_anilist_v2`, `kizuna_extra_catalogue_v1`. |
| Marché local | `kyara_market_listings_v1`, `kyara_market_pending_credits_v1`, `kyara_market_pending_cards_v1`, `kyara_market_history_v1`, `kyara_market_wishlist_v1`. Le préfixe historique ne doit pas être renommé pour une refonte visuelle. |
| Isolation invité / compte | `kizuna_guest_snapshot_v1`, `kizuna_workspace_owner_v1`, `kizuna_guest_imported_v1_<UUID>`, `kizuna_unsynced_v1_<UUID>`. |

Les 14 tables Kizuna observées dans `public` et `private` ont RLS activé. Les politiques vérifiées pour profils et sauvegardes imposent le propriétaire en lecture et écriture ; celles des grades autorisent seulement la lecture de sa propre appartenance. Les opérations staff revalident le compte et les lignes de rôle protégées côté serveur ; `user_metadata` n'accorde aucun pouvoir.

## Invariants économiques et de collection

- Ne réinitialiser ni collections, doublons, réservations, monnaies, annonces, historique, préférences, statistiques, inventaire de rerolls ou garanties.
- Conserver les IDs, sources AniList, images, noms, séries, statistiques et politique `album-ranks-v2`. Par anime : rangs 1–5 Mythique, 6–10 Légendaire, 11–15 Épique ; ensuite Rare à partir de 2 500 favoris, Peu commune à partir de 1 000. Priorité de la meilleure rareté globale, exception explicite Madara Mythique. Aucun reclassement demandé dans le Lot 1.
- Conserver les poids de tirage : Commun 60, Peu commune 23, Rare 12,5, Épique 4,2, Légendaire 0,2, Mythique 0,1. Ces poids ne sont pas la probabilité finale d'un paquet complet : les minima de slots et pity interviennent.
- Cinq slots : `[1, 1, 1, 2, 3]` en niveaux minimaux. Garanties Légendaire à 50 et Mythique à 250, remises à zéro selon les tirages existants. L'ordre de révélation reste ascendant.
- Réserve gratuite : plafond 100, départ 3, recharge de six heures ; rerolls bonus séparés. Ouvertures ×1/×5/×10, prix boutique 100/450/850 Chakra inchangés.
- Frais de marché : 5 % au vendeur sur les opérations concernées, avec arrondi entier déjà présent. Aucune nouvelle taxe ou monnaie.
- Aucune carte n'est accordée pour avoir consulté une page, un album, une annonce ou le nouveau hero. Une navigation ne doit jamais appeler `applySnapshot` ni modifier les soldes.
- Aucune mécanique future ne consomme automatiquement les doublons. Les copies mises en vente ou en échange restent réservées.

## Risques et limites constatés

1. **HTML monolithique** : environ 595 Ko avant refonte, auquel s'ajoute un bundle de politique/catalogue d'environ 414 Ko. Ne pas y empiler les nouvelles mécaniques. Sortir les nouveautés en modules dédiés, conserver le moteur tant que ses tests ne permettent pas une extraction maîtrisée.
2. **Surcharges historiques** : plusieurs définitions successives de handlers et enveloppes de `showTab`. Une modification de navigation doit conserver les actions de fermeture, rafraîchissement et marché. Éviter de rebinder plusieurs fois le même clic.
3. **Format d'instantané borné** : limites préexistantes de 5 000 copies, 30 gros tirages, 800 annonces, 300 livraisons et 80 opérations d'historique. Les nouveaux modules ne doivent pas introduire d'autre réduction. Une sauvegarde brute préalable protège aussi ce qui dépasse ces limites historiques ; elle ne transforme pas le stockage actuel en historique illimité.
4. **Sérialisation restrictive** : les adaptateurs de compte et de jeu ne conservent que leurs champs connus. Ajouter des champs d'Éveil ou de quêtes directement dans `snapshot` les ferait disparaître au passage suivant. Prévoir un contrat versionné et une migration explicite lors du lot concerné.
5. **Calculs de collection** : plusieurs vues parcourent le catalogue et l'inventaire ; le nouveau hero ne doit pas recréer un rendu complet à chaque frame ou chaque seconde. Limiter les cartes vedettes, différer les autres images et agréger les événements de rendu.
6. **Navigation par fragment** : préserver les anciens liens directs et `?auth=discord`. Le compte et le staff ne doivent pas disparaître derrière le nouveau menu mobile.
7. **Authentification** : ne pas remplacer les identifiants de stockage/session, la configuration Discord, les redirections, le contrôle du pseudo ou les vérifications de rôle. Les erreurs de synchronisation doivent rester visibles.
8. **Images externes** : prévoir une présentation utilisable si une illustration ne charge pas. Ne pas remplacer des identités par des personnages fictifs pour remplir l'accueil.
9. **Accessibilité** : les effets doivent respecter `prefers-reduced-motion`; commandes accessibles au clavier/toucher, focus visible, texte de rareté en plus de la couleur. Ne pas faire dépendre une action du survol.
10. **Absence de visuel automatisé disponible** : les tests DOM valident interactions et états mais ne prouvent ni l'absence de débordement réel ni le rendu visuel sur chaque taille. La validation de livraison doit expliciter cette limite si aucun navigateur contrôlable n'est disponible.

## Sauvegarde et retour arrière

La version Sites 16 constitue le point de retour arrière de la source. Son archive locale existante, `outputs/kizuna-album-navigation-v16.tar.gz` à la racine du workspace, fait 27 400 758 octets (SHA-256 du fichier local : `27d8e950cae3fdc53ac397b5d3337917bcd6995188ccf3a05701ae052d6c3a30`). Une archive de source supplémentaire a été créée avant le Lot 1 : `outputs/kizuna-before-lot1-v16.zip`, 27 722 932 octets. Le commit source de référence est indiqué en tête du document. Conserver ces archives inchangées et la version publiée ; le retour arrière se fait par redéploiement de cette version, pas par suppression de données.

Le Lot 1 n'exige aucune migration de base de données. Ne pas créer de copie des comptes Auth, de secrets ou de collections privées dans `dist/`, le dépôt ou une archive publiable. Une archive de source n'est pas une sauvegarde de la base Supabase ; aucune sauvegarde complète distante n'a été créée par cet audit. Avant un futur lot modifiant l'économie ou le schéma, prévoir une sauvegarde distante contrôlée et une procédure de restauration testée dans un environnement séparé.

Pour le navigateur, `dist/kizuna-preserve.js` capture synchroniquement les valeurs brutes avant l'exécution du moteur historique puis les sauvegarde dans IndexedDB, base `kizuna_preservation`, magasin `backups`, version `lot1-v17`. Une liste explicite autorise seulement les clés de progression et les sauvegardes de compte reconnues ; les jetons Auth sont exclus. Une sauvegarde existante n'est pas remplacée lors d'un rechargement. Aucune clé de jeu n'est supprimée, réécrite ou restaurée par ce module. L'absence d'IndexedDB, un blocage ou un échec d'écriture donnent un état `unavailable` sans toucher aux données originales ; une sauvegarde locale ne peut donc pas être garantie si le navigateur refuse le stockage. Il n'existe pas encore d'interface de restauration de cette sauvegarde. Une future restauration devra être explicite, jamais un effet du chargement de page. Les vues du Lot 1 ne nécessitent aucune conversion des copies ou transactions.

## Architecture des lots suivants

Les éléments ci-dessous sont des contrats de conception, pas des fonctions activées.

| Module | Contrat proposé | Dépendance / limite |
| --- | --- | --- |
| Présentation | Tokens de couleur/typographie/espacement, contrôleurs de navigation et accueil séparés, abonnement aux événements `kizuna:game-change`, `kizuna:account-change`, `kizuna:albums-change`. | Lecture via `KizunaGame`; aucun accès direct à l'économie. Préférences UI versionnées séparées et isolées par compte. |
| Registre de fonctionnalités | Capabilities explicites et désactivables ; ne rendre un bouton actif que lorsqu'un module opérationnel est enregistré. | Une option UI n'est jamais une autorisation serveur. Désactiver une activité ne supprime aucune progression. |
| Constellations | Définition versionnée : ID, univers, source éditoriale, nœuds par ID canonique, liens typés validés, prérequis et récompense cosmétique référencée. | Collection en lecture seule, aucune consommation ; progression déterministe, remise de récompense idempotente côté serveur. |
| Éveil | Définition par carte, niveaux cosmétiques, prérequis explicites, aperçu, coûts et mécanisme de confirmation. | Contrôle serveur des copies libres et réservées avant consommation ; aucun débit tant que cette infrastructure n'existe pas. |
| Missions | Définitions réutilisables, objectifs typés (collection, ouverture, album), version, période et fuseau, récompenses bornées. | Événements de jeu autoritaires avant récompenses économiques ; pas de progression inventée à partir de la présence dans une page. |
| Univers | Identité d'anime ou d'album existante, cover, description validée et destinations de collection. | N'afficher que les univers présents ; pas de carte vide ou d'anime inventé. |
| Sanctuaire | Sélection ordonnée d'IDs possédés, thème, titres et décorations débloquées, visibilité privée/publique explicite. | Vue publique à données minimales et politique RLS dédiée ; ne jamais publier l'instantané complet du joueur. |
| Événements / annonces | Définition publiée avec dates, règles, version, récompenses, bannière et statut brouillon/publié. | Autorisation admin serveur existante réutilisée ; historique des modifications, aucune annonce factice. |
| Marché partagé | Inventaire par copie, portefeuille, séquestre, annonces, offres, règlements et journal serveur. | Transactions atomiques et idempotentes, validation de propriété, verrouillage des réservations, audit ; migration compatible séparée indispensable. |

Pour les nouvelles tables : clé propriétaire quand nécessaire, RLS activé, politiques en lecture/écriture distinctes, privilèges minimaux, fonctions privées protégées, aucune confiance dans des rôles ou soldes envoyés par le navigateur. Les anciennes données restent lisibles ; les migrations sont additives et précédées d'un audit de volumes et d'une sauvegarde.

## Validation attendue avant publication du Lot 1

- Compilation, syntaxe et absence d'erreurs de chargement ; actifs référencés existants.
- Rejouer les tests interface, albums, comptes, popularité/raretés, ordre de révélation, stock, boosters personnalisés et staff selon les modules touchés.
- Nouveau test de non-mutation : charger un état contenant doublons, pity, réservations et historique ; naviguer, changer de rubrique, ouvrir une fiche ; vérifier l'état et les clés historiques inchangés hors actions de jeu explicites.
- Vérifier invité sans cartes, joueur avec progression, compte en chargement, erreur backend, données absentes, storage refusé et données locales malformées.
- Vérifier navigation directe, clavier, focus, mode réduit, tailles mobile/desktop et accès permanent au profil/Chakra. Ne jamais prétendre avoir fait une inspection visuelle qui n'a pas été possible.
- Conserver les tests sans modifier de vrai joueur, créer de compte de test distant ni envoyer de mail. Les tests économiques doivent utiliser des fixtures isolées.
- Publication seulement après les contrôles disponibles et conservation du point de retour arrière ; relever la version réellement déployée dans le rapport de livraison.

Le Lot 2 doit ensuite traiter l'expérience des boosters, Collection et Wiki : extraction progressive du rendu, accessibilité des animations et performances, en gardant les mêmes résultats de tirage et formats de sauvegarde. Les Constellations, l'Éveil, les missions, les Sanctuaires publics, les événements administrables et le marché multijoueur restent des lots ultérieurs.

## Contrôles exécutés pendant le Lot 1

Le nouveau test `scripts/verify-lot1.mjs` a passé les contrôles suivants : sauvegarde brute de 5 003 copies et 83 opérations sans normalisation, contenu malformé conservé textuellement, exclusion d'Auth et de clés étrangères, non-écrasement au rechargement, stockage indisponible sans destruction ; routes directes et navigation de toutes les rubriques, maintien des paramètres OAuth, état actif des anciennes routes Wiki/Classement, univers A–Z, recherche et ouverture d'album ; notifications alimentées par les tirages du joueur, états de chargement/erreur/vide, échappement HTML et retour du focus. La navigation et les notifications laissent les copies, doublons, soldes, pity, stock, réservations, historique et clés historiques identiques aux fixtures de départ. Aucun appel réseau n'a été effectué et aucune erreur JavaScript n'a été enregistrée.

Les accès secondaires ont également été testés via leurs vrais boutons : « Voir les boosters » depuis la fiche d'un personnage non possédé et « Changer de booster » depuis l'aperçu ×5 aboutissent à la rubrique Boosters, ferment leur vue précédente et ne consomment aucun pack ni Chakra. La destination de la fiche est contrôlée après la restauration asynchrone de l'historique du navigateur.

Suites existantes exécutées avec succès lors de cette revue : `verify-account.mjs`, `verify-staff-panel.mjs`, `verify-staff-server.mjs`, `verify-free-stock.mjs`, `verify-rarity.mjs`, `verify-reveal-order.mjs`, `verify-interface.mjs`. Elles vérifient notamment Discord/PKCE, isolation des comptes et conflits de sauvegarde, autorisation des rôles, idempotence des récompenses, conservation des réserves supérieures à dix, minima/garanties/pity et tri ascendant de 5/25/50 révélations. Le test d'interface a chargé les 1 124 cartes sans erreur, confirmé l'isolation du catalogue administrateur et effectué une ouverture réelle du moteur sur fixture avec l'ordre C/C/C/U/R.

Ces contrôles sont réalisés dans des environnements isolés ou sur du code pur. Les styles responsive et de réduction des mouvements ont été contrôlés statiquement ; aucun test DOM ne constitue une capture visuelle. Le navigateur contrôlable étant indisponible dans cet environnement, la vérification visuelle réelle mobile/ordinateur n'a pas pu être menée. La compilation finale, les autres suites, le contrôle HTTP, la version publiée et son statut sont consignés dans le rapport de livraison de l'intervention principale.
