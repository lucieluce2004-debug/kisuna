/* Rebirth presentation. Existing nodes and game handlers retain ownership of state. */
requestAnimationFrame(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const fold = (label, nodes, className) => {
    const details = document.createElement('details');
    details.className = 'rb-disclosure ' + className;
    const summary = document.createElement('summary'); summary.textContent = label;
    details.append(summary); nodes[0].before(details); details.append(...nodes);
    return details;
  };
  document.body.classList.add('rebirth');
  const scene = $('.ka-lobby-scene');
  if (scene) {
    $('.ka-lobby-eyebrow').textContent = 'KIZUNA REBIRTH · LA CITÉ DES LIENS';
    $('.ka-lobby-intro h1').innerHTML = 'Un portail.<br><em>Mille rencontres.</em>';
    $('#kzFeaturedOpen').textContent = 'Ouvrir un booster';
    const progress = $('.kz-home-progress');
    fold('Mon carnet de collection', [progress], 'rb-journal');
    const news = $('.kz-home-news');
    // Keep discovery and error states available; only their density changes.
    $('#kzHomeError') && scene.after($('#kzHomeError'));
    fold('Découvrir les personnages', [news], 'rb-discoveries');
    const activities = $('.kg-activity-map');
    const more = document.createElement('details'); more.className = 'rb-activities';
    more.innerHTML = '<summary><i aria-hidden="true">✧</i><span><strong>Activités</strong><small>Choisis ton aventure</small></span></summary><div></div>';
    for (const key of ['events', 'missions', 'sanctuary']) {
      const button = activities.querySelector('[data-kg-go="' + key + '"]');
      if (button) more.lastElementChild.append(button);
    }
    activities.append(more);
    $('.ka-lobby-journeys header')?.remove();
  }
  const panel = $('.kb-panel');
  if (panel) {
    $('.kb-head h2').textContent = 'Le sanctuaire des invocations';
    const stage = document.createElement('div'); stage.className = 'rb-booster-stage';
    stage.innerHTML = '<div class="rb-altar" aria-hidden="true"><span>絆</span></div>';
    const facts=document.createElement('p');facts.className='rb-pack-facts';facts.textContent='5 cartes · Rare ou mieux garantie';panel.querySelector('.kb-sel').after(facts);
    $('.kb-layout').prepend(stage); stage.append(panel);
    fold('Probabilités & garanties', [$('.kb-st'), $('#kgPackPreview'), $('.kb-cap'), $('#kBars'), $('.kb-odds-note')].filter(Boolean), 'rb-odds');
    const multiple = $('.kb-multi'); fold('Ouvrir plusieurs paquets', [multiple], 'rb-multiple');
    // Preserve the existing carousel and its handlers; the selected pack owns the stage.
    const sync = () => {
      const selected = $('#kGrid [aria-pressed="true"]');
      stage.dataset.booster = $('#kMark')?.dataset.booster || 'mix';
      const illustration = selected?.querySelector('img:not(.booster-logo)');
      if (illustration) stage.style.setProperty('--rb-pack-image', 'url("' + illustration.getAttribute('src').replace(/["\\]/g, '') + '")');
    };
    new MutationObserver(sync).observe($('#kMark'), {attributes:true, childList:true, subtree:true}); sync();
  }
  document.addEventListener('error', event => {
    const image=event.target;
    if(image.tagName==='IMG' && image.closest('#kyaraRevealRoot') && !image.dataset.rbFallback){
      image.dataset.rbFallback='true';image.src='assets/rebirth/portrait-unavailable.svg';
    }
  }, true);
  const root = $('#kyaraRevealRoot');
  if (root) {
    const observer = new MutationObserver(() => {
      if (root.dataset.phase !== 'finale' || root.querySelector('.rb-summary-more')) return;
      const extra = [...root.querySelectorAll('[data-kr-action="change"], [data-kr-action="image"], [data-kr-action="copy"]')];
      if (extra.length) fold('Autres actions', extra, 'rb-summary-more');
    });
    observer.observe(root, {childList:true, subtree:true});
  }
});
