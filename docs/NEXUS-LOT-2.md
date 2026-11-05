# Nexus des Destinées — livraison du lot 2

Le lot 2 active les vingt rangs restants : les 25 nœuds ont désormais des effets réels, calculés et enregistrés côté serveur. Les achats gardent les coûts, les niveaux requis et les prérequis de chaque branche. Les règles détaillées sont dans `NEXUS-LOT-2-BACKEND.md`.

- Invocation : jusqu’à quatre packs supplémentaires par jour et une capacité de recharge de 103 packs. L’augmentation de capacité ne distribue pas automatiquement des packs.
- Destin : vingt suivis prioritaires, statistiques de tirages et garanties, annonces du marché correspondant aux priorités et bilan de la wishlist.
- Résonance : fragments sur les doublons Mythiques, trois auras à acheter et équiper, animation de Résonance et présentation prestige des Mythiques entièrement éveillées.
- Collection : archives filtrables avec préférences enregistrées, bonus de recyclage jusqu’à 15 % sur les doublons et récompenses uniques pour 39 albums définis.
- Prestige : 25 Chakra quotidiens, un puis deux Coffrets Nexus hebdomadaires, titre et profil animés, récompense finale unique de 1 000 Chakra et cinq packs.

Les récompenses quotidiennes et hebdomadaires suivent l’heure de Paris ; la semaine commence lundi à minuit. Il n’y a pas de rattrapage ni de seconde récupération après une amélioration dans la même période. Les achats d’auras affichent le coût en fragments avant confirmation.

Le Coffret Nexus possède son propre stock et s’ouvre avec l’animation d’invocation existante. Les probabilités, garanties, Résonances et l’ordre de révélation du moins rare au plus rare sont conservés. La wishlist et les alertes marché déjà disponibles gardent leurs droits ; Destin V ajoute un suivi utile sans modifier les probabilités.

Les validations PostgreSQL et JavaScript passent ; leur portée et les limites de la vérification visuelle sont consignées dans `NEXUS-LOT-2-VALIDATION.md`. Les deux comptes et les 1 124 cartes existants sont conservés.

Sauvegardes : source v29 dans `outputs/kizuna-before-nexus-lot2-v29.zip` du workspace, commit `18fb9d472b48f4a123e145af8365ad5c4224271d`, et sauvegarde privée des fonctions et données concernées en base. Un retour arrière doit conserver les gains obtenus depuis la publication.

Le lot 3 reste à réaliser : panel administrateur Nexus avancé, enrichissement visuel et vérifications visuelles/performance approfondies. Il n’est pas présenté comme livré par cette version.
