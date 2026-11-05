/* Authored relationships use exact retained card IDs and publisher references. */
(() => {
  const relation=(id,title,universe,ids,edges,description,source,reward)=>({id,kind:'constellation',title,universe,description,requirements:{metric:'cards',card_ids:ids,goal:ids.length,edges},period:'once',reward_kind:'title',reward_label:reward,source_url:source,enabled:true,revision:1});
  const mission=(id,title,metric,goal,period,reward,extra={})=>({id,kind:'mission',title,description:'Progresse à ton rythme. Aucune carte ni monnaie n’est consommée.',universe:'',requirements:{metric,goal,...extra},period,reward_kind:'badge',reward_label:reward,source_url:'',enabled:true,revision:1});
  window.KizunaAdventureSeed=Object.freeze([
    relation('rivals-konoha','Deux chemins, un lien','Naruto',['cseed-0013','cseed-0014'],[[0,1,'Rivaux']], 'Naruto et Sasuke, deux rivaux liés par leur parcours au sein de l’équipe 7.','https://naruto-official.com/en/news/01_1296','Les liens de Konoha'),
    relation('brothers-uchiha','Héritage des Uchiha','Naruto',['cseed-0014','cseed-0017'],[[0,1,'Frères']], 'Sasuke et son frère aîné Itachi. Réunis les deux personnages pour compléter ce lien.','https://naruto-official.com/en/anime/naruto1/list/01_353','Héritage écarlate'),
    relation('team-seven','L’équipe 7','Naruto',['cseed-0013','cseed-0014','cseed-0015','cseed-0016'],[[3,0,'Maître et élève'],[3,1,'Maître et élève'],[3,2,'Maître et élève'],[0,1,'Coéquipiers'],[1,2,'Coéquipiers']], 'Naruto, Sasuke et Sakura forment l’équipe 7 sous la direction de Kakashi.','https://naruto-official.com/en/news/01_1610','L’esprit de l’équipe 7'),
    relation('saiyan-rivals','Au-delà des limites','Dragon Ball',['cseed-0089','cseed-0090'],[[0,1,'Rivaux']], 'Goku et Vegeta : une rivalité qui les pousse à se dépasser.','https://en.dragon-ball-official.com/news/01_1189.html','Fierté des Saiyans'),
    relation('brothers-sea','Frères au-delà du sang','One Piece',['cseed-0028','cseed-0033'],[[0,1,'Frères de cœur']], 'Luffy et Ace ont grandi avec un lien fraternel qui dépasse les liens du sang.','https://one-piece.com/news/o20210101_11927/index.html','La promesse des frères'),
    mission('first-collection','Premiers liens','total',5,'once','Premiers liens'),
    mission('collector-25','Un nouvel horizon','total',25,'once','Collectionneur des horizons'),
    mission('collector-100','Cent rencontres','total',100,'once','Cent rencontres'),
    mission('traveller','D’un univers à l’autre','visits',5,'once','Voyageur'),
    mission('first-constellation','Les étoiles se rejoignent','constellations',1,'once','Tisseur de liens'),
    mission('first-awakening','Une nouvelle lumière','awakenings',1,'once','Éveilleur'),
    mission('daily-explore','L’escale du jour','visits',1,'day','Éclat du jour'),
    mission('daily-discovery','Une découverte du jour','discoveries',1,'day','Nouvelle rencontre'),
    mission('weekly-explore','La traversée de la semaine','visits',3,'week','Carnet de voyage'),
    mission('weekly-discovery','Les rencontres de la semaine','discoveries',5,'week','Chroniqueur'),
    {...mission('hidden-awakening','Une constellation intérieure','awakenings',5,'once','Gardien de lumière'),secret:true}
    ,...[
  {
    "id": "kamado-bond",
    "kind": "constellation",
    "title": "Le fil des Kamado",
    "description": "Tanjiro et sa jeune sœur Nezuko : un lien familial au cœur de leur voyage.",
    "universe": "Demon Slayer",
    "requirements": {
      "metric": "cards",
      "goal": 2,
      "card_ids": [
        "cseed-0042",
        "cseed-0043"
      ],
      "edges": [
        [
          0,
          1,
          "Frère et sœur"
        ]
      ]
    },
    "period": "once",
    "reward_kind": "title",
    "reward_label": "Le fil des Kamado",
    "source_url": "https://demonslayer-anime.com/hta/character/",
    "enabled": true,
    "secret": false,
    "revision": 1
  },
  {
    "id": "substitute-soul-reaper",
    "kind": "constellation",
    "title": "La rencontre qui change tout",
    "description": "La rencontre d’Ichigo avec Rukia lui transmet les pouvoirs de Shinigami et ouvre un nouveau chapitre.",
    "universe": "Bleach",
    "requirements": {
      "metric": "cards",
      "goal": 2,
      "card_ids": [
        "cseed-0098",
        "cseed-0099"
      ],
      "edges": [
        [
          0,
          1,
          "Transmission des pouvoirs"
        ]
      ]
    },
    "period": "once",
    "reward_kind": "title",
    "reward_label": "Aux portes de la Soul Society",
    "source_url": "https://bleach-anime.com/en/character/",
    "enabled": true,
    "secret": false,
    "revision": 1
  },
  {
    "id": "bleach-first-links",
    "kind": "mission",
    "title": "Premiers pas à Karakura",
    "description": "Réunis trois personnages différents de Bleach. Les exemplaires sont conservés.",
    "universe": "Bleach",
    "requirements": {
      "metric": "universe",
      "universe": "Bleach",
      "goal": 3
    },
    "period": "once",
    "reward_kind": "badge",
    "reward_label": "Échos de Karakura",
    "source_url": "",
    "enabled": true,
    "secret": false,
    "revision": 1
  },
  {
    "id": "demon-slayer-first-links",
    "kind": "mission",
    "title": "À travers la nuit",
    "description": "Réunis trois personnages différents de Demon Slayer.",
    "universe": "Demon Slayer",
    "requirements": {
      "metric": "universe",
      "universe": "Demon Slayer",
      "goal": 3
    },
    "period": "once",
    "reward_kind": "badge",
    "reward_label": "Lueur de l’aube",
    "source_url": "",
    "enabled": true,
    "secret": false,
    "revision": 1
  },
  {
    "id": "weekly-five-horizons",
    "kind": "mission",
    "title": "Cinq horizons cette semaine",
    "description": "Explore cinq univers différents cette semaine, à ton rythme.",
    "universe": "",
    "requirements": {
      "metric": "visits",
      "goal": 5
    },
    "period": "week",
    "reward_kind": "badge",
    "reward_label": "Les cinq horizons",
    "source_url": "",
    "enabled": true,
    "secret": false,
    "revision": 1
  },
  {
    "id": "awakening-trio",
    "kind": "mission",
    "title": "Trois lumières",
    "description": "Débloque l’Éveil de trois cartes différentes. Aucun exemplaire n’est consommé.",
    "universe": "",
    "requirements": {
      "metric": "awakenings",
      "goal": 3
    },
    "period": "once",
    "reward_kind": "decoration",
    "reward_label": "Trio lumineux",
    "source_url": "",
    "enabled": true,
    "secret": false,
    "revision": 1
  },
  {
    "id": "festival-des-liens-draft",
    "kind": "event",
    "title": "Festival des liens",
    "description": "Brouillon à personnaliser : réunis dix personnages différents pour obtenir l’insigne du festival. Vérifie les dates avant de publier.",
    "universe": "",
    "requirements": {
      "metric": "total",
      "goal": 10
    },
    "period": "once",
    "reward_kind": "badge",
    "reward_label": "Souvenir du Festival des liens",
    "source_url": "",
    "starts_at": "2026-11-07T00:00:00Z",
    "ends_at": "2026-11-14T00:00:00Z",
    "enabled": false,
    "secret": false,
    "revision": 1
  }
]
  ]);
})();
