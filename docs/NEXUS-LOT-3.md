# Nexus — lot 3

Le panneau **Staff → Nexus** permet aux administrateurs de régler les 25 améliorations, leurs prix, niveaux et prérequis, les bonus économiques, le Coffret hebdomadaire, les récompenses d’albums et les auras. Les réglages passent par un brouillon, un aperçu des différences et une publication versionnée. Une restauration charge un nouveau brouillon à vérifier avant publication.

Les autorisations sont vérifiées côté serveur à chaque opération. Les modérateurs et joueurs n’ont pas accès aux réglages. Les achats, récompenses déjà récupérées et coûts historiques restent acquis. Les confirmations périmées et les doubles publications sont protégées par version et reçu unique. Les montants restent soumis aux bornes du moteur.

Les cinq voies du Nexus, les états du cristal, le focus, les animations réduites et les indicateurs de récompenses ont été affinés. Les célébrations suivent uniquement les nouveaux achats confirmés. Le coffret hebdomadaire conserve son stock et son parcours d’ouverture propres.

Le carrousel des boosters permet de revenir au premier paquet Kizuna Mix. La recharge gratuite affiche désormais une réserve de **10** packs, portée à **11 puis 13** par les bonus Invocation. Le stock initial reste trois. Les packs déjà accumulés sont conservés ; les packs achetés et offerts restent séparés.

Les migrations sont `kizuna_nexus_lot_three` puis `kizuna_nexus_free_capacity_ten`. La configuration économique active devient la version 3. Les résultats SQL et les vérifications visuelles réelles dans Edge, sur ordinateur et en affichage mobile émulé, sont consignés dans `NEXUS-LOT-3-VALIDATION.md`. L’en-tête mobile conserve le logo, les actions et l’accès Staff. L’essai de concurrence SQL a été interrompu faute de sessions simultanées ; ses comptes temporaires ont été supprimés. Le contrat serveur se trouve dans `NEXUS-LOT-3-BACKEND.md`.
