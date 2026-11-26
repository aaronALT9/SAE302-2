'use strict';
/* ============================================================================
   SAÉ 303-2 – Chart.js (+ GSAP) – données : Defra Family Food FYE 2025
   ============================================================================
   VUE D'ENSEMBLE
   Ce script fait 3 choses :
   1. Il charge deux fichiers JSON (aliments + dépenses).
   2. Il dessine 2 graphiques avec Chart.js :
        - Figure 1 (#chart-spend)  : dépenses « à la maison » vs « au restaurant »
        - Figure 2 (#chart-groups) : évolution des achats par groupe d'aliments
   3. Il ajoute des animations avec GSAP (barre de progression, compteurs,
      apparition au scroll, animation de rejeu du graphique, etc.)

   - Chart.js = la bibliothèque qui DESSINE les graphiques (dans un <canvas>).
   - GSAP     = la bibliothèque qui ANIME des valeurs dans le temps.
   - ScrollTrigger = plugin GSAP qui déclenche des animations au scroll.

   'use strict' (ligne 1) : active le mode strict de JavaScript. Il interdit
   certaines mauvaises pratiques (ex : utiliser une variable non déclarée) et
   fait remonter les erreurs plus tôt. C'est une bonne habitude.
   ============================================================================ */

/* Tout le code est enveloppé dans une IIFE : (function () { ... })();
   = une fonction qui s'exécute immédiatement, sans attendre qu'on l'appelle.
   Intérêt : toutes les variables restent PRIVÉES à ce fichier et ne polluent
   pas l'espace global (window). Ça évite les conflits avec d'autres scripts. */
(function () {

  /* ---------- Constantes de configuration ---------- */

  // L'utilisateur a-t-il demandé « moins d'animations » dans son système
  // (réglage d'accessibilité) ? matchMedia renvoie un objet dont .matches
  // vaut true/false. On s'en sert partout plus bas pour couper les animations.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Palette de couleurs centralisée (objet C) : si tu veux changer une couleur,
  // tu la modifies ici une seule fois.
  //  fall/rise : barres « acheté moins » / « acheté plus » (fig. 2)
  //  home/out  : barres « à la maison » / « au restaurant » (fig. 1)
  //  ink       : couleur du texte ; grid : couleur des lignes de grille
  const C = { fall: '#34a15f', rise: '#99FF66', home: '#34a15f', out: '#99FF66', ink: '#e9f1ec', grid: 'rgba(255,255,255,.12)' };

  // Raccourci pour document.querySelector : $('#id') au lieu de l'écrire en entier.
  const $ = (s) => document.querySelector(s);

  // n0 = « nombre à 0 décimale » : arrondit puis formate à l'anglaise
  // (ex : 1234.7 -> "1,235"). 'en-GB' met la virgule comme séparateur de milliers.
  const n0 = (v) => Math.round(v).toLocaleString('en-GB');

  // fmt = formate un nombre avec d décimales fixes (1 par défaut).
  // Ex : fmt(12.3456) -> "12.3" ; fmt(5, 2) -> "5.00".
  // minimumFractionDigits = maximumFractionDigits force un nombre constant de décimales.
  const fmt = (n, d = 1) => n.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ---------- État de l'application ---------- */

  // state = l'ensemble des choix de l'utilisateur + l'avancement de l'animation.
  //   base     : année de départ de la comparaison (comparée à FYE 2025)
  //   type     : filtre sur le type d'aliment ('all' = tous)
  //   sort     : critère de tri ('fall' | 'rise' | 'alpha')
  //   selected : nom du groupe cliqué ('' = aucun)
  //   t        : progression de l'animation de 0 à 1 (voir replay()).
  //              Si reduce est vrai, on met 1 direct = graphique déjà complet.
  const state = { base: 2022, type: 'all', sort: 'fall', selected: '', t: reduce ? 1 : 0 };

  // Variables « globales au script », remplies plus tard :
  //   groups     : liste des groupes d'aliments (venant du JSON)
  //   years      : liste des années (venant du JSON)
  //   view       : lignes actuellement affichées (après filtre + tri)
  //   chartGroups: l'instance Chart.js de la figure 2
  //   chartSpend : l'instance Chart.js de la figure 1
  //   spendData  : données de dépenses (JSON)
  //   spendMode  : 'gbp' (en livres) ou 'share' (en % du total)
  let groups = [], years = [], view = [], chartGroups, chartSpend, spendData, spendMode = 'gbp';

  /* ---------- Vérification des bibliothèques ---------- */

  // Si le CDN de Chart.js ou de GSAP n'a pas chargé (pas d'internet, bloqueur…),
  // typeof ... === 'undefined' est vrai. On affiche un message d'erreur
  // (role="alert" = lu par les lecteurs d'écran) et on STOPPE le script avec return.
  if (typeof Chart === 'undefined' || typeof gsap === 'undefined') {
    document.body.insertAdjacentHTML('afterbegin', '<p role="alert">Libraries could not be loaded.</p>');
    return;
  }

  // On « enregistre » le plugin ScrollTrigger auprès de GSAP, sinon il ne marche pas.
  gsap.registerPlugin(ScrollTrigger);

  // Si l'utilisateur veut moins d'animations, on coupe celles de Chart.js.
  if (reduce) Chart.defaults.animation = false;

  // Réglages par défaut appliqués à TOUS les graphiques Chart.js :
  Chart.defaults.font.family = '"Hanken Grotesk", Roboto, Arial, sans-serif'; // police
  Chart.defaults.color = C.ink;                                               // couleur du texte
  Chart.defaults.borderColor = C.grid;                                        // couleur de la grille
  Chart.defaults.elements.bar.borderRadius = 6;                               // barres arrondies

  /* ==========================================================================
     CHARGEMENT DES DONNÉES
     ========================================================================== */

  // fetch() télécharge un fichier. Les deux requêtes partent EN MÊME TEMPS
  // grâce à Promise.all, et on attend que les deux soient terminées.
  Promise.all([fetch('data/food-groups.json'), fetch('data/expenditure.json')])
    // Étape 1 : transformer chaque réponse HTTP (r) en objet JS avec .json()
    // (.json() est lui-même asynchrone, d'où le 2e Promise.all).
    .then((r) => Promise.all(r.map((x) => x.json())))
    // Étape 2 : on récupère les 2 objets (g = groupes, e = dépenses) grâce à
    // la déstructuration [g, e]. On les range dans nos variables puis on lance init().
    .then(([g, e]) => { groups = g.groups; years = g.years; spendData = e; init(); })
    // Si une erreur arrive (fichier introuvable, JSON invalide, ouverture en file://…)
    // on affiche un message utile. fetch est bloqué en file:// d'où le message
    // « ouvrez via un serveur web ».
    .catch(() => {
      document.getElementById('fig2').insertAdjacentHTML('afterbegin',
        '<p role="alert">Data could not be loaded. Open this page through a web server, not by double-clicking the file.</p>');
    });

  /* ==========================================================================
     rows() : prépare les données de la figure 2
     ==========================================================================
     Elle ne dessine rien : elle CALCULE la liste des lignes à afficher selon
     les choix de l'utilisateur (année de base, type, tri).
     Elle renvoie un tableau d'objets { name, unit, v0, v1, pct }.
  */
  function rows() {
    // i0 = position de l'année de base dans le tableau des années
    // i1 = position de la dernière année (FYE 2025)
    const i0 = years.indexOf(state.base), i1 = years.length - 1;

    const list = groups
      // 1) FILTRE : on garde tout si 'all', sinon seulement le type choisi
      .filter((g) => state.type === 'all' || g.type === state.type)
      // 2) TRANSFORMATION : pour chaque groupe on construit une ligne
      .map((g) => ({
        name: g.name,           // nom du groupe (ex : "Fresh fruit")
        unit: g.unit,           // unité (ex : "g")
        v0: g.values[i0],       // valeur de l'année de base
        v1: g.values[i1],       // valeur de la dernière année
        // variation en pourcentage : (nouvelle - ancienne) / ancienne * 100
        pct: (g.values[i1] - g.values[i0]) / g.values[i0] * 100
      }));

    // Les 3 façons de trier, stockées dans un objet (plus propre qu'un if/else) :
    //  fall  : du plus négatif au moins négatif (plus grosse baisse en haut)
    //  rise  : du plus positif au moins positif (plus grosse hausse en haut)
    //  alpha : ordre alphabétique (localeCompare gère les accents)
    const sorts = { fall: (a, b) => a.pct - b.pct, rise: (a, b) => b.pct - a.pct, alpha: (a, b) => a.name.localeCompare(b.name) };

    // On applique le tri choisi par l'utilisateur (state.sort) et on renvoie.
    return list.sort(sorts[state.sort]);
  }

  /* ==========================================================================
     FIGURE 2 : graphique en barres horizontales (Chart.js)
     ========================================================================== */

  // shade() : choisit la couleur d'une barre.
  // Chart.js l'appelle pour CHAQUE barre (ctx.dataIndex = numéro de la barre).
  // Si un groupe est sélectionné et que cette barre n'est pas lui, on ajoute
  // '55' à la fin de la couleur hex => c'est la transparence (canal alpha),
  // donc la barre devient pâle. La barre sélectionnée reste bien visible.
  function shade(ctx, color) {
    const r = view[ctx.dataIndex];
    return state.selected && r && r.name !== state.selected ? color + '55' : color;
  }

  // fillData() : met à jour les DONNÉES du graphique (sans le redessiner).
  function fillData() {
    view = rows(); // on recalcule les lignes à afficher
    // Axe vertical : les noms des groupes
    chartGroups.data.labels = view.map((r) => r.name);
    // Dataset 0 « Bought less » : seulement les valeurs négatives, sinon null (= pas de barre)
    // Dataset 1 « Bought more » : seulement les valeurs positives
    // On multiplie par state.t (0 -> 1) : c'est ce qui permet l'animation
    // « les barres poussent depuis 0 » pilotée par GSAP (voir replay()).
    chartGroups.data.datasets[0].data = view.map((r) => (r.pct < 0 ? r.pct * state.t : null));
    chartGroups.data.datasets[1].data = view.map((r) => (r.pct >= 0 ? r.pct * state.t : null));
    // On adapte la hauteur du conteneur au nombre de barres (30px par barre
    // + 110px de marge, minimum 300px) pour que rien ne soit écrasé.
    $('#box-groups').style.height = Math.max(300, view.length * 30 + 110) + 'px';
  }

  // buildGroups() : CRÉE le graphique de la figure 2 (appelée UNE seule fois).
  function buildGroups() {
    chartGroups = new Chart($('#chart-groups'), {
      type: 'bar',
      data: { labels: [], datasets: [
        // Deux datasets (vide au départ, rempli par fillData).
        // backgroundColor est une FONCTION => Chart.js la rappelle pour chaque barre.
        { label: 'Bought less', data: [], backgroundColor: (c) => shade(c, C.fall) },
        { label: 'Bought more', data: [], backgroundColor: (c) => shade(c, C.rise), borderWidth: 0 }] },
      options: {
        indexAxis: 'y',                 // barres HORIZONTALES (l'axe des catégories devient y)
        responsive: true,               // s'adapte à la largeur du conteneur
        maintainAspectRatio: false,     // permet de contrôler la hauteur nous-mêmes
        scales: {
          // x = axe des pourcentages, borné de -40 % à +20 %. stacked:true =
          // les 2 datasets partagent la même ligne (un seul des deux a une valeur).
          x: { stacked: true, min: -40, max: 20, title: { display: true, text: 'Change in purchases per person (%)' }, ticks: { callback: (v) => v + '%' } },
          // y = noms. autoSkip:false => Chart.js n'a pas le droit de masquer des noms.
          y: { stacked: true, ticks: { autoSkip: false } } },
        plugins: {
          legend: { position: 'top' },
          // Tooltip personnalisé : ex « -12.3%  (1,200 → 1,050 g a week) »
          tooltip: { callbacks: { label: (c) => {
            const r = view[c.dataIndex];
            return fmt(r.pct) + '%  (' + n0(r.v0) + ' → ' + n0(r.v1) + ' ' + r.unit + ' a week)';
          } } } },
        // Clic sur une barre => on sélectionne ce groupe (els = barres cliquées)
        onClick: (e, els) => { if (els.length) select(view[els[0].index].name); },
        // Survol d'une barre => le curseur devient une main (pointer)
        onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; }
      }
    });
  }

  // refresh() : met TOUT à jour après un changement de filtre/tri.
  // mode = mode d'animation de Chart.js ('none' = pas d'animation, undefined = animation normale)
  function refresh(mode) {
    fillData();                 // recalcule les données
    chartGroups.update(mode);   // demande à Chart.js de redessiner
    fillTable();                // met à jour le tableau HTML (version accessible)
    // aria-label = description du graphique pour les lecteurs d'écran (accessibilité).
    // On y met l'année de base et le groupe qui a le plus baissé
    // (slice() copie le tableau pour ne pas modifier view en le triant).
    $('#chart-groups').setAttribute('aria-label', 'Horizontal bar chart: change in purchases since FYE ' + state.base +
      '. Largest fall: ' + view.slice().sort((a, b) => a.pct - b.pct)[0].name + '. Full data in the table below.');
  }

  // fillTable() : remplit un tableau HTML avec les mêmes données que le graphique.
  // Utile pour l'accessibilité (un graphique canvas est invisible pour un lecteur d'écran).
  function fillTable() {
    // En-tête : le nom de l'année de base change selon state.base
    $('#table-groups thead').innerHTML = '<tr><th>Food group</th><th>FYE ' + state.base + '</th><th>FYE 2025</th><th>Change</th></tr>';
    // Corps : une ligne <tr> par groupe, puis join('') colle tout en une seule chaîne HTML
    $('#table-groups tbody').innerHTML = view.map((r) =>
      '<tr><td>' + r.name + '</td><td>' + n0(r.v0) + ' ' + r.unit + '</td><td>' + n0(r.v1) + ' ' + r.unit + '</td><td>' + fmt(r.pct) + '%</td></tr>').join('');
  }

  /* ==========================================================================
     PANNEAU DE SÉLECTION (compteur GSAP déclenché par un clic Chart.js)
     ========================================================================== */

  // Objet « bidon » dont GSAP va animer la propriété v (le chiffre affiché).
  // GSAP peut animer N'IMPORTE quelle propriété numérique d'un objet, pas
  // seulement du CSS.
  const counter = { v: 0 };

  // select() : appelée quand on clique une barre OU qu'on choisit dans le <select>.
  function select(name) {
    state.selected = name;                 // on mémorise le groupe choisi
    $('#focus').value = name;              // on synchronise le menu déroulant
    const r = view.find((x) => x.name === name); // on retrouve sa ligne de données
    chartGroups.update('none');            // on redessine (les autres barres deviennent pâles via shade)
    if (!r) return;                        // sécurité : groupe introuvable => on s'arrête

    // Remplissage des textes du panneau de détail
    $('#detail-name').textContent = r.name;
    $('#detail-unit').textContent = r.unit + ' per person per week in FYE 2025';
    // Phrase du type « That is 12.3% less than the 1,200 g bought in FYE 2022. »
    // Math.abs enlève le signe moins, et on choisit less/more selon le signe.
    $('#detail-text').textContent = 'That is ' + fmt(Math.abs(r.pct)) + '% ' + (r.pct < 0 ? 'less' : 'more') +
      ' than the ' + n0(r.v0) + ' ' + r.unit + ' bought in FYE ' + state.base + '.';

    // On stoppe toute animation précédente du compteur (évite les conflits si on clique vite)
    gsap.killTweensOf(counter);
    // Animation du compteur : de sa valeur actuelle jusqu'à r.v1 en 0,9 s.
    // ease 'power2.out' = démarre vite, ralentit à la fin.
    // onUpdate est appelée à CHAQUE image : on écrit la valeur arrondie dans le HTML.
    gsap.to(counter, { v: r.v1, duration: reduce ? 0 : 0.9, ease: 'power2.out',
      onUpdate: () => { $('#detail-value').textContent = Math.round(counter.v).toLocaleString('en-GB'); } });
    // Petit effet d'apparition du panneau : fondu + glissement de 8px vers le haut
    gsap.fromTo('#detail', { opacity: 0.4, y: 8 }, { opacity: 1, y: 0, duration: reduce ? 0 : 0.4 });
  }

  /* ==========================================================================
     replay() : GSAP anime les données que Chart.js dessine
     ==========================================================================
     C'est l'astuce principale du script : au lieu d'utiliser l'animation
     intégrée de Chart.js, on anime state.t de 0 à 1 avec GSAP, et à chaque
     image on recalcule les données (valeur * t) puis on redessine sans
     animation. Résultat : les barres « poussent » depuis zéro, avec le
     contrôle total de GSAP (durée, easing, rejouable).
  */
  function replay() {
    gsap.killTweensOf(state);  // stoppe un éventuel replay déjà en cours
    state.t = 0;               // on repart de zéro
    gsap.to(state, { t: 1, duration: reduce ? 0 : 1.8, ease: 'power2.out',
      onUpdate: () => { fillData(); chartGroups.update('none'); } });
  }

  /* ==========================================================================
     FIGURE 1 : dépenses à la maison vs au restaurant
     ========================================================================== */

  // spendValues() : renvoie [donnéesMaison, donnéesRestaurant] selon le mode.
  function spendValues() {
    const { home, out } = spendData;           // déstructuration des deux séries
    if (spendMode === 'gbp') return [home, out]; // mode livres : valeurs brutes
    // Mode « share » : on convertit en pourcentage du total de chaque année.
    // tot = tableau des totaux année par année (maison + resto)
    const tot = home.map((h, i) => h + out[i]);
    return [home.map((h, i) => h / tot[i] * 100), out.map((o, i) => o / tot[i] * 100)];
  }

  // buildSpend() : crée le graphique de la figure 1 (appelée une seule fois).
  function buildSpend() {
    const [h, o] = spendValues();
    chartSpend = new Chart($('#chart-spend'), {
      type: 'bar',   // barres verticales empilées (stacked) : maison + resto = total
      data: { labels: spendData.years, datasets: [
        { label: 'At home', data: h, backgroundColor: C.home },
        { label: 'Eating out', data: o, backgroundColor: C.out, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '£ per person per week' }, ticks: { callback: (v) => '£' + v } } },
        plugins: { legend: { position: 'top' }, tooltip: { callbacks: { label: (c) =>
          // Tooltip : « At home: £45.20 » ou « At home: 62.3% » selon le mode
          c.dataset.label + ': ' + (spendMode === 'gbp' ? '£' + fmt(c.parsed.y, 2) : fmt(c.parsed.y) + '%') } } } }
    });
  }

  // setSpendMode() : bascule entre « £ » et « % du total » (boutons de la fig. 1).
  function setSpendMode(mode) {
    spendMode = mode;
    const [h, o] = spendValues();                 // nouvelles valeurs selon le mode
    chartSpend.data.datasets[0].data = h;         // on remplace les données…
    chartSpend.data.datasets[1].data = o;
    const pct = mode === 'share';
    // …et on adapte le titre et le format de l'axe vertical (£ ou %)
    chartSpend.options.scales.y.title.text = pct ? 'Share of total spending (%)' : '£ per person per week';
    chartSpend.options.scales.y.ticks.callback = (v) => (pct ? v + '%' : '£' + v);
    chartSpend.update();                          // redessine avec animation Chart.js
    // aria-pressed = indique au lecteur d'écran quel bouton est actif (et permet de le styliser en CSS)
    document.querySelectorAll('#fig1 [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }

  /* ==========================================================================
     EFFETS DE PAGE (GSAP + ScrollTrigger)
     ========================================================================== */
  function effects() {
    // 1) Barre de progression de lecture : #progress passe de scaleX 0 à 1
    // pendant qu'on scrolle de 0 jusqu'à la fin de page ('max').
    // scrub:true = l'animation est liée à la position du scroll.
    gsap.to('#progress', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });

    // 2) Compteurs animés : tout élément avec data-count="123" compte de 0 à 123.
    document.querySelectorAll('[data-count]').forEach((el) => {
      // o = objet animé ; target = valeur finale (lue dans data-count) ;
      // d = nombre de décimales (data-dec), le + convertit en nombre, || 0 par défaut
      const o = { v: 0 }, target = parseFloat(el.dataset.count), d = +el.dataset.dec || 0;
      // write() écrit la valeur courante, avec préfixe/suffixe optionnels (ex : "£", "%")
      const write = () => { el.textContent = (el.dataset.prefix || '') + fmt(o.v, d) + (el.dataset.suffix || ''); };
      // Si « moins d'animations » : on ne fait rien, le HTML garde sa valeur finale
      if (reduce) return;
      // Le compteur démarre quand l'élément atteint 90 % de la hauteur de l'écran,
      // une seule fois (once:true).
      ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true,
        onEnter: () => gsap.to(o, { v: target, duration: 1.4, ease: 'power1.out', onUpdate: write }) });
      o.v = 0; write(); // affichage initial à 0 avant le scroll
    });

    // 3) Apparition au scroll : chaque élément .reveal apparaît en fondu
    // en glissant de 24px depuis le bas, une seule fois.
    if (!reduce) document.querySelectorAll('.reveal').forEach((el) =>
      gsap.from(el, { opacity: 0, y: 24, duration: 0.7, scrollTrigger: { trigger: el, start: 'top 88%', once: true } }));

    // 4) Le graphique de la figure 2 se « rejoue » automatiquement quand
    // on arrive dessus (replay) – sinon l'animation aurait lieu hors écran.
    ScrollTrigger.create({ trigger: '#fig2', start: 'top 70%', once: true, onEnter: replay });
  }

  /* ==========================================================================
     init() : le CHEF D'ORCHESTRE – lancée une fois les données chargées
     ========================================================================== */
  function init() {
    // Remplit le menu déroulant #focus avec une <option> par groupe d'aliments
    $('#focus').insertAdjacentHTML('beforeend', groups.map((g) => '<option>' + g.name + '</option>').join(''));

    // Construit les deux graphiques, remplit tout, puis active les effets de page
    buildGroups(); buildSpend(); refresh('none'); effects();

    // Le formulaire #controls ne doit jamais recharger la page
    $('#controls').addEventListener('submit', (e) => e.preventDefault());

    // DÉLÉGATION D'ÉVÉNEMENTS : un seul écouteur sur le formulaire qui capte le
    // changement de TOUS ses champs (au lieu d'un écouteur par champ).
    // e.target = le champ modifié ; name = son attribut name ; value = sa valeur.
    $('#controls').addEventListener('change', (e) => {
      const { name, value } = e.target;
      if (name === 'base') state.base = +value;        // année de base (+ = convertit en nombre)
      else if (name === 'type') state.type = value;    // type d'aliment
      else if (name === 'sort') state.sort = value;    // tri
      else if (name === 'focus') { select(value); return; } // choix d'un groupe => select et on sort
      // Si le groupe sélectionné n'existe plus avec le nouveau filtre, on le désélectionne
      if (state.selected && !rows().some((r) => r.name === state.selected)) state.selected = '';
      refresh();                                        // redessine graphique + tableau
      if (state.selected) select(state.selected);       // remet à jour le panneau de détail
    });

    // Bouton « Replay » => relance l'animation des barres
    $('#replay').addEventListener('click', replay);

    // Boutons de la figure 1 : un seul écouteur sur #fig1 ; closest() remonte
    // jusqu'au bouton [data-mode] cliqué (même si on clique sur un élément à l'intérieur)
    $('#fig1').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (b) setSpendMode(b.dataset.mode);
    });
  }
})();