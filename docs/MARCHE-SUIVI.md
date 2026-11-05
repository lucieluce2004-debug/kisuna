# Marché : règlement automatique et activité privée

Suite de la version 21, 4 novembre 2026. Le site existant, les comptes Discord, le catalogue, les soldes et les exemplaires sont conservés.

## Fonctions livrées

- La cloche affiche les annonces publiées, achats, ventes, échanges, mises, remboursements de surenchère ou achat immédiat, annonces retirées et cartes restituées à échéance. Les messages sont créés dans la transaction financière : une opération annulée ne laisse pas de fausse confirmation.
- Une nouvelle annonce correspondant à une carte de la liste d’envies sauvegardée déclenche un avis privé. Aucun événement historique n’est inventé. La sauvegarde des identifiants de cette liste a aussi été corrigée : une variable SQL masquait la colonne agrégée.
- Compteur de notifications non lues, filtre, pagination par curseur, lecture individuelle et lecture groupée limitée au dernier événement observé. Les lectures n’appliquent aucune sauvegarde économique et fonctionnent pendant une révélation de booster. Le carnet de découvertes reste accessible aux invités.
- Le job `kizuna-market-settlement` exécute `market_sweep()` chaque minute, sans session de joueur ni secret HTTP. Le même verrou transactionnel protège les requêtes de joueurs et le règlement planifié. Chaque passage traite au plus 100 annonces ; les autres restent pour les passages suivants.
- Si la collection de réception est pleine ou le solde du vendeur à sa limite, rien n’est perdu : carte et mise restent réservées, une notification explique l’action nécessaire et une nouvelle tentative se fait après une minute. Les erreurs techniques isolent la seule annonce concernée et sont réessayées après cinq minutes. Une file bloquée ne prive pas les autres annonces de traitement.
- Les annonces expirées encore réservées restent visibles dans **Mes annonces**, sans bouton d’achat actif. **Staff → Marché**, réservé aux administrateurs, montre le dernier succès du service, les annonces à régler et les causes d’attente.
- Missions et constellations ne relancent plus le défilement automatique en haut de page. L’option de conservation est transmise par les deux anciens adaptateurs de navigation ; les destinations principales conservent leur comportement habituel. Si le nouveau contenu est plus court que la fenêtre défilée, le navigateur peut naturellement limiter la position à sa hauteur disponible.

## Données et sécurité

Les ajouts résident dans `kizuna_private` : notifications et état du service. RLS est activé et les accès directs anonymes et authentifiés sont refusés. Le RPC public `kizuna_market_inbox` est invoker ; le helper privilégié contrôle l’identité et le profil. La supervision relit le grade administrateur dans la table protégée à chaque requête. Les fonctions de crédit et le job ne sont pas appelables par le navigateur.

Les réponses arrivant après un changement de compte sont ignorées et les vues privées effacées immédiatement. Le client échappe le contenu des notifications. Aucun e-mail, solde adverse, sauvegarde de tiers ou détail d’exception SQL n’est envoyé au joueur. Aucun réglage Auth, rôle existant ou objet Yugen n’est modifié.

SQL, dans l’ordre : `schema/kizuna_market_followup.sql`, `schema/kizuna_market_wishlist.sql`, `schema/kizuna_market_followup_validation.sql`, `schema/kizuna_market_followup_activate.sql`. Les migrations sont additives. Les modifications de la fonction économique vérifient leur point d’application avant de remplacer une expression précise.

La tâche native utilise pg_cron ; sa durée est limitée à 25 secondes. Les journaux de cron et les audits sont conservés ; surveiller leur croissance avant d’établir une politique de rétention. Référence : [Supabase Cron](https://supabase.com/docs/guides/cron). Les avis RLS sans politique sont attendus pour ces tables privées fermées ([documentation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).

## Validation

`check-market-followup.sql` utilise des identités temporaires dans une transaction intégralement annulée : wishlist validée, notifications et véritables remboursements concordants, règlement sans JWT, exemplaire et date conservés, absence de double crédit, 101 annonces bloquées sans famine des autres, reprise après place libérée, notifications sans répétition, pagination, lecture limitée au propriétaire, borne de lecture groupée, contrôle administrateur et refus des helpers. `check-economy.sql` et `check-economy-permissions.sql` couvrent les régressions de tirage, achat, échange et permissions.

Les tests DOM vérifient la navigation sans scroll, les notifications, les erreurs et reprises, l’échappement, les changements de compte, la révocation du rôle, le carnet invité et l’absence de mutation de la collection lors d’une lecture. Les contrôles existants comptes, économie, staff, aventure et interface restent applicables. La validation DOM ne remplace pas une inspection visuelle réelle sur mobile et ordinateur, indisponible ici.

L’archive source préalable est `outputs/kizuna-before-market-followup-v21.zip` hors dépôt ; elle ne constitue pas une sauvegarde de la base. En cas d’incident, suspendre uniquement le job nommé Kizuna et conserver annonces, notifications et audits. Revenir au frontend v21 reste compatible avec ces ajouts. Ne jamais rétablir les écritures libres de sauvegardes antérieures à v21.

## État du prompt d’ensemble

Les lots visuels 1–2, l’aventure et la personnalisation des lots 3–6, puis le marché autoritaire sont documentés dans les rapports précédents. Cette livraison ferme le règlement hors connexion et le suivi privé du marché. Les événements sont configurables par le staff ; leur liste peut être vide tant qu’aucun événement réel n’est publié.

Les possibilités évoquées à terme dans le prompt restent distinctes : illustrations alternatives validées par l’équipe, nouvelle monnaie de fragments d’Éveil, moteur de combat et éditeur général de thèmes/bannières. Aucun de ces systèmes n’a été simulé ou annoncé comme opérationnel. L’Éveil actuel est cosmétique, sans consommation, et les thèmes du Sanctuaire sont disponibles dans sa galerie.
