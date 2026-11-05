# Livraison des illustrations des Éveils

Les 197 cartes mythiques du catalogue possèdent trois illustrations indépendantes, soit 591 fichiers WebP. Le portrait d’origine reste le niveau 0. Les illustrations officielles et les créations générées sont identifiées dans l’interface et dans `AWAKENING-ILLUSTRATIONS.md` ; les prompts des créations sont conservés séparément.

## Intégration

- Aucun identifiant de carte, palier de Résonance, déblocage, tirage ou solde n’est modifié.
- Les illustrations sont chargées à la demande. Les compositions compactes restent sans animation.
- Une erreur de chargement revient une seule fois au portrait original. Si celui-ci échoue aussi, un état indisponible remplace l’image.
- Le build refuse un catalogue où un niveau d’Éveil n’a pas d’illustration. Le collecteur refuse les identifiants et fichiers identiques.
- Les fichiers officiels gardent leurs proportions et leur transparence. Les créations utilisent une composition pleine carte.

## Contrôles reproductibles

`node scripts/verify-awakening-illustrations.mjs --complete` vérifie la couverture, les fichiers WebP, les empreintes, les associations personnage/niveau, le chargement différé, le repli et les portraits originaux.

`node scripts/verify-mythic.mjs` vérifie les aperçus, les déblocages, les niveaux choisis, les filtres et l’isolation des comptes sans modifier la production.

Les originaux ont été inspectés visuellement pendant la création. Les rapports locaux `outputs/illustrations/review-*.json` recensent les lots et leurs corrections. Le contrôle de rendu dans le navigateur reste limité par l’infrastructure de contrôle du navigateur disponible ; les tests DOM ne remplacent pas une validation graphique sur appareil.

## Retour arrière

La version Sites 24 et le commit `0a1ce03b3cd4c1b5e25559928074a2c9aae1578f` constituent le point de retour avant cette livraison. La sauvegarde source locale est `outputs/kizuna-before-illustrations-v24-source.zip` dans le dossier de travail parent. Un retour arrière doit republier la version de code voulue, sans restaurer les données des joueurs.
