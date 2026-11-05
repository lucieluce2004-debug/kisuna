# Validation du Nexus — lot 1

Cette suite conserve les attentes de la configuration version 1 : cinq nœuds actifs et vingt nœuds prévus. Après activation du lot 2, employer `scripts/check-nexus-lot2.sql`, qui reprend les invariants du lot 1 dans le contrat étendu. Ne pas interpréter le refus de l’ancienne configuration version 1 comme une régression.

`scripts/check-nexus.sql` est un test d’intégration PostgreSQL destiné au rôle de migration. Il crée deux comptes temporaires, des boosters déterministes, un objectif de collection et une anomalie, puis annule toute la transaction avec `ROLLBACK`. Il ne réutilise aucun joueur réel.

Le test couvre les 25 nœuds, les cinq premiers bonus actifs, les achats permanents, les refus atomiques (solde, prix, version, niveau et prérequis), les reçus idempotents, le cadeau quotidien séparé du cadeau UTC existant, les journées de 23 et 25 heures à Paris, les suivis prioritaires, le cadre, le bonus de recyclage et ses fractions conservées, les XP des ouvertures/découvertes/éveils/objectifs/anomalies, ainsi que l’isolement des comptes et les permissions.

Les ouvertures de test passent par le vrai moteur économique avec un booster temporaire mono-carte afin de vérifier les journaux et l’absence de gain répété à la réacquisition. Les boosters mono-rareté sont uniquement des fixtures annulées ; ils ne constituent pas une recommandation d’équilibrage du catalogue.

Les erreurs attendues sont interceptées dans des sous-transactions. Toute assertion inattendue fait échouer le test. Les tables privées et le caractère `SECURITY INVOKER` du point d’entrée public sont contrôlés, puis une partie des tentatives de falsification s’exécute réellement sous le rôle `authenticated`.

Le test séquentiel prouve l’idempotence et les contraintes d’unicité ; il ne constitue pas un test de charge ni une mesure de concurrence entre connexions. Le verrou économique partagé et les contraintes sont également à relire lors de chaque évolution.

Le 4 novembre 2026, après application réussie de la migration, `scripts/check-nexus.sql` a été exécuté sur PostgreSQL : toutes les assertions sont passées et les fixtures ont été annulées par `ROLLBACK`.

Le contrôle Supabase de sécurité après migration n’a signalé aucun nouveau problème Nexus. Les résultats restent identiques à l’état initial : 20 informations concernant des tables existantes avec RLS sans politique, et un avertissement Auth préexistant concernant la protection contre les mots de passe compromis. Ce dernier concerne la configuration partagée du projet, inchangée par cette livraison ; [documentation Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Les tests d’interface et la vérification visuelle sont consignés séparément lors de la publication ; la réussite SQL ne prouve pas le rendu dans un navigateur réel.
