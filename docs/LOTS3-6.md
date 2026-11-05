# Kizuna — Lots 3 à 6

Livraison du 4 novembre 2026, après la version 19 (`773bd7f2b4676c598a9b310753c0d35f8c436e63`). Les quatre étapes ont été mises en œuvre et testées sans interruption de validation utilisateur. Les identifiants de publication effectifs sont consignés après le déploiement dans `outputs/kizuna-lots3-6-publication.json` du workspace.

## Fonctions opérationnelles

### Lot 3 : Constellations

Cinq constellations initiales utilisent les identifiants exacts de personnages du catalogue : Naruto/Sasuke, Sasuke/Itachi, l’équipe 7, Goku/Vegeta et Luffy/Ace. Les données structurées contiennent les membres, arêtes, libellés, récompenses et références des éditeurs. Aucun rapprochement approximatif de noms ne crée de relation.

Les nœuds manquants sont assombris et identifiés, les liens possédés s’illuminent, les fiches sont accessibles au clic/clavier et les commandes permettent de zoomer, déplacer et recentrer. La liste se filtre par univers et propose les constellations les plus proches de leur complétion. Les récompenses sont des titres cosmétiques, attribués une seule fois. Les cartes ne sont pas consommées.

Références de rédaction : [Naruto et Sasuke](https://naruto-official.com/en/news/01_1296), [les frères Uchiha](https://naruto-official.com/en/anime/naruto1/list/01_353), [l’équipe 7](https://naruto-official.com/en/news/01_1610), [Goku et Vegeta](https://en.dragon-ball-official.com/news/01_1189.html), [Luffy et Ace](https://one-piece.com/news/o20210101_11927/index.html).

### Lot 4 : Éveil, quêtes et succès

L’Atelier est accessible depuis les fiches des cartes. Deux copies **disponibles** débloquent le cadre éveillé et cinq la présentation transcendée. L’aperçu ne modifie rien ; le déblocage demande confirmation. Aucune copie, monnaie ou statistique n’est consommée ou modifiée. Les copies réservées au marché ne peuvent pas satisfaire ce prérequis. Les présentations débloquées sont permanentes. Les cadres s’affichent dans la collection et la consultation des cartes ; les animations de tirage continuent de refléter la rareté réelle.

Onze définitions initiales couvrent la collection, les visites, les découvertes de personnages, les constellations, l’Éveil et un succès secret. Les quêtes quotidiennes utilisent minuit UTC ; les hebdomadaires commencent le lundi UTC. Il n’existe ni série de présence punitive ni récompense économique automatique. Les récompenses répétables sont des badges datés ; les titres/insignes peuvent être exposés dans le Sanctuaire. Les badges débloquent aussi certaines options de présentation. Les administrateurs peuvent créer des objectifs supplémentaires par univers ou personnages précis.

### Lot 5 : Voyage et Sanctuaire

Le Voyage présente les 39 univers réellement disponibles sous forme d’îlots illustrés et recherchables. Chaque destination donne sa progression, l’accès à l’album exact, les cartes manquantes, ses constellations publiées et le lien vers les missions. Les escales sont enregistrées et comptent dans les quêtes d’exploration ; un univers absent n’est jamais inventé pour remplir la carte.

Le Sanctuaire permet de choisir une ambiance, un cadre, une décoration, un titre obtenu, six cartes dans un ordre choisi, une pièce Mythique et jusqu’à 24 favoris. Un aperçu précède l’enregistrement. Les récompenses et constellations complétées y apparaissent. Les copies réservées ne peuvent pas être sélectionnées comme cartes disponibles dans la galerie.

Un Sanctuaire est privé par défaut. La publication est volontaire pour les comptes connectés. Sa projection publique contient seulement le pseudo, les cartes exposées et la présentation choisie, les badges et les constellations complétées. Elle exclut l’e-mail, le solde, les favoris privés, l’inventaire et la sauvegarde. Seuls les niveaux d’Éveil des cartes exposées sont inclus. La galerie publique est paginée et l’accès est revérifié à chaque visite. Le propriétaire peut rendre son Sanctuaire privé même lorsque sa sauvegarde économique présente un conflit.

### Lot 6 : Événements, communauté, marché et administration

Le panel **Staff → Aventure & événements** permet de créer, modifier, publier ou désactiver constellations, missions, événements temporaires et annonces. Les objectifs, dates UTC et récompenses cosmétiques sont configurables. Les membres d’une constellation sont choisis dans le catalogue réel ; sa source officielle est obligatoire. La validation serveur impose des membres distincts et des arêtes valides. Les modifications concurrentes sont rejetées par révision. Les opérations sont auditées et le grade est vérifié dans la table d’administrateurs protégée.

La page Événements affiche les définitions réellement publiées, leur période, leur progression et leur récompense. Aucun événement actif ni joueur n’a été fabriqué à la livraison. Les événements absents, à venir ou terminés disposent d’états explicites. Les récompenses déjà acquises restent enregistrées lorsqu’une définition est désactivée.

La communauté peut parcourir les Sanctuaires volontairement publiés. Le marché bénéficie d’une présentation plus lisible, de commandes tactiles et d’historiques factuels dans les enchères et annonces : seuls les achats/ventes conclus et datés alimentent les médianes. Aucun prix demandé ou valeur de recyclage ne crée un cours fictif. Un graphique nécessite au moins deux ventes. Les frais et opérations historiques sont conservés.

## Limite explicite : économie multijoueur

Les comptes, définitions, récompenses cosmétiques et Sanctuaires disposent désormais d’un stockage partagé. **Les tirages et l’économie historique restent calculés dans le navigateur et synchronisés dans une sauvegarde personnelle. Le marché n’est pas devenu un marché économique partagé.** Aucun transfert multijoueur réel, classement mondial autoritaire ou notification de vente globale n’a été activé.

Les nouveaux contrôles cosmétiques vérifient la possession dans la sauvegarde du compte synchronisée, après flush côté client. Cette sauvegarde historique peut encore être écrite par son propriétaire : ces contrôles ne sont donc pas une preuve antifraude d’inventaire. Les récompenses ajoutées n’accordent ni Chakra, ni rerolls, ni cartes. Un registre serveur autoritaire des tirages, possessions et soldes reste nécessaire avant les vrais échanges partagés. Les illustrations alternatives et combats ne font pas partie de cette livraison.

## Architecture et conservation

- `dist/kizuna-adventure-data.js` : contenu initial et références éditoriales.
- `dist/kizuna-adventure-rules.js` : règles pures de progression cosmétique.
- `dist/kizuna-adventure.js` / `.css` : parcours, atelier, missions, voyage, galerie, communauté et raccourcis d’accueil/profil.
- `dist/kizuna-adventure-admin.js` : éditeur administrateur.
- `src/market-presentation.inc.js` / `dist/kizuna-market-v3.css` : marché factuel et présentation.
- `dist/kizuna-account.js` : RPC authentifié, flush avant validation, détection du changement de compte, révocation de confidentialité indépendante d’un conflit économique.
- `src/game-bridge.inc.js`, `dist/kizuna-shell.js`, `dist/kizuna-staff.js`, `dist/index.html` et `scripts/sync-feature-views.mjs` : intégration dans les routes et vues existantes.
- `dist/kizuna-preserve.js` : sauvegarde brute préchargement `lots3-6-v20`, incluant les préférences d’ouverture et la progression invitée, sans jeton Auth.

Les instantanés économiques gardent leur format et leurs limites existantes. Les 1124 éditions, les 39 albums, les quantités, dates, Chakra, boosters, pity, annonces, réservations et historiques ne sont pas migrés ni réinitialisés. Les poids de tirage, minima, classement par popularité et frais de vente de 5 % sont inchangés.

La progression invitée est conservée sous `kizuna_adventure_guest_v1`. La progression connectée est propre à chaque identité Discord. Aucun transfert automatique de progression invitée vers un compte n’a été ajouté. Une réponse tardive d’un ancien compte est ignorée ; les vues et prévisualisations privées sont effacées au changement d’identité.

## Ajouts Supabase

Le projet existant **Yugen Manga RP** (`hxbujmdzidtwmalmqrwt`) est conservé. Aucun réglage Auth, rôle existant ou objet Yugen n’a été modifié.

Les ajouts sont `public.kizuna_adventure_definitions`, `kizuna_private.kizuna_adventure_players`, `public.kizuna_sanctuaries` et le RPC `kizuna_adventure`. La progression privée ne dispose d’aucun accès direct aux tables. Le RPC public est invoker ; le helper definer se trouve dans un schéma dédié non exposé avec un `search_path` vide et contrôle `auth.uid()`. Les comptes sans profil Kizuna, appels anonymes et joueurs/modérateurs tentant d’administrer sont refusés. Les claims et mises à jour de progression utilisent un verrou par joueur. Les tables exposées ont RLS et des lectures publiques limitées aux définitions activées et Sanctuaires publiés ; aucune écriture directe n’est accordée au navigateur.

SQL retenu : `schema/kizuna_adventure.sql`, `schema/kizuna_adventure_validation.sql`, `schema/kizuna_adventure_links_validation.sql` et l’ajout de contenu `schema/kizuna_adventure_one_piece.sql`. Les correctifs valident explicitement l’ensemble cartes exposées + favoris et la structure des liens. Les changements sont additifs ; aucune migration destructive.

Les contrôles de sécurité Supabase ne signalent aucune nouvelle erreur. L’information « RLS enabled no policy » sur la table privée est volontaire : elle est inaccessible directement, seul le helper contrôlé y accède. Les avertissements existants du projet partagé sur les tables Studio et la protection des mots de passe n’ont pas été modifiés ; Kizuna utilise Discord. Références : [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [protection des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Vérifications effectuées

Les nouvelles suites `verify-adventure.mjs`, `verify-adventure-admin.mjs`, `verify-adventure-community.mjs` testent les parcours réels dans le DOM, conservation complète de l’instantané, annulation, récompenses uniques, périodes UTC, réservations, changement de compte, formulaire staff, échappement, galerie paginée, révocation de confidentialité, événements et erreurs réseau.

`verify-adventure-backend.mjs` vérifie le service publié sans écriture : 16 définitions visibles, cinq constellations avec membres canoniques, lecture publique des seules galeries publiées et refus HTTP 401 du RPC sans connexion.

`check-adventure.sql` exécute dans Postgres des contrôles de permissions, séparation des identités, idempotence, Éveil, quêtes UTC, publication privée/publique, refus des cartes réservées, administration, révision et fin d’événement. **Toutes les fixtures sont annulées par rollback.** Les empreintes des deux profils et deux sauvegardes existantes étaient identiques avant et après les migrations.

Régressions réussies : `verify-interface`, `verify-account` (étendu au nouveau RPC), `verify-staff-panel`, `verify-boosters-v2`, `verify-collection-v2`, `verify-wiki-v2`, `verify-card-viewer-v2`, `verify-lot1`, `verify-home`, `verify-albums`, `verify-popularity`, `verify-rarity`, `verify-free-stock`, `verify-custom-boosters`. Les scripts sont des fichiers `.mjs` sous `scripts/`.

Compilation, syntaxe JS/CSS, actifs locaux et reproductibilité du HTML sont contrôlés. L’aperçu local répond HTTP 200. La vérification visuelle réelle mobile/ordinateur n’a pas pu être effectuée : le chemin Computer Use autorisé n’est pas disponible avec ce navigateur. Les tests DOM et règles responsive/réduction des animations ne remplacent pas cette inspection.

## Retour arrière et suite recommandée

L’archive source préalable est `outputs/kizuna-before-lots3-6-v19.zip` dans le workspace. La version Sites 19 reste une référence de retour arrière. Republier v19 n’exige pas de supprimer les nouvelles tables ; il faut les conserver pour ne perdre aucune progression cosmétique acquise. Cette archive source n’est pas une copie de la base de données.

La prochaine étape technique recommandée est le registre économique serveur : figer le contrat des anciennes sauvegardes, sauvegarder et migrer les possessions sans perte, puis rendre les tirages, dépenses, réservations et transferts atomiques avant d’activer un marché entre joueurs. Les nouveaux outils cosmétiques peuvent continuer à fonctionner pendant cette évolution.
