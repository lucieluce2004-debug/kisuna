# Ouverture par invocation — 4 novembre 2026

L’ouverture reprend le choix du joueur : un sceau anime, une montée d’énergie et la matérialisation des cartes. Le sceau est dessiné en SVG local ; les halos, anneaux, colonne et douze particules utilisent le CSS, sans nouvelle image ni dépendance réseau. Sur mobile, six particules sont affichées.

Le lancement dure 1,35 seconde : les anneaux accélèrent, l’énergie converge et l’emblème du booster disparaît dans une colonne lumineuse. « Passer l’invocation » termine immédiatement cette introduction. Fermer pendant l’introduction annule avant tout tirage. Une connexion lente conserve un état d’attente sans répéter les effets.

Les cartes réellement obtenues apparaissent ensuite dans l’ordre croissant de rareté. La matérialisation dure 650 ms pour les premiers niveaux, 850 ms pour une Épique, 1,1 seconde pour une Légendaire et 1,35 seconde pour une Mythique. Les anneaux de prestige sont réservés aux deux dernières raretés. Les commandes existantes permettent toujours de passer aux prochaines Épiques ou de tout révéler ; le mode rapide va directement au récapitulatif.

Le résultat économique reste indépendant de l’animation et est enregistré avant la révélation. Les protections contre le double-clic, les transitions périmées et le changement de compte sont conservées. Aucun changement des probabilités, garanties, stocks ou Résonances.

Les sons synthétisés, dont la nouvelle montée d’invocation, respectent le réglage existant : désactivés par défaut, aucun son avant un geste utilisateur réel. La réduction des animations, manuelle ou système, supprime les délais et les mouvements. L’introduction reste interruptible si cette préférence est activée en cours de route. Les effets lumineux sont progressifs, sans stroboscope ni secousse de l’écran.

Validation : `verify-boosters-v2`, `verify-mythic`, `verify-gaming-ui` et `verify-interface` passent. Les tests couvrent le sceau, l’absence d’effets Mythiques sur les cartes ordinaires, le saut d’introduction sans double tirage, l’annulation, le focus, les quantités, l’ordre des raretés, les préférences et l’isolation des comptes. Le nouveau CSS est analysé sans avertissement.

Limite : le rendu visuel et l’écoute n’ont pas été vérifiés dans un navigateur. Le navigateur installé n’est pas pris en charge par les contrôles d’URL de Computer Use ; l’aperçu local a également rencontré une restriction de connexion. Les tests DOM ne remplacent pas cette vérification.

Retour arrière : la version Sites 27, source `274ab529b1a6c89c5dc62ada32b102319b5c77dd`, conserve l’ouverture précédente et la correction de défilement des Éveils. Ne pas restaurer les données de joueurs pour revenir à cette présentation.
