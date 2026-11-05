# Studio Kizuna — livraison du 4 novembre 2026

Cette livraison complète les outils d’administration après les vérifications des comptes, boosters, collection, aventure et marché. Elle conserve le site existant, ses comptes Discord et le projet Supabase partagé Yugen Manga RP.

## Utilisation

Ouvrir **Staff → Studio Kizuna** avec un administrateur. Préparer les champs, consulter l’aperçu, puis **Enregistrer le brouillon**. **Publier le brouillon** demande une confirmation et rend uniquement la version enregistrée disponible aux joueurs. Un changement non enregistré empêche la publication. Si un autre administrateur a enregistré entre-temps, un conflit de révision demande de recharger.

- Trois palettes : Nuit Kizuna, Aurore et Crépuscule. Les couleurs des raretés restent distinctes.
- Bannière d’accueil : titre, message, personnage du catalogue, destination et dates UTC. L’affichage suit les dates et l’activation enregistrées.
- Activation des constellations, missions, Voyage, Atelier, Sanctuaire et événements. Les opérations connectées sont contrôlées au serveur ; désactiver ne supprime pas la progression. La révocation d’un Sanctuaire public reste toujours accessible.
- Cartes éligibles à l’Éveil : toutes ou une sélection recherchable par personnage/anime. Les niveaux historiques sont conservés.
- Historique des 20 dernières versions affiché ; **Reprendre en brouillon** n’effectue aucune publication automatique. L’historique complet est conservé en base.
- Les événements, liens, missions et récompenses continuent d’être gérés dans **Staff → Aventure**. Les fonctions AniList, boosters, grades, Chakra, rerolls et suivi du marché restent disponibles dans leurs onglets existants.

Une publication est reçue au chargement, à la reprise de la fenêtre ou au rafraîchissement périodique d’une minute. Les dates de la bannière sont également vérifiées chaque minute. En cas d’erreur réseau, la dernière présentation connue reste affichée.

## Illustrations et fragments

Une illustration alternative utilise une URL HTTPS directe PNG, JPG, WebP ou AVIF et une URL de source/attribution. Le staff choisit la carte, son libellé, le niveau requis et valide l’illustration avant de l’activer. Le serveur refuse la publication d’une illustration active non validée. Aucun dessin n’a été arbitrairement déclaré approuvé : la configuration initiale n’en publie aucun.

Le joueur connecté choisit les variantes publiées depuis l’Atelier d’Éveil. Il doit posséder un exemplaire disponible et le niveau requis. L’apparence sélectionnée est personnelle, appliquée à l’Atelier et aux vignettes de cartes ; les images canoniques, les révélations de boosters, raretés, probabilités et statistiques ne changent pas. Les images restent hébergées à l’adresse fournie : leur disponibilité dépend de cet hébergeur.

Les **fragments d’Éveil restent désactivés par défaut**. Après activation et publication, un nouveau défi réclamé donne un fragment. Aucun ancien défi n’est recrédité. Deux fragments débloquent l’Éveil, cinq la Transcendance, avec un exemplaire disponible. La voie existante par 2 puis 5 exemplaires reste valable sans consommation. Les cartes réservées au marché ne satisfont pas la condition d’exemplaire disponible. Les répétitions d’une même récompense ou d’un niveau déjà obtenu ne débitent/créditent pas à nouveau. Aucun achat, échange de fragments, recyclage automatique ou conversion de Chakra n’est ajouté.

## Contenu ajouté

Deux constellations : Tanjiro/Nezuko et Ichigo/Rukia. Les relations s’appuient sur les fiches officielles [Demon Slayer](https://demonslayer-anime.com/hta/character/) et [Bleach](https://bleach-anime.com/en/character/), avec les identifiants exacts des cartes existantes.

Quatre missions ajoutées : trois personnages de Bleach, trois de Demon Slayer, cinq univers visités dans la semaine UTC et trois cartes éveillées. Le total est de **22 définitions publiques, dont 7 constellations**. Un **Festival des liens** est enregistré comme brouillon désactivé : le staff doit personnaliser son contenu et vérifier ses dates avant de le publier.

## Architecture, permissions et conservation

`schema/kizuna_studio.sql` ajoute la configuration publique en lecture seule, le brouillon privé et l’historique privé. Le RPC `kizuna_studio` relit le grade administrateur protégé à chaque appel. Joueurs, modérateurs et appels anonymes sont refusés. Les réponses arrivant après un changement de compte sont rejetées par le client. Les champs sont échappés dans le DOM. Les URL d’images sont validées sans téléchargement privilégié côté serveur.

L’ancienne fonction d’aventure est conservée comme `kizuna_adventure_core`, non exécutable par les rôles navigateur. Le nouveau point d’entrée vérifie les activités et l’éligibilité, puis utilise le verrou transactionnel commun à l’économie. Les illustrations et fragments sont stockés avec la progression cosmétique privée, pas dans l’inventaire économique.

`schema/kizuna_adventure_expansion.sql` insère seulement de nouvelles définitions, sans écraser celles portant déjà le même identifiant. Aucune migration ne réinitialise ou ne réécrit les collections, Chakra, stocks, garanties, annonces, historiques, rôles ou objets Yugen. Le contrôle final retrouve 2 profils, 2 sauvegardes économiques, 1 progression et 1124 cartes. La tâche du marché est active avec un dernier passage réussi. L’empreinte globale des sauvegardes a évolué pendant la session ; l’audit enregistre des opérations normales de rafraîchissement/récompenses et des ouvertures, donc elle n’est pas présentée comme identique avant/après.

## Validation et limites

- `check-studio.sql` : permissions réelles, brouillon privé, conflits, publication, approbation d’illustrations, interdiction du contournement par l’ancienne fonction, éligibilité, possession, fragments uniques, niveaux, restauration, refus des URL dangereuses, conservation économique et révocation du grade. Toutes les données temporaires sont annulées par rollback ; aucun compte de test ne subsiste.
- `check-adventure.sql` : régression des opérations et permissions existantes.
- `verify-studio`, `verify-studio-account` : aperçu, formulaire, recherche, confirmation, publication/restauration, planification, échappement, illustrations et fragments, compte changé, refus non-admin, réponse réseau périmée et conservation de l’inventaire.
- `verify-studio-backend`, `verify-adventure-backend` : lectures publiques réelles, 22 définitions publiées et refus HTTP 401 des RPC privés anonymes.
- Suites existantes comptes, interface, aventure/administration/communauté, staff, notifications, marché, boosters, collection, Wiki, fiche de carte, accueil et lot 1 : réussies.
- `verify-studio-build` : ressources présentes, syntaxe JS/CSS et compilation reproductible. Aperçu HTTP 200.

L’audit Supabase ne relève pas de nouvelle erreur : les informations RLS sans politique correspondent aux tables privées volontairement fermées. L’avertissement préexistant du projet partagé sur la protection des mots de passe reste inchangé ; Kizuna utilise Discord.

**L’inspection visuelle réelle sur ordinateur et mobile reste à effectuer avec l’accord préalable de l’utilisateur pour contrôler son PC.** Les tests DOM, CSS et HTTP ne remplacent pas ce contrôle. Aucune prise de contrôle supplémentaire n’a été effectuée après sa demande.

## Retour arrière

L’archive source préalable est `outputs/kizuna-before-advanced-v22.zip`, hors dépôt ; ce n’est pas une sauvegarde de la base. Le frontend Sites v22 reste compatible avec les ajouts. Pour revenir à sa présentation, republier v22 et conserver les nouvelles tables ainsi que les progressions. Ne pas supprimer les fragments ou illustrations acquis ni restaurer une ancienne sauvegarde économique.

Les fonctions du prompt initial disposent désormais de leurs parcours et outils de gestion. Les illustrations concrètes et les dates d’événements demandent ensuite un choix éditorial du staff. Un système de combat, seulement évoqué comme perspective, n’est pas ajouté à cette livraison.
