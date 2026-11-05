/* A personal hall of achievements. No shared ranks are invented. */
renderRanking=function(){
  const desc=$('rankDescription'),pod=$('rankPodium'),list=$('rankList');if(!desc||!pod||!list)return;
  const account=window.KizunaAccount?.getSnapshot?.()||{},loading=!!account.loading;
  const metric=rankMetrics(),mode=RANK_MODES[rankMode]||RANK_MODES.collection;
  const name=account.profile?.username||state.username||'Invité',q=($('rankSearch')?.value||'').trim().toLocaleLowerCase('fr');
  const scores={collection:metric.unique,prestige:metric.prestige,mythiques:metric.myth,series:metric.series,success:metric.success},score=scores[rankMode]??metric.unique;
  const ownedIds=new Set(state.owned.map(x=>String(x.id))),ownedCards=LOCAL_CARDS.filter(c=>ownedIds.has(String(c.id))).sort((a,b)=>rarityFor(b).level-rarityFor(a).level||(b.fav||0)-(a.fav||0));
  const favorite=ownedCards.find(c=>String(c.id)===String(account.profile?.avatar_card_id))||ownedCards[0];
  desc.textContent=mode.desc;
  const heading=document.querySelector('#ranking .rank-title');if(heading)heading.textContent='Le palmarès des liens';
  document.querySelector('#ranking .rank-local-pill').textContent=account.user?'Ton compte':'Ton parcours invité';
  document.querySelector('#ranking .rank-note').textContent='Le classement entre joueurs n’est pas disponible. Les valeurs présentées ici proviennent uniquement de ta collection ; aucun rang global ne t’est attribué.';
  $('rankSearch')?.setAttribute('aria-label','Rechercher mon pseudo');if($('rankSearch'))$('rankSearch').placeholder='Rechercher mon pseudo…';
  document.querySelectorAll('#rankTabs button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rank===rankMode)));
  pod.innerHTML='<article class="kad-prestige-seat"><span class="kad-laurel" aria-hidden="true">✧</span><span class="section-kicker">TA PLACE DANS L’AVENTURE</span><h3>'+esc(name)+'</h3><p>'+esc(account.user?'Collection liée à ton compte':'Collection de cet appareil')+'</p><strong class="rank-score">'+(loading?'—':fmt(score))+'</strong><span class="rank-score-label">'+esc(mode.label)+'</span><span class="kad-personal-seal">PARCOURS PERSONNEL</span></article><div class="kad-prestige-card">'+(!loading&&favorite?'<button type="button" data-kad-rank-card="'+esc(favorite.id)+'" aria-label="Voir '+esc(favorite.name)+'"><img src="'+esc(favorite.image)+'" alt="" decoding="async"><span>'+esc(favorite.rarity)+'</span><strong>'+esc(favorite.name)+'</strong></button>':'<div class="kad-empty-trophy" aria-hidden="true">絆</div>')+'</div><aside class="kad-ranking-future"><span aria-hidden="true">♜</span><h3>Le club écrira la suite.</h3><p>Le podium partagé apparaîtra quand le classement entre joueurs sera disponible.</p><span>Classement global indisponible</span></aside>';
  pod.querySelector('[data-kad-rank-card]')?.addEventListener('click',()=>openDetail(favorite));
  if(q&&!name.toLocaleLowerCase('fr').includes(q)){list.innerHTML='<p class="rank-empty">Aucun pseudo correspondant dans ce parcours.</p>';return;}
  const progress=metric.total?Math.min(100,metric.unique/metric.total*100):0;
  list.innerHTML='<div class="rank-row me"><span class="rank-position" aria-hidden="true">✦</span><div class="rank-user"><span class="rank-mini-avatar">'+esc(name.charAt(0).toUpperCase())+'</span><div class="rank-user-copy"><b>'+esc(name)+'</b><small>'+esc(mode.label)+' · '+(account.user?'ton compte':'cet appareil')+'</small>'+(rankMode==='collection'?'<div class="rank-progress"><i style="width:'+progress+'%"></i></div>':'')+'</div></div><span class="rank-badge">PERSONNEL</span><div class="rank-row-score">'+(loading?'—':fmt(score))+'<small>'+esc(mode.label)+'</small></div></div>';
};
