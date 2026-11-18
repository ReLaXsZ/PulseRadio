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
const visualizerCanvas = document.getElementById('visualizer');
const quickPicksContainer = document.getElementById('quick-picks-container');
const playRandomBtn = document.getElementById('play-random-btn');
const playRandomGlobalBtn = document.getElementById('play-random-global-btn');
const sortButtons = document.querySelectorAll('.sort-btn');

const songInfoContainer = document.getElementById('song-info-container');
const songInfoText = document.getElementById('song-info-text');
const refreshSongBtn = document.getElementById('refresh-song-btn');

let allStations = [];
let currentStation = null;
let currentSort = 'clickcount';
let currentFilterType = 'genre';
let currentFilterQuery = 'all';

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
    bg: { genres: "Музикални жанрове", countries: "Държави", all: "Всички", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Classical", lofi: "Lofi / Chill", news: "News", loading: "Зареждане на станциите...", noStations: "Няма намерени станции.", failed: "Грешка при зареждане.", footer: "🔒 Без бисквитки, без регистрация, без следене. Чисто музикално изживяване.", selectStation: "Изберете станция", genreCountry: "Жанр и Държава", stationsTitle: "Станции", favorites: "Любими", share: "Сподели", searchPlaceholder: "Търси станция...", searchCountryPlaceholder: "Търси държава...", linkCopied: "Линкът е копиран!", noFavorites: "Няма любими станции.", bass: "Bass", mid: "Mid", treble: "Treble", songLoading: "Проверка...", songError: "Няма информация за песента.", heroText: "Слушай любимите си радиостанции от цял свят. Без регистрация, без реклами.", playNow: "Слушай сега", quickPicks: "Бърз избор", sortClicks: "Най-пускани", sortName: "Азбучен ред", sortVotes: "Гласове", randomStation: "Произволно радио" },
    en: { genres: "Music Genres", countries: "Countries", all: "All Stations", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Classical", lofi: "Lofi / Chill", news: "News", loading: "Loading stations...", noStations: "No stations found.", failed: "Failed to load.", footer: "🔒 No cookies, no registration, no tracking. Pure music experience.", selectStation: "Select a station", genreCountry: "Genre & Country", stationsTitle: "Stations", favorites: "Favorites", share: "Share", searchPlaceholder: "Search station...", searchCountryPlaceholder: "Search country...", linkCopied: "Link copied!", noFavorites: "No favorite stations.", bass: "Bass", mid: "Mid", treble: "Treble", songLoading: "Checking...", songError: "No song info available.", heroText: "Listen to your favorite radio stations from around the world. No registration, no ads.", playNow: "Listen Now", quickPicks: "Quick Picks", sortClicks: "Most Played", sortName: "Alphabetical", sortVotes: "Votes", randomStation: "Random Radio" },
    es: { genres: "Géneros Musicales", countries: "Países", all: "Todas", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Clásica", lofi: "Lofi / Chill", news: "Noticias", loading: "Cargando estaciones...", noStations: "No se encontraron estaciones.", failed: "Error al cargar.", footer: "🔒 Sin cookies, sin registro, sin rastreo. Pura experiencia musical.", selectStation: "Selecciona una estación", genreCountry: "Género y País", stationsTitle: "Estaciones", favorites: "Favoritos", share: "Compartir", searchPlaceholder: "Buscar estación...", searchCountryPlaceholder: "Buscar país...", linkCopied: "¡Enlace copiado!", noFavorites: "No hay estaciones favoritas.", bass: "Bajos", mid: "Medios", treble: "Agudos", songLoading: "Comprobando...", songError: "No hay información de la canción.", heroText: "Escucha tus estaciones de radio favoritas de todo el mundo. Sin registro, sin anuncios.", playNow: "Escuchar ahora", quickPicks: "Selección rápida", sortClicks: "Más escuchadas", sortName: "Alfabético", sortVotes: "Votos", randomStation: "Radio Aleatoria" },
    fr: { genres: "Genres Musicaux", countries: "Pays", all: "Toutes", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Classique", lofi: "Lofi / Chill", news: "Actualités", loading: "Chargement des stations...", noStations: "Aucune station trouvée.", failed: "Échec du chargement.", footer: "🔒 Sans cookies, sans inscription, sans suivi. Pure expérience musicale.", selectStation: "Sélectionnez une station", genreCountry: "Genre et Pays", stationsTitle: "Stations", favorites: "Favoris", share: "Partager", searchPlaceholder: "Rechercher une station...", searchCountryPlaceholder: "Rechercher un pays...", linkCopied: "Lien copié !", noFavorites: "Aucune station favorite.", bass: "Basses", mid: "Médiums", treble: "Aigus", songLoading: "Vérification...", songError: "Aucune info sur la chanson.", heroText: "Écoutez vos stations de radio préférées du monde entier. Sans inscription, sans publicité.", playNow: "Écouter maintenant", quickPicks: "Choix rapides", sortClicks: "Les plus écoutées", sortName: "Alphabétique", sortVotes: "Votes", randomStation: "Radio Aléatoire" },
    de: { genres: "Musikgenres", countries: "Länder", all: "Alle", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Klassik", lofi: "Lofi / Chill", news: "Nachrichten", loading: "Sender werden geladen...", noStations: "Keine Sender gefunden.", failed: "Laden fehlgeschlagen.", footer: "🔒 Keine Cookies, keine Registrierung, kein Tracking. Reines Musikerlebnis.", selectStation: "Sender auswählen", genreCountry: "Genre & Land", stationsTitle: "Sender", favorites: "Favoriten", share: "Teilen", searchPlaceholder: "Sender suchen...", searchCountryPlaceholder: "Land suchen...", linkCopied: "Link kopiert!", noFavorites: "Keine Favoriten.", bass: "Bass", mid: "Mitten", treble: "Höhen", songLoading: "Prüfen...", songError: "Keine Liedinformationen.", heroText: "Hören Sie Ihre Lieblingsradiosender aus aller Welt. Ohne Registrierung, ohne Werbung.", playNow: "Jetzt hören", quickPicks: "Schnellauswahl", sortClicks: "Meistgespielt", sortName: "Alphabetisch", sortVotes: "Stimmen", randomStation: "Zufälliges Radio" },
    it: { genres: "Generi Musicali", countries: "Paesi", all: "Tutte", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Classica", lofi: "Lofi / Chill", news: "Notizie", loading: "Caricamento stazioni...", noStations: "Nessuna stazione trovata.", failed: "Caricamento fallito.", footer: "🔒 Nessun cookie, nessuna registrazione, nessun tracciamento. Pura esperienza musicale.", selectStation: "Seleziona una stazione", genreCountry: "Genere e Paese", stationsTitle: "Stazioni", favorites: "Preferiti", share: "Condividi", searchPlaceholder: "Cerca stazione...", searchCountryPlaceholder: "Cerca paese...", linkCopied: "Link copiato!", noFavorites: "Nessuna stazione preferita.", bass: "Bassi", mid: "Medi", treble: "Alti", songLoading: "Verifica...", songError: "Nessuna info sulla canzone.", heroText: "Ascolta le tue stazioni radio preferite da tutto il mondo. Nessuna registrazione, nessuna pubblicità.", playNow: "Ascolta ora", quickPicks: "Scelte rapide", sortClicks: "Più ascoltate", sortName: "Alfabetico", sortVotes: "Voti", randomStation: "Radio Casuale" },
    pt: { genres: "Gêneros Musicais", countries: "Países", all: "Todas", pop: "Pop", rock: "Rock", jazz: "Jazz", classical: "Clássica", lofi: "Lofi / Chill", news: "Notícias", loading: "Carregando estações...", noStations: "Nenhuma estação encontrada.", failed: "Falha ao carregar.", footer: "🔒 Sem cookies, sem registro, sem rastreamento. Pura experiência musical.", selectStation: "Selecione uma estação", genreCountry: "Gênero e País", stationsTitle: "Estações", favorites: "Favoritos", share: "Compartilhar", searchPlaceholder: "Buscar estação...", searchCountryPlaceholder: "Buscar país...", linkCopied: "Link copiado!", noFavorites: "Nenhuma estação favorita.", bass: "Graves", mid: "Médios", treble: "Agudos", songLoading: "Verificando...", songError: "Nenhuma informação da música.", heroText: "Ouça suas estações de rádio favoritas de todo o mundo. Sem registro, sem anúncios.", playNow: "Ouvir agora", quickPicks: "Escolhas rápidas", sortClicks: "Mais tocadas", sortName: "Alfabético", sortVotes: "Votos", randomStation: "Rádio Aleatoria" },
    ru: { genres: "Музыкальные жанры", countries: "Страны", all: "Все", pop: "Поп", rock: "Рок", jazz: "Джаз", classical: "Классика", lofi: "Лофи / Чилл", news: "Новости", loading: "Загрузка станций...", noStations: "Станции не найдены.", failed: "Ошибка загрузки.", footer: "🔒 Без файлов cookie, без регистрации, без отслеживания. Чистый музыкальный опыт.", selectStation: "Выберите станцию", genreCountry: "Жанр и Страна", stationsTitle: "Станции", favorites: "Избранное", share: "Поделиться", searchPlaceholder: "Поиск станции...", searchCountryPlaceholder: "Поиск страны...", linkCopied: "Ссылка скопирована!", noFavorites: "Нет избранных станций.", bass: "Бас", mid: "Средние", treble: "Высокие", songLoading: "Проверка...", songError: "Нет информации о песне.", heroText: "Слушайте любимые радиостанции со всего мира. Без регистрации, без рекламы.", playNow: "Слушать сейчас", quickPicks: "Быстрый выбор", sortClicks: "Самые популярные", sortName: "По алфавиту", sortVotes: "Голоса", randomStation: "Случайное радио" },
    zh: { genres: "音乐流派", countries: "国家", all: "全部", pop: "流行", rock: "摇滚", jazz: "爵士", classical: "古典", lofi: "低保真 / 放松", news: "新闻", loading: "正在加载电台...", noStations: "未找到电台。", failed: "加载失败。", footer: "🔒 无Cookie，无注册，无跟踪。纯粹的音乐体验。", selectStation: "选择电台", genreCountry: "流派和国家", stationsTitle: "电台", favorites: "收藏", share: "分享", searchPlaceholder: "搜索电台...", searchCountryPlaceholder: "搜索国家...", linkCopied: "链接已复制！", noFavorites: "没有收藏的电台。", bass: "低音", mid: "中音", treble: "高音", songLoading: "检查中...", songError: "没有歌曲信息。", heroText: "收听来自世界各地的您最喜欢的广播电台。无需注册，无广告。", playNow: "立即收听", quickPicks: "快速选择", sortClicks: "最多播放", sortName: "字母顺序", sortVotes: "投票", randomStation: "随机电台" },
    ja: { genres: "音楽ジャンル", countries: "国", all: "すべて", pop: "ポップス", rock: "ロック", jazz: "ジャズ", classical: "クラシック", lofi: "ローファイ", news: "ニュース", loading: "ステーションを読み込み中...", noStations: "ステーションが見つかりません。", failed: "読み込みに失敗しました。", footer: "🔒 Cookie、登録、追跡なし。純粋な音楽体験。", selectStation: "ステーションを選択", genreCountry: "ジャンルと国", stationsTitle: "ステーション", favorites: "お気に入り", share: "共有", searchPlaceholder: "ステーションを検索...", searchCountryPlaceholder: "国を検索...", linkCopied: "リンクをコピーしました！", noFavorites: "お気に入りのステーションはありません。", bass: "低音", mid: "中音", treble: "高音", songLoading: "確認中...", songError: "曲の情報がありません。", heroText: "世界中のお気に入りのラジオ局を聴きましょう。登録不要、広告なし。", playNow: "今すぐ聴く", quickPicks: "クイックピック", sortClicks: "最も再生された", sortName: "アルファベット順", sortVotes: "投票", randomStation: "ランダムラジオ" }
};

function t(key) { return translations[languageSelect.value][key] || key; }

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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML || 'Unknown Station';
}

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
        btn.className = 'cat-btn';
        btn.textContent = cleanString(station.name); 
        btn.addEventListener('click', () => playStation(station));
        favoritesList.appendChild(btn);
    });
}

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
        console.warn('Could not load top stations:', e);
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
        img.src = station.favicon || 'https://cdn-icons-png.flaticon.com/512/2950/2950683.png';
        img.onerror = () => { img.src = 'https://cdn-icons-png.flaticon.com/512/2950/2950683.png'; };
        const span = document.createElement('span');
        span.textContent = cleanString(station.name);
        div.appendChild(img);
        div.appendChild(span);
        div.addEventListener('click', () => playStation(station));
        quickPicksContainer.appendChild(div);
    });
}

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
        console.error('API Error:', error);
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
            console.error('Search error:', err);
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

function displayStations(stations) {
    stationsContainer.innerHTML = '';
    const defaultIcon = 'https://cdn-icons-png.flaticon.com/512/2950/2950683.png';
    if (!Array.isArray(stations) || stations.length === 0) {
        stationsContainer.innerHTML = `<p>${t('noStations')}</p>`;
        return;
    }

    stations.forEach(station => {
        if (!station.url_resolved || station.url_resolved.trim() === '') return; 

        const card = document.createElement('div');
        card.classList.add('station-card');

        let name = cleanString(station.name);
        const country = station.country ? cleanString(station.country) : 'Global';
        
        let tagsRaw = station.tags ? cleanString(station.tags) : '';
        let tagsArray = tagsRaw.split(',').map(t => t.trim()).filter(t => t.length > 0).slice(0, 2);
        let slogan = tagsRaw ? tagsRaw.replace(/,/g, ', ') : 'Global Radio Station';

        let favicon = station.favicon;
        if (!favicon || favicon.trim() === '' || favicon.includes('placeholder')) favicon = defaultIcon;

        const img = document.createElement('img');
        img.className = 'station-logo';
        img.src = favicon;
        img.alt = 'Logo';
        img.loading = 'lazy';
        img.onerror = () => { img.src = defaultIcon; };

        const infoDiv = document.createElement('div');
        infoDiv.className = 'station-info-text';
        
        const h4 = document.createElement('h4');
        h4.textContent = name;
        
        const sloganP = document.createElement('p');
        sloganP.className = 'slogan';
        sloganP.textContent = slogan;

        const tagsDiv = document.createElement('div');
        tagsDiv.className = 'station-tags';
        
        tagsArray.forEach(tag => {
            const tagSpan = document.createElement('span');
            tagSpan.className = 'tag';
            tagSpan.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
            tagsDiv.appendChild(tagSpan);
        });
        
        const countrySpan = document.createElement('span');
        countrySpan.className = 'tag';
        countrySpan.textContent = country;
        tagsDiv.appendChild(countrySpan);

        infoDiv.appendChild(h4);
        infoDiv.appendChild(sloganP);
        infoDiv.appendChild(tagsDiv);

        const playBtn = document.createElement('div');
        playBtn.className = 'play-btn';
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';

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

        card.appendChild(img);
        card.appendChild(infoDiv);
        card.appendChild(playBtn);
        card.appendChild(favBtn);

        card.addEventListener('click', () => playStation(station));
        stationsContainer.appendChild(card);
    });
}

async function playStation(station) {
    if (!station.url_resolved) return;
    currentStation = station;
    audioStream.src = station.url_resolved;

    audioStream.onerror = () => {
        console.warn("Грешка при зареждане на стрийма за станция:", station.name);
        if (songInfoContainer) {
            songInfoContainer.style.display = 'flex';
            songInfoText.textContent = "⚠️ Стриймът е недостъпен или счупен. Опитайте друга станция.";
        }
        stationName.textContent = cleanString(station.name) + " (Офлайн)";
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        }
    };

    try {
        await audioStream.play();
    } catch (e) {
        console.log("Audio play blocked:", e);
        songInfoContainer.style.display = 'flex';
        songInfoText.textContent = "⚠️ Браузърът блокира авто-пускането. Натиснете Play.";
        return;
    }

    const name = cleanString(station.name);
    stationName.textContent = name;
    stationDetails.textContent = `🌍 ${cleanString(station.country) || 'Global'} | 🎵 ${cleanString(station.tags) || 'Music'}`;
    stationIcon.src = station.favicon || 'https://cdn-icons-png.flaticon.com/512/2950/2950683.png';
    shareBtn.disabled = false;

    songInfoContainer.style.display = 'flex';
    checkCurrentSong(station);

    if (!audioContext) initAudioGraph(audioStream, visualizerCanvas);
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
        const response = await fetch(statusUrl);
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
        console.log('Song info error:', e);
        songInfoText.textContent = t('songError');
    }
}

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
        } else {
            alert('Няма намерени активни станции.');
        }
    } catch (e) {
        console.error('Random station error:', e);
        alert('Възникна грешка при търсенето на случайна станция.');
    } finally {
        playRandomGlobalBtn.innerHTML = originalHtml;
    }
});

// ======================== ПЛЕЪР, ЗВУК И MUTE ========================
const playPauseBtn = document.getElementById('play-pause-btn');
const seekSlider = document.getElementById('seek-slider');
const currentTimeEl = document.getElementById('current-time');
const volumeSlider = document.getElementById('volume-slider');
const volumeIcon = document.getElementById('volume-icon');

let lastVolume = 1;

playPauseBtn.addEventListener('click', () => {
    if (audioStream.paused) {
        audioStream.play();
    } else {
        audioStream.pause();
    }
});

audioStream.addEventListener('play', () => {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
});
audioStream.addEventListener('pause', () => {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
});

audioStream.addEventListener('timeupdate', () => {
    currentTimeEl.textContent = formatTime(audioStream.currentTime);
});

seekSlider.addEventListener('input', () => {
    if (audioStream.duration && !isNaN(audioStream.duration)) {
        const time = (seekSlider.value / 100) * audioStream.duration;
        audioStream.currentTime = time;
    }
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
            playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
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