# Catalogue artistique des Éveils mythiques

197 cartes Mythiques identifiées par leurs identifiants exacts ; **3 Éveils par carte, soit 591 compositions SVG originales**.

Les portraits existants sont conservés : 153 images locales et 44 URL AniList déjà utilisées par le catalogue. 591 illustrations alternatives sont intégrées aux Éveils : 10 visuels officiels sourcés et 581 créations originales générées pour Kizuna. La sélection Originale conserve le portrait initial. Les noms des niveaux sont propres à Kizuna. Les illustrations peuvent représenter une forme canonique ou une scène originale, et les crédits précisent leur provenance.

Les noms et motifs sont des choix de direction artistique. Chaque fiche source est reliée par l’identifiant AniList déjà enregistré. Les exemples Naruto/Sasuke/Itachi suivent le brief du projet. [Fiches officielles Bleach](https://bleach-anime.com/en/character/) consultées pour Ichigo et Rukia.

## Rendu réel

Les illustrations remplissent la carte sans découpe ni inclinaison. Les visuels officiels détourés restent entiers sur le fond. La surcouche et la légende donnent une identité à chaque niveau sans remplacer le dessin.

- Révélation : cadre ouvert, halo asymétrique, motifs de personnage aux coins.
- Ascension : cadre à décrochements, double halo et motifs latéraux.
- Transcendance : portique rayonnant, cadres latéraux et six motifs de prestige.
- 45 familles vectorielles dessinées ; palettes, succession de motifs et noms choisis pour chacun des 197 identifiants. Les effets évoquent aussi la musique, la couture, les lettres, le sport ou la stratégie des personnages sans leur inventer des pouvoirs.
- Grandes présentations : particules selon sept mouvements (flux, braises, pulsation lente, flottement, prisme, envol ou orbite). Les grilles restent statiques.
- Le mode réduit supprime les animations et transitions ; aucune animation embarquée dans les SVG. Aucun Canvas/WebGL ni vidéo permanent.

## Intégration

`window.KizunaMythicArt.manifest` contient les fiches avec `id`, `name`, `series`, `image`, `source`, `maxLevel`, `colors`, `portraitLocal`, `levels`. Chaque niveau indique `level`, `title`, `name`, `description`, `motif`, `motion`, `asset`, `composition`, `sha256`, `illustration`. `render(card, level, {compact, animate})` renvoie le HTML échappé ; le niveau 0 affiche le portrait original. Une carte non Mythique ou inconnue ne reçoit jamais d’Éveil. Le choix du niveau réellement débloqué reste contrôlé par le serveur et le module d’interface appelant.

Génération : `node scripts/build-mythic-art.mjs`. Option `--check-remote` : vérification HTTP HEAD des 44 URL retenues, sans enregistrer d’image. Le générateur refuse un catalogue mythique sans direction explicite ou une image locale absente.

## Vérifications et limites

Le générateur vérifie la couverture exacte des IDs, les 3 niveaux par carte, les 591 empreintes distinctes, le XML de chaque SVG, l’absence de scripts/ressources distantes dans les surcouches, la présence des portraits locaux, le rendu HTML des 788 états (originale + 3 Éveils), l’absence d’animation compacte et l’échappement. Les portraits distants restent dépendants d’AniList ; un état « Portrait indisponible » est prévu si une image ne se charge pas.

Aucune prise de contrôle du PC ni inspection de navigateur n’est réalisée par ce générateur. Les contrôles fonctionnels DOM ne remplacent pas une inspection visuelle mobile/ordinateur. Voir le compte rendu de livraison pour les vérifications réellement effectuées.

## Attack on Titan

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Armin Arlert](https://anilist.co/character/46494) · `cseed-0068` | Carte de l’horizon — lettres et plis | Appel de l’océan — ondes d’eau | Aube au-delà des murs — disque solaire |
| [Eren Yeager](https://anilist.co/character/40882) · `cseed-0066` | Fissure verte — éclairs | Murs brisés — éclats cristallins | Silhouette des géants — armure spectrale |
| [Hange Zoe](https://anilist.co/character/71121) · `cseed-0071` | Verre d’observation — engrenages | Éclat de découverte — prismes | Étincelle de curiosité — éclairs |
| [Levi Ackerman](https://anilist.co/character/45627) · `cseed-0069` | Acier du silence — lames stylisées | Spirale de vitesse — spirales de vent | Ailes de liberté — ailes géométriques |
| [Mikasa Ackerman](https://anilist.co/character/40881) · `cseed-0067` | Écharpe écarlate — rubans | Sillage des lames — lames stylisées | Ailes protectrices — ailes géométriques |

## Berserk

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Casca](https://anilist.co/character/423) · `cseed-0213` | Lame de courage — lames stylisées | Garde du lien — bouclier | Jardin retrouvé — fleurs |
| [Griffith](https://anilist.co/character/424) · `cseed-0212` | Plume d’argent — plumes | Ailes du rêve — ailes géométriques | Couronne du faucon — couronne |
| [Guts](https://anilist.co/character/422) · `cseed-0211` | Acier de lutte — lames stylisées | Nuit du voyageur — volutes sombres | Fureur indomptable — empreintes et silhouette bestiale |
| [Judeau](https://anilist.co/character/454) · `c454` | Lame légère — lames stylisées | Trajectoire fidèle — trajectoires | Étoile du compagnon — étoiles |
| [Zodd](https://anilist.co/character/600) · `c600` | Corne de pierre — empreintes et silhouette bestiale | Force du combat — lames stylisées | Ailes du crépuscule — ailes géométriques |

## Black Clover

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Asta](https://anilist.co/character/123285) · `cseed-0148` | Acier rebelle — lames stylisées | Énergie sombre — volutes sombres | Ailes de détermination — ailes géométriques |
| [Mereoleona Vermillion](https://anilist.co/character/124522) · `cseed-0152` | Braise sauvage — langues de feu | Crinière ardente — empreintes et silhouette bestiale | Soleil indomptable — disque solaire |
| [Noelle Silva](https://anilist.co/character/123283) · `cseed-0150` | Perle d’eau — ondes d’eau | Armure des marées — bouclier | Couronne d’écume — couronne |
| [Yami Sukehiro](https://anilist.co/character/124440) · `cseed-0151` | Lame du soir — lames stylisées | Croissant obscur — croissant lunaire | Nuit tranchante — volutes sombres |
| [Yuno](https://anilist.co/character/123284) · `cseed-0149` | Souffle léger — spirales de vent | Feuilles célestes — feuilles | Ciel étoilé — étoiles |

## Bleach

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Ichigo Kurosaki](https://anilist.co/character/5) · `cseed-0098` | Tranchant d’ambre — lames stylisées | Arc de lune — croissant lunaire | Voile des deux mondes — volutes sombres |
| [Kisuke Urahara](https://anilist.co/character/210) · `cseed-0106` | Éventail discret — échiquier | Sceau de l’artisan — sceau géométrique | Trame du stratège — fils et aiguille |
| [Rukia Kuchiki](https://anilist.co/character/6) · `cseed-0099` | Cristaux pâles — cristaux de givre | Pétales de givre — pétales | Lune blanche — croissant lunaire |
| [Sosuke Aizen](https://anilist.co/character/1086) · `cseed-0104` | Miroir de brume — prismes | Regard illusoire — iris concentriques | Éclat transcendant — ailes géométriques |
| [Yoruichi Shihouin](https://anilist.co/character/908) · `cseed-0105` | Pas violet — éclairs | Griffe de l’éclair — empreintes et silhouette bestiale | Tempête de vitesse — spirales de vent |

## Blue Lock

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Hyoma Chigiri](https://anilist.co/character/167444) · `cseed-0136` | Fil de vitesse — rubans | Vent écarlate — spirales de vent | Sillage royal — trajectoires |
| [Meguru Bachira](https://anilist.co/character/162213) · `cseed-0133` | Dribble libre — rubans | Instinct intérieur — empreintes et silhouette bestiale | Éclat imprévisible — rayons d’impact |
| [Rin Itoshi](https://anilist.co/character/169395) · `cseed-0134` | Précision froide — iris concentriques | Ligne parfaite — trajectoires | Champ de gravité — orbites |
| [Seishiro Nagi](https://anilist.co/character/162969) · `cseed-0135` | Calme suspendu — nuages | Contrôle de cristal — prismes | Ciel du génie — étoiles |
| [Yoichi Isagi](https://anilist.co/character/140856) · `cseed-0132` | Pièce décisive — échiquier | Trajectoire gagnante — trajectoires | Vision du terrain — iris concentriques |

## Bocchi the Rock!

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Hitori Gotoh](https://anilist.co/character/257562) · `cseed-0226` | Premier accord — notes et portées | Câbles de scène — rubans | Solo de lumière — rayons d’impact |
| [Ikuyo Kita](https://anilist.co/character/266041) · `c266041` | Accord écarlate — notes et portées | Étoiles de scène — étoiles | Flamme du refrain — langues de feu |
| [Kikuri Hiroi](https://anilist.co/character/291639) · `c291639` | Vibration violette — notes et portées | Improvisation libre — spirales de vent | Nuit électrique — croissant lunaire |
| [Nijika Ijichi](https://anilist.co/character/261674) · `c261674` | Premier rythme — notes et portées | Cercles de cadence — orbites | Soleil de la scène — disque solaire |
| [Ryo Yamada](https://anilist.co/character/264529) · `cseed-0227` | Basse bleue — notes et portées | Onde profonde — ondes d’eau | Nuit du groove — croissant lunaire |

## Chainsaw Man

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Aki Hayakawa](https://anilist.co/character/137081) · `cseed-0004` | Lame silencieuse — lames stylisées | Croissant d’acier — croissant lunaire | Veille du renard — volutes sombres |
| [Denji](https://anilist.co/character/130102) · `cseed-0001` | Déclic orange — engrenages | Mécanique déchaînée — lames stylisées | Couronne des chaînes — mailles de chaînes |
| [Makima](https://anilist.co/character/137080) · `cseed-0003` | Iris d’ambre — iris concentriques | Liens concentriques — mailles de chaînes | Cercle de domination — orbites |
| [Power](https://anilist.co/character/137079) · `cseed-0002` | Éclat carmin — éclats cristallins | Lances écarlates — lames stylisées | Éruption souveraine — rayons d’impact |
| [Reze](https://anilist.co/character/148740) · `cseed-0007` | Pétales nocturnes — pétales | Étincelle suspendue — rayons d’impact | Floraison explosive — langues de feu |

## Cowboy Bebop

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Edward Wong Hau Pepelu Tivrusky IV](https://anilist.co/character/16) · `c16` | Pixel malicieux — circuits lumineux | Improvisation numérique — notes et portées | Ronde de données — orbites |
| [Ein](https://anilist.co/character/4) · `c4` | Petite empreinte — empreintes et silhouette bestiale | Écho des données — circuits lumineux | Étoile du vaisseau — étoiles |
| [Faye Valentine](https://anilist.co/character/2) · `cseed-0209` | Reflet du hasard — médaillons | Prisme du passé — prismes | Nuit de fortune — étoiles |
| [Jet Black](https://anilist.co/character/3) · `c3` | Rouage du vaisseau — engrenages | Garde du Bebop — bouclier | Veille bleue — croissant lunaire |
| [Spike Spiegel](https://anilist.co/character/1) · `cseed-0208` | Note de départ — trajectoires | Fumée du jazz — arabesques de fumée | Ballade des étoiles — étoiles |

## Dandadan

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Aira Shiratori](https://anilist.co/character/245466) · `cseed-0178` | Ruban aérien — rubans | Danse des pétales — pétales | Envol soyeux — ailes géométriques |
| [Jiji](https://anilist.co/character/258506) · `cseed-0179` | Regard double — iris concentriques | Ombre mouvante — volutes sombres | Impact surnaturel — rayons d’impact |
| [Momo Ayase](https://anilist.co/character/222594) · `cseed-0176` | Onde rose — orbites | Lien invisible — cœurs | Prisme psychique — prismes |
| [Okarun](https://anilist.co/character/222593) · `cseed-0177` | Pas nocturne — spirales de vent | Traînée écarlate — langues de feu | Élan surnaturel — empreintes et silhouette bestiale |
| [Seiko Ayase](https://anilist.co/character/234824) · `cseed-0180` | Papier protecteur — lettres et plis | Sceau du seuil — sceau géométrique | Veille spirituelle — bouclier |

## Death Note

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [L Lawliet](https://anilist.co/character/71) · `cseed-0123` | Indice bleu — échiquier | Déduction de cristal — prismes | Cercle des possibles — orbites |
| [Light Yagami](https://anilist.co/character/80) · `cseed-0122` | Encre du destin — lettres et plis | Pages du jugement — traits d’encre | Couronne rouge — couronne |
| [Mihael Keehl](https://anilist.co/character/463) · `c463` | Maille d’ambre — mailles de chaînes | Coup audacieux — échiquier | Flamme de rivalité — langues de feu |
| [Misa Amane](https://anilist.co/character/835) · `cseed-0124` | Ruban gothique — cœurs | Rose nocturne — rosace | Ailes d’idole — ailes géométriques |
| [Ryuk](https://anilist.co/character/75) · `cseed-0125` | Plumes de l’ombre — plumes | Sourire du crépuscule — masque d’os | Lune du hasard — croissant lunaire |

## Demon Slayer

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Giyu Tomioka](https://anilist.co/character/130050) · `cseed-0046` | Ondes silencieuses — ondes d’eau | Reflet de la lune — croissant lunaire | Marée immobile — orbites |
| [Inosuke Hashibira](https://anilist.co/character/129130) · `cseed-0045` | Instinct sauvage — empreintes et silhouette bestiale | Crocs croisés — lames stylisées | Tempête des montagnes — spirales de vent |
| [Nezuko Kamado](https://anilist.co/character/127518) · `cseed-0043` | Bambou de lumière — feuilles | Floraison rose — pétales | Braise protectrice — langues de feu |
| [Tanjiro Kamado](https://anilist.co/character/126071) · `cseed-0042` | Souffle de l’eau — ondes d’eau | Danse de l’aurore — disque solaire | Brasier du soleil — langues de feu |
| [Zenitsu Agatsuma](https://anilist.co/character/129131) · `cseed-0044` | Étincelle d’or — éclairs | Pas foudroyant — trajectoires | Orage de l’aube — rayons d’impact |

## Dr. Stone

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Chrome](https://anilist.co/character/124145) · `c124145` | Pierre curieuse — éclats cristallins | Verre de découverte — prismes | Étincelle du savant — éclairs |
| [Gen Asagiri](https://anilist.co/character/127445) · `cseed-0220` | Reflet du mentaliste — prismes | Jeu de lumière — médaillons | Fil des possibles — fils et aiguille |
| [Kohaku](https://anilist.co/character/124143) · `cseed-0219` | Élan de la forêt — feuilles | Lame du village — lames stylisées | Soleil protecteur — disque solaire |
| [Senku Ishigami](https://anilist.co/character/124142) · `cseed-0218` | Première formule — circuits lumineux | Éclat de découverte — prismes | Constellation du savoir — étoiles |
| [Suika](https://anilist.co/character/124162) · `c124162` | Petite feuille — feuilles | Regard de cristal — iris concentriques | Jardin des découvertes — fleurs |

## Dragon Ball

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Piccolo](https://anilist.co/character/914) · `cseed-0092` | Souffle vert — feuilles | Orbe du gardien — orbites | Force ancestrale — armure spectrale |
| [Son Gohan](https://anilist.co/character/2093) · `cseed-0091` | Potentiel latent — éclairs | Éveil de l’éclair — éclats cristallins | Fureur silencieuse — empreintes et silhouette bestiale |
| [Son Goku](https://anilist.co/character/246) · `cseed-0089` | Énergie dorée — langues de feu | Orage céleste — éclairs | Soleil combattant — disque solaire |
| [Trunks](https://anilist.co/character/2707) · `cseed-0093` | Lame du futur — lames stylisées | Éclair temporel — éclairs | Prisme de l’espoir — prismes |
| [Vegeta](https://anilist.co/character/913) · `cseed-0090` | Flamme du prince — langues de feu | Couronne d’orgueil — couronne | Éclat souverain — rayons d’impact |

## Fairy Tail

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Erza Scarlet](https://anilist.co/character/5189) · `cseed-0156` | Lame écarlate — lames stylisées | Armure de prestige — bouclier | Ailes d’acier — ailes géométriques |
| [Gray Fullbuster](https://anilist.co/character/4839) · `cseed-0157` | Premier givre — cristaux de givre | Cristaux forgés — éclats cristallins | Palais de glace — prismes |
| [Juvia Lockser](https://anilist.co/character/9719) · `c9719` | Goutte d’azur — ondes d’eau | Pluie du cœur — cœurs | Marée lumineuse — orbites |
| [Lucy Heartfilia](https://anilist.co/character/5186) · `cseed-0155` | Clé étoilée — étoiles | Sceau céleste — sceau géométrique | Ronde des constellations — orbites |
| [Natsu Dragneel](https://anilist.co/character/5187) · `cseed-0154` | Étincelle de feu — langues de feu | Crocs du brasier — empreintes et silhouette bestiale | Dragon de lumière — rayons d’impact |

## Fire Force

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Arthur Boyle](https://anilist.co/character/130715) · `cseed-0231` | Lame de lumière — lames stylisées | Éclair du chevalier — éclairs | Couronne d’acier — couronne |
| [Benimaru Shinmon](https://anilist.co/character/130848) · `cseed-0232` | Braise rouge — langues de feu | Croissant de feu — croissant lunaire | Soleil d’Asakusa — disque solaire |
| [Iris](https://anilist.co/character/130716) · `c130716` | Lueur de prière — croix de soin | Fleurs paisibles — fleurs | Aube protectrice — disque solaire |
| [Maki Oze](https://anilist.co/character/130713) · `cseed-0229` | Braise tendre — langues de feu | Fleurs incandescentes — fleurs | Garde de feu — armure spectrale |
| [Shinra Kusakabe](https://anilist.co/character/120462) · `cseed-0230` | Pas de braise — langues de feu | Sillage ardent — trajectoires | Ailes du héros — ailes géométriques |

## Frieren: Beyond Journey's End

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Fern](https://anilist.co/character/183965) · `cseed-0172` | Lueur violette — sceau géométrique | Cercle de précision — orbites | Prisme tranquille — prismes |
| [Frieren](https://anilist.co/character/176754) · `cseed-0171` | Sceau ancien — sceau géométrique | Floraison de mémoire — fleurs | Ciel des siècles — étoiles |
| [Himmel](https://anilist.co/character/184311) · `cseed-0174` | Lame du héros — lames stylisées | Fleurs du souvenir — fleurs | Ailes de promesse — ailes géométriques |
| [Stark](https://anilist.co/character/184313) · `cseed-0173` | Acier hésitant — lames stylisées | Courage du gardien — bouclier | Force de l’aurore — rayons d’impact |
| [Übel](https://anilist.co/character/246057) · `cseed-0175` | Fil vert — fils et aiguille | Coupure silencieuse — lames stylisées | Trame de l’ombre — volutes sombres |

## Fruits Basket

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Hatsuharu Souma](https://anilist.co/character/369) · `c369` | Empreinte de contraste — empreintes et silhouette bestiale | Reflet double — prismes | Garde tranquille — bouclier |
| [Kyo Sohma](https://anilist.co/character/209) · `cseed-0234` | Empreinte orange — empreintes et silhouette bestiale | Feuilles d’automne — feuilles | Aube libérée — disque solaire |
| [Momiji Souma](https://anilist.co/character/367) · `c367` | Empreinte dorée — empreintes et silhouette bestiale | Mélodie du cœur — notes et portées | Jardin du printemps — fleurs |
| [Tohru Honda](https://anilist.co/character/207) · `cseed-0235` | Chaleur du lien — cœurs | Jardin d’accueil — fleurs | Constellation des rencontres — étoiles |
| [Yuki Sohma](https://anilist.co/character/208) · `cseed-0236` | Empreinte lilas — empreintes et silhouette bestiale | Pétales du printemps — pétales | Lune apaisée — croissant lunaire |

## Fullmetal Alchemist

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Alphonse Elric](https://anilist.co/character/12) · `cseed-0192` | Acier protecteur — bouclier | Sceau du lien — sceau géométrique | Âme de lumière — étoiles |
| [Edward Elric](https://anilist.co/character/11) · `cseed-0191` | Mécanique d’or — engrenages | Cercle de transmutation — sceau géométrique | Éclair de volonté — éclairs |
| [Riza Hawkeye](https://anilist.co/character/70) · `cseed-0194` | Ligne de mire — prismes | Trajectoire fidèle — trajectoires | Veille d’acier — bouclier |
| [Roy Mustang](https://anilist.co/character/68) · `cseed-0193` | Étincelle du gant — langues de feu | Cercle ardent — sceau géométrique | Flamme souveraine — disque solaire |
| [Winry Rockbell](https://anilist.co/character/63) · `cseed-0195` | Première pièce — engrenages | Mécanique du soin — fils et aiguille | Atelier de lumière — fleurs |

## Ghost in the Shell

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Batou](https://anilist.co/character/2653) · `c2653` | Optiques de veille — iris concentriques | Rouages tactiques — engrenages | Garde du réseau — bouclier |
| [Daisuke Aramaki](https://anilist.co/character/2677) · `c2677` | Premier ordre — échiquier | Réseau du stratège — circuits lumineux | Tour de veille — couronne |
| [Motoko Kusanagi](https://anilist.co/character/1795) · `cseed-0210` | Signal du réseau — circuits lumineux | Corps de cristal — prismes | Regard du cyberespace — iris concentriques |
| [Ningyoutsukai](https://anilist.co/character/18516) · `c18516` | Fil numérique — fils et aiguille | Esprit du réseau — circuits lumineux | Convergence des données — orbites |
| [Togusa](https://anilist.co/character/2654) · `c2654` | Indice analogique — prismes | Connexion humaine — circuits lumineux | Trajectoire juste — trajectoires |

## Haikyu!!

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Kenma Kozume](https://anilist.co/character/71267) · `cseed-0146` | Premier mouvement — échiquier | Lecture du réseau — circuits lumineux | Vision du stratège — iris concentriques |
| [Shoyo Hinata](https://anilist.co/character/64769) · `cseed-0140` | Premier envol — trajectoires | Soleil du court — disque solaire | Ailes orange — ailes géométriques |
| [Tobio Kageyama](https://anilist.co/character/64771) · `cseed-0141` | Passe d’azur — trajectoires | Géométrie du jeu — échiquier | Couronne du passeur — couronne |
| [Toru Oikawa](https://anilist.co/character/71611) · `cseed-0143` | Service turquoise — trajectoires | Orbite de précision — orbites | Constellation du court — étoiles |
| [Yu Nishinoya](https://anilist.co/character/67327) · `cseed-0142` | Garde du terrain — bouclier | Rafale défensive — spirales de vent | Impact du gardien — rayons d’impact |

## Hunter x Hunter

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Chrollo Lucilfer](https://anilist.co/character/58) · `cseed-0113` | Livre entrouvert — pages ouvertes | Pages nocturnes — volutes sombres | Sceau du voleur — sceau géométrique |
| [Gon Freecss](https://anilist.co/character/30) · `cseed-0108` | Élan de forêt — feuilles | Poing de lumière — rayons d’impact | Horizon indomptable — disque solaire |
| [Hisoka Morow](https://anilist.co/character/31) · `cseed-0112` | Carte de mystère — prismes | Jeu des couleurs — cœurs | Fil de l’illusion — fils et aiguille |
| [Killua Zoldyck](https://anilist.co/character/27) · `cseed-0109` | Étincelle argentée — éclairs | Vitesse de l’orage — spirales de vent | Cercle de foudre — orbites |
| [Kurapika](https://anilist.co/character/28) · `cseed-0110` | Regard écarlate — iris concentriques | Chaînes du serment — mailles de chaînes | Lune de mémoire — croissant lunaire |

## Jujutsu Kaisen

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Kento Nanami](https://anilist.co/character/133704) · `cseed-0059` | Ligne mesurée — prismes | Rapport parfait — échiquier | Tranchant de précision — lames stylisées |
| [Megumi Fushiguro](https://anilist.co/character/126635) · `cseed-0055` | Ombre jumelle — volutes sombres | Bestiaire nocturne — empreintes et silhouette bestiale | Domaine lunaire — croissant lunaire |
| [Nobara Kugisaki](https://anilist.co/character/133700) · `cseed-0056` | Clou de cuivre — lames stylisées | Fil de résonance — fils et aiguille | Couronne d’impacts — rayons d’impact |
| [Satoru Gojo](https://anilist.co/character/127691) · `cseed-0057` | Iris infini — iris concentriques | Horizon sans limite — orbites | Prisme du vide — prismes |
| [Yuji Itadori](https://anilist.co/character/127212) · `cseed-0054` | Impact rose — rayons d’impact | Fracture d’énergie — éclats cristallins | Cœur incandescent — langues de feu |

## Kaguya-sama: Love Is War

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Ai Hayasaka](https://anilist.co/character/121104) · `c121104` | Reflet secret — prismes | Rubans de liberté — rubans | Ciel des possibles — étoiles |
| [Chika Fujiwara](https://anilist.co/character/121103) · `cseed-0223` | Ruban rose — rubans | Mélodie inattendue — notes et portées | Jardin des surprises — fleurs |
| [Kaguya Shinomiya](https://anilist.co/character/120649) · `cseed-0221` | Premier battement — cœurs | Partie du cœur — échiquier | Lune des confidences — croissant lunaire |
| [Miko Iino](https://anilist.co/character/125886) · `c125886` | Page des principes — lettres et plis | Garde de l’équilibre — bouclier | Étoiles du courage — étoiles |
| [Yuu Ishigami](https://anilist.co/character/121102) · `c121102` | Signal discret — circuits lumineux | Voile de réserve — volutes sombres | Éclat du cœur — cœurs |

## Kingdom

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Duanhe Yang](https://anilist.co/character/66701) · `c66701` | Souffle des montagnes — empreintes et silhouette bestiale | Lame des sommets — lames stylisées | Couronne des hauteurs — couronne |
| [Lei Qiang](https://anilist.co/character/65445) · `c65445` | Pas de jade — rubans | Danse de l’acier — lames stylisées | Tourbillon silencieux — spirales de vent |
| [Qi Wang](https://anilist.co/character/65443) · `c65443` | Acier du général — lames stylisées | Étendards du champ — étendards | Prestige du commandement — couronne |
| [Shin](https://anilist.co/character/64573) · `cseed-0217` | Lame de départ — lames stylisées | Sillage du combat — trajectoires | Bannières de conquête — étendards |
| [Zheng Ying](https://anilist.co/character/64109) · `c64109` | Sceau de l’ambition — sceau géométrique | Bannières unies — étendards | Couronne de l’horizon — couronne |

## Konosuba

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Aqua](https://anilist.co/character/89362) · `cseed-0204` | Goutte de lumière — ondes d’eau | Fleurs d’eau — fleurs | Ronde des marées — orbites |
| [Darkness](https://anilist.co/character/89363) · `cseed-0206` | Éclat d’armure — bouclier | Serment d’acier — lames stylisées | Garde dorée — couronne |
| [Kazuma Satou](https://anilist.co/character/89364) · `cseed-0203` | Coup de chance — échiquier | Reflets du trésor — médaillons | Constellation de fortune — étoiles |
| [Megumin](https://anilist.co/character/89361) · `cseed-0205` | Cercle rouge — sceau géométrique | Incantation ardente — langues de feu | Explosion grandiose — rayons d’impact |
| [Yunyun](https://anilist.co/character/120652) · `c120652` | Sceau timide — sceau géométrique | Étoiles de rencontre — étoiles | Lueur de courage — éclairs |

## My Dress-Up Darling

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Marin Kitagawa](https://anilist.co/character/133676) · `cseed-0224` | Éclat du miroir — étoiles | Fils de création — fils et aiguille | Prisme des rôles — prismes |
| [Nowa Sugaya](https://anilist.co/character/260977) · `c260977` | Éclat complice — cœurs | Rubans de rencontre — rubans | Jardin de l’amitié — fleurs |
| [Sajuna Inui](https://anilist.co/character/133677) · `c133677` | Ruban pastel — rubans | Reflets de scène — prismes | Étoiles du costume — étoiles |
| [Shinju Inui](https://anilist.co/character/207937) · `c207937` | Objectif délicat — prismes | Trame de rêve — fils et aiguille | Envol de création — ailes géométriques |
| [Wakana Gojo](https://anilist.co/character/133678) · `cseed-0225` | Premier point — fils et aiguille | Patron de lumière — lettres et plis | Atelier en fleurs — fleurs |

## My Hero Academia

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [All Might](https://anilist.co/character/89224) · `cseed-0081` | Sourire de lumière — disque solaire | Impact solaire — rayons d’impact | Symbole de paix — couronne |
| [Izuku Midoriya](https://anilist.co/character/89028) · `cseed-0077` | Étincelle émeraude — éclairs | Impact héroïque — rayons d’impact | Envol de l’espoir — ailes géométriques |
| [Katsuki Bakugo](https://anilist.co/character/88892) · `cseed-0078` | Amorce orangée — éclats cristallins | Explosion croisée — rayons d’impact | Déflagration royale — langues de feu |
| [Shota Aizawa](https://anilist.co/character/89225) · `cseed-0082` | Étoffe en veille — rubans | Regard décisif — iris concentriques | Nuit protectrice — volutes sombres |
| [Shoto Todoroki](https://anilist.co/character/89220) · `cseed-0079` | Cristal froid — cristaux de givre | Braise jumelle — langues de feu | Équilibre des éléments — prismes |

## Naruto

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Itachi Uchiha](https://anilist.co/character/14) · `cseed-0017` | Plumes du crépuscule — plumes | Flammes obscures — langues de feu | Lune écarlate — croissant lunaire |
| [Kakashi Hatake](https://anilist.co/character/85) · `cseed-0016` | Reflet argenté — éclairs | Œil de l’orage — iris concentriques | Lame de foudre — lames stylisées |
| [Madara Uchiha](https://anilist.co/character/53901) · `cseed-0018` | Regard ancestral — iris concentriques | Armure des ombres — armure spectrale | Ciel de conquête — rayons d’impact |
| [Naruto Uzumaki](https://anilist.co/character/17) · `cseed-0013` | Chakra naissant — orbites | Horizon de l’ermite — feuilles | Neuf lueurs — neuf queues de lumière |
| [Sasuke Uchiha](https://anilist.co/character/13) · `cseed-0014` | Éclair violet — éclairs | Regard des ténèbres — iris concentriques | Gardien spectral — armure spectrale |
| [Shikamaru Nara](https://anilist.co/character/2007) · `cseed-0021` | Premier coup — échiquier | Étreinte de l’ombre — volutes sombres | Échiquier infini — sceau géométrique |

## One Piece

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Monkey D. Luffy](https://anilist.co/character/40) · `cseed-0028` | Aube du voyage — disque solaire | Nuages libres — nuages | Rire solaire — rayons d’impact |
| [Nico Robin](https://anilist.co/character/61) · `cseed-0032` | Fleur de l’histoire — pétales | Pages enfouies — pages ouvertes | Envol des secrets — ailes géométriques |
| [Roronoa Zoro](https://anilist.co/character/62) · `cseed-0029` | Premier tranchant — lames stylisées | Trois sillages — spirales de vent | Gardien d’acier — armure spectrale |
| [Sanji](https://anilist.co/character/305) · `cseed-0031` | Pas d’azur — rubans | Spirale ardente — langues de feu | Soleil du large — disque solaire |
| [Trafalgar Law](https://anilist.co/character/13767) · `cseed-0034` | Cercle opératoire — sceau géométrique | Sphère suspendue — orbites | Tranchant du destin — lames stylisées |
| [Vinsmoke Sanji](https://anilist.co/character/305) · `cseed-0040` | Braise princière — langues de feu | Flamme d’azur — éclairs | Envol incandescent — ailes géométriques |

## One Punch Man

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Fubuki](https://anilist.co/character/81931) · `cseed-0119` | Brise émeraude — spirales de vent | Cristaux de blizzard — cristaux de givre | Jardin des vents — pétales |
| [Garou](https://anilist.co/character/89277) · `cseed-0120` | Griffe en éveil — empreintes et silhouette bestiale | Courant martial — ondes d’eau | Silhouette de la nuit — volutes sombres |
| [Genos](https://anilist.co/character/73979) · `cseed-0117` | Moteur doré — engrenages | Cœur incandescent — langues de feu | Architecture de puissance — circuits lumineux |
| [Saitama](https://anilist.co/character/73935) · `cseed-0116` | Éclat simple — disque solaire | Onde absolue — rayons d’impact | Horizon sans limite — orbites |
| [Tatsumaki](https://anilist.co/character/81929) · `cseed-0118` | Spirale verte — spirales de vent | Fragments en lévitation — éclats cristallins | Tempête souveraine — orbites |

## Overlord

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Ainz Ooal Gown](https://anilist.co/character/89103) · `cseed-0200` | Sceau d’os — masque d’os | Cercle de Nazarick — sceau géométrique | Couronne immortelle — couronne |
| [Albedo](https://anilist.co/character/89122) · `cseed-0201` | Plumes de nacre — plumes | Envol nocturne — ailes géométriques | Gardienne de marbre — armure spectrale |
| [Demiurge](https://anilist.co/character/89125) · `c89125` | Verre d’ambre — prismes | Flamme calculée — langues de feu | Échiquier des ombres — échiquier |
| [Sebas Tian](https://anilist.co/character/89155) · `c89155` | Garde d’argent — bouclier | Force du dragon — empreintes et silhouette bestiale | Protecteur de prestige — armure spectrale |
| [Shalltear Bloodfallen](https://anilist.co/character/89121) · `cseed-0202` | Rose de porcelaine — rosace | Lance du soir — lames stylisées | Lune du palais — croissant lunaire |

## Re:Zero

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Beatrice](https://anilist.co/character/90181) · `cseed-0164` | Page rose — pages ouvertes | Sceau de bibliothèque — sceau géométrique | Floraison des récits — pétales |
| [Echidna](https://anilist.co/character/129330) · `cseed-0165` | Porcelaine pâle — prismes | Livre des questions — pages ouvertes | Lune de curiosité — croissant lunaire |
| [Emilia](https://anilist.co/character/88572) · `cseed-0161` | Cristal lilas — cristaux de givre | Jardin de givre — pétales | Neige stellaire — étoiles |
| [Rem](https://anilist.co/character/88575) · `cseed-0162` | Reflet bleu — ondes d’eau | Chaîne protectrice — mailles de chaînes | Clair de lune — croissant lunaire |
| [Subaru Natsuki](https://anilist.co/character/88573) · `cseed-0160` | Écho de l’instant — orbites | Heure nocturne — volutes sombres | Aube retrouvée — disque solaire |

## Solo Leveling

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Beru](https://anilist.co/character/159849) · `cseed-0169` | Griffe nocturne — empreintes et silhouette bestiale | Carapace de cristal — éclats cristallins | Envol des ombres — ailes géométriques |
| [Cha Hae-In](https://anilist.co/character/138789) · `cseed-0167` | Tranchant doré — lames stylisées | Danse des pétales — pétales | Lumière du combat — disque solaire |
| [Igris](https://anilist.co/character/145722) · `cseed-0168` | Acier du serment — lames stylisées | Garde écarlate — bouclier | Chevalier des ombres — armure spectrale |
| [Ju-Hui Lee](https://anilist.co/character/136074) · `c136074` | Lueur de soin — croix de soin | Feuillage apaisant — feuilles | Veille bienveillante — étoiles |
| [Sung Jinwoo](https://anilist.co/character/129928) · `cseed-0166` | Ombre en marche — volutes sombres | Lames du passage — lames stylisées | Couronne du monarque — couronne |

## Spy x Family

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Anya Forger](https://anilist.co/character/138100) · `cseed-0129` | Petites étoiles — étoiles | Échos du cœur — cœurs | Constellation des secrets — orbites |
| [Bond Forger](https://anilist.co/character/169679) · `cseed-0130` | Empreinte blanche — empreintes et silhouette bestiale | Nuage protecteur — nuages | Veilleur des possibles — étoiles |
| [Damian Desmond](https://anilist.co/character/150424) · `cseed-0131` | Feuille d’ambition — feuilles | Insigne d’Eden — bouclier | Couronne d’avenir — couronne |
| [Loid Forger](https://anilist.co/character/138101) · `cseed-0127` | Reflet de couverture — prismes | Réseau secret — circuits lumineux | Veille du crépuscule — bouclier |
| [Yor Forger](https://anilist.co/character/138102) · `cseed-0128` | Rose discrète — rosace | Aiguilles dorées — lames stylisées | Jardin écarlate — pétales |

## Sword Art Online

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Alice Zuberg](https://anilist.co/character/75450) · `cseed-0189` | Lame d’or — lames stylisées | Fleurs de lumière — fleurs | Couronne de l’intégrité — couronne |
| [Asuna Yuuki](https://anilist.co/character/36828) · `cseed-0187` | Éclair de nacre — lames stylisées | Trajectoire lumineuse — trajectoires | Ailes de l’aurore — ailes géométriques |
| [Eugeo](https://anilist.co/character/70899) · `cseed-0190` | Cristal bleu — cristaux de givre | Tranchant gelé — lames stylisées | Arbre de lumière — feuilles |
| [Kirito](https://anilist.co/character/36765) · `cseed-0186` | Lame noire — lames stylisées | Double connexion — circuits lumineux | Ciel du dernier niveau — étoiles |
| [Sinon](https://anilist.co/character/55147) · `cseed-0188` | Visée turquoise — prismes | Ligne numérique — circuits lumineux | Orbite de précision — orbites |

## That Time I Got Reincarnated as a Slime

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Diablo](https://anilist.co/character/131033) · `c131033` | Flamme discrète — langues de feu | Voile de dévotion — volutes sombres | Couronne de la nuit — couronne |
| [Milim Nava](https://anilist.co/character/128036) · `cseed-0198` | Étoile rose — étoiles | Élan du dragon — empreintes et silhouette bestiale | Explosion céleste — rayons d’impact |
| [Rimuru Tempest](https://anilist.co/character/123962) · `cseed-0196` | Onde azurée — ondes d’eau | Sphère de Tempest — orbites | Couronne des liens — couronne |
| [Shion](https://anilist.co/character/128033) · `c128033` | Tranchant violet — lames stylisées | Iris de Tempest — fleurs | Garde majestueuse — armure spectrale |
| [Veldora Tempest](https://anilist.co/character/128034) · `c128034` | Étincelle antique — éclairs | Dragon de l’orage — empreintes et silhouette bestiale | Tempête libérée — spirales de vent |

## Tokyo Ghoul

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Hideyoshi Nagachika](https://anilist.co/character/88421) · `c88421` | Lueur amicale — disque solaire | Fil du souvenir — cœurs | Lettre de l’aurore — lettres et plis |
| [Juuzou Suzuya](https://anilist.co/character/88412) · `cseed-0183` | Fil de porcelaine — fils et aiguille | Lames croisées — lames stylisées | Mosaïque de nuit — prismes |
| [Ken Kaneki](https://anilist.co/character/87275) · `cseed-0181` | Iris rouge — iris concentriques | Voile de l’ombre — volutes sombres | Silhouette écarlate — empreintes et silhouette bestiale |
| [Kishou Arima](https://anilist.co/character/88946) · `cseed-0185` | Acier blanc — lames stylisées | Éclair du veilleur — éclairs | Gardien de silence — armure spectrale |
| [Touka Kirishima](https://anilist.co/character/87277) · `cseed-0182` | Plume violette — plumes | Éclats ailés — éclats cristallins | Envol du crépuscule — ailes géométriques |

## Vinland Saga

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Askeladd](https://anilist.co/character/13020) · `cseed-0215` | Acier des récits — lames stylisées | Coup du stratège — échiquier | Lune des chemins — croissant lunaire |
| [Canute](https://anilist.co/character/17438) · `cseed-0216` | Feuille de promesse — feuilles | Serment du roi — bouclier | Couronne du Nord — couronne |
| [Thorfinn Karlsefni](https://anilist.co/character/10138) · `c10138` | Lames du voyage — lames stylisées | Traversée de l’océan — ondes d’eau | Terre de renouveau — feuilles |
| [Thorkell](https://anilist.co/character/17440) · `c17440` | Acier massif — lames stylisées | Élan du géant — empreintes et silhouette bestiale | Fracas du Nord — rayons d’impact |
| [Thors Snorresson](https://anilist.co/character/13021) · `c13021` | Garde tranquille — bouclier | Mer apaisée — ondes d’eau | Aube du guerrier — disque solaire |

## Violet Evergarden

| Carte / identifiant exact | Révélation | Ascension | Transcendance |
|---|---|---|---|
| [Benedict Blue](https://anilist.co/character/124788) · `c124788` | Premier trajet — trajectoires | Rouages du courrier — engrenages | Horizon des lettres — lettres et plis |
| [Cattleya Baudelaire](https://anilist.co/character/124787) · `c124787` | Encre de velours — traits d’encre | Rose du récit — rosace | Lettre précieuse — lettres et plis |
| [Claudia Hodgins](https://anilist.co/character/124799) · `c124799` | Adresse familière — lettres et plis | Abri des récits — bouclier | Jardin des rencontres — fleurs |
| [Gilbert Bougainvillea](https://anilist.co/character/124790) · `c124790` | Encre de mémoire — lettres et plis | Promesse protectrice — bouclier | Aube des retrouvailles — disque solaire |
| [Violet Evergarden](https://anilist.co/character/90169) · `cseed-0207` | Lettre entrouverte — lettres et plis | Fil des émotions — fils et aiguille | Jardin des mots — fleurs |
