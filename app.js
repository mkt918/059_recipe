const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQlMrVlcfS3ntbwo5kfLdNrziho2jOmz3X_Qq9-ojUozpM0YzNUGIrc9HZxCSI7AP43BcGe4shmwLsU/pub?gid=0&single=true&output=csv';

let state = {
    recipes: [],
    favorites: JSON.parse(localStorage.getItem('recipe_favorites') || '[]'),
    searchQuery: '',
    activeCategory: 'すべて',
    activeIngredients: [],
    showOnlyFavorites: false
};

// --- DOM Elements ---
const recipeList = document.getElementById('recipe-list');
const categoryFilters = document.getElementById('category-filters');
const ingredientFilters = document.getElementById('ingredient-filters');
const searchInput = document.getElementById('search-input');
const recipeCount = document.getElementById('recipe-count');
const recipeModal = document.getElementById('recipe-modal');
const modalContent = document.getElementById('modal-content');
const modalBody = document.getElementById('modal-body');
const closeModal = document.getElementById('close-modal');
const showFavoritesBtn = document.getElementById('show-favorites');

// --- Initialization ---
async function init() {
    try {
        const data = await fetchCSV(CSV_URL);
        state.recipes = parseCSV(data);
        renderFilters();
        renderRecipes();
    } catch (error) {
        console.error('Failed to load recipes:', error);
        recipeList.innerHTML = '<div class="col-span-full py-12 text-center text-red-500 font-bold">申し訳ありません。データの読み込みに失敗しました。</div>';
    }
}

// --- CSV Parsing ---
async function fetchCSV(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.text();
}

function parseCSV(text) {
    const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true
    });
    
    return result.data.map(row => {
        const ingredientsInput = row['主な食材（カンマ区切り）'] || '';
        const ingredientsList = ingredientsInput.split('、').filter(i => i.trim() !== '');
        
        return {
            id: row['ID'],
            title: row['レシピ名'],
            category: row['種別'],
            ingredients: ingredientsList,
            steps: [row['手順①'], row['手順②'], row['手順③'], row['手順④'], row['手順⑤'], row['手順⑥']].filter(s => s && s.trim() !== ''),
            extra1: row['追加項目１'],
            extra2: row['追加項目２'],
            reference: row['参考サイトなど'],
            rawIngredients: ingredientsInput
        };
    });
}

// --- State Management ---
function toggleFavorite(id) {
    const index = state.favorites.indexOf(id);
    if (index === -1) {
        state.favorites.push(id);
    } else {
        state.favorites.splice(index, 1);
    }
    localStorage.setItem('recipe_favorites', JSON.stringify(state.favorites));
    renderRecipes();
}

function toggleIngredientFilter(ingredient) {
    const index = state.activeIngredients.indexOf(ingredient);
    if (index === -1) {
        state.activeIngredients.push(ingredient);
    } else {
        state.activeIngredients.splice(index, 1);
    }
    renderFilters();
    renderRecipes();
}

function clearIngredients() {
    state.activeIngredients = [];
    renderFilters();
    renderRecipes();
}

function renderFilters() {
    const activeClass = 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-100';
    const inactiveClass = 'bg-white text-slate-600 border-slate-200 hover:border-orange-200 hover:text-orange-500 hover:bg-orange-50 transition-all';

    // Categories
    const categories = ['すべて', ...new Set(state.recipes.map(r => r.category))];
    categoryFilters.innerHTML = categories.map(cat => `
        <button onclick="updateCategory('${cat}')" 
                class="px-4 py-1.5 rounded-full border text-sm font-medium ${state.activeCategory === cat ? activeClass : inactiveClass}">
            ${cat}
        </button>
    `).join('');

    // Ingredients (Top 15 most used)
    const ingredientCounts = {};
    state.recipes.forEach(r => {
        r.ingredients.forEach(i => {
            ingredientCounts[i] = (ingredientCounts[i] || 0) + 1;
        });
    });
    const sortedIngredients = Object.keys(ingredientCounts)
        .sort((a, b) => ingredientCounts[b] - ingredientCounts[a])
        .slice(0, 15);

    // Ingredient buttons with "すべて" at the beginning
    const allIngredientsBtn = `
        <button onclick="clearIngredients()" 
                class="px-4 py-1.5 rounded-full border text-sm font-medium ${state.activeIngredients.length === 0 ? activeClass : inactiveClass}">
            すべて
        </button>
    `;

    ingredientFilters.innerHTML = allIngredientsBtn + sortedIngredients.map(ing => `
        <button onclick="toggleIngredientFilter('${ing}')" 
                class="px-4 py-1.5 rounded-full border text-sm font-medium ${state.activeIngredients.includes(ing) ? activeClass : inactiveClass}">
            ${ing}
        </button>
    `).join('');
}

function updateCategory(cat) {
    state.activeCategory = cat;
    renderFilters();
    renderRecipes();
}

function getFilteredRecipes() {
    return state.recipes.filter(recipe => {
        const matchesSearch = recipe.title.includes(state.searchQuery) || 
                              recipe.rawIngredients.includes(state.searchQuery) ||
                              recipe.category.includes(state.searchQuery);
        const matchesCategory = state.activeCategory === 'すべて' || recipe.category === state.activeCategory;
        const matchesIngredients = state.activeIngredients.length === 0 || 
                                   state.activeIngredients.every(ing => recipe.ingredients.includes(ing));
        const matchesFavorite = !state.showOnlyFavorites || state.favorites.includes(recipe.id);
        
        return matchesSearch && matchesCategory && matchesIngredients && matchesFavorite;
    });
}

function renderRecipes() {
    const filtered = getFilteredRecipes();
    recipeCount.textContent = `${filtered.length} 件のレシピを表示中`;
    
    if (filtered.length === 0) {
        recipeList.innerHTML = '<div class="col-span-full py-12 text-center text-slate-400">見つかりませんでした。条件を変えてみてください。</div>';
        return;
    }

    recipeList.innerHTML = filtered.map(recipe => {
        const isFav = state.favorites.includes(recipe.id);
        return `
            <div class="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-card relative animate-fade-in">
                <div class="p-6">
                    <div class="flex justify-between items-start mb-4">
                        <span class="px-2 py-0.5 bg-orange-50 text-orange-600 text-xs font-bold rounded-md uppercase">${recipe.category}</span>
                        <button onclick="event.stopPropagation(); toggleFavorite('${recipe.id}')" class="text-2xl transition-all hover:scale-110 active:scale-95 ${isFav ? 'text-red-500 heart-pop' : 'text-slate-200'}">
                            <ion-icon name="${isFav ? 'heart' : 'heart-outline'}"></ion-icon>
                        </button>
                    </div>
                    <h3 class="text-xl font-bold text-slate-800 leading-tight mb-4 min-h-[3.5rem] line-clamp-2">${recipe.title}</h3>
                    <div class="flex flex-wrap gap-1.5 mb-6">
                        ${recipe.ingredients.slice(0, 6).map(ing => `<span class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">#${ing}</span>`).join('')}
                        ${recipe.ingredients.length > 6 ? `<span class="text-[10px] text-slate-400 px-1">+${recipe.ingredients.length - 6}</span>` : ''}
                    </div>
                    <button onclick="openRecipeModal('${recipe.id}')" class="w-full py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-700 transition-colors text-sm">手順を確認する</button>
                </div>
            </div>
        `;
    }).join('');
}

// --- Modal Handlers ---
function openRecipeModal(id) {
    const recipe = state.recipes.find(r => r.id === id);
    if (!recipe) return;

    modalBody.innerHTML = `
        <div class="flex flex-col gap-8">
            <div class="border-b border-slate-100 pb-6">
                <div class="mb-4">
                    <span class="inline-block px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg mb-2 capitalize">${recipe.category}</span>
                    <h2 class="text-4xl font-bold text-slate-900 font-['Outfit'] mb-4">${recipe.title}</h2>
                </div>
                
                <div class="bg-orange-50 p-6 rounded-3xl border border-orange-100 mb-8">
                    <h4 class="font-bold text-orange-900 mb-4 flex items-center gap-2">
                        <ion-icon name="list"></ion-icon>
                        材料
                    </h4>
                    <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm text-orange-800">
                        ${recipe.ingredients.map(ing => `<div class="flex items-center gap-2 font-medium"><ion-icon name="checkmark-circle" class="text-orange-400"></ion-icon> ${ing}</div>`).join('')}
                    </div>
                </div>
            </div>
                
                <h4 class="font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <ion-icon name="restaurant-outline"></ion-icon>
                    作り方
                </h4>
                <div class="space-y-4 mb-8">
                    ${recipe.steps.map((step, idx) => `
                        <div class="flex gap-4">
                            <div class="flex-shrink-0 w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold text-sm">${idx + 1}</div>
                            <p class="text-slate-600 leading-relaxed pt-1">${step}</p>
                        </div>
                    `).join('')}
                </div>

                ${recipe.reference ? `
                    <div class="pt-6 border-t border-slate-100">
                        <a href="${recipe.reference}" target="_blank" class="flex items-center gap-2 text-sm font-bold text-orange-500 hover:text-orange-600 transition-colors">
                            <ion-icon name="link"></ion-icon>
                            参考サイト・動画を見る
                        </a>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    recipeModal.classList.remove('hidden');
    setTimeout(() => {
        modalContent.classList.remove('scale-95', 'opacity-0');
        modalContent.classList.add('scale-100', 'opacity-100', 'animate-modal-in');
    }, 10);
    document.body.style.overflow = 'hidden';
}

function hideModal() {
    modalContent.classList.remove('scale-100', 'opacity-100', 'animate-modal-in');
    modalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        recipeModal.classList.add('hidden');
        document.body.style.overflow = '';
    }, 300);
}

// --- Event Listeners ---
searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderRecipes();
});

closeModal.addEventListener('click', hideModal);
recipeModal.addEventListener('click', (e) => {
    if (e.target === recipeModal) hideModal();
});

showFavoritesBtn.addEventListener('click', () => {
    state.showOnlyFavorites = !state.showOnlyFavorites;
    showFavoritesBtn.classList.toggle('bg-slate-900');
    showFavoritesBtn.classList.toggle('text-white');
    showFavoritesBtn.classList.toggle('hover:bg-slate-700');
    renderRecipes();
});

// Start the app
init();
