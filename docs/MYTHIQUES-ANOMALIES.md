# Éveils mythiques et Anomalies — livraison du 4 novembre 2026

Le catalogue comprend 1 124 cartes et 197 Mythiques. Les **197 Mythiques possèdent chacune trois Éveils**, soit **591 compositions SVG** effectivement présentes dans `dist/assets/awakenings`. La liste exhaustive, avec les identifiants, les trois noms et les motifs propres à chaque personnage, figure dans [MYTHIC-ART-CATALOGUE.md](MYTHIC-ART-CATALOGUE.md).

## Ce qui est réalisé

- Révélation, Ascension et Transcendance : compositions différentes, halos, portiques, cadres, motifs de personnage et particules. 45 familles de motifs et sept mouvements. Les portraits existants sont conservés ; il ne s’agit pas de nouvelles illustrations de personnages.
- Atelier avec aperçu de l’original et des trois Éveils, recherche par personnage/anime, compteurs, verrous et sélection persistante. Les aperçus verrouillés sont consultables ; le serveur refuse leur activation.
- Résonance autoritaire par identifiant exact, uniquement sur les doublons obtenus dans les boosters. Première copie : zéro. Chaque doublon suivant : un, y compris dans une même ouverture multiple. Les exemplaires ne sont pas consommés.
- Seuils initiaux 1 / 3 / 6, modifiables dans Staff → Anomalies & Éveils. Un seuil relevé ne retire aucun Éveil. Un niveau débloqué reste acquis après une vente, un échange ou un recyclage.
- Indications et célébrations pendant les ouvertures, compatibles avec les commandes pour passer la révélation. Filtres de collection, composition sélectionnée dans les fiches et sur les cartes exposées du profil. Aucun bouton d’Éveil sur les autres raretés.
- Page Anomalies : périodes calculées avec l’heure serveur, compte à rebours, progression réelle, trois niveaux de difficulté, récompenses uniques et six types de cosmétiques équipables sur le profil ou les cartes.
- Admin : brouillons privés, formulaire de défis, choix des personnages et animes, illustration avec source, trois ambiances, aperçu privé, publication/programme, activation, participants paginés et archivage. Après le début, les dates et conditions publiées sont figées.
- Animations désactivables depuis l’Atelier et les Anomalies ; préférence système de mouvement réduit respectée. Les cartes en grille restent statiques.

## Pilote réel

**Convergence des Univers** : du 4 novembre 2026 à 10:06:21 UTC au 11 novembre 2026 à 10:06:21 UTC. Ces dates proviennent du serveur. Six défis : ouvrir trois boosters ; obtenir cinq personnages distincts ; découvrir trois animes ; obtenir dix doublons ; gagner une Résonance ; débloquer un Éveil. Les deux derniers sont des défis Prestige facultatifs. Récompenses indépendantes : insigne, titre, fond, décoration, effet de carte et cadre. Aucun gain de Chakra ni changement de probabilité.

Aucune participation, récompense ou progression de joueur n’a été préremplie. Les défis commencent à la publication et au début effectif de l’événement. Les récompenses doivent être réclamées avant sa fin ; les cosmétiques obtenus sont ensuite conservés.

## Sauvegarde et compatibilité

- Sauvegarde des sources avant modification : `outputs/kizuna-before-mythic-v23.zip`, dans le dossier de travail parent.
- Copie privée des fonctions antérieures : `outputs/kizuna-before-mythic-functions.sql`.
- Instantané privé serveur `kizuna_private.kizuna_mythic_release_backup` : états des joueurs, progression d’aventure et configuration du studio avant la migration. Aucun accès public.
- Migrations additives : `kizuna_mythic_resonance`, `kizuna_mythic_compatibility`, `kizuna_anomalies`, `kizuna_anomalies_validation`, `kizuna_anomalies_feature_guard`, puis `kizuna_anomaly_pilot`.
- Les deux profils et les deux sauvegardes existants sont conservés. Les collections, soldes, stocks, historiques et annonces ne sont pas réinitialisés. Les fonctions d’ouverture conservent leurs probabilités, garanties et compteurs de pity ; seule une écriture atomique du journal et des Résonances est ajoutée après le tirage.
- Les anciens Éveils sont migrables sans inventer de Résonances ; aucun Éveil antérieur n’était détenu dans les deux sauvegardes inspectées. Les Résonances démarrent avec les nouveaux tirages serveur. Les anciens historiques locaux ne sont pas considérés comme une preuve d’obtention.
- L’ancien déblocage par copies/fragments est refusé côté serveur. Les valeurs historiques du studio et les fragments acquis sont conservés. Les missions et le Sanctuaire continuent à reconnaître les nouveaux Éveils.

## Vérifications effectuées

Tests SQL dans des transactions annulées : premier exemplaire, copies du même booster, ouverture de 25 cartes, répétition idempotente, seuils, limite des niveaux, activation verrouillée, refus des autres raretés et de l’ancien déblocage ; conservation après recyclage, prise en compte des copies réservées, achat sans Résonance ; droits administrateurs ; progression temporelle des défis, récompense unique, cumul de cosmétiques, publication différée, désactivation globale et individuelle, expiration, archivage, révocation du grade et séparation des comptes. L’économie et ses permissions passent également leurs suites existantes.

Tests JavaScript avec le DOM complet : Atelier, collection et filtres, aperçu des trois niveaux, original, connexion requise, réponse tardive d’un ancien compte, ouverture et célébration passée ; formulaire admin, prévisualisation sans publication, brouillon, programmation, participants et seuils ; récompense et équipement ; absence de boucle de rendu ; échappement du texte. Régressions vérifiées sur les comptes Discord, le panel staff, les boosters, leur ordre de rareté, la collection, les albums, le Wiki, les fiches et leur navigation clavier, le marché, les missions, les constellations et la conservation du défilement.

Construction reproductible, syntaxe JavaScript/CSS, 591 SVG et 788 états graphiques validés. Les 44 portraits distants existants ont répondu en image aux vérifications HEAD, sans téléchargement. Vérifications REST réelles : 197 fiches de trois niveaux, seuils publiés, événement réel sans données personnelles, refus HTTP 401 des appels anonymes aux deux fonctions privées.

L’audit Supabase ne signale pas de faille nouvelle sur ces fonctions. Les tables privées sans politique publique sont volontairement fermées et accessibles uniquement via les fonctions autorisées. La [protection des mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) reste désactivée dans le projet partagé ; Kizuna utilise Discord et ce réglage global n’a pas été modifié. Les index de suivi nécessaires aux nouveaux journaux sont présents.

## Limites explicites

Le contrôle visuel ordinateur/mobile **n’a pas pu être effectué** : après l’accord de l’utilisateur, Computer Use a arrêté la session car la vérification de sécurité des URL n’est pas prise en charge avec Firefox sous Windows. Aucun autre contrôle du navigateur n’a été tenté. Les vérifications de DOM, de syntaxe et des règles responsive ne remplacent pas cette inspection visuelle.

153 portraits sont locaux et 44 dépendent des URL AniList déjà utilisées par le catalogue. Les nouvelles compositions sont locales. Toute future Mythique ajoutée au catalogue devra recevoir une direction artistique et ses fichiers avant de rejoindre les 197 formes déjà prises en charge ; le générateur refuse une couverture incomplète. Les illustrations alternatives ajoutées manuellement au Studio restent enregistrées dans les données historiques ; elles ne remplacent pas les compositions du nouvel Atelier.
