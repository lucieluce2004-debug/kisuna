# Direction artistique — phase C

Version préparée le 4 novembre 2026, à partir de la publication 33.

## Livré

- Nexus : arbre à cinq branches et 25 nœuds du modèle existant, cristal, racines, fond original, détails de coût et prérequis, autel et coffres, galerie des Éveils. Vue liste conservée.
- Éveils : scène de transformation, sélection de personnages conservée, quatre aperçus (portrait original + trois formes), états verrouillés, débloqués et équipés, progression réelle.
- Anomalies : identités Convergence, Éclipse et Nocturne, défis illustrés selon le type de récompense, compte à rebours, archives des événements terminés, état vide honnête.
- Missions : carnet, chapitres et filtres selon la progression réelle, reçus après récompense acceptée.
- Constellations : atlas, portraits reliés suivant les liens existants, progression et titre.
- Voyage : 39 albums réels comme destinations, recherche et pages d’univers.

Aucune modification des raretés, probabilités, prix, seuils, soldes, inventaires ou règles serveur. Aucune migration ni écriture Supabase. Les données de démonstration sont limitées au serveur QA local hors du dépôt et ne sont pas publiées.

## Corrections issues de la QA

- Les sections héritées encyclopédie et tutoriel ne s’affichent plus au-dessus des pages aventure.
- Les messages de secours des miniatures d’Éveil apparaissent seulement après une erreur d’image.
- Les boutons de destination restent à la largeur de leur colonne sur ordinateur et mobile.
- Les reçus de mission disparaissent correctement après une actualisation.
- La navigation supérieure suit les sous-pages aventure.

## Vérification

Build réussi. Quatorze suites passées : interface, art-shell, gaming-ui, anomalies, art-anomalies, adventure, art-adventure, adventure-community, mythic, art-awakening, nexus, nexus-lot2, nexus-lot3 et art-nexus.

Les tests couvrent notamment : succès confirmé avant célébration, refus, attente, répétition, réponse d’un ancien compte, période incorrecte, conservation du snapshot économique complet, focus et position des sélecteurs, mouvement réduit, erreurs d’images, archives non réclamables et absence de fausse progression.

Inspection dans le navigateur intégré avec données locales, aux largeurs 360, 390, 900, 1280 et 1440 pixels. Écrans Nexus, Éveils, Anomalies, archives, missions, constellations et Voyage inspectés ; achat de lien, cadeau quotidien et récompenses testés uniquement sur les simulations locales. Aucun débordement horizontal sur les destinations après correction. Console locale sans erreur à la fin.

Captures de preuve dans le dossier outputs du workspace : kizuna-art-c-nexus.png et kizuna-art-c-constellation.png. Le bandeau des captures identifie les données de démonstration.

## Illustration originale

Fichier intégré : `dist/assets/art/kizuna-nexus-grove-v1.png`.
Mode : outil ImageGen intégré, génération originale. Format PNG, 1536 × 1024. Aucun rendu CLI, aucune image de référence. Décor uniquement ; arbre et nœuds sont interactifs et dessinés par l’interface.

Prompt utilisé :

> Use case: stylized-concept. Create an original richly hand-painted anime fantasy game background, landscape 1536x1024, for the KIZUNA Nexus progression tree. A vast ancient celestial grove inside a dark blue enchanted cavern: immense pale weathered roots and elegant branching silhouettes framing ONLY the far left and far right edges, a small distant ruined stone arch, soft deep teal mist, distant silver stars, tiny subtle gold lights in the moss and a calm circular stone floor at the bottom. The central two-thirds should be an almost empty low-contrast dark ink-blue space, with beautiful hazy depth, where an interactive luminous tree and crystal will be drawn separately using code. Do NOT paint the central tree, nodes, crystal, icons, interface, characters, text, letters, numbers or symbols. Asymmetric natural silhouette framing, evocative Japanese fantasy illustration, restrained atmospheric cyan and warm gold, dark readable values. Clear difference from an observatory sky terrace: this is a secluded subterranean grove. No purple wash, no bright central object, no UI mockup, no photorealistic render, no confetti. Original game scenery only.

## Suite du brief

La refonte globale n’est pas déclarée terminée. Phase D : profil, Sanctuaire, encyclopédie, univers, marché, classements et communauté. Phase E : harmonisation générale, animations, accessibilité, responsive, performances et vérifications transversales.

