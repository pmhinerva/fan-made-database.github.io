(function(){
"use strict";

/* ============ Data & Indices ============ */
const MONSTERS = window.DB_MONSTERS || [];
const ITEMS = window.DB_ITEMS || [];
const MAPS = window.DB_MAPS || [];
const COLLECTIONS = window.DB_MAPCOLLECTION || [];
const CARDSETS = window.DB_CARDCOLLECTION || [];
const HATCRAFT = (window.DB_HATCRAFT && window.DB_HATCRAFT.receitas) || [];
const HATCOST = (window.DB_HATCRAFT && window.DB_HATCRAFT.custo) || { zeny:0, aureum:0 };

const monById = new Map(MONSTERS.map(m => [m.id, m]));
const itemById = new Map(ITEMS.map(i => [i.id, i]));
const mapByCode = new Map(MAPS.map(m => [m.codigo, m]));
/* a coleção é indexada por posição: 5 mapas não têm código na fonte e
   alguns nomes se repetem entre cidades */
COLLECTIONS.forEach((c, i) => { c.key = String(i); });
const colByKey = new Map(COLLECTIONS.map(c => [c.key, c]));
CARDSETS.forEach((c, i) => { c.key = String(i); });
const cardSetByKey = new Map(CARDSETS.map(c => [c.key, c]));
HATCRAFT.forEach((h, i) => { h.key = String(i); });
const hatByKey = new Map(HATCRAFT.map(h => [h.key, h]));
/* 4 cartas pertencem a duas coleções; este índice reverso permite avisar o
   jogador de que gastar a carta afeta os dois conjuntos */
const cardSetsByCardId = new Map();
CARDSETS.forEach(cs => cs.cartas.forEach(k => {
  if(!cardSetsByCardId.has(k.id)) cardSetsByCardId.set(k.id, []);
  cardSetsByCardId.get(k.id).push(cs);
}));

/* ============ Busca por efeito ============
   As descrições misturam acentuação ("Maximo"/"Máximo") e usam abreviações de
   atributo diferentes: cartas em português (FOR/DES/SOR), almas em inglês
   (STR/DEX/LUK). Normalizamos os dois lados para a forma PT, senão buscar
   "LUK +3" não encontraria as cartas com "SOR +3". */
const STAT_ALIASES = { str:'for', dex:'des', luk:'sor' };
function normalizeText(s){
  return (s === null || s === undefined ? '' : String(s))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(str|dex|luk)\b/g, m => STAT_ALIASES[m])
    .replace(/\s+/g, ' ')
    /* "LUK+3" e "LUK +3" viram a mesma coisa. Só antes de dígito, senão
       nomes hifenizados ("Batata-Doce") seriam quebrados. */
    .replace(/\s*([+-])\s*(?=\d)/g, ' $1')
    .trim();
}
/* índice montado uma vez: filtrar 7k descrições a cada tecla seria lento */
const itemSearchIndex = new Map(
  ITEMS.map(it => [it, normalizeText(`${it.nome || ''} ${it.descricao || ''}`)])
);
/* Casamento ancorado em início de palavra. Substring pura fazia "des +" bater
   dentro de "humanoiDES +5%"; ainda assim "por" acha "Poring", porque só o
   início do trecho precisa cair numa fronteira de palavra. Feito na mão (e não
   com \b) porque a busca pode começar com "+", que não é caractere de palavra. */
function matchesAtWordStart(text, nq){
  let i = text.indexOf(nq);
  while(i !== -1){
    if(i === 0 || !/[a-z0-9]/.test(text[i-1])) return true;
    i = text.indexOf(nq, i + 1);
  }
  return false;
}
function itemMatches(it, nq){
  if(!nq) return true;
  return String(it.id).includes(nq) || matchesAtWordStart(itemSearchIndex.get(it) || '', nq);
}
/* Quando o casamento veio da descrição e não do nome, devolve o trecho que
   bateu — senão o resultado parece aleatório para quem buscou por efeito. */
function effectSnippet(it, nq){
  if(!nq) return '';
  if(matchesAtWordStart(normalizeText(it.nome), nq)) return '';
  const parts = cleanDescription(it.descricao).split('\n');
  const hit = parts.find(p => matchesAtWordStart(normalizeText(p), nq));
  if(!hit) return '';
  const clean = hit.replace(/^Efeito:\s*/i, '').trim();
  return clean.length > 60 ? clean.slice(0, 57) + '…' : clean;
}

/* ============ Helpers ============ */
function esc(s){
  if(s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtNum(n){
  if(n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if(isNaN(num)) return esc(n);
  return num.toLocaleString('pt-BR');
}
function fmtPct(n){
  if(n === null || n === undefined || n === '') return '—';
  const num = Number(n) * 100;
  if(isNaN(num)) return '—';
  if(num >= 100) return '100%';
  if(num < 0.01) return num.toFixed(4) + '%';
  if(num < 1) return num.toFixed(2) + '%';
  return num.toFixed(2).replace(/\.?0+$/,'') + '%';
}
function elementBase(el){
  if(!el) return '';
  return el.replace(/\s*\d+$/,'').trim();
}
function monsterIconPath(m){ return `images/monsters/${esc(encodeURIComponent(m.id))}.gif`; }
/* Cada alma tem ícone próprio (images/souls/), e a cor do cristal indica o
   nível: azul = normal, roxo = mini-chefe, vermelho = MVP. Poucas almas não
   têm ícone e caem no genérico. */
const SOUL_ICON = 'https://i.imgur.com/ePtDthB.png';
const SOUL_ICON_IDS = new Set((window.DB_SOULICONS || []).map(Number));
function soulIconPath(id){
  return SOUL_ICON_IDS.has(Number(id)) ? `images/souls/${encodeURIComponent(id)}.png` : SOUL_ICON;
}
function isSoul(it){ return Number(it.id) >= 2000000; }
/* As 487 almas vêm gravadas como tipo "Carta". Para filtro e exibição elas são
   uma categoria própria — use sempre isto no lugar de it.tipo. */
function itemTipo(it){ return isSoul(it) ? 'Alma' : (it.tipo || ''); }
function itemIconPath(it){
  if(isSoul(it)) return soulIconPath(it.id);
  const id = esc(encodeURIComponent(it.id));
  if(it.tipo === 'Carta') return `https://game.ragnaplace.com/ro/bro/card/${id}.webp`;
  return `https://game.ragnaplace.com/ro/laro/item/${id}.webp`;
}
function mapImagePath(codigo){
  return codigo ? `https://ragnarokdatabase.com/assets/images/maps/${esc(encodeURIComponent(codigo))}.png` : '';
}
function mapIconPath(mp){ return mapImagePath(mp.codigo); }

/* ID clicável que copia "@ws <id>" — o comando que se cola no chat do jogo.
   Só para itens; ID de monstro/mapa não serve para @ws. */
function copyIdHtml(id, cls){
  const v = esc(id);
  return `<span class="${cls} copy-id" data-copy-id="${v}" role="button" tabindex="0" title="Copiar @ws ${v}">#${v}</span>`;
}

function iconOrFallback(src, glyph, cls){
  if(src){
    return `<img src="${src}" loading="lazy" alt="" onerror="this.parentElement.innerHTML='<span class=\\'fallback-glyph\\'>${esc(glyph)}</span>'">`;
  }
  return `<span class="fallback-glyph">${esc(glyph)}</span>`;
}

function cleanDescription(desc){
  if(!desc) return '';
  return desc
    .split('  •  ')
    .map(s => s.trim())
    .filter(s => s && !/^-{3,}$/.test(s))
    .join('\n');
}

/* ============ State ============ */
const state = {
  tab: 'monstros',
  mon: { search:'', raca:'', elemento:'', tamanho:'', sort:'id', page:1 },
  item: { search:'', tipo:'', sort:'id', page:1 },
  map: { search:'', sort:'codigo', page:1 },
  col: { search:'', cidade:'', sort:'cidade', page:1 },
  card: { search:'', sort:'idx', page:1 },
  craft: { search:'', sort:'nome', page:1 },
};
const PAGE_SIZE = 60;

/* ============ Populate filter selects ============ */
function uniqueSorted(arr, key){
  return [...new Set(arr.map(x => x[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function fillSelect(id, values){
  const sel = document.getElementById(id);
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v;
    sel.appendChild(opt);
  });
}
fillSelect('monRaca', uniqueSorted(MONSTERS, 'raca'));
fillSelect('monElemento', [...new Set(MONSTERS.map(m => elementBase(m.elemento)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')));
fillSelect('monTamanho', uniqueSorted(MONSTERS, 'tamanho'));
fillSelect('itemTipo', [...new Set(ITEMS.map(itemTipo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')));
fillSelect('colCidade', uniqueSorted(COLLECTIONS, 'cidade'));

/* ============ Filtering ============ */
function getFilteredMonsters(){
  const s = state.mon;
  const q = s.search.trim().toLowerCase();
  let arr = MONSTERS.filter(m => {
    if(q && !(String(m.id).includes(q) || (m.nome||'').toLowerCase().includes(q))) return false;
    if(s.raca && m.raca !== s.raca) return false;
    if(s.elemento && elementBase(m.elemento) !== s.elemento) return false;
    if(s.tamanho && m.tamanho !== s.tamanho) return false;
    return true;
  });
  arr.sort((a,b) => {
    if(s.sort === 'nome') return (a.nome||'').localeCompare(b.nome||'', 'pt-BR');
    const av = Number(a[s.sort])||0, bv = Number(b[s.sort])||0;
    if(s.sort === 'id') return av - bv;
    return bv - av;
  });
  return arr;
}
function getFilteredItems(){
  const s = state.item;
  const nq = normalizeText(s.search);
  let arr = ITEMS.filter(it => {
    if(!itemMatches(it, nq)) return false;
    if(s.tipo && itemTipo(it) !== s.tipo) return false;
    return true;
  });
  arr.sort((a,b) => {
    if(s.sort === 'nome') return (a.nome||'').localeCompare(b.nome||'', 'pt-BR');
    if(s.sort === 'id') return (Number(a.id)||0) - (Number(b.id)||0);
    return (Number(b[s.sort])||0) - (Number(a[s.sort])||0);
  });
  return arr;
}
function getFilteredMaps(){
  const s = state.map;
  const q = s.search.trim().toLowerCase();
  let arr = MAPS.filter(mp => {
    if(q && !((mp.codigo||'').toLowerCase().includes(q) || (mp.nome||'').toLowerCase().includes(q))) return false;
    return true;
  });
  arr.sort((a,b) => {
    if(s.sort === 'codigo') return (a.codigo||'').localeCompare(b.codigo||'', 'pt-BR');
    if(s.sort === 'nome') return (a.nome||'').localeCompare(b.nome||'', 'pt-BR');
    return (Number(b[s.sort])||0) - (Number(a[s.sort])||0);
  });
  return arr;
}

/* Busca de coleção cobre nome do mapa, cidade, bônus e os itens exigidos —
   assim dá para achar "quais coleções pedem Peridoto". */
const colSearchIndex = new Map(
  COLLECTIONS.map(c => [c, normalizeText(
    `${c.nome} ${c.cidade} ${c.codigo} ${c.bonus} ${c.itens.map(i => i.nome).join(' ')}`
  )])
);
function getFilteredCollections(){
  const s = state.col;
  const nq = normalizeText(s.search);
  let arr = COLLECTIONS.filter(c => {
    if(nq && !matchesAtWordStart(colSearchIndex.get(c) || '', nq)) return false;
    if(s.cidade && c.cidade !== s.cidade) return false;
    return true;
  });
  arr.sort((a,b) => {
    if(s.sort === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR');
    if(s.sort === 'itens') return b.itens.length - a.itens.length;
    return a.cidade.localeCompare(b.cidade, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR');
  });
  return arr;
}

/* Busca de coleção de cartas cobre nome, bônus, efeitos dos níveis e as
   cartas que a compõem */
const cardSetSearchIndex = new Map(
  CARDSETS.map(c => [c, normalizeText(
    `${c.nome} ${c.bonus} ${c.tiers.map(t => t.efeito).join(' ')} ${c.cartas.map(k => k.nome).join(' ')}`
  )])
);
function getFilteredCardSets(){
  const s = state.card;
  const nq = normalizeText(s.search);
  let arr = CARDSETS.filter(c => !nq || matchesAtWordStart(cardSetSearchIndex.get(c) || '', nq));
  arr.sort((a,b) => s.sort === 'nome'
    ? a.nome.localeCompare(b.nome, 'pt-BR')
    : (a.idx || '').localeCompare(b.idx || '', 'pt-BR'));
  return arr;
}

/* Busca de craft cobre o nome do hat e os nomes dos materiais */
const hatSearchIndex = new Map(
  HATCRAFT.map(h => [h, normalizeText(`${h.nome} ${h.materiais.map(m => m.nome).join(' ')}`)])
);
function getFilteredHats(){
  const s = state.craft;
  const nq = normalizeText(s.search);
  let arr = HATCRAFT.filter(h => !nq || matchesAtWordStart(hatSearchIndex.get(h) || '', nq));
  arr.sort((a,b) => s.sort === 'materiais'
    ? b.materiais.length - a.materiais.length
    : a.nome.localeCompare(b.nome, 'pt-BR'));
  return arr;
}

/* ============ Rendering: cards ============ */
function monsterCard(m){
  const icon = monsterIconPath(m);
  const elBase = elementBase(m.elemento);
  return `<div class="card ${m.mvp ? 'mvp':''}" data-open="mon" data-id="${esc(m.id)}" tabindex="0">
    <div class="card-icon">${iconOrFallback(icon, '?', '')}</div>
    <div class="card-body">
      <div class="card-name">${esc(m.nome)}</div>
      <div class="card-meta">
        <span class="badge badge-id">#${esc(m.id)}</span>
        <span>Nv.${esc(m.nivel)}</span>
        ${elBase ? `<span class="badge el-${esc(elBase)}">${esc(elBase)}</span>` : ''}
      </div>
    </div>
  </div>`;
}
function itemCard(it){
  const icon = itemIconPath(it);
  return `<div class="card" data-open="item" data-id="${esc(it.id)}" tabindex="0">
    <div class="card-icon">${iconOrFallback(icon, '?', '')}</div>
    <div class="card-body">
      <div class="card-name">${esc(it.nome)}</div>
      <div class="card-meta">
        ${copyIdHtml(it.id, "badge badge-id")}
        <span>${esc(itemTipo(it))}</span>
      </div>
    </div>
  </div>`;
}
function hatCard(h){
  const it = h.id ? itemById.get(h.id) : null;
  const icon = it ? itemIconPath(it) : '';
  return `<div class="card" data-open="hat" data-id="${esc(h.key)}" tabindex="0">
    <div class="card-icon">${iconOrFallback(icon, '🎩', '')}</div>
    <div class="card-body">
      <div class="card-name">${esc(h.nome)}${h.slots ? ' <span class="hat-slot">[1]</span>' : ''}</div>
      <div class="card-meta">
        ${it && it.def ? `<span class="badge el-Neutro">DEF ${esc(it.def)}</span>` : ''}
        <span>${h.materiais.length} materiais</span>
      </div>
    </div>
  </div>`;
}
function cardSetCard(cs){
  /* miniaturas das 5 cartas dão identidade imediata ao conjunto — só o nome
     do bônus não diz quais cartas você precisa caçar */
  const minis = cs.cartas.map(k => {
    const it = itemById.get(k.id);
    const src = it ? itemIconPath(it) : '';
    return src ? `<img src="${src}" loading="lazy" alt="" title="${esc(k.nome)}">` : '';
  }).join('');
  return `<div class="card cs-card" data-open="cardset" data-id="${esc(cs.key)}" tabindex="0">
    <div class="card-body">
      <div class="card-name">${esc(cs.nome)}</div>
      <div class="col-bonus">${esc(cs.bonus)}</div>
      <div class="cs-minis">${minis}</div>
    </div>
  </div>`;
}
function colCard(c){
  const mp = c.codigo ? mapByCode.get(c.codigo) : null;
  const icon = mapImagePath(c.codigo);
  return `<div class="card" data-open="col" data-id="${esc(c.key)}" tabindex="0">
    <div class="card-icon card-map-icon">${iconOrFallback(icon, '🗺', '')}</div>
    <div class="card-body">
      <div class="card-name">${esc(c.nome)}</div>
      <div class="col-bonus">${esc(c.bonus)}</div>
      <div class="card-meta">
        <span class="badge badge-id">${esc(c.cidade)}</span>
        <span>${c.itens.length} itens</span>
        ${mp ? '' : '<span class="col-nomap">sem mapa vinculado</span>'}
      </div>
    </div>
  </div>`;
}
function mapCard(mp){
  const icon = mapIconPath(mp);
  return `<div class="card" data-open="map" data-id="${esc(mp.codigo)}" tabindex="0">
    <div class="card-icon card-map-icon">${iconOrFallback(icon, '🗺', '')}</div>
    <div class="card-body">
      <div class="card-name">${esc(mp.nome)}</div>
      <div class="card-meta">
        <span class="badge badge-id">${esc(mp.codigo)}</span>
        <span>${esc(mp.especies)} espécies · ${fmtNum(mp.total_mobs)} mobs</span>
      </div>
    </div>
  </div>`;
}

/* ============ Render lists w/ pagination ============ */
function renderList(kind){
  let filtered, gridEl, countEl, btnEl, cardFn, s;
  if(kind === 'mon'){ filtered = getFilteredMonsters(); gridEl = document.getElementById('monGrid'); countEl = document.getElementById('monCount'); btnEl = document.getElementById('monLoadMore'); cardFn = monsterCard; s = state.mon; }
  else if(kind === 'item'){ filtered = getFilteredItems(); gridEl = document.getElementById('itemGrid'); countEl = document.getElementById('itemCount'); btnEl = document.getElementById('itemLoadMore'); cardFn = itemCard; s = state.item; }
  else if(kind === 'map'){ filtered = getFilteredMaps(); gridEl = document.getElementById('mapGrid'); countEl = document.getElementById('mapCount'); btnEl = document.getElementById('mapLoadMore'); cardFn = mapCard; s = state.map; }
  else if(kind === 'col'){ filtered = getFilteredCollections(); gridEl = document.getElementById('colGrid'); countEl = document.getElementById('colCount'); btnEl = document.getElementById('colLoadMore'); cardFn = colCard; s = state.col; }
  /* as 19 coleções de cartas cabem numa página só, então não há botão de paginação */
  else if(kind === 'card'){ filtered = getFilteredCardSets(); gridEl = document.getElementById('cardGrid'); countEl = document.getElementById('cardCount'); btnEl = null; cardFn = cardSetCard; s = state.card; }
  else { filtered = getFilteredHats(); gridEl = document.getElementById('craftGrid'); countEl = document.getElementById('craftCount'); btnEl = null; cardFn = hatCard; s = state.craft; }

  countEl.textContent = filtered.length.toLocaleString('pt-BR');
  const visibleCount = Math.min(s.page * PAGE_SIZE, filtered.length);
  const slice = filtered.slice(0, visibleCount);
  gridEl.innerHTML = slice.map(cardFn).join('') || `<div class="empty-note">Nenhum resultado encontrado.</div>`;
  if(btnEl) btnEl.classList.toggle('hidden', visibleCount >= filtered.length);
}

/* ============ Detail rendering ============ */
/* Dano elemental recebido: em pré-renewal depende só do elemento+nível do
   monstro. A tabela (data/elementtable.js) foi extraída do RateMyServer.
   100% = normal, >100 fraqueza, <100 resistência, ≤0 imunidade/absorção. */
const ELEMTABLE = (window.DB_ELEMTABLE && window.DB_ELEMTABLE.table) || {};
const ELEM_ORDER = (window.DB_ELEMTABLE && window.DB_ELEMTABLE.order) || [];
const ELEM_PT2KEY = { 'Neutro':'neutro','Água':'agua','Terra':'terra','Fogo':'fogo','Vento':'vento',
  'Veneno':'veneno','Sagrado':'sagrado','Sombrio':'sombrio','Fantasma':'fantasma','Maldito':'maldito' };
const ELEM_LABELS = { neutral:'Neutro', water:'Água', earth:'Terra', fire:'Fogo', wind:'Vento',
  poison:'Veneno', holy:'Sagrado', shadow:'Sombrio', ghost:'Fantasma', undead:'Maldito' };
/* classe CSS de badge de elemento por chave da coluna (reusa .el-*) */
const ELEM_ELCLASS = { neutral:'Neutro', water:'Água', earth:'Terra', fire:'Fogo', wind:'Vento',
  poison:'Veneno', holy:'Sagrado', shadow:'Sombrio', ghost:'Fantasma', undead:'Maldito' };

function elementDamageHtml(elemento){
  const base = elementBase(elemento);                       // "Fogo 2" -> "Fogo"
  const lvl = (String(elemento).match(/(\d+)\s*$/) || [])[1]; // "2"
  const key = ELEM_PT2KEY[base];
  const row = key && ELEMTABLE[key] && ELEMTABLE[key][lvl];
  if(!row) return '';
  const cells = ELEM_ORDER.map((col, i) => {
    const v = row[i];
    const cls = v <= 0 ? 'absorb' : (v < 100 ? 'resist' : (v > 100 ? 'weak' : 'normal'));
    return `<div class="edmg-cell ${cls}">
      <span class="edmg-el el-${esc(ELEM_ELCLASS[col])}">${esc(ELEM_LABELS[col])}</span>
      <span class="edmg-val">${v}%</span>
    </div>`;
  }).join('');
  return `<div class="d-divider">Dano elemental recebido</div>
    <div class="edmg-grid">${cells}</div>
    <div class="edmg-legend">
      <span><i class="edmg-sw weak"></i>fraqueza</span>
      <span><i class="edmg-sw resist"></i>resistência</span>
      <span><i class="edmg-sw absorb"></i>imune / absorve</span>
    </div>`;
}

function buildMonsterHtml(id){
  const m = monById.get(Number(id)) || monById.get(id);
  if(!m) return null;
  const icon = monsterIconPath(m);
  const elBase = elementBase(m.elemento);
  const drops = (m.drops || []).slice().sort((a,b)=>b.chance-a.chance);
  const spawns = m.spawns || [];

  const dropsHtml = drops.length ? drops.map(d => {
    const it = itemById.get(d.item_id);
    const iconSrc = it ? itemIconPath(it) : '';
    const chanceCls = d.tipo === 'Carta' ? 'card' : (d.chance < 0.01 ? 'low' : '');
    return `<div class="list-row" data-open="item" data-id="${esc(d.item_id)}">
      ${iconSrc ? `<img src="${iconSrc}" loading="lazy" alt="">` : `<span class="lr-icon-fallback"></span>`}
      <span class="lr-name">${esc(d.item)}</span>
      <span class="lr-chance ${chanceCls}">${fmtPct(d.chance)}</span>
    </div>`;
  }).join('') : `<div class="empty-note">Nenhum drop registrado.</div>`;

  const spawnsHtml = spawns.length ? spawns.map(sp => {
    return `<div class="spawn-row" data-open="map" data-id="${esc(sp.mapa)}">
      <span class="sr-name">${esc(sp.nome_mapa)} <span style="color:var(--text-dim)">(${esc(sp.mapa)})</span></span>
      <span class="sr-detail">×${esc(sp.qtd)} · ${esc(sp.respawn)}</span>
    </div>`;
  }).join('') : `<div class="empty-note">Nenhum spawn registrado.</div>`;

  const html = `
    <div class="d-head">
      <div class="d-icon">${iconOrFallback(icon, '?', '')}</div>
      <div class="d-title">
        <div class="d-name">${esc(m.nome)} ${m.mvp ? '<span class="badge" style="color:var(--crimson);border-color:rgba(217,97,90,.55);background:rgba(217,97,90,.13);vertical-align:middle;">MVP</span>' : ''}</div>
        <div class="d-sub">#${esc(m.id)} · ${esc(m.raca)} · ${esc(m.tamanho)} ${elBase ? '· <span class="el-'+esc(elBase)+'">'+esc(m.elemento)+'</span>' : ''}</div>
      </div>
    </div>

    <div class="d-divider">Atributos</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-label">Nível</div><div class="stat-value accent">${esc(m.nivel)}</div></div>
      <div class="stat-box"><div class="stat-label">HP</div><div class="stat-value">${fmtNum(m.hp)}</div></div>
      <div class="stat-box"><div class="stat-label">Ataque</div><div class="stat-value">${esc(m.atq)}</div></div>
      <div class="stat-box"><div class="stat-label">Defesa</div><div class="stat-value">${fmtNum(m.def)}</div></div>
      <div class="stat-box"><div class="stat-label">Def. Mágica</div><div class="stat-value">${fmtNum(m.mdef)}</div></div>
      <div class="stat-box"><div class="stat-label">Alcance</div><div class="stat-value">${fmtNum(m.alcance)}</div></div>
      <div class="stat-box"><div class="stat-label">FOR</div><div class="stat-value">${fmtNum(m.for_)}</div></div>
      <div class="stat-box"><div class="stat-label">AGI</div><div class="stat-value">${fmtNum(m.agi)}</div></div>
      <div class="stat-box"><div class="stat-label">VIT</div><div class="stat-value">${fmtNum(m.vit)}</div></div>
      <div class="stat-box"><div class="stat-label">INT</div><div class="stat-value">${fmtNum(m.int_)}</div></div>
      <div class="stat-box"><div class="stat-label">DES</div><div class="stat-value">${fmtNum(m.des)}</div></div>
      <div class="stat-box"><div class="stat-label">SOR</div><div class="stat-value">${fmtNum(m.sor)}</div></div>
    </div>

    <div class="d-divider">Experiência</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-label">EXP Base</div><div class="stat-value teal">${fmtNum(m.exp_base)}</div></div>
      <div class="stat-box"><div class="stat-label">EXP Classe</div><div class="stat-value teal">${fmtNum(m.exp_classe)}</div></div>
      <div class="stat-box"><div class="stat-label">EXP MVP</div><div class="stat-value crimson">${m.exp_mvp ? fmtNum(m.exp_mvp) : '—'}</div></div>
    </div>

    ${elementDamageHtml(m.elemento)}

    <div class="d-divider">Drops (${drops.length})</div>
    ${dropsHtml}

    <div class="d-divider">Onde encontrar (${spawns.length} mapas)</div>
    ${spawnsHtml}
  `;
  return { title: m.nome, html };
}

/* Bloco "Atributos" de um item de equipamento. Reusado no drawer do item e no
   craft (lá sem preços, que não interessam para quem vai fabricar). */
function itemStatsHtml(it, withPrices){
  const attrs = [];
  if(it.atq) attrs.push(['Ataque', it.atq]);
  if(it.def) attrs.push(['Defesa', it.def]);
  if(it.peso !== '' && it.peso !== null) attrs.push(['Peso', it.peso]);
  if(it.slots) attrs.push(['Slots', it.slots]);
  if(it.nv_min) attrs.push(['Nível mín.', it.nv_min]);
  if(it.nv_arma) attrs.push(['Nv. arma', it.nv_arma]);
  const priceBoxes = withPrices ? `
      <div class="stat-box"><div class="stat-label">Preço compra</div><div class="stat-value accent">${it.compra ? fmtNum(it.compra)+' z' : '—'}</div></div>
      <div class="stat-box"><div class="stat-label">Preço venda</div><div class="stat-value accent">${it.venda ? fmtNum(it.venda)+' z' : '—'}</div></div>
      ${it.refin ? `<div class="stat-box"><div class="stat-label">Refino</div><div class="stat-value">${esc(it.refin)}</div></div>` : ''}` : '';
  /* sem atributos nem preços não há o que mostrar (ex.: no craft sem preços) */
  if(!attrs.length && !priceBoxes.trim()) return '';
  return `<div class="d-divider">Atributos</div>
    <div class="stat-grid">
      ${attrs.map(([label,val]) => `<div class="stat-box"><div class="stat-label">${esc(label)}</div><div class="stat-value">${fmtNum(val)}</div></div>`).join('')}
      ${priceBoxes}
    </div>`;
}

function buildItemHtml(id){
  const it = itemById.get(Number(id)) || itemById.get(id);
  if(!it) return null;
  const icon = itemIconPath(it);
  const droppedBy = (it.dropped_by || []).slice().sort((a,b)=>b.chance-a.chance);

  const droppedHtml = droppedBy.length ? droppedBy.map(d => {
    const m = monById.get(d.mob_id);
    const iconSrc = m ? monsterIconPath(m) : '';
    return `<div class="list-row" data-open="mon" data-id="${esc(d.mob_id)}">
      ${iconSrc ? `<img src="${iconSrc}" loading="lazy" alt="">` : `<span class="lr-icon-fallback"></span>`}
      <span class="lr-name">${esc(d.monstro)}</span>
      <span class="lr-chance ${d.chance < 0.01 ? 'low':''}">${fmtPct(d.chance)}</span>
    </div>`;
  }).join('') : `<div class="empty-note">Não dropado por nenhum monstro cadastrado.</div>`;

  const html = `
    <div class="d-head">
      <div class="d-icon ${isSoul(it) ? 'soul-art' : (it.tipo === 'Carta' ? 'card-art' : '')}">${iconOrFallback(icon, '?', '')}</div>
      <div class="d-title">
        <div class="d-name">${esc(it.nome)}</div>
        <div class="d-sub">${copyIdHtml(it.id, "")} · ${esc(itemTipo(it))}${it.subtipo ? ' · '+esc(it.subtipo) : ''}${it.posicao ? ' · '+esc(it.posicao) : ''}</div>
      </div>
    </div>

    ${itemStatsHtml(it, true)}

    ${it.classes ? `<div class="d-divider">Classes</div><div class="d-desc">${esc(it.classes)}</div>` : ''}

    ${it.descricao ? `<div class="d-divider">Descrição</div><div class="d-desc">${esc(cleanDescription(it.descricao))}</div>` : ''}

    <div class="d-divider">Dropado por (${droppedBy.length})</div>
    ${droppedHtml}
  `;
  return { title: it.nome, html };
}

function buildHatHtml(key){
  const h = hatByKey.get(String(key));
  if(!h) return null;
  const it = h.id ? itemById.get(h.id) : null;
  const icon = it ? itemIconPath(it) : '';

  const matsHtml = h.materiais.map(m => {
    const mit = m.id ? itemById.get(m.id) : null;
    const src = mit ? itemIconPath(mit) : '';
    /* material sem ID (ex.: Cacau) não abre ficha nem copia @ws; vira linha
       estática para não prometer um link que não leva a lugar nenhum */
    const attrs = m.id ? `data-open="item" data-id="${esc(m.id)}"` : '';
    return `<div class="list-row lr-mat" ${attrs}>
      ${src ? `<img src="${src}" loading="lazy" alt="">` : `<span class="lr-icon-fallback"></span>`}
      <span class="lr-qty">${fmtNum(m.qty)}×</span>
      <span class="lr-name">${esc(m.nome)}</span>
      ${m.id ? copyIdHtml(m.id, 'lr-meta') : ''}
    </div>`;
  }).join('');

  const html = `
    <div class="d-head">
      <div class="d-icon">${iconOrFallback(icon, '🎩', '')}</div>
      <div class="d-title">
        <div class="d-name">${esc(h.nome)}${h.slots ? ' <span class="hat-slot">[1]</span>' : ''}</div>
        <div class="d-sub">${h.id ? copyIdHtml(h.id, '') + ' · ' : ''}Craft de chapéu · ${h.materiais.length} materiais</div>
      </div>
    </div>

    ${it ? itemStatsHtml(it, false) : ''}
    ${it && it.posicao ? `<div class="d-desc hat-pos">Posição: ${esc(it.posicao)}${it.classes ? ' · '+esc(it.classes) : ''}</div>` : ''}
    ${it && it.descricao ? `<div class="d-desc hat-desc">${esc(cleanDescription(it.descricao))}</div>` : ''}

    <div class="d-divider">Custo base</div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-label">Zeny</div><div class="stat-value accent">${fmtNum(HATCOST.zeny)}</div></div>
      <div class="stat-box"><div class="stat-label">Aureum Coin</div><div class="stat-value accent">${fmtNum(HATCOST.aureum)}×</div></div>
    </div>

    <div class="d-divider">Materiais (${h.materiais.length})</div>
    ${matsHtml}
  `;
  return { title: h.nome, html };
}

function buildCardSetHtml(key){
  const cs = cardSetByKey.get(String(key));
  if(!cs) return null;

  const tiersHtml = cs.tiers.map(t => `
    <div class="stat-box">
      <div class="stat-label">${esc(t.req)}</div>
      <div class="stat-value accent">${esc(t.efeito)}</div>
    </div>`).join('');

  const cartasHtml = cs.cartas.map(k => {
    const it = itemById.get(k.id);
    const src = it ? itemIconPath(it) : '';
    /* a mesma carta pode estar em outro conjunto; como ela é consumida ao
       depositar, avisar evita o jogador queimar a carta errada */
    const outros = (cardSetsByCardId.get(k.id) || []).filter(o => o !== cs);
    const aviso = outros.length
      ? `<span class="lr-fontes">também em: ${esc(outros.map(o => o.nome).join(', '))}</span>` : '';
    return `<div class="list-row lr-col lr-card" data-open="item" data-id="${esc(k.id)}">
      ${src ? `<img src="${src}" loading="lazy" alt="">` : `<span class="lr-icon-fallback"></span>`}
      <span class="lr-name">${esc(k.nome)}${aviso}</span>
      ${copyIdHtml(k.id, "lr-meta")}
    </div>`;
  }).join('');

  const html = `
    <div class="d-head">
      <div class="d-title">
        <div class="d-name">${esc(cs.nome)}</div>
        <div class="d-sub">Coleção ${esc(cs.idx)} · ${cs.cartas.length} cartas</div>
      </div>
    </div>

    <div class="d-divider">Bônus completo</div>
    <div class="col-bonus-box">${esc(cs.bonus)}</div>

    <div class="d-divider">Progressão</div>
    <div class="stat-grid">${tiersHtml}</div>

    <div class="d-divider">Cartas necessárias (${cs.cartas.length})</div>
    ${cartasHtml}

    <div class="empty-note">As cartas são consumidas ao depositar e não podem ser retiradas.</div>
  `;
  return { title: cs.nome, html };
}

function buildCollectionHtml(key){
  const c = colByKey.get(String(key));
  if(!c) return null;
  const mp = c.codigo ? mapByCode.get(c.codigo) : null;
  const icon = mapImagePath(c.codigo);

  const itensHtml = c.itens.map(ci => {
    const it = itemById.get(ci.id);
    const iconSrc = it ? itemIconPath(it) : '';
    /* fontes = "Monstro — chance" vindas da wiki; sem elas o jogador não sabe
       onde farmar o item dentro do mapa */
    const fontes = (ci.fontes || []).join(' · ');
    return `<div class="list-row lr-col" data-open="item" data-id="${esc(ci.id)}">
      ${iconSrc ? `<img src="${iconSrc}" loading="lazy" alt="">` : `<span class="lr-icon-fallback"></span>`}
      <span class="lr-name">${esc(ci.nome)}${fontes ? `<span class="lr-fontes">${esc(fontes)}</span>` : ''}</span>
      ${copyIdHtml(ci.id, "lr-meta")}
    </div>`;
  }).join('');

  const html = `
    <div class="d-head">
      <div class="d-icon map-icon">${iconOrFallback(icon, '🗺', '')}</div>
      <div class="d-title">
        <div class="d-name">${esc(c.nome)}</div>
        <div class="d-sub">${esc(c.cidade)}${c.codigo ? ' · '+esc(c.codigo) : ''} · ${c.itens.length} itens</div>
      </div>
    </div>

    <div class="d-divider">Bônus ao completar</div>
    <div class="col-bonus-box">${esc(c.bonus)}</div>

    <div class="d-divider">Itens necessários (${c.itens.length})</div>
    ${itensHtml}

    ${mp ? `<div class="d-divider">Mapa</div>
      <div class="list-row" data-open="map" data-id="${esc(mp.codigo)}">
        <span class="lr-name">Ver monstros de ${esc(mp.nome)}</span>
        <span class="lr-meta">${esc(mp.codigo)}</span>
      </div>` : ''}
  `;
  return { title: c.nome, html };
}

function buildMapHtml(code){
  const mp = mapByCode.get(code);
  if(!mp) return null;
  const icon = mapIconPath(mp);
  const spawns = (mp.spawns || []).slice().sort((a,b)=> (Number(b.qtd)||0) - (Number(a.qtd)||0));

  const spawnsHtml = spawns.length ? spawns.map(sp => {
    const m = monById.get(sp.mob_id);
    const iconSrc = m ? monsterIconPath(m) : '';
    return `<div class="list-row" data-open="mon" data-id="${esc(sp.mob_id)}">
      ${iconSrc ? `<img src="${iconSrc}" loading="lazy" alt="">` : `<span class="lr-icon-fallback"></span>`}
      <span class="lr-name">${esc(sp.monstro)}</span>
      <span class="lr-meta">×${esc(sp.qtd)} · ${esc(sp.respawn)}</span>
    </div>`;
  }).join('') : `<div class="empty-note">Nenhum monstro cadastrado neste mapa.</div>`;

  const html = `
    <div class="d-head">
      <div class="d-icon map-icon">${iconOrFallback(icon, '🗺', '')}</div>
      <div class="d-title">
        <div class="d-name">${esc(mp.nome)}</div>
        <div class="d-sub">${esc(mp.codigo)} · ${esc(mp.especies)} espécies · ${fmtNum(mp.total_mobs)} mobs</div>
      </div>
    </div>
    <div class="d-divider">Monstros no mapa (${spawns.length})</div>
    ${spawnsHtml}
  `;
  return { title: mp.nome, html };
}

/* ============ Drawer control + navigation history ============ */
const drawer = document.getElementById('drawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const drawerContent = document.getElementById('drawerContent');
const drawerBack = document.getElementById('drawerBack');

let navStack = []; // { kind, id }

function buildByKind(kind, id){
  if(kind === 'mon') return buildMonsterHtml(id);
  if(kind === 'item') return buildItemHtml(id);
  if(kind === 'map') return buildMapHtml(id);
  if(kind === 'col') return buildCollectionHtml(id);
  if(kind === 'cardset') return buildCardSetHtml(id);
  if(kind === 'hat') return buildHatHtml(id);
  return null;
}

function renderCurrent(){
  const top = navStack[navStack.length - 1];
  if(!top) return;
  const result = buildByKind(top.kind, top.id);
  if(!result) return;
  drawerContent.innerHTML = result.html;
  drawer.scrollTop = 0;
  drawerBack.classList.toggle('hidden', navStack.length < 2);
}

function navigateTo(kind, id){
  navStack.push({ kind, id });
  drawer.classList.add('open');
  drawerOverlay.classList.add('open');
  renderCurrent();
}

function goBack(){
  if(navStack.length < 2) return;
  navStack.pop();
  renderCurrent();
}

function closeDrawer(){
  drawer.classList.remove('open');
  drawerOverlay.classList.remove('open');
  navStack = [];
}

drawerBack.addEventListener('click', goBack);
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') closeDrawer();
  if(e.key === 'Backspace' && drawer.classList.contains('open')){
    const tag = (e.target.tagName || '').toLowerCase();
    if(tag !== 'input' && tag !== 'select' && tag !== 'textarea') goBack();
  }
});

/* ============ Copiar "@ws <id>" ============ */
function copyText(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text);
  }
  /* fallback para navegador antigo ou contexto sem permissão de clipboard */
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    ok ? resolve() : reject(new Error('copy failed'));
  });
}
function flashCopied(el, ok){
  const original = el.textContent;
  el.textContent = ok ? '✓ copiado' : '✗ falhou';
  el.classList.add(ok ? 'copied' : 'copy-fail');
  setTimeout(() => {
    /* pode ter sido re-renderizado nesse meio tempo; então só restaura se o
       elemento ainda estiver no documento */
    if(!el.isConnected) return;
    el.textContent = original;
    el.classList.remove('copied', 'copy-fail');
  }, 1100);
}
function handleCopyId(el){
  const id = el.getAttribute('data-copy-id');
  copyText(`@ws ${id}`).then(() => flashCopied(el, true), () => flashCopied(el, false));
}

/* Event delegation for opening entities from cards / lists / drawer content */
document.addEventListener('click', e => {
  /* o badge de ID fica dentro de um card clicável: copiar não deve abrir */
  const copy = e.target.closest('.copy-id');
  if(copy){ e.preventDefault(); handleCopyId(copy); return; }
  const el = e.target.closest('[data-open]');
  if(!el) return;
  const kind = el.getAttribute('data-open');
  const id = el.getAttribute('data-id');
  navigateTo(kind, id);
});
document.addEventListener('keydown', e => {
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const copy = e.target.closest('.copy-id');
  if(copy){ e.preventDefault(); handleCopyId(copy); return; }
  if(e.key !== 'Enter') return;
  const el = e.target.closest('[data-open]');
  if(!el) return;
  el.click();
});

/* ============ Tema ============
   O tema inicial já foi aplicado pelo script inline do <head>; aqui só o
   toggle e a persistência. */
const themeToggle = document.getElementById('themeToggle');
function setTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('theme', t); } catch(e){ /* modo privado */ }
  const meta = document.getElementById('themeColor');
  if(meta) meta.setAttribute('content', t === 'light' ? '#e8eef7' : '#070c15');
}
themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
});

/* ============ Tabs ============ */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-tab');
    state.tab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.dataset.view !== tab));
  });
});

/* ============ Toolbar controls ============ */
function debounce(fn, wait){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}

document.getElementById('monRaca').addEventListener('change', e => { state.mon.raca = e.target.value; state.mon.page = 1; renderList('mon'); });
document.getElementById('monElemento').addEventListener('change', e => { state.mon.elemento = e.target.value; state.mon.page = 1; renderList('mon'); });
document.getElementById('monTamanho').addEventListener('change', e => { state.mon.tamanho = e.target.value; state.mon.page = 1; renderList('mon'); });
document.getElementById('monSort').addEventListener('change', e => { state.mon.sort = e.target.value; state.mon.page = 1; renderList('mon'); });
document.getElementById('monLoadMore').addEventListener('click', () => { state.mon.page++; renderList('mon'); });

document.getElementById('itemTipo').addEventListener('change', e => { state.item.tipo = e.target.value; state.item.page = 1; renderList('item'); });
document.getElementById('itemSort').addEventListener('change', e => { state.item.sort = e.target.value; state.item.page = 1; renderList('item'); });
document.getElementById('itemLoadMore').addEventListener('click', () => { state.item.page++; renderList('item'); });

document.getElementById('mapSort').addEventListener('change', e => { state.map.sort = e.target.value; state.map.page = 1; renderList('map'); });
document.getElementById('mapLoadMore').addEventListener('click', () => { state.map.page++; renderList('map'); });

document.getElementById('colCidade').addEventListener('change', e => { state.col.cidade = e.target.value; state.col.page = 1; renderList('col'); });
document.getElementById('colSort').addEventListener('change', e => { state.col.sort = e.target.value; state.col.page = 1; renderList('col'); });
document.getElementById('colLoadMore').addEventListener('click', () => { state.col.page++; renderList('col'); });

document.getElementById('cardSort').addEventListener('change', e => { state.card.sort = e.target.value; state.card.page = 1; renderList('card'); });
document.getElementById('craftSort').addEventListener('change', e => { state.craft.sort = e.target.value; state.craft.page = 1; renderList('craft'); });

/* ============ Global search ============ */
const globalSearchInput = document.getElementById('globalSearch');
const globalResults = document.getElementById('globalResults');

function switchToTabAndFilter(tab, query){
  const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  btn.click();
  if(tab === 'monstros'){ state.mon.search = query; state.mon.page = 1; renderList('mon'); }
  if(tab === 'itens'){ state.item.search = query; state.item.page = 1; renderList('item'); }
  if(tab === 'mapas'){ state.map.search = query; state.map.page = 1; renderList('map'); }
}

const doGlobalSearch = debounce(() => {
  const q = globalSearchInput.value.trim().toLowerCase();
  if(!q){ globalResults.classList.add('hidden'); globalResults.innerHTML=''; return; }

  const monMatches = MONSTERS.filter(m => (m.nome||'').toLowerCase().includes(q) || String(m.id).includes(q)).slice(0,6);
  const nq = normalizeText(globalSearchInput.value);
  const itemMatchList = ITEMS.filter(it => itemMatches(it, nq)).slice(0,6);
  const mapMatches = MAPS.filter(mp => (mp.nome||'').toLowerCase().includes(q) || (mp.codigo||'').toLowerCase().includes(q)).slice(0,6);
  const colMatches = COLLECTIONS.filter(c => matchesAtWordStart(colSearchIndex.get(c) || '', nq)).slice(0,6);
  const cardSetMatches = CARDSETS.filter(c => matchesAtWordStart(cardSetSearchIndex.get(c) || '', nq)).slice(0,5);
  const hatMatches = HATCRAFT.filter(h => matchesAtWordStart(hatSearchIndex.get(h) || '', nq)).slice(0,5);

  let html = '';
  if(monMatches.length){
    html += `<div class="gr-group-label">Monstros</div>`;
    html += monMatches.map(m => {
      const icon = monsterIconPath(m);
      return `<div class="gr-item" data-open="mon" data-id="${esc(m.id)}">
        ${icon ? `<img src="${icon}" alt="">` : `<span class="gr-icon-fallback"></span>`}
        <span class="gr-item-name">${esc(m.nome)}</span>
        <span class="gr-item-meta">Nv.${esc(m.nivel)}</span>
      </div>`;
    }).join('');
  }
  if(itemMatchList.length){
    html += `<div class="gr-group-label">Itens</div>`;
    html += itemMatchList.map(it => {
      const icon = itemIconPath(it);
      const hint = effectSnippet(it, nq);
      return `<div class="gr-item" data-open="item" data-id="${esc(it.id)}">
        ${icon ? `<img src="${icon}" alt="">` : `<span class="gr-icon-fallback"></span>`}
        <span class="gr-item-name">${esc(it.nome)}</span>
        <span class="gr-item-meta">${hint ? esc(hint) : esc(itemTipo(it))}</span>
      </div>`;
    }).join('');
  }
  if(mapMatches.length){
    html += `<div class="gr-group-label">Mapas</div>`;
    html += mapMatches.map(mp => {
      const icon = mapIconPath(mp);
      return `<div class="gr-item" data-open="map" data-id="${esc(mp.codigo)}">
        ${icon ? `<img src="${icon}" alt="">` : `<span class="gr-icon-fallback"></span>`}
        <span class="gr-item-name">${esc(mp.nome)}</span>
        <span class="gr-item-meta">${esc(mp.codigo)}</span>
      </div>`;
    }).join('');
  }
  if(colMatches.length){
    html += `<div class="gr-group-label">Coleções</div>`;
    html += colMatches.map(c => {
      const icon = mapImagePath(c.codigo);
      return `<div class="gr-item" data-open="col" data-id="${esc(c.key)}">
        ${icon ? `<img src="${icon}" alt="">` : `<span class="gr-icon-fallback"></span>`}
        <span class="gr-item-name">${esc(c.nome)}</span>
        <span class="gr-item-meta">${esc(c.bonus)}</span>
      </div>`;
    }).join('');
  }
  if(cardSetMatches.length){
    html += `<div class="gr-group-label">Coleções de cartas</div>`;
    html += cardSetMatches.map(cs => {
      const first = itemById.get(cs.cartas[0].id);
      const icon = first ? itemIconPath(first) : '';
      return `<div class="gr-item" data-open="cardset" data-id="${esc(cs.key)}">
        ${icon ? `<img src="${icon}" alt="">` : `<span class="gr-icon-fallback"></span>`}
        <span class="gr-item-name">${esc(cs.nome)}</span>
        <span class="gr-item-meta">${esc(cs.bonus)}</span>
      </div>`;
    }).join('');
  }
  if(hatMatches.length){
    html += `<div class="gr-group-label">Craft de chapéus</div>`;
    html += hatMatches.map(h => {
      const it = h.id ? itemById.get(h.id) : null;
      const icon = it ? itemIconPath(it) : '';
      return `<div class="gr-item" data-open="hat" data-id="${esc(h.key)}">
        ${icon ? `<img src="${icon}" alt="">` : `<span class="gr-icon-fallback"></span>`}
        <span class="gr-item-name">${esc(h.nome)}</span>
        <span class="gr-item-meta">${h.materiais.length} mat.</span>
      </div>`;
    }).join('');
  }
  if(!html){
    html = `<div class="gr-empty">Nenhum resultado para "${esc(globalSearchInput.value)}"</div>`;
  }
  globalResults.innerHTML = html;
  globalResults.classList.remove('hidden');
}, 150);

globalSearchInput.addEventListener('input', doGlobalSearch);
globalSearchInput.addEventListener('focus', () => { if(globalSearchInput.value.trim()) globalResults.classList.remove('hidden'); });
document.addEventListener('click', e => {
  if(!e.target.closest('.global-search')) globalResults.classList.add('hidden');
});
globalResults.addEventListener('click', e => {
  const el = e.target.closest('[data-open]');
  if(!el) return;
  globalResults.classList.add('hidden');
  globalSearchInput.value = '';
});

/* Also wire quick per-tab text search via the global bar when typed while a tab is not "search"—
   handled fully by global search + drawer already; add lightweight inline search bars into toolbars */
function injectInlineSearch(containerSelector, onInput, placeholder){
  const filtersWrap = document.querySelector(containerSelector + ' .toolbar-filters');
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.className = 'inline-search';
  input.addEventListener('input', debounce(e => onInput(e.target.value), 120));
  filtersWrap.insertBefore(input, filtersWrap.firstChild);
}
injectInlineSearch('#view-monstros', v => { state.mon.search = v; state.mon.page = 1; renderList('mon'); }, 'Filtrar por nome ou ID...');
injectInlineSearch('#view-itens', v => { state.item.search = v; state.item.page = 1; renderList('item'); }, 'Filtrar por nome, ID ou efeito (ex: LUK +3)...');
injectInlineSearch('#view-mapas', v => { state.map.search = v; state.map.page = 1; renderList('map'); }, 'Filtrar por nome ou código...');
injectInlineSearch('#view-colecoes', v => { state.col.search = v; state.col.page = 1; renderList('col'); }, 'Filtrar por mapa, cidade, bônus ou item...');
injectInlineSearch('#view-cartas', v => { state.card.search = v; state.card.page = 1; renderList('card'); }, 'Filtrar por nome, bônus ou carta...');
injectInlineSearch('#view-craft', v => { state.craft.search = v; state.craft.page = 1; renderList('craft'); }, 'Filtrar por chapéu ou material...');

/* ============ Init ============ */
renderList('mon');
renderList('item');
renderList('map');
renderList('col');
renderList('card');
renderList('craft');

})();
