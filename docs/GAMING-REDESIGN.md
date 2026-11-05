# Kizuna — refonte gaming, 4 novembre 2026

Le projet existant conserve son catalogue, ses comptes Discord, ses sauvegardes et son économie. Cette livraison applique la demande `message3.txt` après la publication des 591 illustrations d’Éveil.

## Changements livrés

- **Lobby** : grand paquet illustré au centre, cartes en éventail ouvrant de vraies fiches, progression réelle, reprise d’album et raccourcis vers le quotidien, les missions, le Sanctuaire et les Anomalies. L’aperçu du paquet ne dépense rien.
- **Boosters** : grandes pochettes illustrées avec les logos existants, rail tactile avec boutons précédent/suivant, sélection visible et aperçu de trois personnages réellement éligibles au paquet choisi. Les illustrations d’Éveil sont annoncées comme des aperçus.
- **Ouverture** : retournement en profondeur, dos de carte, révélations Légendaire et Mythique plus marquées, indicateur de nouvelle carte et récapitulatif. Le moteur enregistre toujours le résultat avant la présentation ; passer, fermer ou accélérer ne change pas le tirage.
- **Albums** : classeur de huit cartes par page, commandes en haut et en bas, mode grille, pochettes, silhouettes pour les cartes manquantes et filtres conservés. Les albums restent classés par ordre alphabétique. Une acquisition récente éclaire son emplacement ; un passage réel à un album complet déclenche une célébration.
- **Profil** : cadre de profil, couleurs des statistiques, compteurs animés, vitrine conservée et trois repères calculés à partir de la collection réelle. Ces repères visuels n’accordent aucune récompense supplémentaire.
- **Ensemble du site** : navigation expressive, boutons avec retour de pression, marché façon boutique, podium honnête sans joueurs fictifs, Wiki, aventure, staff et fenêtres harmonisés. Les choix de thème du Studio restent disponibles.
- **Préférences** : sons synthétisés originaux, désactivés par défaut et impossibles avant une interaction utilisateur réelle. Réglage de réduction des animations commun aux pages et aux ouvertures, respect du système et suppression du défilement animé quand demandé.
- **Isolation** : les effets de nouvelle carte, de fin d’album et les compteurs se réinitialisent au changement de compte. Une synchronisation initiale ne simule pas une nouvelle récompense.

## Invariants conservés

Aucune modification des identifiants de cartes, raretés, probabilités, garanties, paliers d’Éveil, Résonances, Chakra, stocks, mécanismes de marché ou autorisations serveur. Aucun changement de schéma ni écriture de données de production pour cette refonte. Les 591 WebP d’Éveil de la version 25 sont réutilisés ; les portraits originaux restent accessibles.

Les images sont locales ou issues du catalogue existant, chargées à la demande avec dimensions explicites. Les effets d’inclinaison suivent uniquement le pointeur et ne créent pas de boucle d’animation permanente.

## Vérifications effectuées

Construction complète réussie. Les 14 scripts suivants passent sur la version finale :

`verify-gaming-ui`, `verify-home`, `verify-boosters-v2`, `verify-collection-v2`, `verify-wiki-v2`, `verify-card-viewer-v2`, `verify-interface`, `verify-adventure`, `verify-anomalies`, `verify-mythic`, `verify-economy-interface`, `verify-staff-panel`, `verify-studio`, `verify-market-inbox`.

Ces contrôles couvrent notamment la pagination et le focus du classeur, les filtres, la nouvelle carte après changement de vue, le vrai passage à un album complet, les préférences partagées, l’absence de son automatique, l’ordre des raretés, le double-clic, l’annulation, les lots rapides, les changements de compte, l’isolation des rôles et l’absence de modification économique lors de la consultation. Les tests utilisent des données en mémoire ; ils ne créent pas de comptes ni de transactions réels.

Le CSS est analysé sans avertissement et possède des adaptations à 1100, 800 et 560 px. **La validation graphique dans un navigateur sur ordinateur et mobile n’a pas pu être effectuée** : l’outil Computer Use disponible refuse les contrôles d’URL du navigateur Firefox installé. Les tests DOM et CSS ne remplacent pas une vérification visuelle sur appareil. Les sons sont protégés par un geste réel ; leur écoute n’a pas été validée par ces tests automatisés.

## Retour arrière

La version Sites 25 contient les illustrations complètes avant la refonte gaming : source `031db3c4ec9621c16f251db542fdf6aca61b6b28`.

Sauvegarde locale : `C:/Users/jothe/Documents/ChatGPT/LSPD/outputs/kizuna-before-gaming-v25-source.zip`. L’archive de déploiement correspondante est `C:/Users/jothe/Documents/ChatGPT/LSPD/outputs/kizuna-awakening-illustrations-v25.tar.gz`.

Pour revenir à la présentation précédente, republier la version Sites 25. Ne pas restaurer de données de joueurs ni de base de données : la refonte ne les a pas modifiées.
