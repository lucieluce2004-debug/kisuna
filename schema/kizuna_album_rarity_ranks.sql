-- Extend album popularity bands to Mythique 1..5, Legendaire 6..10, Epique
-- 11..15. Keep existing triggers, locks, grants and minimum-two constraints.
-- Only rarity/pow/aura/rarity_policy metadata may change.
create or replace function private.kizuna_rarity_stats(p_id text,p_rarity text)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare h bigint:=7;signed_h bigint;i integer;minimum integer;spread integer;offset_value integer;power integer;
begin
  for i in 1..char_length(p_id) loop h:=(h*31+ascii(substr(p_id,i,1)))%4294967296; end loop;
  case p_rarity
    when 'Mythique' then minimum:=96;spread:=4;offset_value:=25;
    when 'Légendaire' then minimum:=90;spread:=7;offset_value:=30;
    when 'Épique' then minimum:=84;spread:=10;offset_value:=30;
    when 'Rare' then minimum:=72;spread:=9;offset_value:=26;
    when 'Peu commune' then minimum:=58;spread:=8;offset_value:=16;
    else minimum:=48;spread:=8;offset_value:=14;
  end case;
  signed_h:=case when h>=2147483648 then h-4294967296 else h end;
  power:=minimum+(h%spread)::integer;
  return jsonb_build_object('rarity',p_rarity,'pow',power,'aura',power-offset_value+((signed_h>>3)%3)::integer,'rarity_policy','album-ranks-v2');
end;
$$;
create or replace function private.kizuna_rebalance_album_mythics()
returns jsonb language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(17493,500);
  with known as (
    select c.id,c.card,private.kizuna_card_source(c.source_id,c.card) as source,
      private.kizuna_card_favourites(c.card) as fav,lower(btrim(coalesce(c.card->>'series',''))) as series
    from public.kizuna_cards c
  ), memberships as (
    select 'album:'||a.id::text as album_key,k.id,k.source,k.fav
    from public.kizuna_albums a join public.kizuna_album_cards m on m.album_id=a.id join known k on k.id=m.card_id
    union all
    select 'series:'||k.series,k.id,k.source,k.fav from known k
    where k.series<>'' and not exists(select 1 from public.kizuna_albums a where lower(btrim(a.name))=k.series)
  ), characters as (
    select album_key,source,max(fav) as fav from memberships where source is not null group by album_key,source
  ), ranked as (
    select source,row_number() over(partition by album_key order by fav desc,source::bigint asc) as place from characters
  ), priorities as (
    select source,min(case when place<=5 then 1 when place<=10 then 2 else 3 end) as priority
    from ranked where place<=15 group by source
  ), desired as (
    select k.id,case
      when k.source='53901' or p.priority=1 then 'Mythique'
      when p.priority=2 then 'Légendaire'
      when p.priority=3 then 'Épique'
      when k.fav>=2500 then 'Rare'
      when k.fav>=1000 then 'Peu commune'
      else 'Commun' end as rarity
    from known k left join priorities p on p.source=k.source
  ), values_to_write as (
    select d.id,private.kizuna_rarity_stats(d.id,d.rarity) as rarity_values from desired d
  )
  update public.kizuna_cards c set card=c.card||v.rarity_values from values_to_write v
    where c.id=v.id and c.card is distinct from c.card||v.rarity_values;
  get diagnostics changed=row_count;
  return jsonb_build_object('updated',changed);
end;
$$;

-- Replacements retain their existing, private execution privileges. The
-- helper also stamps unchanged rarity rows with this policy's new marker.
select private.kizuna_rebalance_album_mythics();
