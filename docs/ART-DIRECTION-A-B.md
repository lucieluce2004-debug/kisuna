# Kizuna — refonte artistique, phases A et B

Date : 4 novembre 2026. Projet existant : `appgprj_6aea56ac83dc81919ebba2d954130f62`.

## Périmètre et sauvegarde

Le brief demande de commencer par l’audit puis A et B, en préparant les phases suivantes. Cette livraison ne termine donc pas la refonte intégrale : C, D et l’harmonisation finale E restent à développer.

Point de départ : version publiée 32, commit `d4659dccde4383a9b787c4499d0c4d587e99887b`. Une archive Git complète des fichiers suivis a été créée avant toute modification : `outputs/kizuna-before-art-ab-v32.tar` (dans le workspace parent). Aucun schéma, compte, rôle, solde, inventaire, condition d’Éveil ou paramètre économique distant n’est modifié par cette refonte. Le système connecté reste autoritaire côté serveur.

## Audit de toutes les surfaces

| Surface | Constat initial | Traitement |
| --- | --- | --- |
| Navigation, boutons, réglages, notifications | Superposition de thèmes, barres denses sur petit écran | A : tokens, typographies, rail et dock, menu complet, focus, réglages existants préservés |
| Lobby | Grand panneau booster et colonne de boîtes, peu de profondeur | B : observatoire illustré, invocation centrale, favori possédé, progression et accès rapides |
| Boosters gratuits, quotidiens, boutique et personnalisés | Carrousel fonctionnel, lecture visuelle répétitive | B : vrais sachets, scène et sélection, stock/coût/garanties conservés |
| Invocation et résultats | Séquence déjà fiable, apparence de médaillon | B : paquet, déchirure, retournement, effets Légendaire/Mythique, récapitulatif |
| Collection, albums et fiches | Inventaire robuste mais présentation utilitaire | B : couvertures, livre, folios, grille pratique et dossier de personnage |
| Nexus, récompenses, Résonances | Systèmes existants et cinq branches fonctionnels | C : conserver les données, reconstruire la scène et les coffres avec identité propre par branche |
| Éveils mythiques | Variantes et conditions existantes | C : mise en scène de transformation, célébration, galerie prestige |
| Anomalies, missions, Voyage, constellations | Listes et panneaux existants | C : événements et cartes de missions distincts, sans inventer d’activité |
| Profil et Sanctuaire | Profil, préférences et décor existants | D : identité du joueur et composition personnelle |
| Wiki et Univers | Recherche et navigation d’albums disponibles | D : exploration visuelle par univers, préserver recherche et alphabet |
| Marché, ventes, enchères, échanges, suivi | Transactions et modales existantes | D : salle de marché, préserver confirmations, réservations et autorisations |
| Classement et Communauté | Données réelles, états vides | D : podium et espaces sociaux sans faux joueurs |
| Staff, studio, admin Nexus et interfaces secondaires | Outils fonctionnels | D/E : harmonisation après les écrans joueurs, conserver les contrôles d’accès |
| Mobile, clavier, performance, mouvements | Adaptations existantes, styles cumulés | Vérification A/B maintenant ; E demeure une passe globale sur toutes les phases |

## Phase A — fondations

`dist/kizuna-art.css` centralise les tokens : encre `#080e1b`, ivoire `#fff5dc`, or `#ffcf63`, turquoise `#65ead7`, corail `#ff7185`. Rajdhani sert aux titres et Manrope à la lecture. Les fontes restent locales. La couleur d’accent varie selon la destination ; les raretés gardent leur propre couleur.

Navigation : rail vertical sur ordinateur, barre horizontale sur tablette, quatre destinations principales plus « Tout » sur mobile. Le menu complet utilise un dialogue natif, les API de navigation existantes et un retour du focus. Staff n’apparaît que si son entrée autorisée existe. Le menu ne confère aucun droit.

Composants réutilisables : `.kza-button-primary`, `.kza-button-secondary`, `.kza-tabs`, `.kza-progress`, `.kza-rarity`, `.kza-reward`, `.kza-mission`, `.kza-new`, `.kza-navigation`. Les célébrations et compteurs réels déjà présents restent disponibles via `KizunaExperience`. Les info-bulles de navigation emploient `title`, complétées par des noms accessibles explicites.

Les boutons ont un état survol/appui et un focus visible. Les animations sont désactivées par `prefers-reduced-motion` et le réglage Kizuna. Les sons existants restent facultatifs, désactivés par défaut et démarrent après une interaction.

## Phase B — expérience principale

Le lobby utilise un décor original d’observatoire et organise les actions autour du booster. Le personnage favori provient des cartes possédées ; sa préférence est cosmétique, locale et isolée par compte. Sa sélection, sa désactivation et les transitions de compte ne modifient pas le snapshot économique. Les réactions partent d’événements et de changements réels ; aucune réplique narrative inventée n’est ajoutée.

Les boosters gardent le moteur de tirage, le tri croissant des raretés, les garanties et l’acquittement serveur. La mise en scène s’appuie sur des sachets illustrés, un sceau, une ouverture puis des cartes qui se retournent. Les résultats exceptionnels n’apparaissent qu’après le tirage réel. Aperçu sans dépense, fermeture avant tirage, modes rapide, passer et ouverture multiple sont conservés.

La collection comporte des couvertures illustrées classées A–Z, un classeur de huit cartes, des pages numérotées, des emplacements manquants et une grille de 60 cartes avec chargement supplémentaire. Le viewer grand format conserve les états possédé/réservé, les détails, les variantes et les actions existantes. Les mouvements de pages ne doivent pas déclencher un défilement de document.

## Contrats pour C et D

- Les changements visuels passent par les données et événements existants. Aucun écran ne synthétise de solde, tirage, score, événement ou joueur.
- Les cinq accents du Nexus doivent rester distincts : Invocation or/ambre, Destin violet/indigo, Résonance rose/pourpre, Collection émeraude, Prestige bleu/argent.
- Les objets économiques restent gouvernés par les modules et fonctions serveur existants ; les composants visuels sont passifs.
- Les dialogues restaurent le focus. Toute action distante garde ses états attente/erreur et son verrou anti-double envoi.
- Les animations concernent la scène ou la sélection, jamais l’ensemble d’un catalogue de centaines de cartes.

## Vérifications

15 suites exécutées avec succès : `verify-interface`, `verify-home`, `verify-art-shell`, `verify-art-lobby`, `verify-collection-v2`, `verify-card-viewer-v2`, `verify-albums`, `verify-gaming-ui`, `verify-boosters-v2`, `verify-booster-carousel`, `verify-reveal-order`, `verify-art-boosters`, `verify-free-stock`, `verify-economy-interface`, `verify-rarity`.

Elles couvrent les 16 destinations du menu (plus Staff conditionnel), le focus, le favori possédé et l’isolation des comptes, l’absence de réaction fictive au chargement, les événements réels dédupliqués, l’aperçu sans dépense, l’annulation et le double clic, les lots de 25/50 cartes, le tri stable de rareté, le stock supérieur à dix conservé, les garanties, les filtres et les réservations. La simulation de rareté utilise 100 000 ouvertures de test. Les scénarios passent sans erreur applicative. Les quatre nouvelles feuilles CSS sont parsées sans avertissement ; build et vérification du diff réussis.

Contrôle visuel effectué dans le navigateur intégré, en aperçu isolé (requêtes distantes bloquées, comptes et soldes de démonstration). Formats observés : ordinateur 1280 × 720, tablette 900 × 900, mobiles 390 × 844 et 360 × 800. Pas de débordement horizontal du document sur les vues contrôlées. Navigation, choix de favori, albums A–Z, album Naruto, grand viewer, carrousel Mix, invocation et récapitulatif ont été parcourus. Les contrôles des animations exceptionnelles Légendaire/Mythique et des lots complets sont automatisés ; le parcours tactile a utilisé un tirage local ordinaire.

Corrections issues du navigateur : CTA du lobby visible dans le premier écran (bas à 605 px sur 720), contrôles d’ouverture placés en tête du dossier booster (haut à 229 px), contraste renforcé sous les titres des couvertures, portrait de révélation restauré dans son conteneur flex (hauteur observée 215 px), dialogues au-dessus de la navigation, arrivée au début d’un nouvel album et retour vers sa couverture. Feuilleter ou actualiser un album ne force pas ce déplacement.

Les modules serveur, comptes, bridge économique et règles de rareté n’ont aucun diff. Aucun nouveau test de charge multi-joueurs distant n’était requis pour ces seuls changements de présentation. La vérification visuelle globale des écrans C/D et une mesure complète des performances restent dans E.

## Illustration

Décor : `dist/assets/art/kizuna-observatory-v1.png`, original généré avec l’outil ImageGen, 1536 × 1024. Aucun personnage, logo ni texte généré dans le décor. Les paquets, portraits et contrôles sont des éléments séparés. Voir `ART-ASSET-PROMPT.txt` pour le prompt exact.
