import { API_BASE, loadCustomStations, fetchStations } from './api.js';
import { initAudioGraph, audioContext, startFullscreenVisualizer, stopFullscreenVisualizer } from './audio.js';

const stationsContainer = document.getElementById('stations-container');
const audioStream = document.getElementById('audio-stream');
const stationName = document.getElementById('station-name');
const stationDetails = document.getElementById('station-details');
const stationIcon = document.getElementById('station-icon');
const searchInput = document.getElementById('search-input');
const allCategoryButtons = document.querySelectorAll('.cat-btn');
const languageSelect = document.getElementById('language-select'); 
const themeToggle = document.getElementById('theme-toggle');
const shareBtn = document.getElementById('share-btn');
const favoritesList = document.getElementById('favorites-list');
const quickPicksContainer = document.getElementById('quick-picks-container');
const recentlyPlayedWrapper = document.getElementById('recently-played-wrapper');
const recentlyPlayedContainer = document.getElementById('recently-played-container');
const clearRecentBtn = document.getElementById('clear-recent-btn');
const playRandomBtn = document.getElementById('play-random-btn');
const playRandomGlobalBtn = document.getElementById('play-random-global-btn');
const sortButtons = document.querySelectorAll('.sort-btn');
const viewGridBtn = document.getElementById('view-grid-btn');
const viewListBtn = document.getElementById('view-list-btn');
const prevStationBtn = document.getElementById('prev-station-btn');
const nextStationBtn = document.getElementById('next-station-btn');
const liveDot = document.getElementById('live-dot');

const songInfoContainer = document.getElementById('song-info-container');
const songInfoText = document.getElementById('song-info-text');
const refreshSongBtn = document.getElementById('refresh-song-btn');

let allStations = [];
let displayedStations = [];
let currentStation = null;
let currentSort = 'clickcount';
let currentFilterType = 'genre';
let currentFilterQuery = 'all';

const DEFAULT_ICON = 'https://cdn-icons-png.flaticon.com/512/2950/2950683.png';

// ======================== ЕЗИЦИ ========================
const langBtn = document.getElementById('lang-btn');
const langDropdown = document.getElementById('lang-dropdown');
const langOptions = document.querySelectorAll('.lang-option');

langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    langDropdown.classList.toggle('show');
});

document.addEventListener('click', () => {
    langDropdown.classList.remove('show');
});

langOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        const lang = opt.getAttribute('data-value');
        const flagClass = opt.querySelector('span').className;
        const text = opt.textContent.trim();
        
        langBtn.innerHTML = `<span class="${flagClass}"></span> ${text} <i class="fa-solid fa-chevron-down" style="font-size: 0.7rem; margin-left: 5px;"></i>`;
        
        languageSelect.value = lang;
        updateLanguage();
    });
});

const translations = {
    bg: { genres: "Музикални жанрове", countries: "Държави", all: "Всички", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Classical", lofi: "Lofi / Chill", news: "News", loading: "Зареждане на станциите...", noStations: "Няма намерени станции.", failed: "Грешка при зареждане.", selectStation: "Изберете станция", genreCountry: "Жанр и Държава", stationsTitle: "Станции", favorites: "Любими / Playlist", share: "Сподели", searchPlaceholder: "Търси станция...", searchCountryPlaceholder: "Търси държава...", linkCopied: "Линкът е копиран!", noFavorites: "Няма любими станции.", bass: "Bass", mid: "Mid", treble: "Treble", songLoading: "Проверка...", songError: "На живо (Live Stream)", playNow: "Слушай сега", quickPicks: "Бърз избор", recentlyPlayed: "Наскоро слушани", clear: "Изчисти", sortClicks: "Най-пускани", sortName: "Азбучен ред", sortVotes: "Гласове", randomStation: "Произволно радио" },
    en: { genres: "Music Genres", countries: "Countries", all: "All Stations", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Classical", lofi: "Lofi / Chill", news: "News", loading: "Loading stations...", noStations: "No stations found.", failed: "Failed to load.", selectStation: "Select a station", genreCountry: "Genre & Country", stationsTitle: "Stations", favorites: "Favorites / Playlist", share: "Share", searchPlaceholder: "Search station...", searchCountryPlaceholder: "Search country...", linkCopied: "Link copied!", noFavorites: "No favorite stations.", bass: "Bass", mid: "Mid", treble: "Treble", songLoading: "Checking...", songError: "Live Stream", playNow: "Listen Now", quickPicks: "Quick Picks", recentlyPlayed: "Recently Played", clear: "Clear", sortClicks: "Most Played", sortName: "Alphabetical", sortVotes: "Votes", randomStation: "Random Radio" },
    es: { genres: "Géneros Musicales", countries: "Países", all: "Todas", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Clásica", lofi: "Lofi / Chill", news: "Noticias", loading: "Cargando estaciones...", noStations: "No se encontraron estaciones.", failed: "Error al cargar.", selectStation: "Selecciona una estación", genreCountry: "Género y País", stationsTitle: "Estaciones", favorites: "Favoritos", share: "Compartir", searchPlaceholder: "Buscar estación...", searchCountryPlaceholder: "Buscar país...", linkCopied: "¡Enlace copiado!", noFavorites: "No hay estaciones favoritas.", bass: "Bajos", mid: "Medios", treble: "Agudos", songLoading: "Comprobando...", songError: "En vivo", playNow: "Escuchar ahora", quickPicks: "Selección rápida", recentlyPlayed: "Escuchadas recientemente", clear: "Limpiar", sortClicks: "Más escuchadas", sortName: "Alfabético", sortVotes: "Votos", randomStation: "Radio Aleatoria" },
    fr: { genres: "Genres Musicaux", countries: "Pays", all: "Toutes", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Classique", lofi: "Lofi / Chill", news: "Actualités", loading: "Chargement des stations...", noStations: "Aucune station trouvée.", failed: "Échec du chargement.", selectStation: "Sélectionnez une station", genreCountry: "Genre et Pays", stationsTitle: "Stations", favorites: "Favoris", share: "Partager", searchPlaceholder: "Rechercher une station...", searchCountryPlaceholder: "Rechercher un pays...", linkCopied: "Lien copié !", noFavorites: "Aucune station favorite.", bass: "Basses", mid: "Médiums", treble: "Aigus", songLoading: "Vérification...", songError: "En direct", playNow: "Écouter maintenant", quickPicks: "Choix rapides", recentlyPlayed: "Écoutées récemment", clear: "Effacer", sortClicks: "Les plus écoutées", sortName: "Alphabétique", sortVotes: "Votes", randomStation: "Radio Aléatoire" },
    de: { genres: "Musikgenres", countries: "Länder", all: "Alle", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Klassik", lofi: "Lofi / Chill", news: "Nachrichten", loading: "Sender werden geladen...", noStations: "Keine Sender gefunden.", failed: "Laden fehlgeschlagen.", selectStation: "Sender auswählen", genreCountry: "Genre & Land", stationsTitle: "Sender", favorites: "Favoriten", share: "Teilen", searchPlaceholder: "Sender suchen...", searchCountryPlaceholder: "Land suchen...", linkCopied: "Link kopiert!", noFavorites: "Keine Favoriten.", bass: "Bass", mid: "Mitten", treble: "Höhen", songLoading: "Prüfen...", songError: "Live-Stream", playNow: "Jetzt hören", quickPicks: "Schnellauswahl", recentlyPlayed: "Zuletzt gehört", clear: "Löschen", sortClicks: "Meistgespielt", sortName: "Alphabetisch", sortVotes: "Stimmen", randomStation: "Zufälliges Radio" },
    it: { genres: "Generi Musicali", countries: "Paesi", all: "Tutte", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Classica", lofi: "Lofi / Chill", news: "Notizie", loading: "Caricamento stazioni...", noStations: "Nessuna stazione trovata.", failed: "Caricamento fallito.", selectStation: "Seleziona una stazione", genreCountry: "Genere e Paese", stationsTitle: "Stazioni", favorites: "Preferiti", share: "Condividi", searchPlaceholder: "Cerca stazione...", searchCountryPlaceholder: "Cerca paese...", linkCopied: "Link copiato!", noFavorites: "Nessuna stazione preferita.", bass: "Bassi", mid: "Medi", treble: "Alti", songLoading: "Verifica...", songError: "In diretta", playNow: "Ascolta ora", quickPicks: "Scelte rapide", recentlyPlayed: "Ascoltate di recente", clear: "Cancella", sortClicks: "Più ascoltate", sortName: "Alfabetico", sortVotes: "Voti", randomStation: "Radio Casuale" },
    pt: { genres: "Gêneros Musicais", countries: "Países", all: "Todas", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Clássica", lofi: "Lofi / Chill", news: "Notícias", loading: "Carregando estações...", noStations: "Nenhuma estação encontrada.", failed: "Falha ao carregar.", selectStation: "Selecione uma estação", genreCountry: "Gênero e País", stationsTitle: "Estações", favorites: "Favoritos", share: "Compartilhar", searchPlaceholder: "Buscar estação...", searchCountryPlaceholder: "Buscar país...", linkCopied: "Link copiado!", noFavorites: "Nenhuma estação favorita.", bass: "Graves", mid: "Médios", treble: "Agudos", songLoading: "Verificando...", songError: "Ao vivo", playNow: "Ouvir agora", quickPicks: "Escolhas rápidas", recentlyPlayed: "Ouvidas recentemente", clear: "Limpar", sortClicks: "Mais tocadas", sortName: "Alfabético", sortVotes: "Votos", randomStation: "Rádio Aleatória" },
    ru: { genres: "Музыкальные жанры", countries: "Страны", all: "Все", pop: "Поп", rock: "Рок", jazz: "Джаз", classical: "Классика", lofi: "Лофи / Чилл", news: "Новости", loading: "Загрузка станций...", noStations: "Станции не найдены.", failed: "Ошибка загрузки.", selectStation: "Выберите станцию", genreCountry: "Жанр и Страна", stationsTitle: "Станции", favorites: "Избранное", share: "Поделиться", searchPlaceholder: "Поиск станции...", searchCountryPlaceholder: "Поиск страны...", linkCopied: "Ссылка скопирована!", noFavorites: "Нет избранных станций.", bass: "Бас", mid: "Средние", treble: "Высокие", songLoading: "Проверка...", songError: "Прямой эфир", playNow: "Слушать сейчас", quickPicks: "Быстрый выбор", recentlyPlayed: "Недавно прослушанные", clear: "Очистить", sortClicks: "Самые популярные", sortName: "По алфавиту", sortVotes: "Голоса", randomStation: "Случайное радио" },
    zh: { genres: "音乐流派", countries: "国家", all: "全部", pop: "流行", rock: "摇滚", jazz: "爵士", classical: "古典", lofi: "低保真 / 放松", news: "新闻", loading: "正在加载电台...", noStations: "未找到电台。", failed: "加载失败。", selectStation: "选择电台", genreCountry: "流派和国家", stationsTitle: "电台", favorites: "收藏", share: "分享", searchPlaceholder: "搜索电台...", searchCountryPlaceholder: "搜索国家...", linkCopied: "链接已复制！", noFavorites: "没有收藏的电台。", bass: "低音", mid: "中音", treble: "高音", songLoading: "检查中...", songError: "直播中", playNow: "立即收听", quickPicks: "快速选择", recentlyPlayed: "最近播放", clear: "清除", sortClicks: "最多播放", sortName: "字母顺序", sortVotes: "投票", randomStation: "随机电台" },
    ja: { genres: "音楽ジャンル", countries: "国", all: "すべて", pop: "ポップス", rock: "ロック", jazz: "ジャズ", classical: "クラシック", lofi: "ローファイ", news: "ニュース", loading: "ステーションを読み込み中...", noStations: "ステーションが見つかりません。", failed: "読み込みに失敗しました。", selectStation: "ステーションを選択", genreCountry: "ジャンルと国", stationsTitle: "ステーション", favorites: "お気に入り", share: "共有", searchPlaceholder: "ステーションを検索...", searchCountryPlaceholder: "国を検索...", linkCopied: "リンクをコピーしました！", noFavorites: "お気に入りのステーションはありません。", bass: "低音", mid: "中音", treble: "高音", songLoading: "確認中...", songError: "ライブ放送", playNow: "今すぐ聴く", quickPicks: "クイックピック", recentlyPlayed: "最近再生した曲", clear: "クリア", sortClicks: "最も再生された", sortName: "アルファベット順", sortVotes: "投票", randomStation: "ランダムラジオ" }
};

function t(key) {
    const lang = languageSelect.value;
    return (translations[lang] && translations[lang][key]) || translations.bg[key] || key;
}

function updateLanguage() {
    const lang = languageSelect.value;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang] && translations[lang][key]) el.textContent = translations[lang][key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[lang] && translations[lang][key]) el.placeholder = translations[lang][key];
    });
    renderFavorites();
}

function cleanString(str) {
    if (!str) return '';
    let text = str.toString().trim();
    text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
    text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
    return text || 'Unknown Station';
}

function formatMetaLine(station) {
    const country = station.country ? cleanString(station.country) : 'Global';
    const tagsRaw = station.tags ? cleanString(station.tags) : '';
    const firstTag = tagsRaw.split(',').map(tag => tag.trim()).find(tag => tag.length > 0);
    const formattedTag = firstTag ? (firstTag.charAt(0).toUpperCase() + firstTag.slice(1)) : 'Radio';
    return `${formattedTag} • ${country}`;
}

// ======================== ЛЮБИМИ (PLAYLIST) ========================
function getFavorites() { return JSON.parse(localStorage.getItem('radio_favorites') || '[]'); }
function setFavorites(favs) { localStorage.setItem('radio_favorites', JSON.stringify(favs)); }
function isFavorite(uuid) { return getFavorites().some(s => s.stationuuid === uuid); }

function toggleFavorite(station, btn) {
    let favs = getFavorites();
    if (isFavorite(station.stationuuid)) {
        favs = favs.filter(s => s.stationuuid !== station.stationuuid);
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
    } else {
        const cleanStation = { ...station, name: cleanString(station.name) };
        favs.push(cleanStation);
        btn.classList.add('active');
        btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
    }
    setFavorites(favs);
    renderFavorites();
}

function renderFavorites() {
    const favs = getFavorites();
    favoritesList.innerHTML = '';
    if (favs.length === 0) {
        favoritesList.innerHTML = `<p style="font-size:0.8rem;color:var(--text-muted);padding:4px 12px;">${t('noFavorites')}</p>`;
        return;
    }
    favs.forEach(station => {
        const btn = document.createElement('button');
        btn.className = 'fav-sidebar-item';
        
        const img = document.createElement('img');
        img.src = station.favicon || DEFAULT_ICON;
        img.onerror = () => { img.src = DEFAULT_ICON; };

        const info = document.createElement('div');
        info.className = 'fav-sidebar-info';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'fav-name';
        nameSpan.textContent = cleanString(station.name);
        
        const metaSpan = document.createElement('span');
        metaSpan.className = 'fav-meta';
        metaSpan.textContent = formatMetaLine(station);

        info.appendChild(nameSpan);
        info.appendChild(metaSpan);
        btn.appendChild(img);
        btn.appendChild(info);

        btn.addEventListener('click', () => playStation(station));
        favoritesList.appendChild(btn);
    });
}

// ======================== НАСКОРО СЛУШАНИ ========================
function getRecentStations() {
    return JSON.parse(localStorage.getItem('radio_recent') || '[]');
}

function addRecentStation(station) {
    let recent = getRecentStations();
    recent = recent.filter(s => s.stationuuid !== station.stationuuid);
    recent.unshift({
        stationuuid: station.stationuuid,
        name: cleanString(station.name),
        url_resolved: station.url_resolved,
        country: station.country,
        tags: station.tags,
        favicon: station.favicon
    });
    if (recent.length > 5) recent = recent.slice(0, 5);
    localStorage.setItem('radio_recent', JSON.stringify(recent));
    renderRecentStations();
}

function renderRecentStations() {
    const recent = getRecentStations();
    if (recent.length === 0) {
        recentlyPlayedWrapper.style.display = 'none';
        return;
    }
    recentlyPlayedWrapper.style.display = 'block';
    recentlyPlayedContainer.innerHTML = '';

    recent.forEach(station => {
        const card = document.createElement('div');
        card.className = 'recent-card';

        const img = document.createElement('img');
        img.src = station.favicon || DEFAULT_ICON;
        img.onerror = () => { img.src = DEFAULT_ICON; };

        const info = document.createElement('div');
        info.className = 'recent-card-info';

        const h4 = document.createElement('h4');
        h4.textContent = cleanString(station.name);

        const p = document.createElement('p');
        p.textContent = formatMetaLine(station);

        info.appendChild(h4);
        info.appendChild(p);
        card.appendChild(img);
        card.appendChild(info);

        card.addEventListener('click', () => playStation(station));
        recentlyPlayedContainer.appendChild(card);
    });
}

if (clearRecentBtn) {
    clearRecentBtn.addEventListener('click', () => {
        localStorage.removeItem('radio_recent');
        renderRecentStations();
    });
}

// ======================== БЪРЗ ИЗБОР ========================
async function loadTopStations(type = 'global', query = '') {
    quickPicksContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Зареждане...</p>';
    let url = `${API_BASE}/topclick/8`;
    if (type === 'country' && query) {
        url = `${API_BASE}/bycountry/${encodeURIComponent(query)}?limit=8&order=clickcount&reverse=true`;
    } else if (type === 'genre' && query !== 'all') {
        url = `${API_BASE}/bytag/${encodeURIComponent(query)}?limit=8&order=clickcount&reverse=true`;
    }
    try {
        const topStations = await fetchStations(url);
        renderQuickPicks(topStations);
    } catch (e) {
        quickPicksContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">Грешка при зареждане.</p>';
    }
}

function renderQuickPicks(stations) {
    quickPicksContainer.innerHTML = '';
    if (!stations || stations.length === 0) return;
    stations.forEach(station => {
        const div = document.createElement('div');
        div.className = 'quick-pick-item';
        const img = document.createElement('img');
        img.src = station.favicon || DEFAULT_ICON;
        img.onerror = () => { img.src = DEFAULT_ICON; };
        const span = document.createElement('span');
        span.textContent = cleanString(station.name);
        div.appendChild(img);
        div.appendChild(span);
        div.addEventListener('click', () => playStation(station));
        quickPicksContainer.appendChild(div);
    });
}

// ======================== ТЕМА ========================
const savedTheme = localStorage.getItem('radio_theme') || 'dark';
if (savedTheme === 'light') document.body.classList.add('light-theme');
updateThemeIcon();

themeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('radio_theme', isLight ? 'light' : 'dark');
    updateThemeIcon();
});

function updateThemeIcon() {
    const icon = themeToggle.querySelector('i');
    icon.className = document.body.classList.contains('light-theme') ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

// ======================== ЗАРЕЖДАНЕ НА СТАНЦИИ ========================
async function loadStations(type, query, sort = 'clickcount') {
    stationsContainer.innerHTML = `<p class="loading-text">${t('loading')}</p>`;
    currentFilterType = type;
    currentFilterQuery = query;
    currentSort = sort;

    const cacheKey = `radio_cache_${type}_${query}_${sort}`;
    const cachedData = sessionStorage.getItem(cacheKey);

    if (cachedData) {
        allStations = JSON.parse(cachedData);
        displayStations(allStations);
        return;
    }

    let url = `${API_BASE}/topclick/60`;
    if (type === 'genre' && query !== 'all') {
        url = `${API_BASE}/bytag/${encodeURIComponent(query)}?limit=60&order=${sort}&reverse=true`;
    } else if (type === 'country') {
        url = `${API_BASE}/bycountry/${encodeURIComponent(query)}?limit=60&order=${sort}&reverse=true`;
    } else {
        url = `${API_BASE}/topclick/60?order=${sort}&reverse=true`;
    }

    try {
        let apiStations = await fetchStations(url);
        if (!Array.isArray(apiStations) || apiStations.length === 0) {
            apiStations = await fetchStations(`${API_BASE}/topclick/60`);
        }

        const custom = await loadCustomStations();
        let filteredCustom = custom;
        if (type === 'genre' && query !== 'all') {
            filteredCustom = custom.filter(s => (s.tags || '').toLowerCase().includes(query.toLowerCase()));
        } else if (type === 'country') {
            filteredCustom = custom.filter(s => (s.country || '').toLowerCase() === query.toLowerCase());
        }

        allStations = [...filteredCustom, ...apiStations];
        sortStationsLocally(sort);
        sessionStorage.setItem(cacheKey, JSON.stringify(allStations));
        displayStations(allStations);
    } catch (error) {
        stationsContainer.innerHTML = `<p style="color: #ef4444;">${t('failed')}</p>`;
    }
}

function sortStationsLocally(sortType) {
    if (sortType === 'name') {
        allStations.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortType === 'votes') {
        allStations.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    } else {
        allStations.sort((a, b) => (b.clickcount || 0) - (a.clickcount || 0));
    }
}

// ======================== ТЪРСЕНЕ И ИЗГЛЕД ========================
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    let term = e.target.value.trim();
    if (term.length > 50) {
        term = term.substring(0, 50);
        searchInput.value = term;
    }

    const lowerTerm = term.toLowerCase();
    if (lowerTerm.length === 0) { displayStations(allStations); return; }

    searchTimeout = setTimeout(async () => {
        try {
            const custom = await loadCustomStations();
            const customMatches = custom.filter(s =>
                (s.name || '').toLowerCase().includes(lowerTerm) || (s.tags || '').toLowerCase().includes(lowerTerm)
            );
            const localMatches = allStations.filter(s =>
                (s.name || '').toLowerCase().includes(lowerTerm) || (s.tags || '').toLowerCase().includes(lowerTerm)
            );

            let apiResults = [];
            if (lowerTerm.length >= 2) {
                apiResults = await fetchStations(`${API_BASE}/byname/${encodeURIComponent(lowerTerm)}?limit=60`);
            }

            const uniqueStations = new Map();
            customMatches.forEach(s => uniqueStations.set(s.stationuuid || s.name, s));
            localMatches.forEach(s => { if (!uniqueStations.has(s.stationuuid || s.name)) uniqueStations.set(s.stationuuid || s.name, s); });
            apiResults.forEach(s => { if (!uniqueStations.has(s.stationuuid || s.name)) uniqueStations.set(s.stationuuid || s.name, s); });

            displayStations(Array.from(uniqueStations.values()));
        } catch (err) {
            const filtered = allStations.filter(s =>
                (s.name || '').toLowerCase().includes(lowerTerm) || (s.tags || '').toLowerCase().includes(lowerTerm)
            );
            displayStations(filtered);
        }
    }, 400);
});

const countrySearchInput = document.getElementById('country-search-input');
if (countrySearchInput) {
    countrySearchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('#country-buttons .cat-btn').forEach(btn => {
            btn.style.display = btn.textContent.toLowerCase().includes(term) ? 'flex' : 'none';
        });
    });
}

sortButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        sortButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const sortType = btn.getAttribute('data-sort');
        loadStations(currentFilterType, currentFilterQuery, sortType);
    });
});

viewGridBtn.addEventListener('click', () => {
    viewGridBtn.classList.add('active');
    viewListBtn.classList.remove('active');
    stationsContainer.className = 'grid-view';
});

viewListBtn.addEventListener('click', () => {
    viewListBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
    stationsContainer.className = 'list-view';
});

// ======================== ВИЗУАЛИЗИРАНЕ НА КАРТИТЕ ========================
function displayStations(stations) {
    stationsContainer.innerHTML = '';
    displayedStations = stations.filter(s => s.url_resolved && s.url_resolved.trim() !== '');

    if (displayedStations.length === 0) {
        stationsContainer.innerHTML = `<p>${t('noStations')}</p>`;
        return;
    }

    displayedStations.forEach(station => {
        const isCurrentPlaying = currentStation && currentStation.stationuuid === station.stationuuid && !audioStream.paused;

        const card = document.createElement('div');
        card.className = 'station-card';
        card.dataset.uuid = station.stationuuid;
        if (isCurrentPlaying) card.classList.add('playing');

        let favicon = station.favicon;
        if (!favicon || favicon.trim() === '' || favicon.includes('placeholder')) favicon = DEFAULT_ICON;

        const img = document.createElement('img');
        img.className = 'station-logo';
        img.src = favicon;
        img.alt = 'Logo';
        img.loading = 'lazy';
        img.onerror = () => { img.src = DEFAULT_ICON; };

        const infoDiv = document.createElement('div');
        infoDiv.className = 'station-info-text';
        
        const h4 = document.createElement('h4');
        h4.textContent = cleanString(station.name);
        
        const metaP = document.createElement('p');
        metaP.className = 'station-meta-line';
        metaP.textContent = formatMetaLine(station);

        infoDiv.appendChild(h4);
        infoDiv.appendChild(metaP);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'station-actions';

        const playIndicator = document.createElement('div');
        playIndicator.className = 'play-btn';
        if (isCurrentPlaying) {
            playIndicator.innerHTML = `<div class="equalizer-bars"><span></span><span></span><span></span><span></span></div>`;
        } else {
            playIndicator.innerHTML = '<i class="fa-solid fa-play"></i>';
        }

        const favBtn = document.createElement('button');
        favBtn.className = 'fav-btn';
        if (isFavorite(station.stationuuid)) {
            favBtn.classList.add('active');
            favBtn.innerHTML = '<i class="fa-solid fa-heart"></i>';
        } else {
            favBtn.innerHTML = '<i class="fa-regular fa-heart"></i>';
        }
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(station, favBtn);
        });

        actionsDiv.appendChild(playIndicator);
        actionsDiv.appendChild(favBtn);

        card.appendChild(img);
        card.appendChild(infoDiv);
        card.appendChild(actionsDiv);

        card.addEventListener('click', () => playStation(station));
        stationsContainer.appendChild(card);
    });
}

function updateActiveCardHighlight() {
    document.querySelectorAll('.station-card').forEach(card => {
        const isMatch = currentStation && card.dataset.uuid === currentStation.stationuuid && !audioStream.paused;
        card.classList.toggle('playing', Boolean(isMatch));
        const indicator = card.querySelector('.play-btn');
        if (indicator) {
            indicator.innerHTML = isMatch
                ? `<div class="equalizer-bars"><span></span><span></span><span></span><span></span></div>`
                : '<i class="fa-solid fa-play"></i>';
        }
    });
}

// ======================== ПУСКАНЕ НА СТАНЦИЯ ========================
async function playStation(station) {
    if (!station || !station.url_resolved) return;
    currentStation = station;
    audioStream.src = station.url_resolved;

    audioStream.onerror = () => {
        liveDot.classList.remove('active');
        songInfoContainer.style.display = 'flex';
        songInfoText.textContent = "⚠️ Стриймът е недостъпен.";
        stationName.textContent = cleanString(station.name) + " (Офлайн)";
        updateActiveCardHighlight();
    };

    try {
        await audioStream.play();
    } catch (e) {
        songInfoContainer.style.display = 'flex';
        songInfoText.textContent = "⚠️ Натиснете Play за старт.";
        return;
    }

    const name = cleanString(station.name);
    stationName.textContent = name;
    stationDetails.textContent = formatMetaLine(station);
    stationIcon.src = station.favicon || DEFAULT_ICON;
    stationIcon.onerror = () => { stationIcon.src = DEFAULT_ICON; };
    shareBtn.disabled = false;

    addRecentStation(station);
    updateActiveCardHighlight();

    songInfoContainer.style.display = 'flex';
    checkCurrentSong(station);

    if (!audioContext) initAudioGraph(audioStream, null);
    if (audioContext && audioContext.state === 'suspended') await audioContext.resume();
}

refreshSongBtn.addEventListener('click', () => {
    if (currentStation) checkCurrentSong(currentStation);
});

async function checkCurrentSong(station) {
    songInfoText.textContent = t('songLoading');
    try {
        const urlObj = new URL(station.url_resolved);
        const statusUrl = `${urlObj.protocol}//${urlObj.host}/status-json.xsl`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(statusUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error('No status');
        
        const data = await response.json();
        let title = '';
        if (data.icestats && data.icestats.source) {
            const sources = Array.isArray(data.icestats.source) ? data.icestats.source : [data.icestats.source];
            const currentSource = sources.find(s => s.listenurl && s.listenurl.includes(urlObj.pathname)) || sources[0];
            title = currentSource.title || currentSource.artist_t || currentSource.song || '';
        }
        songInfoText.textContent = title ? title : t('songError');
    } catch (e) {
        songInfoText.textContent = t('songError');
    }
}

// Предишна / Следваща станция
prevStationBtn.addEventListener('click', () => {
    if (displayedStations.length === 0) return;
    const idx = currentStation ? displayedStations.findIndex(s => s.stationuuid === currentStation.stationuuid) : 0;
    const prevIdx = (idx - 1 + displayedStations.length) % displayedStations.length;
    playStation(displayedStations[prevIdx]);
});

nextStationBtn.addEventListener('click', () => {
    if (displayedStations.length === 0) return;
    const idx = currentStation ? displayedStations.findIndex(s => s.stationuuid === currentStation.stationuuid) : -1;
    const nextIdx = (idx + 1) % displayedStations.length;
    playStation(displayedStations[nextIdx]);
});

shareBtn.addEventListener('click', () => {
    if (!currentStation) return;
    const url = new URL(window.location);
    url.searchParams.set('station', currentStation.stationuuid);
    navigator.clipboard.writeText(url.toString()).then(() => {
        const original = shareBtn.innerHTML;
        shareBtn.innerHTML = `<i class="fa-solid fa-check"></i> ${t('linkCopied')}`;
        setTimeout(() => { shareBtn.innerHTML = original; }, 2000);
    });
});

allCategoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        allCategoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const genre = btn.getAttribute('data-genre');
        const country = btn.getAttribute('data-country');
        const activeSort = document.querySelector('.sort-btn.active').getAttribute('data-sort');
        
        if (genre) {
            loadStations('genre', genre, activeSort);
            loadTopStations('genre', genre);
        } else if (country) {
            loadStations('country', country, activeSort);
            loadTopStations('country', country);
        }
    });
});

playRandomBtn.addEventListener('click', () => {
    if (allStations.length > 0) {
        const randomIndex = Math.floor(Math.random() * allStations.length);
        playStation(allStations[randomIndex]);
    }
});

playRandomGlobalBtn.addEventListener('click', async () => {
    const originalHtml = playRandomGlobalBtn.innerHTML;
    playRandomGlobalBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Търсене...';
    try {
        const stations = await fetchStations(`${API_BASE}/topclick/100`);
        const validStations = stations.filter(s => s.url_resolved && s.url_resolved.trim() !== '');
        if (validStations.length > 0) {
            const randomIndex = Math.floor(Math.random() * validStations.length);
            playStation(validStations[randomIndex]);
        }
    } catch (e) {
        console.error('Random station error:', e);
    } finally {
        playRandomGlobalBtn.innerHTML = originalHtml;
    }
});

// ======================== ПЛЕЪР, ЗВУК И MUTE ========================
const playPauseBtn = document.getElementById('play-pause-btn');
const currentTimeEl = document.getElementById('current-time');
const volumeSlider = document.getElementById('volume-slider');
const volumeIcon = document.getElementById('volume-icon');

let lastVolume = 1;

playPauseBtn.addEventListener('click', () => {
    if (!currentStation && displayedStations.length > 0) {
        playStation(displayedStations[0]);
        return;
    }
    if (audioStream.paused) {
        audioStream.play();
    } else {
        audioStream.pause();
    }
});

audioStream.addEventListener('play', () => {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    liveDot.classList.add('active');
    updateActiveCardHighlight();
});

audioStream.addEventListener('pause', () => {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    liveDot.classList.remove('active');
    updateActiveCardHighlight();
});

audioStream.addEventListener('timeupdate', () => {
    currentTimeEl.textContent = formatTime(audioStream.currentTime);
});

volumeSlider.addEventListener('input', (e) => {
    audioStream.volume = e.target.value;
    updateVolumeIcon(audioStream.volume);
});

volumeIcon.addEventListener('click', () => {
    if (audioStream.volume > 0) {
        lastVolume = audioStream.volume;
        audioStream.volume = 0;
        volumeSlider.value = 0;
    } else {
        audioStream.volume = lastVolume || 1;
        volumeSlider.value = audioStream.volume;
    }
    updateVolumeIcon(audioStream.volume);
});

function updateVolumeIcon(vol) {
    if (vol === 0) {
        volumeIcon.className = 'fa-solid fa-volume-xmark';
    } else if (vol < 0.5) {
        volumeIcon.className = 'fa-solid fa-volume-low';
    } else {
        volumeIcon.className = 'fa-solid fa-volume-high';
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// ======================== СЪН ТАЙМЕР ========================
const sleepTimerBtn = document.getElementById('sleep-timer-btn');
const sleepTimerMenu = document.getElementById('sleep-timer-menu');
const timerCountdown = document.getElementById('timer-countdown');
let sleepTimerInterval = null;

if (sleepTimerBtn) {
    sleepTimerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sleepTimerMenu.style.display = sleepTimerMenu.style.display === 'flex' ? 'none' : 'flex';
    });

    document.addEventListener('click', () => {
        sleepTimerMenu.style.display = 'none';
    });

    document.querySelectorAll('.timer-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            const mins = parseInt(btn.getAttribute('data-mins'));
            setSleepTimer(mins);
            sleepTimerMenu.style.display = 'none';
        });
    });
}

function setSleepTimer(mins) {
    if (sleepTimerInterval) clearInterval(sleepTimerInterval);
    
    if (mins === 0) {
        timerCountdown.style.display = 'none';
        sleepTimerBtn.style.color = 'inherit';
        return;
    }

    sleepTimerBtn.style.color = 'var(--accent)';
    timerCountdown.style.display = 'block';
    
    let timeLeft = mins * 60;
    
    sleepTimerInterval = setInterval(() => {
        let m = Math.floor(timeLeft / 60);
        let s = timeLeft % 60;
        timerCountdown.textContent = `Остават: ${m}:${s < 10 ? '0' : ''}${s}`;
        
        if (timeLeft <= 0) {
            clearInterval(sleepTimerInterval);
            audioStream.pause();
            timerCountdown.style.display = 'none';
            sleepTimerBtn.style.color = 'inherit';
        }
        timeLeft--;
    }, 1000);
}

// ======================== ЦЯЛ ЕКРАН ВИЗУАЛИЗАТОР ========================
const fullscreenVisBtn = document.getElementById('fullscreen-vis-btn');
const fullscreenModal = document.getElementById('fullscreen-modal');
const closeFullscreen = document.getElementById('close-fullscreen');
const fsVisualizerCanvas = document.getElementById('fullscreen-visualizer');
const fsStationName = document.getElementById('fs-station-name');

if (fullscreenVisBtn) {
    fullscreenVisBtn.addEventListener('click', () => {
        if (!currentStation) return;
        fullscreenModal.style.display = 'flex';
        fsStationName.textContent = cleanString(currentStation.name);
        startFullscreenVisualizer(fsVisualizerCanvas);
    });

    closeFullscreen.addEventListener('click', () => {
        fullscreenModal.style.display = 'none';
        stopFullscreenVisualizer();
    });
}

// ======================== СТАРТИРАНЕ ========================
document.addEventListener('DOMContentLoaded', async () => {
    updateLanguage();
    renderFavorites();
    renderRecentStations();
    await loadCustomStations();
    loadTopStations();

    const params = new URLSearchParams(window.location.search);
    const stationUuid = params.get('station');

    if (stationUuid) {
        const custom = await loadCustomStations();
        const customMatch = custom.find(s => s.stationuuid === stationUuid);
        if (customMatch) { playStation(customMatch); return; }

        try {
            const data = await fetchStations(`${API_BASE}/byuuid/${stationUuid}`);
            if (Array.isArray(data) && data.length > 0) {
                playStation(data[0]);
                return;
            }
        } catch (e) { console.log('Share load error:', e); }
    }

    const activeSort = document.querySelector('.sort-btn.active').getAttribute('data-sort');
    loadStations('genre', 'all', activeSort);
});