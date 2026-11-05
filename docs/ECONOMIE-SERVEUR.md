# Kizuna — économie serveur et marché partagé

Livraison du 4 novembre 2026 après la version Sites 20. Le manifeste de publication effectif est enregistré dans `outputs/kizuna-economy-publication.json`, hors du dépôt. Les sources antérieures sont archivées dans `outputs/kizuna-before-economy-v20.zip`.

## Comportement livré

Les comptes connectés envoient désormais une intention au RPC `kizuna_economy` : ouvrir un booster, acheter des packs, récupérer le cadeau, recycler, publier, acheter, enchérir ou échanger. Le navigateur ne peut plus enregistrer une collection complète ni choisir son solde ou son résultat de tirage. Le rôle Discord, les profils et les outils administrateurs existants restent en place.

Le serveur conserve les règles : cinq cartes par pack, ouvertures ×1/×5/×10, poids 60/23/12,5/4,2/0,2/0,1, minima C/C/C/U/R, garanties L50/M250 et pools de boosters administrateur. Les tirages utilisent `pgcrypto.gen_random_bytes` avec rejet des valeurs créant un biais de modulo. La révélation conserve le tri du moins rare au plus rare. Le stock gratuit reste plafonné à 100, démarre à 3 et se recharge toutes les six heures ; le stock bonus reste distinct. La boutique conserve 100/450/850 Chakra. Le cadeau de trois packs utilise désormais une journée UTC explicite.

La valeur de recyclage reste 5/8/10/15/25/60 Chakra par rareté. Le recyclage des doublons conserve un exemplaire disponible de chaque carte et demande confirmation sur une révision précise : si la collection a changé, il faut confirmer à nouveau.

Le marché connecté comprend ventes à prix fixe, enchères, achat immédiat, échanges contre une carte parmi cinq acceptées, annonces personnelles, historique personnel et ventes réelles par carte. Il est paginé par 24 annonces. Le dépôt reste de 2 %, et la vente de 5 % ; les arrondis au Chakra supérieur suivent le détail des frais affiché, avec un minimum de 1. Les échanges n’ajoutent aucun frais. Le propriétaire est identifié par UUID, même après un changement de pseudo. Un exemplaire est réservé par le serveur ; l’achat ou l’échange transfère les cartes et les soldes dans une transaction unique. Le vendeur conserve les dates originales lors d’une restitution ; les transferts conservent également la date de l’exemplaire.

Une surenchère rembourse la mise précédente. L’achat immédiat rend la mise bloquée et ne débite que le complément lorsque l’acheteur est le meilleur enchérisseur. Une mise dans les deux dernières minutes prolonge l’échéance de deux minutes. Les annonces arrivées à échéance sont réglées à la prochaine requête économique ; elles ne sont plus achetables après leur date. Il n’existe pas de tâche planifiée indépendante dans cette livraison. Si la réception ferait dépasser une limite de collection ou de solde, les éléments restent réservés jusqu’à ce que le règlement soit possible.

Les cours du marché reposent uniquement sur les ventes réellement conclues côté serveur. Aucune annonce, mise, valeur de recyclage, transaction invitée ou ancienne simulation locale ne crée un prix public. La fenêtre est de 30 jours, limitée explicitement aux 1 000 ventes les plus récentes par carte.

## Conservation et transition

L’activation capture les sauvegardes serveur intégrales avec leur révision dans `kizuna_private.kizuna_economy_archive`, avant de révoquer INSERT/UPDATE/DELETE pour les navigateurs sur `kizuna_player_states`. Les lignes existantes ne sont ni réinitialisées ni remplacées. Les cartes, Chakra, stock, pity, historique et préférences existants constituent le point de départ conservé. Cette reprise ne prouve pas rétroactivement que les anciennes acquisitions étaient authentiques.

Le contrôle préalable refuse la bascule si des réservations, crédits ou livraisons de l’ancien marché sont apparus, ou si des cartes ne sont pas reconnues. Aucun de ces cas ne doit être effacé pour faire passer la migration. Les copies sont conservées sans fusion ni déduplication implicite.

Sur chaque appareil, la sauvegarde locale antérieure du compte est conservée une fois sous `kizuna_pre_server_v1_<id>` et peut être exportée depuis **Mon compte**. La sauvegarde brute de précaution porte également la version `economy-v21`. Les jetons Auth ne sont jamais inclus. La collection invitée demeure disponible séparément à la déconnexion. Elle n’entre plus automatiquement dans l’économie partagée ; une restauration exceptionnelle devra être examinée et accordée côté administration, sans accepter un inventaire arbitraire fourni par le navigateur.

Une requête économique porte un UUID persistant propre au compte. Le reçu est créé dans la même transaction que les effets. Réessayer avec cet UUID renvoie le résultat déjà obtenu sans redébiter ; changer son contenu est refusé. Si la réponse se perd, l’intention reste sur l’appareil et le rechargement du compte la réconcilie. Les réponses d’un ancien compte sont ignorées. Les vues privées du marché sont effacées à la déconnexion.

## Structure et sécurité

- `schema/kizuna_economy.sql` : tables privées, opérations, RNG, séquestre, reçus et audit. Le correctif consolidé `schema/kizuna_economy_validation.sql` reprend les fonctions finales.
- `schema/kizuna_economy_activate.sql` : sauvegarde de référence, contrôles et fermeture des écritures du navigateur.
- `dist/kizuna-account.js` : RPC, reprise des requêtes, isolation des identités et export local.
- `src/economy-bridge.inc.js` : raccordement des boutons, révélation existante, horloge serveur et désactivation du règlement local pour les comptes connectés.
- `dist/kizuna-exchange.js` / `.css` : marché partagé, édition, historique et erreurs explicites.

Le RPC public est `SECURITY INVOKER`, avec exécution réservée aux comptes authentifiés. Le helper privilégié se trouve dans le schéma non exposé `kizuna_private`, avec un `search_path` vide et un contrôle d’identité/profil. Les helpers de crédit, livraison et RNG ne sont pas exécutables par le client. Toutes les nouvelles tables ont RLS et aucun droit direct pour anon/authenticated. Une projection n’expose jamais les sauvegardes, soldes privés ou e-mails des autres joueurs.

Un verrou transactionnel économique commun évite les inversions de verrous entre vendeurs, enchérisseurs et acheteurs. Les lignes de compte sont aussi verrouillées, notamment face aux récompenses staff existantes. C’est adapté au trafic actuel ; une croissance importante demandera de remplacer ce verrou commun par des verrous de lignes pris dans un ordre strict, et de planifier le règlement des enchères. Les opérations conservent un audit et les reçus sans purge automatique.

Les contrôles Supabase signalent seulement les informations RLS sans politique attendues sur les tables privées fermées, et les avertissements préexistants du projet partagé. Aucun réglage Auth Yugen n’a été changé. Références : [RLS sans politique](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [sécurité des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [fonctions Supabase](https://supabase.com/docs/guides/database/functions), [génération aléatoire PostgreSQL](https://www.postgresql.org/docs/current/pgcrypto.html).

## Vérifications

`scripts/check-economy.sql` teste dans Postgres les doubles requêtes, pertes simulées de répétition, quantités invalides, fonds insuffisants, cadeau unique, recyclage, réservations, achats, surenchères et remboursements, échange atomique, annulation, dates, recharge, garanties, ouverture de 50 cartes, pool administrateur, enchère expirée et restitution d’une vente expirée. Les comptes de test sont créés dans une transaction puis annulés par rollback.

`scripts/check-economy-permissions.sql` teste les droits réellement accordés après activation, le refus d’écriture directe, l’absence d’accès aux helpers et la lecture limitée au propriétaire. Le test de bascule est d’abord exécuté dans une transaction annulée.

`verify-economy-account.mjs` vérifie le refus des modifications locales comme source économique, les intentions seules, la récupération après réponse perdue, le même UUID à la reprise, l’interdiction d’un deuxième paiement concurrent et le changement de compte. `verify-economy-interface.mjs` teste la pagination, l’échappement des noms, les ventes absentes, un achat refusé sans débit local, la publication d’échange, le cadeau, la révélation triée d’un tirage serveur et l’effacement à la déconnexion.

Les régressions comptes, interface, boosters, collection, staff, aventure, galerie, stock et boosters personnalisés sont exécutées. Le serveur d’aperçu répond HTTP 200 ; la syntaxe JavaScript/CSS et la reproductibilité du build sont contrôlées. L’inspection visuelle réelle reste indisponible dans cet environnement Windows ; les tests DOM ne constituent pas une validation visuelle mobile/ordinateur.

## Retour arrière

Ne pas republier simplement la version 20 et rouvrir les écritures de sauvegarde : cela réintroduirait les écritures économiques libres après des transactions partagées. En cas d’incident, garder les tables, reçus, annonces et archives ; suspendre les actions concernées, sauvegarder les données actuelles et corriger la version serveur. L’archive de référence est destinée à la vérification et à une restauration contrôlée, jamais à écraser les progrès ultérieurs.
