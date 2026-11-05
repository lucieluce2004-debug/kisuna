-- Real seven-day pilot. Dates are stamped by the database when this release is applied.
-- No participant, progress, claim or balance is seeded.
do $$declare event_id uuid;content jsonb;begin
 content:=kizuna_private.anomaly_validate(jsonb_build_object(
 'title','Convergence des Univers',
 'description','Six défis, des rencontres inattendues et une signature à façonner. Ouvre tes boosters, explore plusieurs animes et fais résonner tes Mythiques. Les défis Prestige sont facultatifs : chaque récompense se gagne indépendamment.',
 'theme','convergence','image','','image_source','',
 'starts_at',now(),'ends_at',now()+interval '7 days',
 'challenges','[
 {"id":"premiers-liens","label":"Trois portes ouvertes","description":"Ouvre 3 boosters pendant la Convergence.","difficulty":"discovery","metric":"boosters","goal":3,"reward":{"kind":"badge","label":"Insigne de la Convergence","style":"convergence"}},
 {"id":"cinq-rencontres","label":"Des visages, des histoires","description":"Obtiens 5 personnages distincts dans tes boosters.","difficulty":"discovery","metric":"characters","goal":5,"reward":{"kind":"title","label":"Éclaireur des Univers","style":"convergence"}},
 {"id":"trois-horizons","label":"Au-delà des frontières","description":"Obtiens des cartes de 3 animes différents dans tes boosters.","difficulty":"collector","metric":"universes","goal":3,"reward":{"kind":"background","label":"Ciel des Univers","style":"convergence"}},
 {"id":"liens-retrouves","label":"Les liens se renforcent","description":"Retrouve 10 doublons dans tes boosters. Tes cartes restent dans ta collection.","difficulty":"collector","metric":"duplicates","goal":10,"reward":{"kind":"decoration","label":"Constellation des Rencontres","style":"convergence"}},
 {"id":"premier-echo","label":"Un écho mythique","description":"Gagne 1 Résonance grâce à un doublon mythique issu d’un booster.","difficulty":"prestige","metric":"resonance","goal":1,"reward":{"kind":"effect","label":"Lueur de Convergence","style":"convergence"}},
 {"id":"premiere-revelation","label":"La Révélation","description":"Débloque au moins un Éveil I, II ou III pendant l’événement.","difficulty":"prestige","metric":"awakenings","goal":1,"min_level":1,"reward":{"kind":"frame","label":"Cadre du Lien Éveillé","style":"convergence"}}
 ]'::jsonb),true);
 insert into kizuna_private.kizuna_anomaly_drafts(config,revision,published_revision) values(content,1,1) returning id into event_id;
 insert into public.kizuna_anomalies(id,config,revision) values(event_id,content,1);
end; $$;
