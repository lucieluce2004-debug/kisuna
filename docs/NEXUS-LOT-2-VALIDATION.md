# Validation du Nexus — lot 2

La suite `scripts/check-nexus-lot2.sql` remplace les attentes de configuration du test historique du lot 1. Elle vise la configuration version 2 et les 25 nœuds actifs. Les achats et les récompenses passent par les RPC réellement utilisées par le site ; les données nécessaires aux scénarios sont créées avec le rôle de migration dans une transaction annulée par `ROLLBACK`.

Les identités de test sont nouvelles et ne réutilisent aucun joueur. Les soldes, niveaux et cartes injectés directement sont uniquement des fixtures privilégiées permettant de couvrir les seuils et les limites. Ils ne correspondent à aucune capacité du navigateur.

La suite couvre :

- Les 25 nœuds actifs, les prix/version/prérequis/niveaux, l’idempotence et la conservation des stocks de départ.
- Le stockage 100/101/103 et sa recharge ; les cadeaux quotidiens 1/2/4 ; l’absence de second cadeau après une amélioration dans la même période.
- Les récompenses Prestige de 25 Chakra par jour, de 1/2 coffrets par semaine et de 1 000 Chakra + cinq boosters une seule fois ; l’annulation d’un gain quand le stock est plein.
- Le lundi à minuit à Paris, y compris les semaines de 167 et 169 heures aux changements d’heure.
- Le stock hebdomadaire distinct, ouvert par le moteur économique existant avec cinq cartes, pity Mythique et journal ; le refus d’un pool déséquilibré ou désactivé. Son catalogue reste privé, son alias staff ordinaire est refusé et les autres brouillons staff restent inaccessibles.
- Les suivis prioritaires de 15/20 cartes, sans effacer la wishlist ; les préférences d’archives validées et les statistiques comparées aux journaux réels.
- Les bonus de recyclage 10/15 %, les fractions conservées et l’exclusion de la copie unique ; le bonus 5 % reste couvert par la suite historique exécutée au lot 1.
- Une récompense d’album fondée sur cinq cartes précises, dont une réservée au marché, récupérable une seule fois.
- Les fragments cosmétiques 1/2 par doublon Mythique, le plafond de dix par date de Paris, l’absence de fragments lors d’un achat marché et l’absence de quatrième Éveil.
- Les trois cosmétiques 20/50/100 fragments, le portefeuille aventure partagé, les prix confirmés, les reçus et les équipements autorisés.
- Une annonce réelle qui apparaît dans la surveillance puis disparaît après annulation ; les fonctions privées, les tables RLS et les refus sous le rôle `authenticated`.

La suite reste séquentielle : elle vérifie les refus, contraintes et reçus, mais ne remplace ni un test de charge multi-connexion ni une vérification visuelle dans un navigateur.

Exécution le 4 novembre 2026 : **PASS** après les migrations `kizuna_nexus_lot_two` et `kizuna_nexus_lot_two_dispatch_fix`. La première exécution a révélé une ambiguïté entre la variable texte `id` du dispatcher et la clé booléenne de configuration ; la réparation additive qualifie les deux références. La suite complète passe après correction, avec `ROLLBACK` des fixtures.

Les régressions PostgreSQL `check-economy.sql`, `check-economy-permissions.sql` et `check-mythic.sql` passent également. Le contrôle final retrouve deux profils, 1 124 cartes, 25 nœuds actifs, 39 définitions de récompenses d’albums et aucun profil temporaire Nexus. Les snapshots des joueurs sont identiques à la sauvegarde avant migration, hors les deux champs additionnels de stock `freeCapacity` et `nexusWeekly`.

Tests JavaScript réussis : `verify-account`, `verify-economy-interface`, `verify-nexus-account`, `verify-nexus`, `verify-nexus-lot2`, `verify-nexus-boosters`, `verify-free-stock`, `verify-mythic`, `verify-boosters-v2`, `verify-interface`, `verify-gaming-ui`. Ils utilisent le DOM réel de l’application et des réponses contrôlées ; les transactions de récompenses sont testées séparément par PostgreSQL. La syntaxe JavaScript et CSS, la construction et `git diff --check` passent.

L’aperçu local répond HTTP 200 ; son ouverture dans Codex est mise en file d’attente. Aucune inspection visuelle réelle ordinateur/mobile ni prise de contrôle du PC n’est revendiquée. Les vérifications DOM, de gestes synthétiques et des règles responsive ne remplacent pas cette inspection.

Le diagnostic de sécurité Supabase reste inchangé : vingt signalements INFO préexistants de RLS sans policy, hors nouvelles tables Nexus, et le signalement Auth préexistant sur les mots de passe compromis. Aucun nouveau signalement Nexus. Les références et le contexte sont conservés dans `NEXUS-VALIDATION.md`.
