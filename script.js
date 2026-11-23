import { API_BASE, loadCustomStations, fetchStations, registerStationClick } from './api.js';
import {
    initAudioGraph,
    audioContext,
    startVisualizer,
    setVisualizerPlayingState,
    startFullscreenVisualizer,
    stopFullscreenVisualizer
} from './audio.js';
import {
    detectInitialLanguage,
    getTranslation,
    applyTranslationsToDom
} from './i18n.js';

const stationsContainer = document.getElementById('stations-container');
const audioStream = document.getElementById('audio-stream');
const stationName = document.getElementById('station-name');
const stationDetails = document.getElementById('station-details');
const stationIcon = document.getElementById('station-icon');
const visualizerCanvas = document.getElementById('visualizer');
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
let selectedCountry = null;
let searchRequestId = 0;

const FAILED_STATIONS_STORAGE_KEY = 'radio_failed_stations_v2';
const FAILED_STATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа
const STREAM_START_TIMEOUT_MS = 8000; // 8 секунди за старт на потока
const STREAM_STALL_TIMEOUT_MS = 10000; // 10 секунди при застой по време на свирене

let playbackWatchdogTimer = null;
let stallWatchdogTimer = null;
let statusRestoreTimer = null;

function loadPersistedFailedStations() {
    const now = Date.now();
    const map = new Map();
    try {
        const raw = localStorage.getItem(FAILED_STATIONS_STORAGE_KEY);
        const parsed = JSON.parse(raw || '[]');
        if (Array.isArray(parsed)) {
            parsed.forEach((item) => {
                if (Array.isArray(item) && item.length === 2) {
                    const [key, expiresAt] = item;
                    if (typeof key === 'string' && typeof expiresAt === 'number' && expiresAt > now) {
                        map.set(key, expiresAt);
                    }
                }
            });
        }
    } catch {
        // Игнорираме грешки при четене от localStorage
    }
    savePersistedFailedStations(map);
    return map;
}

function savePersistedFailedStations(mapObj) {
    try {
        const entries = Array.from(mapObj.entries()).slice(-300);
        localStorage.setItem(FAILED_STATIONS_STORAGE_KEY, JSON.stringify(entries));
    } catch {
        // Игнорираме грешки при запис в localStorage
    }
}

const failedStationsMap = loadPersistedFailedStations();
const DEFAULT_ICON = 'https://cdn-icons-png.flaticon.com/512/2950/2950683.png';

function t(key) {
    return getTranslation(languageSelect.value, key);
}

function getStationKey(station) {
    if (!station) return '';
    return station.stationuuid || station.url_resolved || '';
}

function isFailedInSession(station) {
    const key = getStationKey(station);
    if (!key) return false;
    const expiresAt = failedStationsMap.get(key);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
        failedStationsMap.delete(key);
        savePersistedFailedStations(failedStationsMap);
        return false;
    }
    return true;
}

function markStationFailed(station, reason = 'error') {
    const key = getStationKey(station);
    if (key) {
        failedStationsMap.set(key, Date.now() + FAILED_STATION_TTL_MS);
        savePersistedFailedStations(failedStationsMap);
        console.warn('Stream marked unavailable (24h TTL):', {
            reason,
            stationuuid: station.stationuuid || null,
            name: station.name || '',
            url: station.url_resolved || ''
        });
    }
}

function clearPlaybackWatchdog() {
    if (playbackWatchdogTimer) {
        clearTimeout(playbackWatchdogTimer);
        playbackWatchdogTimer = null;
    }
}

function clearStallWatchdog() {
    if (stallWatchdogTimer) {
        clearTimeout(stallWatchdogTimer);
        stallWatchdogTimer = null;
    }
}

function showTemporaryPlayerNotice(noticeText, stationToRestore) {
    if (statusRestoreTimer) {
        clearTimeout(statusRestoreTimer);
        statusRestoreTimer = null;
    }
    stationDetails.textContent = noticeText;
    statusRestoreTimer = setTimeout(() => {
        if (currentStation && stationToRestore && getStationKey(currentStation) === getStationKey(stationToRestore)) {
            stationDetails.textContent = formatMetaLine(stationToRestore);
        }
        statusRestoreTimer = null;
    }, 4500);
}

function isSafeStreamUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
        const parsed = new URL(url.trim());
        return parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function isPlayableStation(station) {
    return Boolean(
        station &&
        isSafeStreamUrl(station.url_resolved) &&
        !isFailedInSession(station)
    );
}

function renderStatusMessage(container, text, isError = false) {
    container.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'loading-text';
    p.textContent = text;
    if (isError) {
        p.style.color = '#ef4444';
    }
    container.appendChild(p);
}

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

function setLanguage(langCode) {
    languageSelect.value = langCode;
    const matchingOption = Array.from(langOptions).find(
        (opt) => opt.getAttribute('data-value') === langCode
    );
    if (matchingOption) {
        const flagClass = matchingOption.querySelector('span')?.className || 'fi fi-bg';
        const labelText = matchingOption.textContent.trim();
        langBtn.innerHTML = '';

        const flagSpan = document.createElement('span');
        flagSpan.className = flagClass;

        const textSpan = document.createElement('span');
        textSpan.id = 'lang-btn-label';
        textSpan.textContent = labelText;

        const chevron = document.createElement('i');
        chevron.className = 'fa-solid fa-chevron-down';
        chevron.style.fontSize = '0.7rem';
        chevron.style.marginLeft = '5px';

        langBtn.appendChild(flagSpan);
        langBtn.appendChild(textSpan);
        langBtn.appendChild(chevron);
    }

    applyTranslationsToDom(langCode);
    updateCountriesVisibility();
    renderFavorites();
    renderRecentStations();
}

langOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        const lang = opt.getAttribute('data-value');
        setLanguage(lang);
    });
});

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
    const tags = tagsRaw
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)
        .slice(0, 2)
        .map(tag => tag.charAt(0).toUpperCase() + tag.slice(1));

    const genrePart = tags.length > 0 ? tags.join(' / ') : 'Radio';
    const codec = station.codec ? String(station.codec).toUpperCase() : '';
    const bitrate = Number(station.bitrate) > 0 ? `${station.bitrate}kbps` : '';
    const qualityPart = [codec, bitrate].filter(Boolean).join(' ');

    return qualityPart
        ? `${genrePart} • ${country} • ${qualityPart}`
        : `${genrePart} • ${country}`;
}

function copyStationShareLink(station, triggerEl) {
    if (!station || !station.stationuuid) return;
    const url = new URL(window.location.href);
    url.searchParams.set('station', station.stationuuid);

    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    navigator.clipboard.writeText(url.toString()).then(() => {
        if (!triggerEl) return;
        const originalHtml = triggerEl.innerHTML;
        triggerEl.classList.add('copied');
        triggerEl.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => {
            triggerEl.classList.remove('copied');
            triggerEl.innerHTML = originalHtml;
        }, 1600);
    }).catch(() => {});
}

// ======================== ЛЮБИМИ (PLAYLIST) ========================
function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem('radio_favorites') || '[]');
    } catch {
        return [];
    }
}
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
        const p = document.createElement('p');
        p.className = 'empty-list-msg';
        p.textContent = t('noFavorites');
        favoritesList.appendChild(p);
        return;
    }
    const fragment = document.createDocumentFragment();
    favs.forEach(station => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fav-sidebar-item';

        const img = document.createElement('img');
        img.src = isSafeStreamUrl(station.favicon) ? station.favicon : DEFAULT_ICON;
        img.alt = '';
        img.loading = 'lazy';
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
        fragment.appendChild(btn);
    });
    favoritesList.appendChild(fragment);
}

// ======================== НАСКОРО СЛУШАНИ ========================
function getRecentStations() {
    try {
        return JSON.parse(localStorage.getItem('radio_recent') || '[]');
    } catch {
        return [];
    }
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
        codec: station.codec,
        bitrate: station.bitrate,
        favicon: station.favicon
    });
    if (recent.length > 5) recent = recent.slice(0, 5);
    localStorage.setItem('radio_recent', JSON.stringify(recent));
    renderRecentStations();
}

function renderRecentStations() {
    const recent = getRecentStations().filter(s => isPlayableStation(s));
    if (recent.length === 0) {
        recentlyPlayedWrapper.style.display = 'none';
        return;
    }
    recentlyPlayedWrapper.style.display = 'block';
    recentlyPlayedContainer.innerHTML = '';

    const fragment = document.createDocumentFragment();
    recent.forEach(station => {
        const card = document.createElement('div');
        card.className = 'recent-card';

        const img = document.createElement('img');
        img.src = isSafeStreamUrl(station.favicon) ? station.favicon : DEFAULT_ICON;
        img.alt = '';
        img.loading = 'lazy';
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
        fragment.appendChild(card);
    });
    recentlyPlayedContainer.appendChild(fragment);
}

if (clearRecentBtn) {
    clearRecentBtn.addEventListener('click', () => {
        localStorage.removeItem('radio_recent');
        renderRecentStations();
    });
}

// ======================== БЪРЗ ИЗБОР ========================
async function loadTopStations(type = 'global', query = '') {
    renderStatusMessage(quickPicksContainer, t('loadingTop'));
    let url = `${API_BASE}/topclick/12`;
    if (type === 'country' && query) {
        url = `${API_BASE}/bycountry/${encodeURIComponent(query)}?limit=12&order=clickcount&reverse=true`;
    } else if (type === 'genre' && query !== 'all') {
        url = `${API_BASE}/bytag/${encodeURIComponent(query)}?limit=12&order=clickcount&reverse=true`;
    }
    try {
        const topStations = await fetchStations(url);
        renderQuickPicks(topStations);
    } catch {
        renderStatusMessage(quickPicksContainer, t('failed'), true);
    }
}

function renderQuickPicks(stations) {
    quickPicksContainer.innerHTML = '';
    if (!stations || stations.length === 0) return;
    const playable = stations.filter(s => isPlayableStation(s)).slice(0, 8);
    const fragment = document.createDocumentFragment();
    playable.forEach(station => {
        const div = document.createElement('div');
        div.className = 'quick-pick-item';
        const img = document.createElement('img');
        img.src = isSafeStreamUrl(station.favicon) ? station.favicon : DEFAULT_ICON;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = () => { img.src = DEFAULT_ICON; };
        const span = document.createElement('span');
        span.textContent = cleanString(station.name);
        div.appendChild(img);
        div.appendChild(span);
        div.addEventListener('click', () => playStation(station));
        fragment.appendChild(div);
    });
    quickPicksContainer.appendChild(fragment);
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
    renderStatusMessage(stationsContainer, t('loading'));
    currentFilterType = type;
    currentFilterQuery = query;
    currentSort = sort;

    if (type === 'country') {
        selectedCountry = query;
    } else if (type === 'genre' && query === 'all') {
        selectedCountry = null;
    }

    const cacheKey = `radio_cache_${type}_${query}_${sort}`;
    const cachedData = sessionStorage.getItem(cacheKey);

    if (cachedData) {
        try {
            allStations = JSON.parse(cachedData);
            displayStations(allStations);
            return;
        } catch {
            sessionStorage.removeItem(cacheKey);
        }
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
            if (type === 'country') {
                renderStatusMessage(stationsContainer, t('noStations'));
                return;
            }
            apiStations = await fetchStations(`${API_BASE}/topclick/60`);
        }

        const custom = await loadCustomStations();
        let filteredCustom = Array.isArray(custom) ? custom : [];
        if (type === 'genre' && query !== 'all') {
            filteredCustom = filteredCustom.filter(s => (s.tags || '').toLowerCase().includes(query.toLowerCase()));
        } else if (type === 'country') {
            filteredCustom = filteredCustom.filter(s => (s.country || '').toLowerCase() === query.toLowerCase());
        }

        allStations = [...filteredCustom, ...apiStations];
        sortStationsLocally(sort);
        sessionStorage.setItem(cacheKey, JSON.stringify(allStations));
        displayStations(allStations);
    } catch {
        renderStatusMessage(stationsContainer, t('failed'), true);
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

// ======================== ТЪРСЕНЕ (СТАНЦИЯ + ДЪРЖАВА) ========================
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    let term = e.target.value.trim();
    if (term.length > 50) {
        term = term.substring(0, 50);
        searchInput.value = term;
    }

    const lowerTerm = term.toLowerCase();
    if (lowerTerm.length === 0) {
        searchRequestId++;
        displayStations(allStations);
        return;
    }

    const reqId = ++searchRequestId;
    searchTimeout = setTimeout(async () => {
        try {
            const custom = await loadCustomStations();
            if (reqId !== searchRequestId) return;

            const activeCountry = selectedCountry || (currentFilterType === 'country' ? currentFilterQuery : null);

            const matchesQuery = (s) =>
                (s.name || '').toLowerCase().includes(lowerTerm) ||
                (s.tags || '').toLowerCase().includes(lowerTerm);

            const matchesCountry = (s) => {
                if (!activeCountry) return true;
                const c = (s.country || '').toLowerCase();
                const target = activeCountry.toLowerCase();
                if (target === 'usa' || target === 'united states') {
                    return c.includes('united states') || c.includes('usa');
                }
                if (target === 'uk' || target === 'united kingdom') {
                    return c.includes('united kingdom') || c.includes('uk');
                }
                return c.includes(target);
            };

            const customMatches = (Array.isArray(custom) ? custom : []).filter(s => matchesQuery(s) && matchesCountry(s));
            const localMatches = allStations.filter(s => matchesQuery(s) && matchesCountry(s));

            let apiResults = [];
            if (lowerTerm.length >= 2) {
                const apiUrl = activeCountry
                    ? `${API_BASE}/search?name=${encodeURIComponent(lowerTerm)}&country=${encodeURIComponent(activeCountry)}&limit=60`
                    : `${API_BASE}/byname/${encodeURIComponent(lowerTerm)}?limit=60`;
                apiResults = await fetchStations(apiUrl);
                if (reqId !== searchRequestId) return;
            }

            const uniqueStations = new Map();
            customMatches.forEach(s => uniqueStations.set(s.stationuuid || s.name, s));
            localMatches.forEach(s => {
                if (!uniqueStations.has(s.stationuuid || s.name)) uniqueStations.set(s.stationuuid || s.name, s);
            });
            if (Array.isArray(apiResults)) {
                apiResults.forEach(s => {
                    if (!uniqueStations.has(s.stationuuid || s.name)) uniqueStations.set(s.stationuuid || s.name, s);
                });
            }

            displayStations(Array.from(uniqueStations.values()));
        } catch {
            if (reqId !== searchRequestId) return;
            const filtered = allStations.filter(s =>
                (s.name || '').toLowerCase().includes(lowerTerm) || (s.tags || '').toLowerCase().includes(lowerTerm)
            );
            displayStations(filtered);
        }
    }, 350);
});

const countrySearchInput = document.getElementById('country-search-input');
const toggleMoreCountriesBtn = document.getElementById('toggle-more-countries-btn');
const INITIAL_VISIBLE_COUNTRIES = 10;
let showAllCountries = false;

function updateCountriesVisibility() {
    const buttons = Array.from(document.querySelectorAll('#country-buttons .cat-btn'));
    const term = countrySearchInput ? countrySearchInput.value.toLowerCase().trim() : '';

    if (term.length > 0) {
        buttons.forEach(btn => {
            const matches = btn.textContent.toLowerCase().includes(term);
            btn.style.display = matches ? 'flex' : 'none';
        });
        if (toggleMoreCountriesBtn) {
            toggleMoreCountriesBtn.style.display = 'none';
        }
        return;
    }

    buttons.forEach((btn, index) => {
        const shouldShow = showAllCountries || index < INITIAL_VISIBLE_COUNTRIES;
        btn.style.display = shouldShow ? 'flex' : 'none';
    });

    if (toggleMoreCountriesBtn) {
        toggleMoreCountriesBtn.style.display = buttons.length > INITIAL_VISIBLE_COUNTRIES ? 'flex' : 'none';
        const label = showAllCountries
            ? t('hideCountries')
            : `${t('moreCountries')} (${buttons.length - INITIAL_VISIBLE_COUNTRIES})`;
        const iconClass = showAllCountries ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
        toggleMoreCountriesBtn.innerHTML = `<i class="${iconClass}"></i> <span></span>`;
        toggleMoreCountriesBtn.querySelector('span').textContent = label;
    }
}

if (toggleMoreCountriesBtn) {
    toggleMoreCountriesBtn.addEventListener('click', () => {
        showAllCountries = !showAllCountries;
        updateCountriesVisibility();
    });
}

if (countrySearchInput) {
    countrySearchInput.addEventListener('input', () => {
        updateCountriesVisibility();
    });

    countrySearchInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const visibleButtons = Array.from(document.querySelectorAll('#country-buttons .cat-btn'))
            .filter(btn => btn.style.display !== 'none');

        if (visibleButtons.length === 1) {
            visibleButtons[0].click();
        }
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
    stationsContainer.classList.remove('list-view');
    stationsContainer.classList.add('grid-view');
});

viewListBtn.addEventListener('click', () => {
    viewListBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
    stationsContainer.classList.remove('grid-view');
    stationsContainer.classList.add('list-view');
});

// ======================== ВИЗУАЛИЗИРАНЕ НА КАРТИТЕ ========================
function displayStations(stations) {
    stationsContainer.innerHTML = '';
    displayedStations = (Array.isArray(stations) ? stations : [])
        .filter(s => isPlayableStation(s));

    if (displayedStations.length === 0) {
        renderStatusMessage(stationsContainer, t('noStations'));
        return;
    }

    const fragment = document.createDocumentFragment();
    displayedStations.forEach(station => {
        const isCurrentPlaying = currentStation && currentStation.stationuuid === station.stationuuid && !audioStream.paused;

        const card = document.createElement('div');
        card.className = 'station-card';
        card.dataset.uuid = station.stationuuid;
        if (isCurrentPlaying) card.classList.add('playing');

        let favicon = station.favicon;
        if (!isSafeStreamUrl(favicon) || favicon.includes('placeholder')) favicon = DEFAULT_ICON;

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

        const cardShareBtn = document.createElement('button');
        cardShareBtn.className = 'card-share-btn';
        cardShareBtn.type = 'button';
        cardShareBtn.title = t('share');
        cardShareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i>';
        cardShareBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyStationShareLink(station, cardShareBtn);
        });

        const favBtn = document.createElement('button');
        favBtn.className = 'fav-btn';
        favBtn.type = 'button';
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
        actionsDiv.appendChild(cardShareBtn);
        actionsDiv.appendChild(favBtn);

        card.appendChild(img);
        card.appendChild(infoDiv);
        card.appendChild(actionsDiv);

        card.addEventListener('click', () => playStation(station));
        fragment.appendChild(card);
    });
    stationsContainer.appendChild(fragment);
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

// ======================== МЕТАДАННИ ЗА ТЕКУЩА ПЕСЕН ========================
function clearSongInfo() {
    if (songInfoText) {
        songInfoText.textContent = '';
    }
    if (songInfoContainer) {
        songInfoContainer.style.display = 'none';
    }
}

function showSongInfo(title) {
    const cleaned = cleanString(title);
    if (!cleaned || cleaned === 'Unknown Station') {
        clearSongInfo();
        return;
    }
    if (songInfoText) {
        songInfoText.textContent = cleaned;
    }
    if (songInfoContainer) {
        songInfoContainer.style.display = 'flex';
    }
}

// ======================== ПУСКАНЕ НА СТАНЦИЯ ========================
function advanceAfterFailure(failedStation, retryCount, reason = 'error') {
    clearPlaybackWatchdog();
    clearStallWatchdog();
    markStationFailed(failedStation, reason);
    setVisualizerPlayingState(false);
    liveDot.classList.remove('active');

    const pool = displayedStations.length > 0 ? displayedStations : allStations;
    const currentIdx = pool.findIndex(s => getStationKey(s) === getStationKey(failedStation));
    let nextStation = null;

    if (pool.length > 0) {
        for (let offset = 1; offset <= pool.length; offset++) {
            const candidate = pool[(currentIdx + offset + pool.length) % pool.length];
            if (candidate && getStationKey(candidate) !== getStationKey(failedStation) && isPlayableStation(candidate)) {
                nextStation = candidate;
                break;
            }
        }
    }

    if (nextStation && retryCount < 5) {
        clearSongInfo();
        const skippedLabel = cleanString(failedStation.name);
        const nextLabel = cleanString(nextStation.name);
        playStation(nextStation, retryCount + 1).then(() => {
            if (currentStation && getStationKey(currentStation) === getStationKey(nextStation)) {
                showTemporaryPlayerNotice(`Skipped: ${skippedLabel} → ${nextLabel}`, nextStation);
            }
        });
        return;
    }

    clearSongInfo();
    stationName.textContent = `${cleanString(failedStation.name)} ${t('offlineSuffix')}`;
    displayStations(displayedStations);
    updateActiveCardHighlight();
}

async function playStation(station, retryCount = 0) {
    clearPlaybackWatchdog();
    clearStallWatchdog();

    if (!isPlayableStation(station)) {
        if (retryCount < 5) {
            const fallbackList = (displayedStations.length > 0 ? displayedStations : allStations)
                .filter(s => isPlayableStation(s));
            const nextCandidate = fallbackList[0];
            if (nextCandidate) {
                return playStation(nextCandidate, retryCount + 1);
            }
        }
        return;
    }

    currentStation = station;
    audioStream.src = station.url_resolved;
    clearSongInfo();

    let streamStarted = false;

    const onStreamPlaying = () => {
        streamStarted = true;
        clearPlaybackWatchdog();
        clearStallWatchdog();
    };

    const onStreamStalled = () => {
        if (audioStream.paused) return;
        clearStallWatchdog();
        stallWatchdogTimer = setTimeout(() => {
            if (!audioStream.paused && currentStation && getStationKey(currentStation) === getStationKey(station)) {
                audioStream.removeEventListener('playing', onStreamPlaying);
                audioStream.removeEventListener('stalled', onStreamStalled);
                audioStream.removeEventListener('waiting', onStreamStalled);
                advanceAfterFailure(station, retryCount, 'stream_stalled');
            }
        }, STREAM_STALL_TIMEOUT_MS);
    };

    audioStream.addEventListener('playing', onStreamPlaying);
    audioStream.addEventListener('stalled', onStreamStalled);
    audioStream.addEventListener('waiting', onStreamStalled);

    audioStream.onerror = () => {
        audioStream.removeEventListener('playing', onStreamPlaying);
        audioStream.removeEventListener('stalled', onStreamStalled);
        audioStream.removeEventListener('waiting', onStreamStalled);
        advanceAfterFailure(station, retryCount, 'audio_error');
    };

    playbackWatchdogTimer = setTimeout(() => {
        if (!streamStarted && currentStation && getStationKey(currentStation) === getStationKey(station)) {
            audioStream.removeEventListener('playing', onStreamPlaying);
            audioStream.removeEventListener('stalled', onStreamStalled);
            audioStream.removeEventListener('waiting', onStreamStalled);
            advanceAfterFailure(station, retryCount, 'silent_or_stalled_start');
        }
    }, STREAM_START_TIMEOUT_MS);

    try {
        await audioStream.play();
    } catch {
        audioStream.removeEventListener('playing', onStreamPlaying);
        audioStream.removeEventListener('stalled', onStreamStalled);
        audioStream.removeEventListener('waiting', onStreamStalled);
        advanceAfterFailure(station, retryCount, 'play_rejected');
        return;
    }

    if (station.stationuuid) {
        registerStationClick(station.stationuuid).catch(() => {});
    }

    const name = cleanString(station.name);
    stationName.textContent = name;
    stationDetails.textContent = formatMetaLine(station);
    stationIcon.src = isSafeStreamUrl(station.favicon) ? station.favicon : DEFAULT_ICON;
    stationIcon.onerror = () => { stationIcon.src = DEFAULT_ICON; };
    shareBtn.disabled = false;

    addRecentStation(station);
    updateActiveCardHighlight();

    checkCurrentSong(station);

    initAudioGraph(audioStream, visualizerCanvas);
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    setVisualizerPlayingState(true);
}

refreshSongBtn.addEventListener('click', () => {
    if (currentStation) checkCurrentSong(currentStation);
});

async function checkCurrentSong(station) {
    if (!station || !station.url_resolved) {
        clearSongInfo();
        return;
    }

    clearSongInfo();

    try {
        const urlObj = new URL(station.url_resolved);
        const statusEndpoints = [
            `${urlObj.protocol}//${urlObj.host}/status-json.xsl`,
            `${urlObj.protocol}//${urlObj.host}/stats?json=1`
        ];

        for (const statusUrl of statusEndpoints) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2800);
                const response = await fetch(statusUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!response.ok) continue;

                const data = await response.json();
                if (data.icestats && data.icestats.source) {
                    const sources = Array.isArray(data.icestats.source) ? data.icestats.source : [data.icestats.source];
                    const currentSource = sources.find(s => s.listenurl && s.listenurl.includes(urlObj.pathname)) || sources[0];
                    const title = currentSource?.title || currentSource?.artist_t || currentSource?.song || '';
                    if (title && cleanString(title) !== 'Unknown Station') {
                        showSongInfo(title);
                        return;
                    }
                }

                const shoutTitle = data.songtitle || data.title || data.streamtitle;
                if (shoutTitle && cleanString(shoutTitle) !== 'Unknown Station') {
                    showSongInfo(shoutTitle);
                    return;
                }
            } catch {
                // Пробваме следващия endpoint
            }
        }

        clearSongInfo();
    } catch {
        clearSongInfo();
    }
}

// Предишна / Следваща станция
prevStationBtn.addEventListener('click', () => {
    const playable = displayedStations.filter(s => isPlayableStation(s));
    if (playable.length === 0) return;
    const idx = currentStation ? playable.findIndex(s => getStationKey(s) === getStationKey(currentStation)) : 0;
    const prevIdx = (idx - 1 + playable.length) % playable.length;
    playStation(playable[prevIdx]);
});

nextStationBtn.addEventListener('click', () => {
    const playable = displayedStations.filter(s => isPlayableStation(s));
    if (playable.length === 0) return;
    const idx = currentStation ? playable.findIndex(s => getStationKey(s) === getStationKey(currentStation)) : -1;
    const nextIdx = (idx + 1) % playable.length;
    playStation(playable[nextIdx]);
});

shareBtn.addEventListener('click', () => {
    if (!currentStation) return;
    const url = new URL(window.location.href);
    url.searchParams.set('station', currentStation.stationuuid);
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    navigator.clipboard.writeText(url.toString()).then(() => {
        const original = shareBtn.innerHTML;
        shareBtn.innerHTML = `<i class="fa-solid fa-check"></i> <span></span>`;
        shareBtn.querySelector('span').textContent = t('linkCopied');
        setTimeout(() => { shareBtn.innerHTML = original; }, 2000);
    }).catch(() => {});
});

allCategoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        allCategoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const genre = btn.getAttribute('data-genre');
        const country = btn.getAttribute('data-country');
        const activeSort = document.querySelector('.sort-btn.active')?.getAttribute('data-sort') || 'clickcount';

        if (genre) {
            loadStations('genre', genre, activeSort);
            loadTopStations('genre', genre);
        } else if (country) {
            selectedCountry = country;
            loadStations('country', country, activeSort);
            loadTopStations('country', country);
        }
    });
});

playRandomBtn.addEventListener('click', () => {
    const playable = allStations.filter(s => isPlayableStation(s));
    if (playable.length > 0) {
        const randomIndex = Math.floor(Math.random() * playable.length);
        playStation(playable[randomIndex]);
    }
});

playRandomGlobalBtn.addEventListener('click', async () => {
    const originalHtml = playRandomGlobalBtn.innerHTML;
    playRandomGlobalBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span></span>`;
    playRandomGlobalBtn.querySelector('span').textContent = t('searching');
    try {
        const stations = await fetchStations(`${API_BASE}/topclick/100`);
        const validStations = (Array.isArray(stations) ? stations : []).filter(s => isPlayableStation(s));
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

playPauseBtn.addEventListener('click', async () => {
    if (!currentStation && displayedStations.length > 0) {
        playStation(displayedStations[0]);
        return;
    }
    if (audioStream.paused) {
        try {
            await audioStream.play();
            if (audioContext && audioContext.state === 'suspended') {
                await audioContext.resume();
            }
        } catch (e) {
            console.warn('Playback start error:', e);
        }
    } else {
        clearPlaybackWatchdog();
        clearStallWatchdog();
        audioStream.pause();
    }
});

audioStream.addEventListener('play', () => {
    playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    liveDot.classList.add('active');
    setVisualizerPlayingState(true);
    updateActiveCardHighlight();
});

audioStream.addEventListener('pause', () => {
    clearPlaybackWatchdog();
    clearStallWatchdog();
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    liveDot.classList.remove('active');
    setVisualizerPlayingState(false);
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
            const mins = parseInt(btn.getAttribute('data-mins'), 10);
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
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        timerCountdown.textContent = `${t('remainingPrefix')} ${m}:${s < 10 ? '0' : ''}${s}`;

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
    setLanguage(detectInitialLanguage());
    renderRecentStations();
    if (visualizerCanvas) {
        startVisualizer(visualizerCanvas);
    }
    await loadCustomStations();
    loadTopStations();

    const params = new URLSearchParams(window.location.search);
    const stationUuid = params.get('station');

    if (stationUuid) {
        const custom = await loadCustomStations();
        const customMatch = (Array.isArray(custom) ? custom : []).find(s => s.stationuuid === stationUuid);
        if (customMatch && isPlayableStation(customMatch)) { playStation(customMatch); return; }

        try {
            const data = await fetchStations(`${API_BASE}/byuuid/${encodeURIComponent(stationUuid)}`);
            if (Array.isArray(data) && data.length > 0 && isPlayableStation(data[0])) {
                playStation(data[0]);
                return;
            }
        } catch (e) { console.log('Share load error:', e); }
    }

    const activeSort = document.querySelector('.sort-btn.active')?.getAttribute('data-sort') || 'clickcount';
    loadStations('genre', 'all', activeSort);
});