# Nexus — administration du lot 3

La migration `schema/kizuna_nexus_lot_three.sql` ajoute une administration versionnée au Nexus déjà actif. Elle ne réinitialise aucun compte, inventaire, solde, achat, récupération, Résonance ni compteur de garantie. Cette première migration garde la configuration économique en version 2.

À la demande explicite ultérieure « pour les boosters gratuits mets /10 », la migration additive `schema/kizuna_nexus_free_capacity_ten.sql` ramène la capacité de recharge de base à dix. Les bonus Invocation II et IV portent ce plafond à onze puis treize. Elle publie une version système 3 avec un audit explicite et conserve tout stock déjà gagné, y compris 103 packs historiques. Le stock initial reste trois ; les packs achetés, offerts et les Coffrets Nexus restent séparés. Le test dédié est `scripts/check-free-capacity-ten.sql`.

## Accès et publication

Le RPC public `kizuna_nexus_admin(p_action,p_payload)` est un wrapper `SECURITY INVOKER`. Son entrée privée vérifie `auth.uid()` puis l’appartenance courante à `public.kizuna_admins`, la table protégée déjà utilisée par le site. Les joueurs et modérateurs sont refusés ; les métadonnées Discord ou `user_metadata` n’accordent aucun droit. Le rôle est revérifié après l’attente du verrou de publication.

Les tables privées de brouillon, versions, reçus et sauvegarde ont RLS activée, des droits révoqués aux navigateurs et une policy réservée à `service_role`. Les helpers internes ne sont pas exécutables par `authenticated` ou `anon`. La seule fonction privée exposée à `authenticated` est l’entrée qui contrôle le rôle.

Une modification suit ce parcours : enregistrer un brouillon validé, consulter le bilan des changements, confirmer la publication. Le hash d’aperçu lie exactement le document, sa révision et la version active. La publication vérifie ce hash, la révision du brouillon, la version attendue et les bornes serveur avant d’appliquer les effets. Le verrou économique global existant empêche une publication de couper une ouverture ou une récupération en deux états différents.

Un `requestId` UUID est enregistré avec l’auteur et l’empreinte du payload. Répéter la même publication renvoie `replayed:true` et la version déjà publiée, sans nouvel effet. Réutiliser cette référence avec un autre payload est refusé. Une réponse rejouée contient également l’état administrateur actuel afin de ne pas réafficher un ancien brouillon.

Restaurer une version charge son document dans un **nouveau brouillon**. L’administrateur doit ensuite revoir et publier la restauration, qui devient une nouvelle version. Les versions ne reculent jamais ; restaurer la configuration ne restaure aucun solde ni aucune récompense déjà récupérée. Les achats historiques conservent leur prix payé et leur version d’origine.

## Contrat

| Action | Payload |
| --- | --- |
| `get` | `{}` |
| `save` | `{revision, config}` |
| `preview` | `{revision}` |
| `publish` | `{revision, expectedVersion, requestId, previewHash}` |
| `restore` | `{revision, targetVersion}` |

Les réponses contiennent `draft`, `revision`, `publishedVersion`, `publishedRevision`, `live`, `history`, `stats`, `bounds`, `serverNow`. L’aperçu ajoute `preview:{hash,changes:[{path,before,after}],summary,warnings}`. `summary` indique les plafonds d’un arbre complété : `dailyPacks`, `freeCapacity`, `prioritySlots`, `recycleBps`, `weeklyPacks`.

Le document éditable contient :

- `nodes` : les 25 identifiants stables, avec `name`, `cost`, `requiredLevel`, `prerequisites`, `enabled`.
- `economy` : `dailyBoosters`, `storageBonuses`, `priorityBonuses`, `recycleBonuses`, `recycleCapBps`, `fragmentsBasic`, `fragmentsAdvanced`, `fragmentsDailyCap`, `prestigeDailyChakra`, `weeklyBasic`, `weeklyAdvanced`, `prestigeOnceChakra`, `prestigeOncePacks`.
- `weeklyBooster` : `name`, `description`, `cardIds`, `enabled`.
- `cosmetics` : identifiants stables et `name`, `cost`, `enabled`.
- `albums` : identifiants stables et `name`, `chakra`, `packs`, `enabled`.

Les cartes exigées pour une récompense d’album restent figées. Changer le nom ou le montant d’une récompense ne crée pas un nouvel identifiant et ne permet aucune deuxième récupération. Les cosmétiques déjà achetés restent équipables après désactivation de leur vente.

Les descriptions et les valeurs d’effet des nœuds sont générées depuis la configuration publiée. Les pourcentages de recyclage ne sont plus des constantes de 500 points de base : le moteur lit les trois valeurs configurées, puis applique le plafond. Les probabilités, le pity, les seuils d’Éveil et les règles du moteur de tirage restent hors de ce panneau.

## Bornes et cohérence

| Réglage | Borne serveur |
| --- | --- |
| Coût d’un nœud | 1 à 1 000 000 000 Chakra |
| Niveau requis | 1 à 10 000 |
| Boosters quotidiens Invocation | trois incréments, total 0 à 4 |
| Stockage | deux incréments, total 0 à 3 ; capacité de recharge 10 à 13 |
| Priorités | trois incréments, total 0 à 20 |
| Recyclage | trois incréments, total et plafond 0 à 1 500 points de base |
| Fragments par doublon | 0 à 10 ; gain avancé au moins égal au gain initial |
| Fragments quotidiens Nexus | 0 à 100 |
| Chakra quotidien Prestige | 0 à 1 000 |
| Coffrets hebdomadaires | initial 0 à 5, avancé 0 à 10 et au moins égal à l’initial |
| Récompense finale unique | 0 à 100 000 Chakra et 0 à 1 000 packs |
| Aura | coût de 1 à 100 000 fragments |
| Récompense d’album | 0 à 10 000 Chakra et 0 à 100 packs |
| Coffret spécial | 6 à 500 cartes distinctes et existantes, avec les six raretés |

Les nombres doivent être des entiers JSON. Les clés inconnues, identifiants ajoutés ou retirés, doublons, types incorrects et configurations incomplètes sont refusés. Le nom d’un nœud ou d’une aura mesure 2 à 80 caractères ; le nom d’un album 2 à 120 ; le coffret 3 à 60 avec une description de 300 caractères maximum.

Les prérequis peuvent ajouter des dépendances entre branches, mais conservent le rang précédent de la branche. Les références inconnues, un prérequis vers soi-même, les cycles et un niveau inférieur à celui d’un prérequis sont refusés. La recherche de cycles utilise une fermeture de paires distinctes bornée à 25 × 25, plutôt qu’une énumération exponentielle de chemins.

Désactiver un nœud interdit les prochains achats sans retirer les bénéfices déjà acquis. Les autres ajustements économiques s’appliquent à la configuration courante, sans complément rétroactif après une récupération. Une baisse de capacité de recharge conserve le stock existant ; la recharge attend que le joueur repasse sous le nouveau plafond. Une baisse des priorités conserve la liste enregistrée, mais les modifications suivantes doivent respecter la nouvelle limite.

Le plafond de base de dix fait partie du moteur, distinct des deux incréments configurables. Restaurer le document économique d’une ancienne version ne restaure pas l’ancien code ni un plafond de cent. La publication système conserve un éventuel brouillon administrateur en attente et lui donne une révision distincte ; elle n’écrase pas son contenu.

Le panneau configure les caractéristiques des 25 nœuds et leur activation. Ajouter un nouveau type d’effet, une branche ou un rang nécessite une évolution du moteur et une migration ; aucun nœud factice ne peut être publié en inventant un type dans le navigateur.

## Coffret spécial et ancien panel staff

Le Coffret Nexus conserve sa définition réelle, privée et non publiée parmi les boosters ordinaires. Son pool, son nom et sa description passent désormais par la même publication versionnée que ses récompenses. Le trigger `nexus_weekly_publication_guard` refuse une modification depuis l’ancien éditeur staff si elle ne correspond pas exactement à la version Nexus publiée. Un enregistrement identique reste inoffensif et autorisé.

Lors d’une publication, l’historique immuable de la nouvelle version est inséré avant son application, dans la même transaction. Le trigger compare la définition du coffret avec cette version. Il n’existe pas de variable de session ni de flag fourni par le client pour contourner ce contrôle. L’alias ordinaire `staff:<id>` reste refusé pour ouvrir ce coffret ; le chemin `nexus:weekly` continue d’utiliser son stock propre et le moteur habituel.

## Statistiques et audit

Les statistiques agrègent les journaux et acquisitions réellement conservés : joueurs ayant un Nexus, activité XP sur trente jours, nœuds achetés, Chakra dépensé, récupérations quotidiennes/hebdomadaires/albums, fragments accordés, auras achetées et récompenses réellement attribuées. Les résultats par branche et par nœud proviennent des achats historiques, pas des prix actuellement affichés. Aucun inventaire individuel, adresse e-mail ou identifiant Discord n’est exposé dans ces statistiques.

Les trente dernières versions publiées sont listées avec date et pseudo administrateur. L’historique complet reste conservé pour les restaurations. Les enregistrements, restaurations et publications écrivent également dans l’audit staff existant. Les simples lectures et aperçus ne publient rien et n’attribuent rien.

## Sauvegarde et vérifications

`kizuna_nexus_lot_three_backup` conserve les fonctions modifiées, les snapshots économiques et les configurations avant migration. La modification du trigger est documentée dans cette migration ; un retour arrière doit préserver tout achat ou gain postérieur et ne doit pas restaurer aveuglément des snapshots sauvegardés.

Le changelog officiel Supabase a été vérifié le 4 novembre 2026 et la documentation actuelle des fonctions PostgreSQL consultée. Les nouveautés CLI v3 ne concernent pas ce déploiement par le connecteur natif ; les mises à jour tzdata signalées n’affectent pas Europe/Paris. Aucun appel à un service externe ni nouveau secret n’est ajouté.

Les résultats effectifs des migrations et suites PostgreSQL/JavaScript sont consignés dans `NEXUS-LOT-3-VALIDATION.md` par l’agent principal. Cette documentation ne présume pas le succès d’un test encore en cours.
