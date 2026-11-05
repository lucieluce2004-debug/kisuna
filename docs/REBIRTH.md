# KIZUNA Rebirth — étapes 1 et 2

Cette livraison transforme le lobby et les invocations, et établit les composants de présentation pour la suite. Les étapes 3 à 6 restent à développer. Base : `e8e8460`, dernier `origin/main` récupéré avant intervention ; le changement récent de `kisuna.html` est conservé.

## Audit réel et inventaire

Application JavaScript sans framework : HTML livré dans `dist/index.html`, modules IIFE, fragments `src/` réinjectés par les scripts de build. Supabase 2.118.0, esbuild 0.28.2, jsdom 26.1.0. `kisuna.html` est une ancienne entrée distincte : le serveur documenté sert `dist/`. Aucun nouveau moteur ou framework.

Le navigateur Chromium a parcouru dix destinations aux formats 1600×1000, 1280×800 et 390×844 avant/après. Captures complètes dans `outputs/rebirth/` (locales) ; comparaisons du périmètre livré ci-dessous.

| Destination / entrée | Fonctions conservées | Diagnostic / suite |
| --- | --- | --- |
| Accueil `home` | Booster vedette, favori possédé, progression, reprise album, catalogue | Plusieurs invitations concurrentes et longue page ; scène unique, carnet repliable et trois raccourcis livrés |
| Boosters `boosts` | Catalogue, stock, catégories, probabilités, garanties, ouvertures 1/5/10 | Grands paquets concurrents et panneau statistique ; paquet actif sur autel, rail compact, détails à la demande livrés |
| Collection `col` | Grille, albums, recherche, filtres, fiches, vente, échange, recyclage | Densité des outils ; composition de classeur à développer à l’étape 3 |
| Univers `universes` / Wiki `wiki` | Albums, progression, catalogue et recherche | Tuiles répétitives ; portails de mondes / encyclopédie à développer |
| Nexus `nexus` | Branches, achats, niveaux, bonus, coffre | Scène et arbre existants ; approfondissement spatial prévu à l’étape 4 |
| Aventure | Missions, constellations, voyage, Éveils, Sanctuaire | Sous-vues dynamiques via `KizunaAdventure.navigate`, toutes accessibles depuis Explorer |
| Anomalies | Événements via `KizunaAnomalies.open` | Panneaux dynamiques conservés ; décor propre à développer |
| Marché `market` | Acheter, vendre depuis collection, enchères, échanges, suivi | Sections économiques denses ; composition en comptoirs prévue à l’étape 5 |
| Profil `profile` | Compte, collection et identité | Carte de joueur à approfondir |
| Communauté / classement | Espaces et indicateurs existants | Aucun faux profil ou indicateur ajouté |
| Staff / administration | Entrées soumises au rôle existant | Filtrage préservé ; aucun privilège ajouté |

Le décor d’observatoire, les éventails de cartes, les rails et les règles de mise en page `!important` s’accumulaient entre plusieurs feuilles artistiques. Rebirth remplace la composition des deux scènes ; les anciennes feuilles restent nécessaires aux autres pages. Le rail, les dialogues et le moteur de révélation restent des composants utilisés, pas du code mort à supprimer. Aucune suppression spéculative de module.

## Langage artistique et composants

**Anime Arcade Fantasy** : une cité-sanctuaire japonaise, portail cyan, lanternes chaudes, îles suspendues et autel central. Décor original généré pour ce projet, converti en WebP de 444 Ko. Aucun téléchargement de nouveau portrait de personnage. Le même lieu relie lobby, sélection et révélation pour cette étape ; les autres zones auront leurs décors distincts dans les prochains lots.

Tokens : nuit `#101326`, panneau `#14243b`, texte `#f7f4ff`, signal cyan `#57d9ef`, action/récompense or `#ffc96b`. Les couleurs de rareté du moteur sont conservées. Typographies locales existantes réutilisées.

- GameNavigation : cinq destinations Accueil, Boosters, Collection, Nexus, Marché ; barre inférieure mobile. Explorer garde toutes les destinations secondaires et le contrôle d’accès Staff.
- SceneBackground / BoosterStage : scène responsive et autel du paquet sélectionné, sans écriture d’état joueur.
- GameButton : action dominante, appui tactile, focus visible ; états désactivés gérés par le moteur existant.
- Disclosure : éléments `details/summary` natifs pour collection, catalogue, probabilités, ouvertures multiples et actions du récapitulatif. Déplacement des nœuds existants, conservation de leurs écouteurs et identifiants.
- RewardReveal / RarityEffects : décor continu pendant la séquence, lumière liée au rituel et traitement doré des Mythiques. Le moteur existant gère paquet, révélation, ordre des raretés et récapitulatif. Les résultats ne sont pas recalculés par la présentation.
- PlayerShowcase : favori réel et réglages existants conservés ; état collection vide explicite.
- Accessibilité : contraste sur panneaux opaques, boutons natifs, Échap et retour de focus du dialogue existant, préférences de mouvement et de son existantes. Aucun son automatique ajouté.

À reprendre dans les étapes suivantes : bibliothèque à pages pour Collection, arbre ramifié pour Nexus, bazar pour Marché, vitrines pour Sanctuaire, parchemins pour Missions. Ne pas multiplier les particules : seulement le paquet actif flotte, et l’effet peut être désactivé.

## Validation

Exécutés avec Node 24, npm 11 et Chromium système :

- `npm run build` et `npm test` : réussite ; 1 124 cartes, scénario d’ouverture et absence d’erreurs applicatives.
- `node scripts/verify-home.mjs` : réussite finale. Une première exécution avait échoué sur la comparaison globale du snapshot ; une instrumentation des clés modifiées n’a pas reproduit de différence, puis le test original et la validation finale ont réussi. Ce contrôle dépend de l’initialisation asynchrone et reste à surveiller.
- `node scripts/verify-reveal-order.mjs` : ordre, identité, badges et entrée inchangée.
- `node scripts/verify-booster-carousel.mjs` : sélection, focus, défilement et économie.
- `CHROMIUM_PATH=/usr/bin/chromium node scripts/verify-rebirth.cjs` : cinq routes principales, menu secondaire, Échap, probabilités, annulation sans débit, cinq acquisitions pour un booster, Chakra inchangé, rechargement persistant, absence de débordement sur trois formats, préférence de mouvement réduit, aucune erreur JavaScript.

Le test navigateur requiert Playwright (disponible dans l’environnement cloud) et `npm run preview:local` en fonctionnement. La variable optionnelle `CHROMIUM_PATH` évite de télécharger un navigateur quand Chromium est installé. Les captures sont produites dans `outputs/rebirth`.

Limites : validation en mode invité local. Les transactions serveur, OAuth réel, achats Nexus, enchères multijoueurs et Éveils débloqués sur un compte de production n’ont pas été exercés. Ils ne sont pas modifiés par ce lot. Certains portraits AniList distants sont indisponibles dans cet environnement ; un visuel de remplacement explicite est désormais présenté pendant la révélation. Aucun benchmark de fluidité sur appareil physique ; validation responsive dans Chromium.

## Comparaisons

| Écran | Avant | Après |
| --- | --- | --- |
| Lobby desktop | [Avant](rebirth/before-desktop-home.webp) | [Après](rebirth/after-desktop-home.webp) |
| Invocations desktop | [Avant](rebirth/before-desktop-boosts.webp) | [Après](rebirth/after-desktop-boosts.webp) |
| Lobby portable | [Avant](rebirth/before-laptop-home.webp) | [Après](rebirth/after-laptop-home.webp) |
| Invocations portable | [Avant](rebirth/before-laptop-boosts.webp) | [Après](rebirth/after-laptop-boosts.webp) |
| Lobby mobile | [Avant](rebirth/before-mobile-home.webp) | [Après](rebirth/after-mobile-home.webp) |
| Invocations mobile | [Avant](rebirth/before-mobile-boosts.webp) | [Après](rebirth/after-mobile-boosts.webp) |

[Révélation dans le nouveau décor](rebirth/after-reveal.webp).

Fichiers centraux : `dist/kizuna-rebirth.js`, `dist/kizuna-rebirth.css`, `dist/kizuna-art.js`, `dist/assets/rebirth/`, `scripts/verify-rebirth.cjs`. Intégration dans `dist/index.html` et `src/style-bundles.json`, bundle CSS régénéré. Pas de modification des probabilités, coûts, migrations, snapshots ou données de joueurs. Aucun déploiement.
