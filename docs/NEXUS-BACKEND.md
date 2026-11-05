# Nexus des Destinées — backend du lot 1

Source : `schema/kizuna_nexus.sql`. Ce fichier est une migration source à appliquer **une seule fois, intégralement dans une transaction**, après les migrations économie, Mythiques, compatibilité aventure et anomalies existantes. Il ne contient ni identifiant de projet ni secret. Le nom de migration enregistré par la plateforme appartient au déploiement, pas à ce fichier.

Le lot 1 active les cinq nœuds de rang I à 1 000 Chakra, niveau Nexus 1. Les vingt autres nœuds sont visibles, explicitement prévus, désactivés et refusés par le serveur, même si un client contourne l’interface. Leurs coûts indicatifs sont 2 500 / 5 000 / 10 000 / 20 000 Chakra et leurs niveaux requis 3 / 6 / 10 / 15. Aucune probabilité, rareté, garantie, pity, résonance ou règle d’Éveil existante n’est modifiée.

## Données et accès

Toutes les nouvelles tables se trouvent dans `kizuna_private` :

| Table | Fonction |
| --- | --- |
| `kizuna_nexus_config` | Version de configuration, plafond de bonus de recyclage, activation |
| `kizuna_nexus_nodes` | 25 définitions : prix, niveau, prérequis, disponibilité et description |
| `kizuna_nexus_progress` | XP, révision, priorités, cadre sélectionné et reliquat de recyclage |
| `kizuna_nexus_unlocks` | Améliorations permanentes, coût payé et version au moment de l’achat |
| `kizuna_nexus_daily_claims` | Unicité de la récompense quotidienne par joueur et date de Paris |
| `kizuna_nexus_xp_events` | Registre unique des faits ayant donné de l’XP |
| `kizuna_nexus_discoveries` | Carte déjà découverte, indépendamment de sa possession actuelle |
| `kizuna_nexus_release_backup` | Définitions SQL et états existants avant cette migration |

RLS est activée sur ces huit tables. Aucune permission n’est accordée à `anon` ou `authenticated`; une policy et des permissions explicites sont réservées à `service_role`. Les helpers privés sont révoqués aux clients. Le seul nouveau point d’entrée public est un wrapper SQL `SECURITY INVOKER` vers une fonction privée `SECURITY DEFINER`, `search_path=''`, avec utilisateur obtenu par `auth.uid()` et profil obligatoire. Aucun endpoint ne permet de choisir un joueur ni de déclarer des XP.

Les définitions de `kizuna_private.kizuna_economy` et `kizuna_private.kizuna_adventure`, les états économiques, les états aventure, les progressions Mythiques et les récompenses d’anomalies sont sauvegardés dans une table privée avant modification. Les inventaires, soldes et historiques existants ne sont pas réinitialisés.

## Contrat navigateur

Lecture : `public.kizuna_nexus(p_action := 'get', p_payload := '{}')`. Toute autre action ou payload est refusé. Réponse :

```json
{
  "configVersion": 1,
  "stateRevision": 0,
  "xp": 0,
  "level": 1,
  "levelFloor": 0,
  "nextLevelXp": 100,
  "nodes": [{
    "id": "invocation_1",
    "branch": "invocation",
    "tier": 1,
    "name": "Premier Souffle",
    "description": "…",
    "cost": 1000,
    "requiredLevel": 1,
    "prerequisites": [],
    "enabled": true,
    "effect": {"type": "dailyPacks", "value": 1}
  }],
  "unlocked": [],
  "bonuses": {
    "dailyPacks": 0,
    "prioritySlots": 0,
    "recycleBps": 0,
    "awakenedGallery": false,
    "profileFrame": ""
  },
  "daily": {
    "available": false,
    "claimed": false,
    "periodKey": "2026-11-04",
    "nextResetAt": "2026-11-04T23:00:00+00:00",
    "count": 0
  },
  "preferences": {"priorityCardIds": [], "frame": ""},
  "recycleRemainder": 0,
  "serverNow": 0,
  "timezone": "Europe/Paris"
}
```

Les branches sont `invocation`, `destin`, `resonance`, `collection`, `prestige`. Les nœuds utilisent `branche_rang`. Les effets inactifs ont `{"type":"planned"}`. `profileFrame` est une **chaîne**, `''` ou `'nexus'`, jamais un booléen. `serverNow` est un timestamp Unix en millisecondes ; `nextResetAt` est une date ISO avec fuseau, `periodKey` une date civile `YYYY-MM-DD`.

Toutes les écritures utilisent le circuit économique existant :

| Action `kizuna_economy` | Payload |
| --- | --- |
| `nexus_buy` | `{nodeId, configVersion, expectedCost}` |
| `nexus_daily` | `{periodKey}` obtenu de la lecture serveur |
| `nexus_preferences` | `{priorityCardIds?: string[], frame?: ''\|'nexus'}` ; au moins un champ |

Chaque mutation utilise le `p_request_id` UUID persistant et la reprise réseau de `KizunaAccount.economyRequest`. Le résultat économique normal conserve `snapshot`, `revision`, `serverNow` et ajoute le Nexus actuel dans `result.nexus`. Cela vaut aussi pour l’ouverture, les recyclages et les reçus rejoués. Le reçu conserve le résultat économique initial ; la partie Nexus est actualisée à la relecture sans réattribuer la récompense.

Une lecture arrivée en retard ne doit pas remplacer un état du même compte ayant une `stateRevision` plus récente. Changer de compte invalide les requêtes précédentes. Les mises à jour de vue doivent préserver scroll, onglet et sélection.

## Achats, verrous et atomicité

Le dispatcher existant garde son verrou global `pg_advisory_xact_lock(17493,700)` avant le verrou de l’état économique. Le helper Nexus prend le même verrou avant toute création/verrouillage de progression. Les achats vérifient configuration et prix affichés, activation effective, absence d’achat antérieur, niveau, prérequis et solde. Le déblocage, le débit et le reçu sont dans la même transaction ; toute erreur annule l’ensemble. `econ_write` reste seul responsable de la révision et de l’audit du snapshot économique, et conserve la projection des cartes réservées au marché.

La fonction aventure doit déjà prendre le même verrou global avant son verrou joueur. La migration vérifie cet ordre et ne réinsère pas le verrou s’il existe. Pour une ancienne définition qui en serait dépourvue, elle ajoute le verrou avant l’insertion/verrouillage du joueur aventure. Cette précaution évite une inversion avec `mythic_sync_adventure`, appelé lors d’une ouverture économique.

Les patches utilisent `pg_get_functiondef` et des ancres devant apparaître exactement une fois. Une définition inattendue fait échouer toute la migration ; ne pas supprimer ces assertions pour forcer un déploiement. Le hook `mythic_record_open`, les corrections de wishlist et les autres ajouts du dispatcher restent conservés.

## Les cinq bonus réels

- **Invocation I** : +1 unité dans `snapshot.stock.inv`, récupérable une fois par date de Paris. Cela conserve le moteur de tirage, les stocks, garanties, pity et résonances. La récompense existante de trois boosters à minuit UTC et son champ `stock.day` sont inchangés. Aucun rattrapage des jours manqués. `nexus_next_reset(timestamptz)` calcule le prochain minuit civil de Paris ; les journées de 23 et 25 heures sont prises en charge.
- **Destin I** : cinq suivis prioritaires persistants. La wishlist existante accepte déjà 5 000 cartes et dispose déjà d’alertes de marché ; on conserve ces acquis. Ajouter une priorité ajoute également la carte à cette wishlist. Retirer une priorité n’efface pas la wishlist. Les cartes doivent exister et les doublons sont refusés. Une wishlist ayant déjà 5 000 entrées doit conserver cette limite : une nouvelle priorité qui la dépasserait est refusée, sans retirer d’anciennes entrées.
- **Résonance I** : autorise la galerie des Mythiques éveillées du joueur. Le frontend utilise la progression Mythique existante et sa possession actuelle ; cette galerie ne donne aucun Éveil, fragment ou supplément de résonance.
- **Collection I** : +500 points de base, soit +5 %, sur les doublons effectivement recyclés. `recycle_all` conserve un exemplaire disponible de chaque carte. Le recyclage individuel de la dernière copie, déjà possible, reste possible mais sans bonus Nexus. Les cartes réservées au marché restent en dehors de l’inventaire disponible. Le reliquat fractionnaire évite de perdre tous les petits bonus.
- **Prestige I** : cadre de profil `nexus`, déblocage permanent puis choix d’équipement explicite. Le serveur refuse d’équiper ce cadre avant son achat et autorise de revenir au cadre normal avec `frame:''`.

Le calcul de recyclage se fait une seule fois, sur le montant éligible de la transaction :

```text
numerateur = eligibleBase * recycleBps + ancienReliquat
bonus = floor(numerateur / 10000)
nouveauReliquat = numerateur modulo 10000
total = base + bonus
```

Le résultat contient `base`, `eligibleBase`, `bonus`, `total`, `recycleBps`, `remainder`, ainsi que `chakra:total` pour compatibilité. L’interface doit afficher ces montants avant la confirmation, avec les mêmes bases et le reliquat serveur ; le contrôle économique de `revision` protège contre un inventaire obsolète. Un exemplaire unique ne transforme pas le reliquat antérieur en bonus : celui-ci reste inférieur à 10 000.

Les coûts, niveaux et prérequis sont stockés en configuration. Les cinq effets appliqués sont volontairement bornés dans le code pour ce lot ; `recycle_cap_bps` est configurable entre 0 et 1 500. Activer d’autres effets exige une nouvelle migration implémentant et testant leur fonctionnement ; basculer simplement `enabled` sur un rang supérieur ne permet pas de l’acheter. Toute évolution des prix/effets doit incrémenter la version et actualiser les descriptions.

## XP fondée sur des faits

| Fait serveur | XP | Identité unique |
| --- | --- | --- |
| Booster effectivement ouvert | 10 par booster | Requête du journal de boosters |
| Première découverte connue d’une carte | 5 | Carte, pour toute la vie du compte |
| Nouveau niveau d’Éveil Mythique | 25 | Carte + niveau |
| Récompense de mission/constellation/événement de collection obtenue | 20 | Clé de récompense aventure, incluant sa période si applicable |
| Récompense d’anomalie obtenue | 30 | Événement + défi |

Les triggers partent des journaux de boosters/tirages, des déblocages Mythiques, des récompenses d’anomalies et des nouvelles clés de récompenses aventure. Un clic de visite, une consultation, une sélection de carte, un achat de nœud ou un rafraîchissement n’accorde rien. Pour l’aventure, seules les métriques `cards`, `total`, `universe`, `discoveries`, `awakenings`, `constellations` sont éligibles ; `visits` est exclue, même si elle donne un badge.

Le niveau vaut `1 + floor(sqrt(xp / 100))`. Son seuil inférieur est `(level-1)² * 100` et son prochain seuil `level² * 100`.

Le backfill crédite les journaux serveur fiables et les récompenses serveur déjà obtenues. La première ligne historique d’une carte ne donne +5 que si elle n’était pas déjà un doublon à cette date. Toutes les cartes présentes dans les journaux, l’inventaire ou les réservations actives alimentent le registre de découvertes ; les possessions héritées sans première découverte prouvée ne donnent pas d’XP. Les anciens Éveils dont `unlocked_at` est nul sont également exclus. Ainsi, vendre/recycler toutes les copies puis retrouver la carte ne renouvelle jamais ses +5 XP.

## Erreurs fonctionnelles

`NEXUS_CONFIG_CHANGED`, `NEXUS_NODE_UNAVAILABLE`, `NEXUS_ALREADY_UNLOCKED`, `NEXUS_LEVEL_REQUIRED`, `NEXUS_PREREQUISITE_REQUIRED`, `INSUFFICIENT_CHAKRA`, `NEXUS_DAILY_LOCKED`, `NEXUS_PERIOD_CHANGED`, `NEXUS_DAILY_CLAIMED`, `NEXUS_PRIORITY_LOCKED`, `NEXUS_PRIORITY_LIMIT`, `NEXUS_FRAME_LOCKED`, `INVALID_INPUT`. Les erreurs économiques existantes, notamment `REQUEST_REUSED`, `STATE_CONFLICT`, `BALANCE_LIMIT`, restent applicables.

## Équilibre et limites observées

Le système existant recharge un booster par six heures, avec un stock gratuit plafonné à 100, et propose trois boosters quotidiens. La boutique facture 100 / 450 / 850 Chakra pour 1 / 5 / 10 boosters. Les valeurs de recyclage sont 5 / 8 / 10 / 15 / 25 / 60 Chakra selon la rareté.

Sur un pool contenant toutes les raretés, l’espérance théorique de recyclage est d’environ 41,77 Chakra par booster, hors pity et uniquement si toutes les cartes peuvent être recyclées. +5 % porte ce montant à environ 43,86. À sept boosters gratuits par jour, 1 000 Chakra représente environ 3,4 jours dans cette hypothèse très favorable ; un nouveau collectionneur conservant ses découvertes progresse plus lentement. Cette estimation n’est pas une promesse de revenu joueur.

Limite préexistante : un booster staff dépourvu de certaines raretés remonte vers une rareté disponible. Un booster composé uniquement de Mythiques peut donc recycler à 300 Chakra par booster, pour un achat minimum de 85 Chakra/booster. Le lot 1 ne modifie pas ce moteur ni les boosters staff. Il ne faut pas en déduire une absence universelle d’arbitrage rentable ; les nouveaux boosters staff doivent être équilibrés séparément.

## Validation et retour arrière

Avant déploiement : vérifier les ancres sur les fonctions réelles, appliquer la migration dans une transaction, puis exécuter les fixtures transactionnelles de `scripts/check-nexus.sql` et les vérifications frontend. Les fixtures doivent être annulées par `ROLLBACK`. Couvrir accès anonyme et intercomptes, achat/reprise/coût/prérequis/niveau/solde, concurrence et double récupération, DST, wishlist conservée, cadre verrouillé, reliquats, dernière copie sans bonus, XP unique et niveaux futurs inaccessibles. Ne jamais présenter une vérification statique comme une exécution PostgreSQL réussie.

En cas de retour arrière, préserver les tables Nexus et son registre financier. Retirer les triggers Nexus et restaurer les définitions SQL sauvegardées doit se faire dans une transaction avec le même verrou global. Ne pas réinjecter automatiquement les snapshots de sauvegarde : des joueurs peuvent avoir ouvert des boosters ou effectué des échanges depuis. Les achats déjà débités demandent une décision explicite de maintien ou de remboursement audité, jamais une restauration globale de portefeuille.
