# Nexus — backend du lot 2

Migration source : `schema/kizuna_nexus_lot_two.sql`, à appliquer une seule fois, intégralement dans une transaction, après le lot 1. Elle passe la configuration de version 1 à version 2, conserve les déblocages et les données existantes et active les vingt nœuds auparavant annoncés comme prévus. Le lot 3 reste consacré à l’administration avancée, à l’enrichissement visuel et aux optimisations supplémentaires.

Appliquer ensuite `schema/kizuna_nexus_lot_two_dispatch_fix.sql`. Les tests PostgreSQL après la migration initiale ont révélé que le dispatcher déclare `id text` et utilise `#variable_conflict use_variable` : les deux nouvelles sous-requêtes de configuration doivent donc qualifier `cfg.id`. Cette réparation additive modifie seulement ces deux expressions, avec vérification d’ancres uniques, sans réécrire la migration déjà appliquée ni modifier des données.

## Activation et sauvegarde

Les 25 nœuds sont maintenant actifs. Les coûts par rang restent 1 000 / 2 500 / 5 000 / 10 000 / 20 000 Chakra. Les niveaux requis restent 1 / 3 / 6 / 10 / 15, sauf Prestige qui demande 1 / 5 / 10 / 15 / 20. Les prérequis de la branche restent obligatoires et les achats restent permanents, atomiques et idempotents.

La table privée `kizuna_nexus_lot_two_backup` conserve les définitions SQL modifiées, les états économiques, les états aventure, la configuration, les nœuds et les progressions Nexus avant l’ajout. La migration prend le verrou économique global avant ces opérations. Elle vérifie la version de départ et chacune des ancres des patches ; une différence inattendue annule toute la transaction.

Les seules nouvelles données sont dans six tables privées avec RLS, permissions et policy réservées à `service_role` :

- `kizuna_nexus_lot_two_backup` : sauvegarde de cette évolution.
- `kizuna_nexus_reward_claims` : récompense déjà récupérée par joueur, clé et période.
- `kizuna_nexus_album_rewards` : définitions d’albums figées et récompenses associées.
- `kizuna_nexus_cosmetics` : trois auras disponibles et prix en fragments.
- `kizuna_nexus_cosmetic_unlocks` : auras achetées de façon permanente.
- `kizuna_nexus_fragment_events` : fragments réellement attribués par ligne du journal de tirage.

Les fonctions privées, y compris la copie `nexus_mutate_lot_one`, sont inaccessibles aux rôles navigateur. Aucun endpoint public ne reçoit un identifiant de joueur, un solde, une quantité de fragments ou une quantité de récompenses à attribuer.

## Effets implémentés

| Branche | Rang | Effet réel |
| --- | --- | --- |
| Invocation | I / III / V | 1 / 2 / 4 boosters Nexus quotidiens au total |
| Invocation | II / IV | Capacité de recharge 101 / 103, au lieu de 100 |
| Destin | I / III / V | 5 / 15 / 20 suivis prioritaires persistants |
| Destin | II | Statistiques enregistrées, poids de rareté et garanties |
| Destin | IV | Annonces actives correspondant aux priorités |
| Destin | V | Bilan de possession, Mythiques et Éveils de la wishlist |
| Résonance | I | Galerie des Mythiques possédées et éveillées |
| Résonance | II / IV | 1 / 2 fragments par doublon Mythique, plafond Nexus de 10 par jour |
| Résonance | III | Signal serveur permettant l’animation exclusive de Résonance |
| Résonance | V | Présentation prestige des Mythiques entièrement éveillées, sans quatrième Éveil |
| Collection | I / III / V | Bonus de recyclage éligible de 5 / 10 / 15 % au total |
| Collection | II | Filtres et tri persistants pour les collections |
| Collection | IV | 100 Chakra et 1 booster ordinaire, une seule fois par album de récompense complété |
| Prestige | I | Cadre Nexus à équiper |
| Prestige | II | 25 Chakra quotidiens |
| Prestige | III / IV | 1 / 2 Coffrets Nexus hebdomadaires au total |
| Prestige | V | Titre, animation de profil, cristal prestige et récompense unique de 1 000 Chakra + 5 boosters ordinaires |

Destin V améliore le suivi au lieu de modifier les probabilités. La wishlist de 5 000 entrées et ses alertes existantes restent accessibles comme avant. Les fragments utilisent **le solde existant** `kizuna_adventure_players.state.fragments`, plafonné à 100 000 : aucune nouvelle monnaie n’est créée, aucune résonance n’est consommée ni augmentée par ce bonus.

## Stock et ouverture hebdomadaire

Le stock existant reçoit deux champs :

```json
{"freeCapacity": 103, "nexusWeekly": 2}
```

`freeCapacity` est calculé côté serveur. Acheter un emplacement agrandit le plafond de recharge et ne crée aucun booster. Le calcul de recharge conserve la durée de six heures et utilise désormais le plafond propre au joueur. `econ_snapshot` ne réduit pas ce stock et `econ_write` conserve les nouveaux champs, avec validation de `nexusWeekly` entier compris entre 0 et 1 000 000.

Le Coffret Nexus est une vraie définition de `public.kizuna_boosters`, constituée initialement de 20 cartes maximum par rareté, donc 120 maximum, avec les six raretés représentées. Sa sélection est déterministe au déploiement. Son identifiant généré est enregistré dans `kizuna_nexus_config.weekly_booster_id`. La contrainte existante de 500 cartes par booster reste inchangée.

Cette définition est **non publiée** afin de ne pas apparaître comme un booster staff ordinaire pour les visiteurs. `weekly_enabled` contrôle sa disponibilité côté Nexus. Un trigger empêche de la publier accidentellement via le panel staff (`NEXUS_WEEKLY_MANAGED`). Les autres boosters non publiés restent inaccessibles.

Ouverture : RPC économique habituelle, action `open`, payload `{count:1,booster:'nexus:weekly'}`. Les quantités habituelles 1/5/10 restent acceptées par le moteur si le stock hebdomadaire suffit ; le bouton Nexus peut proposer une ouverture simple. Seul ce chemin reconnu autorise la définition spéciale non publiée. L’alias direct `staff:<definitionId>` est refusé par `NEXUS_WEEKLY_REQUIRED`.

Le dispatcher déduit uniquement `stock.nexusWeekly` et utilise ensuite **la même boucle de tirage**, les mêmes poids, garanties, compteurs de pity, écritures de cartes, journaux, résonances, anomalies et XP. Le stock ordinaire n’est pas consommé. Sa recharge naturelle peut néanmoins se mettre à jour lors de l’appel, comme pour toute opération économique. Aucun moteur de tirage indépendant n’est créé.

La définition hebdomadaire doit garder ses six raretés et ses cartes valides ; sinon récupération et ouverture deviennent indisponibles, sans supprimer les coffrets possédés. Les règles existantes des autres boosters staff ne sont pas modifiées.

## Récompenses et périodes

Les boosters Invocation continuent d’utiliser `nexus_daily {periodKey}` et la table de réclamations du lot 1. Le nouveau coffre utilise `nexus_reward {key,periodKey}` :

| Clé | Période | Récompense |
| --- | --- | --- |
| `prestige_daily` | Date civile de Paris `YYYY-MM-DD` | 25 Chakra |
| `weekly` | Date du lundi de la semaine à Paris `YYYY-MM-DD` | 1 ou 2 unités de `stock.nexusWeekly` |
| `prestige_once` | `once` | 1 000 Chakra et 5 unités de `stock.inv` |
| `album:<albumId>` | `once` | Récompense figée de cet album |

Il n’y a aucun rattrapage de période manquée. Une amélioration achetée après avoir récupéré la récompense du jour ou de la semaine ne permet pas de récupérer une deuxième fois ni de demander un complément. Le prochain renouvellement utilise la nouvelle quantité. Les helpers `nexus_week_start(timestamptz)` et `nexus_next_week_reset(timestamptz)` calculent les semaines civiles de Paris ; la durée des semaines contenant un changement d’heure est donc correcte.

La récupération est protégée par une clé unique `(user_id,reward_key,period_key)`, le verrou économique et le reçu idempotent. Dépassement du plafond de Chakra ou de stock : la transaction entière échoue, y compris l’enregistrement de récupération. Aucun montant fourni par le client n’est utilisé.

Les albums sont figés au déploiement : albums administrés existants, puis séries implicites ne portant pas le même nom normalisé qu’un album administré. Seuls les ensembles d’au moins cinq cartes sont retenus. Les identifiants sont `managed:<uuid>` ou `series:<empreinte stable du nom normalisé>`. La liste figée des cartes évite qu’une modification ultérieure du catalogue renouvelle une récompense.

La preuve de complétion utilise les cartes actuellement possédées **et** celles réservées dans les annonces actives du joueur. Toutes les cartes de la définition doivent être présentes. Réclamer une récompense d’album attribue également 20 XP, via un événement unique `mission / nexus_album:<albumId>`. La collection n’est jamais consommée. Les récompenses déjà obtenues ne sont pas retirées après vente des cartes.

## Fragments et auras

Un trigger sur les nouvelles lignes du journal des tirages attribue les fragments uniquement aux doublons Mythiques réellement tirés après cette migration, avec Résonance II ou IV débloquée. Il applique le plafond quotidien de Paris de 10 fragments Nexus et la limite de 100 000 du portefeuille existant. Le registre unique de la ligne de tirage empêche les répétitions. Aucun backfill de fragments n’est effectué.

Les trois auras coûtent des fragments : `echo` / Écho de cristal / 20, `astral` / Aura astrale / 50, `transcendance` / Transcendance / 100. Achat : `nexus_cosmetic {id,expectedCost,configVersion}`. Il nécessite Résonance II, vérifie le prix et le solde, débite le portefeuille aventure et crée le déblocage dans une même transaction. L’aura n’est pas équipée automatiquement : `nexus_preferences {aura:'echo'}` l’équipe, `aura:''` la retire. Aucune aura non achetée ne peut être équipée.

Les auras décorent la galerie et le profil. Elles n’accordent ni carte, ni tirage, ni XP, ni Éveil. Les fragments déjà obtenus par d’autres mécanismes légitimes restent utilisables ; le plafond de 10 concerne exclusivement les gains Nexus provenant des doublons.

## Contrat de lecture étendu

Le RPC de lecture et tous les champs du lot 1 sont conservés, avec `configVersion:2`. Les réponses économiques et les replays contiennent toujours le Nexus actuel dans `result.nexus`.

Les nouvelles propriétés de `bonuses` sont : `storageBonus`, `freeCapacity`, `detailedStats`, `marketWatch`, `advancedTracking`, `archiveTools`, `albumRewards`, `fragmentsPerDuplicate`, `fragmentsDailyCap`, `resonanceAnimation`, `mythicPrestige`, `prestigeDailyChakra`, `weeklyPacks`, `prestigeTitle`, `profileAnimation`, `prestigeCrystal`. `profileFrame` reste une chaîne `'' | 'nexus'`.

```js
rewards: [{
  key, name, kind, periodKey, nextResetAt,
  available, claimed, locked, chakra, packs, weeklyPacks,
  albumId?, owned?, total?
}]
weeklyBooster: {
  id: 'nexus:weekly', name, definitionId, cardIds, cardCount,
  count, available, rarities
}
cosmetics: {
  fragments, earnedToday, dailyCap,
  items: [{id, name, cost, owned}], aura
}
preferences: {
  priorityCardIds, frame, aura,
  archivePreferences: {series: '', rarity: '', mode: 'all', sort: 'name'}
}
```

Les préférences d’archive exigent Collection II et un objet complet : `mode` vaut `all`, `duplicates` ou `missing`; `sort` vaut `name`, `copies` ou `rarity`; `series` vaut un nom réel ou une chaîne vide; `rarity` vaut une rareté valide ou une chaîne vide. Elles sont sauvegardées via `nexus_preferences {archivePreferences}`. Les autres champs de préférences peuvent être envoyés dans la même transaction.

`stats` vaut `null` avant Destin II ; ensuite :

```js
{
  packs, cards, newCards,
  rarities: {'Commun': count, /* six raretés */},
  pity: {
    legendary: {current, threshold: 50, remaining},
    mythic: {current, threshold: 250, remaining}
  },
  odds: [{id, name, weights, guarantee, cardCount}]
}
```

Ces compteurs proviennent des journaux serveur. Ils ne prétendent pas reconstituer d’anciennes ouvertures locales inconnues. Les poids 600/230/125/42/2/1 sont les poids du moteur, renormalisés selon le minimum de rareté de chaque emplacement ; leur normalisation globale seule ne décrit pas les deux emplacements garantis.

`marketWatch` vaut `null` avant Destin IV ; ensuite `{listings,observedAt}`. Les annonces comprennent `id`, `cardId`, `name`, `series`, `rarity`, `mode`, `price`, `topBid`, `seller` (pseudo), `createdAt`, `endsAt`. Seules les annonces réelles actives non expirées, proposées par un autre joueur et correspondant aux priorités sont retournées, avec une limite de 40. Aucun e-mail, identifiant Auth de vendeur ou autre donnée privée n’est exposé.

`advancedTracking` vaut `null` avant Destin V ; ensuite `{scope:'wishlist',total,owned,missing,mythics,fullyAwakened,items,hasMore}`. Les totaux portent sur toute la wishlist enregistrée ; `items`, limité à 100, contient `{id,owned,copies,rarity,resonance,unlocked}`, avec les cartes manquantes en premier. Les copies de l’inventaire et des réservations sont agrégées une seule fois pour éviter une lecture complète de l’inventaire pour chaque souhait.

## Configuration, erreurs et validations

Les quantités sont stockées côté serveur et bornées : bonus de boosters journaliers total ≤4, stockage supplémentaire ≤3, priorités ≤20, recyclage ≤15 %, fragments Nexus ≤100/jour avec 10 par défaut, Chakra quotidien Prestige ≤1 000, coffrets hebdomadaires ≤10, récompense Prestige unique ≤100 000 Chakra et ≤1 000 boosters. Les récompenses d’albums sont bornées à 10 000 Chakra et 100 boosters par définition. Ces bornes sont des limites techniques, pas une recommandation économique ; modifier la configuration exige un contrôle administrateur et une nouvelle version. Les outils d’administration avancés appartiennent au lot 3.

Erreurs nouvelles : `NEXUS_REWARD_LOCKED`, `NEXUS_REWARD_CLAIMED`, `NEXUS_REWARD_UNAVAILABLE`, `NEXUS_ALBUM_INCOMPLETE`, `NEXUS_COSMETIC_UNAVAILABLE`, `NEXUS_COSMETIC_OWNED`, `INSUFFICIENT_FRAGMENTS`, `NEXUS_AURA_LOCKED`, `NEXUS_ARCHIVE_LOCKED`, `NEXUS_WEEKLY_UNAVAILABLE`, `NEXUS_WEEKLY_REQUIRED`, `NEXUS_WEEKLY_MANAGED`, `INSUFFICIENT_WEEKLY_PACKS`. Les erreurs de période, configuration, solde et idempotence du lot 1 restent applicables.

Vérification de préparation : les huit ancres du dispatcher et l’ancre de `econ_write` ont été comparées aux définitions de production en lecture seule et apparaissent chacune exactement une fois ; les trois ancres du helper lot 1 sont présentes. Cette vérification ne remplace pas l’exécution PostgreSQL des fixtures. `scripts/check-nexus-lot2.sql` doit être exécuté avec `ROLLBACK` après migration ; il remplace les attentes spécifiques version 1 / cinq nœuds actifs de l’ancien test historique.

La validation doit couvrir les 25 achats et prérequis, les montants 1/2/4, la capacité 101/103 sans création de boosters, l’absence de deuxième récupération après upgrade, les semaines avec changement d’heure, les coffrets déduits uniquement de leur stock, les garanties et journaux, les bonus 10/15 %, la preuve d’album incluant une carte réservée, les gains plafonnés de fragments, l’achat/équipement d’auras, les statistiques réelles, les annonces apparues puis retirées, les filtres persistants et les accès anonymes/intercomptes.

Validation exécutée après application de la réparation : `scripts/check-nexus-lot2.sql` a réussi dans PostgreSQL, avec annulation des fixtures par `ROLLBACK`. Les régressions `check-economy.sql`, `check-economy-permissions.sql` et `check-mythic.sql` ont également réussi. Les conseillers de sécurité n’ont ajouté aucun signalement : les 20 notices informatives et l’avertissement de protection des mots de passe préexistaient à ce lot. Ces résultats concernent le backend ; les validations d’interface et la publication sont suivies séparément.

En cas de rollback, ne pas restaurer les snapshots globaux : les ouvertures et échanges intervenus après déploiement doivent être conservés. Garder les registres de récompenses, achats et fragments. Un retour au code lot 1 doit notamment gérer explicitement les coffrets encore possédés, les stocks gratuits supérieurs à 100 et les achats des rangs avancés ; restaurer aveuglément les anciennes fonctions ferait perdre des possibilités acquises.
