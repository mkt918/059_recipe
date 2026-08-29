'use strict';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQlMrVlcfS3ntbwo5kfLdNrziho2jOmz3X_Qq9-ojUozpM0YzNUGIrc9HZxCSI7AP43BcGe4shmwLsU/pub?gid=0&single=true&output=csv';

const CAT_ORDER = ['主食', '主菜', '副菜', 'サラダ', '汁物', '調味料', 'ホームベーカリー', 'その他'];
const INGREDIENTS_COLLAPSED = 12;
const FAV_KEY = 'recipe_favorites';

const state = {
    recipes: [],
    favorites: new Set(loadFavorites()),
    query: '',
    category: 'すべて',
    ingredients: new Set(),
    favOnly: false,
    ingExpanded: false,
};

// --- DOM ---
const $ = (sel) => document.querySelector(sel);
const grid = $('#grid');
const countEl = $('#count');
const statusEl = $('#status');
const catFilters = $('#catFilters');
const ingFilters = $('#ingFilters');
const ingMoreBtn = $('#ingMore');
const clearAllBtn = $('#clearAll');
const searchInput = $('#q');
const favToggle = $('#favToggle');
const favCountEl = $('#favCount');
const dialog = $('#detail');
const dialogBody = $('#detailBody');
const cardTpl = $('#tpl-card');
const jumpTop = $('#jumpTop');
const jumpBottom = $('#jumpBottom');

const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SCROLL_BEHAVIOR = prefersReducedMotion ? 'auto' : 'smooth';

// --- init ---
init();

async function init() {
    bindEvents();
    renderFavCount();
    try {
        const text = await fetchCSV(CSV_URL);
        state.recipes = parseRecipes(text);
        if (!state.recipes.length) throw new Error('empty');
        renderCategoryFilters();
        renderIngredientFilters();
        render();
        openFromHash();
    } catch (err) {
        console.error('レシピの読み込みに失敗:', err);
        showError();
    }
}

async function fetchCSV(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
}

function parseRecipes(text) {
    const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
    return data
        .map((row) => {
            const raw = (row['主な食材（カンマ区切り）'] || '').trim();
            return {
                id: String(row['ID'] || '').trim(),
                title: (row['レシピ名'] || '').trim(),
                category: (row['種別'] || '').trim() || 'その他',
                ingredients: raw.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
                rawIngredients: raw,
                steps: ['手順①', '手順②', '手順③', '手順④', '手順⑤', '手順⑥']
                    .map((k) => (row[k] || '').trim())
                    .filter(Boolean),
                reference: (row['参考サイトなど'] || '').trim(),
            };
        })
        .filter((r) => r.id && r.title);
}

// --- favorites ---
function loadFavorites() {
    try {
        const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
        return Array.isArray(v) ? v.map(String) : [];
    } catch {
        return [];
    }
}
function saveFavorites() {
    try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...state.favorites]));
    } catch {
        /* ignore */
    }
}
function toggleFavorite(id) {
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
    saveFavorites();
    renderFavCount();
    render();
}
function renderFavCount() {
    const n = state.favorites.size;
    favCountEl.textContent = n;
    favCountEl.hidden = n === 0;
}

// --- filters ---
function renderCategoryFilters() {
    const counts = new Map();
    state.recipes.forEach((r) => counts.set(r.category, (counts.get(r.category) || 0) + 1));
    const cats = CAT_ORDER.filter((c) => counts.has(c));

    const chips = [chipMarkup('すべて', state.recipes.length, state.category === 'すべて')];
    cats.forEach((c) => chips.push(chipMarkup(c, counts.get(c), state.category === c)));
    catFilters.innerHTML = chips.join('');
}

function renderIngredientFilters() {
    const counts = new Map();
    state.recipes.forEach((r) =>
        r.ingredients.forEach((i) => counts.set(i, (counts.get(i) || 0) + 1))
    );
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
    const limit = state.ingExpanded ? sorted.length : INGREDIENTS_COLLAPSED;

    // keep any active ingredient visible even if outside the top-N
    const visible = new Map(sorted.slice(0, limit));
    state.ingredients.forEach((i) => {
        if (!visible.has(i) && counts.has(i)) visible.set(i, counts.get(i));
    });

    ingFilters.innerHTML = [...visible.entries()]
        .map(([name, n]) => chipMarkup(name, n, state.ingredients.has(name)))
        .join('');

    if (sorted.length > INGREDIENTS_COLLAPSED) {
        ingMoreBtn.hidden = false;
        ingMoreBtn.textContent = state.ingExpanded
            ? '主要な食材だけ表示'
            : `すべて表示（${sorted.length}種）`;
    } else {
        ingMoreBtn.hidden = true;
    }
}

function chipMarkup(label, n, active) {
    return `<button type="button" class="chip" data-value="${escapeAttr(label)}" aria-pressed="${active}">` +
        `${escapeHtml(label)}<span class="chip-n">${n}</span></button>`;
}

function hasActiveFilters() {
    return (
        state.query !== '' ||
        state.category !== 'すべて' ||
        state.ingredients.size > 0 ||
        state.favOnly
    );
}

function resetFilters() {
    state.query = '';
    state.category = 'すべて';
    state.ingredients.clear();
    state.favOnly = false;
    searchInput.value = '';
    favToggle.setAttribute('aria-pressed', 'false');
    renderCategoryFilters();
    renderIngredientFilters();
    render();
}

// --- filtering ---
function getFiltered() {
    const q = state.query.trim().toLowerCase();
    return state.recipes.filter((r) => {
        if (state.favOnly && !state.favorites.has(r.id)) return false;
        if (state.category !== 'すべて' && r.category !== state.category) return false;
        if (state.ingredients.size > 0) {
            for (const ing of state.ingredients) {
                if (!r.ingredients.includes(ing)) return false;
            }
        }
        if (q) {
            const hay = (r.title + ' ' + r.rawIngredients + ' ' + r.category).toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

// --- render list ---
function render() {
    const list = getFiltered();
    clearAllBtn.hidden = !hasActiveFilters();

    countEl.innerHTML = `<strong>${list.length}</strong> 品`;

    if (!list.length) {
        grid.innerHTML = '';
        statusEl.hidden = false;
        statusEl.classList.remove('is-error');
        statusEl.textContent = state.favOnly && state.favorites.size === 0
            ? 'お気に入りはまだありません。カードのハートで追加できます。'
            : '条件に合うレシピがありません。絞り込みを変えてみてください。';
        return;
    }
    statusEl.hidden = true;

    const frag = document.createDocumentFragment();
    list.forEach((r) => frag.appendChild(buildCard(r)));
    grid.replaceChildren(frag);

    updateJump();
}

// --- jump to top / bottom ---
function updateJump() {
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    jumpTop.hidden = y < 320;
    jumpBottom.hidden = max <= 0 || y > max - 320;
}

function buildCard(r) {
    const node = cardTpl.content.firstElementChild.cloneNode(true);
    const isFav = state.favorites.has(r.id);

    node.dataset.id = r.id;
    node.querySelector('[data-cat]').textContent = r.category;

    const openBtn = node.querySelector('.card-open');
    openBtn.textContent = r.title;

    const ings = node.querySelector('[data-ings]');
    ings.textContent = r.ingredients.length ? r.ingredients.join('・') : '—';

    const favBtn = node.querySelector('[data-fav]');
    favBtn.setAttribute('aria-pressed', String(isFav));
    favBtn.setAttribute('aria-label', isFav ? 'お気に入りから外す' : 'お気に入りに追加');

    return node;
}

// --- detail dialog ---
function openRecipe(id) {
    const r = state.recipes.find((x) => x.id === id);
    if (!r) return;

    const ingHtml = r.ingredients.length
        ? `<p class="d-section-label">材料</p><ul class="d-ings">${r.ingredients
              .map((i) => `<li>${escapeHtml(i)}</li>`)
              .join('')}</ul>`
        : '';

    const stepsHtml = r.steps.length
        ? `<p class="d-section-label">作り方</p><ol class="d-steps">${r.steps
              .map((s) => `<li>${escapeHtml(s)}</li>`)
              .join('')}</ol>`
        : '<p class="d-ref-note">手順は未登録です。</p>';

    let refHtml = '';
    if (r.reference) {
        const m = r.reference.match(/https?:\/\/\S+/);
        if (m) {
            refHtml = `<a class="d-ref" href="${escapeAttr(m[0])}" target="_blank" rel="noopener noreferrer">` +
                `<svg aria-hidden="true"><use href="#i-link"></use></svg>参考サイト・動画を開く</a>`;
        } else {
            refHtml = `<p class="d-ref-note">参考: ${escapeHtml(r.reference)}</p>`;
        }
    }

    dialogBody.innerHTML =
        `<span class="d-cat">${escapeHtml(r.category)}</span>` +
        `<h2 class="d-title" id="detailTitle">${escapeHtml(r.title)}</h2>` +
        ingHtml + stepsHtml + refHtml;

    dialogBody.scrollTop = 0;
    if (!dialog.open) dialog.showModal();
    if (location.hash !== '#r-' + id) history.replaceState(null, '', '#r-' + id);
}

function closeRecipe() {
    if (dialog.open) dialog.close();
}

function openFromHash() {
    const m = location.hash.match(/^#r-(.+)$/);
    if (m) openRecipe(decodeURIComponent(m[1]));
}

// --- events ---
function bindEvents() {
    searchInput.addEventListener('input', debounce((e) => {
        state.query = e.target.value;
        render();
    }, 160));

    catFilters.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        state.category = btn.dataset.value;
        renderCategoryFilters();
        render();
    });

    ingFilters.addEventListener('click', (e) => {
        const btn = e.target.closest('.chip');
        if (!btn) return;
        const v = btn.dataset.value;
        state.ingredients.has(v) ? state.ingredients.delete(v) : state.ingredients.add(v);
        renderIngredientFilters();
        render();
    });

    ingMoreBtn.addEventListener('click', () => {
        state.ingExpanded = !state.ingExpanded;
        renderIngredientFilters();
    });

    clearAllBtn.addEventListener('click', resetFilters);

    favToggle.addEventListener('click', () => {
        state.favOnly = !state.favOnly;
        favToggle.setAttribute('aria-pressed', String(state.favOnly));
        render();
    });

    grid.addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        if (!card) return;
        if (e.target.closest('[data-fav]')) {
            toggleFavorite(card.dataset.id);
            return;
        }
        if (e.target.closest('[data-open]')) {
            openRecipe(card.dataset.id);
        }
    });

    $('#detailClose').addEventListener('click', closeRecipe);
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) closeRecipe(); // backdrop
    });
    dialog.addEventListener('close', () => {
        if (location.hash.startsWith('#r-')) history.replaceState(null, '', location.pathname + location.search);
    });

    window.addEventListener('hashchange', () => {
        if (location.hash.startsWith('#r-')) openFromHash();
        else closeRecipe();
    });

    jumpTop.addEventListener('click', () =>
        window.scrollTo({ top: 0, behavior: SCROLL_BEHAVIOR })
    );
    jumpBottom.addEventListener('click', () =>
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: SCROLL_BEHAVIOR })
    );
    window.addEventListener('scroll', updateJump, { passive: true });
    window.addEventListener('resize', updateJump);
}

function showError() {
    grid.innerHTML = '';
    countEl.textContent = '';
    statusEl.hidden = false;
    statusEl.classList.add('is-error');
    statusEl.innerHTML =
        'レシピデータを読み込めませんでした。通信環境を確認してください。' +
        '<br><button type="button" class="btn" onclick="location.reload()">再読み込み</button>';
}

// --- utils ---
function debounce(fn, ms) {
    let t;
    return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
    };
}
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}
function escapeAttr(s) {
    return escapeHtml(s);
}
