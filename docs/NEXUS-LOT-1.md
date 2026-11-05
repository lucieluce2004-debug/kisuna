# Nexus des Destinées — livraison du lot 1

Le lot 1 demandé dans `message4.txt` ajoute une progression permanente à Kizuna. Les vingt nœuds des lots suivants sont consultables, indiqués « À venir » et inaccessibles à l’achat côté serveur.

## Fonctionnel

- Navigation Nexus, raccourci d’accueil et résumé de progression sur le profil.
- Arbre de cinq branches et vingt-cinq nœuds, cristal central, états textuels et colorés, déplacement, zoom, pincement, recentrage et vue liste accessible.
- Cinq premiers nœuds à 1 000 Chakra chacun : achat confirmé, permanent, débité et enregistré par le moteur économique existant.
- Invocation I : un booster supplémentaire par jour, à réclamer dans le Nexus. Renouvellement à minuit en Europe/Paris, sans rattrapage des jours manqués ; cadeau UTC existant conservé.
- Destin I : cinq personnages prioritaires persistants, état de possession et recherche au marché. Leur ajout les inscrit aux alertes existantes. La liste d’envies déjà disponible conserve ses droits.
- Résonance I : galerie des Mythiques actuellement possédées et éveillées, avec accès à l’atelier existant.
- Collection I : bonus de 5 % sur les doublons recyclés, aperçu base/bonus/total et reliquats fractionnaires conservés. Aucun bonus sur la dernière copie.
- Prestige I : cadre Nexus équipable sur le profil, compatible avec les décorations existantes.
- XP issue des journaux serveur : ouvertures, premières découvertes, niveaux d’Éveil, objectifs de collection réclamés et récompenses d’anomalies. Pas d’XP pour de simples clics ou visites.
- Protection contre les doubles achats/récupérations, reprise d’une opération, changement d’identité, réponse retardée et modification du prix pendant une confirmation.

Le contrat, les coûts, l’équilibre observé et les limites sont décrits dans `NEXUS-BACKEND.md`. La progression et ses données préparatoires aux prochains lots sont séparées des sauvegardes historiques.

## Vérifications réalisées le 4 novembre 2026

La migration `kizuna_nexus_lot_one` a été appliquée avec succès. Le test PostgreSQL `check-nexus.sql` passe sur de vrais appels RPC avec des comptes temporaires et annulation de toutes les fixtures. Les contrôles couvrent notamment les journées de 23/25 heures, le stock plein, les refus atomiques, les droits et la génération unique d’XP.

Les régressions PostgreSQL `check-economy.sql`, `check-economy-permissions.sql` et `check-mythic.sql` passent également. Les deux comptes existants conservent leurs snapshots de jeu ; les révisions techniques peuvent évoluer indépendamment. Aucun compte de test Nexus ne demeure.

Tests JavaScript réussis : `verify-account`, `verify-nexus-account`, `verify-economy-account`, `verify-economy-interface`, `verify-nexus`, `verify-interface`, `verify-home`, `verify-gaming-ui`, `verify-mythic`, `verify-adventure`, `verify-anomalies`, `verify-boosters-v2`. Ils vérifient le DOM et les interactions avec des réponses contrôlées, sans simuler des gains sur les comptes réels. Construction et vérification des différences réussies.

L’aperçu local répond HTTP 200. L’ouverture dans Codex a été mise en file d’attente ; aucun contrôle du PC ni inspection visuelle réelle ordinateur/mobile n’a été effectué. Les tests de gestes synthétiques et les règles responsive ne remplacent pas cette inspection.

Deux anciens contrôles supplémentaires ne comptent pas parmi les validations réussies : `check-adventure.sql` attend encore une ancienne mécanique d’Éveil désormais refusée par le moteur Mythique ; l’autorisation de la suite complète `check-anomalies.sql` a expiré avant exécution. Les missions et anomalies utilisées par le Nexus sont couvertes par `check-nexus.sql` et les scénarios JavaScript correspondants. Aucun test de charge multi-connexion n’est revendiqué.

La sécurité Supabase ne présente aucun nouveau signalement Nexus ; voir `NEXUS-VALIDATION.md` pour les résultats préexistants et leurs références.

## Sauvegardes et suite

Source précédente : archive locale `outputs/kizuna-before-nexus-v28.zip` dans le workspace, commit `d8aa90f922e12e0b13c0b26857d5eeffd6235e34`. La migration conserve aussi les états et fonctions concernés dans une table privée. Aucun retour arrière ne doit écraser automatiquement les gains ultérieurs des joueurs.

Lot 2 restant : effets des rangs II à V, extension de stockage, bonus supplémentaires, fragments cosmétiques et récompenses d’albums/journalières/hebdomadaires.

Lot 3 restant : panel administrateur Nexus avancé, prestige final, statistiques avancées, finitions et validation visuelle/performance approfondie. La configuration du lot 1 est versionnée au serveur ; ces outils administrateur ne sont pas encore livrés.
