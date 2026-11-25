import { API_BASE, loadCustomStations, fetchStations, registerStationClick } from './api.js';
import {
    initAudioGraph,
    initEqControls,
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
const primaryAudio = document.getElementById('audio-stream');
let fallbackAudio = null;
let activeAudio = primaryAudio;

const stationName = document.getElementById('station-name');
const stationDetails = document.getElementById('station-details');
const stationIcon = document.getElementById('station-icon');
const visualizerCanvas = document.getElementById('visualizer');
const searchInput = document.getElementById('search-input');
const allCategoryButtons = document.querySelectorAll('.cat-btn');
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
const copySongBtn = document.getElementById('copy-song-btn');
const searchSongBtn = document.getElementById('search-song-btn');
const refreshSongBtn = document.getElementById('refresh-song-btn');
const sectionTitle = document.getElementById('section-title');
const loadMoreWrapper = document.getElementById('load-more-wrapper');
const loadMoreBtn = document.getElementById('load-more-btn');
const exportFavsBtn = document.getElementById('export-favs-btn');
const importFavsBtn = document.getElementById('import-favs-btn');
const importFavsInput = document.getElementById('import-favs-input');
const mobileFiltersToggle = document.getElementById('mobile-filters-toggle');
const sidebarCollapsible = document.getElementById('sidebar-collapsible');

const PAGE_SIZE = 60;
let currentLanguage = 'bg';
let allStations = [];
let displayedStations = [];
let currentStation = null;
let currentSort = 'clickcount';
let currentFilterType = 'genre';
let currentFilterQuery = 'all';
let selectedCountry = null;
let selectedCountryCode = null;
let currentOffset = 0;
let hasMoreStations = false;
let isLoadingMore = false;
let isSearchActive = false;
let searchRequestId = 0;
let stationsRequestId = 0;
let topStationsRequestId = 0;
let playbackAttemptId = 0;
let songCheckRequestId = 0;
let currentAttemptState = null;

function safeStorageGet(storage, key, fallback = null) {
    try {
        const value = storage.getItem(key);
        return value !== null ? value : fallback;
    } catch {
        return fallback;
    }
}

function safeStorageSet(storage, key, value) {
    try {
        storage.setItem(key, value);
    } catch {
        // Игнорираме грешки при ограничен или пълен storage
    }
}

function safeStorageRemove(storage, key) {
    try {
        storage.removeItem(key);
    } catch {
        // Игнорираме грешки при изтриване от storage
    }
}

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
const DEFAULT_ICON = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%231e293b'/%3E%3Ccircle cx='32' cy='32' r='16' fill='none' stroke='%2338bdf8' stroke-width='3'/%3E%3Ccircle cx='32' cy='32' r='5' fill='%2338bdf8'/%3E%3C/svg%3E";
const BLOCKED_ICON_HOSTS = ['pozdravite.net'];

function getSafeIconUrl(url) {
    if (!url || typeof url !== 'string') return DEFAULT_ICON;
    const trimmed = url.trim();
    if (trimmed.includes('placeholder')) return DEFAULT_ICON;
    if (!isSafeStreamUrl(trimmed)) return DEFAULT_ICON;
    try {
        const parsed = new URL(trimmed);
        const host = parsed.hostname.toLowerCase();
        const isBlocked = BLOCKED_ICON_HOSTS.some(
            (blocked) => host === blocked || host.endsWith(`.${blocked}`)
        );
        return isBlocked ? DEFAULT_ICON : parsed.toString();
    } catch {
        return DEFAULT_ICON;
    }
}

function t(key) {
    return getTranslation(currentLanguage, key);
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

function renderStatusMessage(container, translationKey, isError = false) {
    container.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'loading-text';
    p.dataset.statusKey = translationKey;
    p.textContent = t(translationKey);
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
    const isOpen = langDropdown.classList.toggle('show');
    langBtn.setAttribute('aria-expanded', String(isOpen));
});

document.addEventListener('click', () => {
    langDropdown.classList.remove('show');
    langBtn.setAttribute('aria-expanded', 'false');
});

function setLanguage(langCode) {
    currentLanguage = langCode;
    safeStorageSet(localStorage, 'radio_lang', langCode);

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

    if (!currentStation) {
        stationName.textContent = t('selectStation');
        stationDetails.textContent = t('genreCountry');
        if (fsStationName) fsStationName.textContent = t('fullscreenStationTitle');
    }

    document.querySelectorAll('[data-status-key]').forEach((el) => {
        el.textContent = t(el.dataset.statusKey);
    });
    document.querySelectorAll('.card-share-btn').forEach((btn) => {
        btn.title = t('share');
    });

    updateCountriesVisibility();
    updateSectionTitle();
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
    text = text.replace(/[\x00-\x1F\x7F]/g, '').trim();
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

const shareCopyTimers = new WeakMap();

function copyStationShareLink(station, triggerEl, showText = false) {
    if (!station || !station.stationuuid) return;
    const url = new URL(window.location.href);
    url.searchParams.set('station', station.stationuuid);

    const onCopied = () => {
        if (!triggerEl) return;
        const existingTimer = shareCopyTimers.get(triggerEl);
        if (existingTimer) clearTimeout(existingTimer);

        triggerEl.classList.add('copied');
        triggerEl.innerHTML = showText
            ? '<i class="fa-solid fa-check"></i> <span></span>'
            : '<i class="fa-solid fa-check"></i>';
        if (showText) {
            triggerEl.querySelector('span').textContent = t('linkCopied');
        }

        const timerId = setTimeout(() => {
            triggerEl.classList.remove('copied');
            triggerEl.innerHTML = showText
                ? '<i class="fa-solid fa-share-nodes"></i> <span data-i18n="share"></span>'
                : '<i class="fa-solid fa-share-nodes"></i>';
            if (showText) {
                triggerEl.querySelector('span').textContent = t('share');
            }
            shareCopyTimers.delete(triggerEl);
        }, showText ? 2000 : 1600);
        shareCopyTimers.set(triggerEl, timerId);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url.toString()).then(onCopied).catch(() => {});
    } else {
        const tempInput = document.createElement('textarea');
        tempInput.value = url.toString();
        tempInput.setAttribute('readonly', '');
        tempInput.style.position = 'fixed';
        tempInput.style.opacity = '0';
        document.body.appendChild(tempInput);
        tempInput.select();
        try {
            if (document.execCommand('copy')) onCopied();
        } catch {
            // Игнорираме при отказ
        }
        document.body.removeChild(tempInput);
    }
}

// ======================== ЛЮБИМИ (PLAYLIST) ========================
function getFavorites() {
    try {
        return JSON.parse(safeStorageGet(localStorage, 'radio_favorites', '[]'));
    } catch {
        return [];
    }
}
function setFavorites(favs) { safeStorageSet(localStorage, 'radio_favorites', JSON.stringify(favs)); }
function isFavorite(uuid) { return getFavorites().some(s => s.stationuuid === uuid); }

function toggleFavorite(station, btn) {
    let favs = getFavorites();
    if (isFavorite(station.stationuuid)) {
        favs = favs.filter(s => s.stationuuid !== station.stationuuid);
        if (btn) {
            btn.classList.remove('active');
            btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
        }
    } else {
        const cleanStation = { ...station, name: cleanString(station.name) };
        favs.push(cleanStation);
        if (btn) {
            btn.classList.add('active');
            btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
        }
    }
    setFavorites(favs);
    syncFavoriteCardButtons();
    renderFavorites();
}

function syncFavoriteCardButtons() {
    document.querySelectorAll('.station-card').forEach(card => {
        const uuid = card.dataset.uuid;
        const btn = card.querySelector('.fav-btn');
        if (!btn || !uuid) return;
        const fav = isFavorite(uuid);
        btn.classList.toggle('active', fav);
        btn.innerHTML = fav ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
    });
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
        const row = document.createElement('div');
        row.className = 'fav-sidebar-row';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fav-sidebar-item';

        const img = document.createElement('img');
        img.src = getSafeIconUrl(station.favicon);
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

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'fav-remove-btn';
        removeBtn.title = t('removeFavTitle');
        removeBtn.setAttribute('aria-label', t('removeFavTitle'));
        removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const updated = getFavorites().filter(s => getStationKey(s) !== getStationKey(station));
            setFavorites(updated);
            syncFavoriteCardButtons();
            renderFavorites();
        });

        row.appendChild(btn);
        row.appendChild(removeBtn);
        fragment.appendChild(row);
    });
    favoritesList.appendChild(fragment);
}

if (exportFavsBtn) {
    exportFavsBtn.addEventListener('click', () => {
        const favs = getFavorites();
        const blob = new Blob([JSON.stringify(favs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'globalpulse-favorites.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

if (importFavsBtn && importFavsInput) {
    importFavsBtn.addEventListener('click', () => {
        importFavsInput.click();
    });

    importFavsInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!Array.isArray(parsed)) throw new Error('Invalid format');

            const existing = getFavorites();
            const byKey = new Map(existing.map(s => [getStationKey(s), s]));
            let added = 0;
            parsed.forEach((item) => {
                if (!item || !isSafeStreamUrl(item.url_resolved)) return;
                const key = getStationKey(item);
                if (!key || byKey.has(key)) return;
                byKey.set(key, {
                    stationuuid: item.stationuuid || key,
                    name: cleanString(item.name),
                    url_resolved: item.url_resolved,
                    country: item.country || '',
                    tags: item.tags || '',
                    codec: item.codec || '',
                    bitrate: item.bitrate || 0,
                    favicon: item.favicon || ''
                });
                added++;
            });

            if (added > 0 || parsed.length === 0) {
                setFavorites(Array.from(byKey.values()));
                syncFavoriteCardButtons();
                renderFavorites();
            }
            alert(t('importSuccess'));
        } catch {
            alert(t('importError'));
        } finally {
            importFavsInput.value = '';
        }
    });
}

// ======================== НАСКОРО СЛУШАНИ ========================
function getRecentStations() {
    try {
        return JSON.parse(safeStorageGet(localStorage, 'radio_recent', '[]'));
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
    safeStorageSet(localStorage, 'radio_recent', JSON.stringify(recent));
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
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'recent-card';

        const img = document.createElement('img');
        img.src = getSafeIconUrl(station.favicon);
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
        safeStorageRemove(localStorage, 'radio_recent');
        renderRecentStations();
    });
}

// ======================== БЪРЗ ИЗБОР ========================
async function loadTopStations(type = 'global', query = '', countryCode = null) {
    const reqId = ++topStationsRequestId;
    renderStatusMessage(quickPicksContainer, 'loadingTop');
    let url = `${API_BASE}/topclick/12`;
    if (type === 'country' && countryCode) {
        url = `${API_BASE}/bycountrycodeexact/${encodeURIComponent(countryCode)}?limit=12&order=clickcount&reverse=true`;
    } else if (type === 'country' && query) {
        url = `${API_BASE}/bycountry/${encodeURIComponent(query)}?limit=12&order=clickcount&reverse=true`;
    } else if (type === 'genre' && query !== 'all') {
        url = `${API_BASE}/bytag/${encodeURIComponent(query)}?limit=12&order=clickcount&reverse=true`;
    }
    try {
        const topStations = await fetchStations(url);
        if (reqId !== topStationsRequestId) return;
        renderQuickPicks(topStations);
    } catch {
        if (reqId !== topStationsRequestId) return;
        renderStatusMessage(quickPicksContainer, 'failed', true);
    }
}

function renderQuickPicks(stations) {
    quickPicksContainer.innerHTML = '';
    if (!stations || stations.length === 0) return;
    const playable = stations.filter(s => isPlayableStation(s)).slice(0, 8);
    const fragment = document.createDocumentFragment();
    playable.forEach(station => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quick-pick-item';
        const img = document.createElement('img');
        img.src = getSafeIconUrl(station.favicon);
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = () => { img.src = DEFAULT_ICON; };
        const span = document.createElement('span');
        span.textContent = cleanString(station.name);
        btn.appendChild(img);
        btn.appendChild(span);
        btn.addEventListener('click', () => playStation(station));
        fragment.appendChild(btn);
    });
    quickPicksContainer.appendChild(fragment);
}

// ======================== ТЕМА ========================
const savedTheme = safeStorageGet(localStorage, 'radio_theme', 'dark');
if (savedTheme === 'light') document.body.classList.add('light-theme');
updateThemeIcon();

themeToggle.addEventListener('click', () => {
    const isLight = document.body.classList.toggle('light-theme');
    safeStorageSet(localStorage, 'radio_theme', isLight ? 'light' : 'dark');
    updateThemeIcon();
});

function updateThemeIcon() {
    const icon = themeToggle.querySelector('i');
    icon.className = document.body.classList.contains('light-theme') ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

// ======================== ЗАРЕЖДАНЕ НА СТАНЦИИ ========================
function buildStationsApiUrl(type, query, sort, offset, countryCode) {
    const order = sort === 'name' || sort === 'votes' ? sort : 'clickcount';
    const reverse = order === 'name' ? 'false' : 'true';
    const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        order,
        reverse,
        hidebroken: 'true'
    });

    if (type === 'genre' && query !== 'all') {
        params.set('tag', query);
    } else if (type === 'country') {
        if (countryCode) {
            params.set('countrycode', countryCode);
        } else if (query) {
            params.set('country', query);
        }
    }

    return `${API_BASE}/search?${params.toString()}`;
}

function updateLoadMoreVisibility() {
    if (!loadMoreWrapper) return;
    const shouldShow = hasMoreStations && !isSearchActive && displayedStations.length > 0;
    loadMoreWrapper.style.display = shouldShow ? 'flex' : 'none';
}

function updateSectionTitle() {
    if (!sectionTitle) return;
    const base = t('stationsTitle');
    const searchTerm = searchInput ? searchInput.value.trim() : '';
    let filterLabel = '';

    if (searchTerm) {
        filterLabel = `"${searchTerm}"`;
    } else if (currentFilterType === 'country' && currentFilterQuery) {
        filterLabel = currentFilterQuery;
    } else if (currentFilterType === 'genre' && currentFilterQuery && currentFilterQuery !== 'all') {
        filterLabel = t(currentFilterQuery);
    } else {
        filterLabel = t('all');
    }

    const countPart = displayedStations.length > 0 ? ` (${displayedStations.length})` : '';
    sectionTitle.textContent = filterLabel ? `${base} • ${filterLabel}${countPart}` : `${base}${countPart}`;
}

async function loadStations(type, query, sort = 'clickcount', options = {}) {
    const { append = false, countryCode = selectedCountryCode } = options;
    const reqId = ++stationsRequestId;

    if (!append) {
        renderStatusMessage(stationsContainer, 'loading');
        currentOffset = 0;
        hasMoreStations = false;
        isSearchActive = false;
        updateLoadMoreVisibility();
    }

    currentFilterType = type;
    currentFilterQuery = query;
    currentSort = sort;

    if (type === 'country') {
        selectedCountry = query;
        selectedCountryCode = countryCode || null;
    } else if (type === 'genre') {
        selectedCountry = null;
        selectedCountryCode = null;
    }

    const offsetToLoad = append ? currentOffset : 0;
    const cacheKey = `radio_cache_${type}_${countryCode || query}_${sort}_${offsetToLoad}`;
    const cachedData = safeStorageGet(sessionStorage, cacheKey, null);

    if (cachedData) {
        try {
            const parsedCache = JSON.parse(cachedData);
            if (Array.isArray(parsedCache)) {
                if (append) {
                    const existingKeys = new Set(allStations.map(s => getStationKey(s)));
                    const extra = parsedCache.filter(s => !existingKeys.has(getStationKey(s)));
                    allStations = [...allStations, ...extra];
                } else {
                    allStations = parsedCache;
                }
                currentOffset = offsetToLoad + PAGE_SIZE;
                hasMoreStations = parsedCache.length >= PAGE_SIZE;
                displayStations(allStations);
                return;
            }
        } catch {
            safeStorageRemove(sessionStorage, cacheKey);
        }
    }

    const url = buildStationsApiUrl(type, query, sort, offsetToLoad, selectedCountryCode);

    try {
        let apiStations = await fetchStations(url);
        if (reqId !== stationsRequestId) return;

        if (!Array.isArray(apiStations)) {
            apiStations = [];
        }

        let filteredCustom = [];
        if (!append) {
            const custom = await loadCustomStations();
            if (reqId !== stationsRequestId) return;

            filteredCustom = Array.isArray(custom) ? custom : [];
            if (type === 'genre' && query !== 'all') {
                filteredCustom = filteredCustom.filter(s => (s.tags || '').toLowerCase().includes(query.toLowerCase()));
            } else if (type === 'country') {
                filteredCustom = filteredCustom.filter(s => (s.country || '').toLowerCase() === query.toLowerCase());
            }
        }

        if (!append && apiStations.length === 0 && filteredCustom.length === 0) {
            if (type === 'country') {
                allStations = [];
                hasMoreStations = false;
                renderStatusMessage(stationsContainer, 'noStations');
                updateSectionTitle();
                updateLoadMoreVisibility();
                return;
            }
            apiStations = await fetchStations(`${API_BASE}/topclick/60`);
            if (reqId !== stationsRequestId) return;
            if (!Array.isArray(apiStations)) apiStations = [];
        }

        hasMoreStations = apiStations.length >= PAGE_SIZE;
        currentOffset = offsetToLoad + PAGE_SIZE;

        if (append) {
            const existingKeys = new Set(allStations.map(s => getStationKey(s)));
            const fresh = apiStations.filter(s => !existingKeys.has(getStationKey(s)));
            allStations = [...allStations, ...fresh];
            safeStorageSet(sessionStorage, cacheKey, JSON.stringify(apiStations));
        } else {
            const combined = [...filteredCustom, ...apiStations];
            const deduped = new Map();
            combined.forEach((s) => {
                const key = getStationKey(s);
                if (key && !deduped.has(key)) deduped.set(key, s);
            });
            allStations = Array.from(deduped.values());
            sortStationsLocally(sort);
            safeStorageSet(sessionStorage, cacheKey, JSON.stringify(allStations));
        }

        displayStations(allStations);
    } catch {
        if (reqId !== stationsRequestId) return;
        if (!append) {
            hasMoreStations = false;
            updateLoadMoreVisibility();
            renderStatusMessage(stationsContainer, 'failed', true);
        }
    }
}

if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
        if (isLoadingMore || !hasMoreStations || isSearchActive) return;
        isLoadingMore = true;
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span></span>';
        loadMoreBtn.querySelector('span').textContent = t('loading');
        try {
            await loadStations(currentFilterType, currentFilterQuery, currentSort, {
                append: true,
                countryCode: selectedCountryCode
            });
        } finally {
            isLoadingMore = false;
            loadMoreBtn.disabled = false;
            loadMoreBtn.innerHTML = '<i class="fa-solid fa-plus"></i> <span data-i18n="loadMore"></span>';
            loadMoreBtn.querySelector('span').textContent = t('loadMore');
        }
    });
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
        isSearchActive = false;
        displayStations(allStations);
        return;
    }

    isSearchActive = true;
    updateLoadMoreVisibility();
    const reqId = ++searchRequestId;
    searchTimeout = setTimeout(async () => {
        try {
            const custom = await loadCustomStations();
            if (reqId !== searchRequestId) return;

            const activeCountry = selectedCountry || (currentFilterType === 'country' ? currentFilterQuery : null);
            const activeCountryCode = selectedCountryCode;

            const matchesQuery = (s) =>
                (s.name || '').toLowerCase().includes(lowerTerm) ||
                (s.tags || '').toLowerCase().includes(lowerTerm);

            const matchesCountry = (s) => {
                if (!activeCountry && !activeCountryCode) return true;
                if (activeCountryCode && s.countrycode && s.countrycode.toUpperCase() === activeCountryCode.toUpperCase()) {
                    return true;
                }
                const c = (s.country || '').toLowerCase();
                const target = (activeCountry || '').toLowerCase();
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
                let apiUrl = `${API_BASE}/byname/${encodeURIComponent(lowerTerm)}?limit=60`;
                if (activeCountryCode) {
                    apiUrl = `${API_BASE}/search?name=${encodeURIComponent(lowerTerm)}&countrycode=${encodeURIComponent(activeCountryCode)}&limit=60`;
                } else if (activeCountry) {
                    apiUrl = `${API_BASE}/search?name=${encodeURIComponent(lowerTerm)}&country=${encodeURIComponent(activeCountry)}&limit=60`;
                }
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

    updateSectionTitle();
    updateLoadMoreVisibility();

    if (displayedStations.length === 0) {
        renderStatusMessage(stationsContainer, 'noStations');
        return;
    }

    const fragment = document.createDocumentFragment();
    displayedStations.forEach(station => {
        const isCurrentPlaying = currentStation && currentStation.stationuuid === station.stationuuid && !activeAudio.paused;

        const card = document.createElement('div');
        card.className = 'station-card';
        card.dataset.uuid = station.stationuuid;
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', cleanString(station.name));
        if (isCurrentPlaying) card.classList.add('playing');

        const img = document.createElement('img');
        img.className = 'station-logo';
        img.src = getSafeIconUrl(station.favicon);
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
            copyStationShareLink(station, cardShareBtn, false);
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
        card.addEventListener('keydown', (e) => {
            if (e.target === card && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                playStation(station);
            }
        });
        fragment.appendChild(card);
    });
    stationsContainer.appendChild(fragment);
}

function updateActiveCardHighlight() {
    document.querySelectorAll('.station-card').forEach(card => {
        const isMatch = currentStation && card.dataset.uuid === currentStation.stationuuid && !activeAudio.paused;
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
    if (searchSongBtn) {
        searchSongBtn.href = '#';
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
    if (searchSongBtn) {
        searchSongBtn.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleaned)}`;
    }
    if (songInfoContainer) {
        songInfoContainer.style.display = 'flex';
    }
    if (currentStation) {
        updateMediaSession(currentStation, cleaned);
    }
}

if (copySongBtn) {
    copySongBtn.addEventListener('click', () => {
        const text = songInfoText ? songInfoText.textContent.trim() : '';
        if (!text || !navigator.clipboard || !navigator.clipboard.writeText) return;
        navigator.clipboard.writeText(text).then(() => {
            copySongBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
            setTimeout(() => {
                copySongBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
            }, 1400);
        }).catch(() => {});
    });
}

// ======================== ПУСКАНЕ НА СТАНЦИЯ ========================
function setPlayButtonState(state) {
    if (!playPauseBtn) return;
    if (state === 'loading') {
        playPauseBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    } else if (state === 'pause') {
        playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    } else {
        playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
}

function updateMediaSession(station, songTitle = '') {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined' || !station) return;
    try {
        const iconUrl = getSafeIconUrl(station.favicon);
        const artworkSrc = iconUrl.startsWith('http') ? iconUrl : 'favicon-192x192.png';
        navigator.mediaSession.metadata = new MediaMetadata({
            title: songTitle || cleanString(station.name),
            artist: songTitle ? cleanString(station.name) : formatMetaLine(station),
            album: 'GlobalPulse Radio',
            artwork: [{ src: artworkSrc, sizes: '192x192', type: 'image/png' }]
        });
    } catch {
        // Игнорираме ако браузърът не поддържа MediaMetadata
    }
}

function setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    const handlers = {
        play: () => playPauseBtn && playPauseBtn.click(),
        pause: () => activeAudio && !activeAudio.paused && activeAudio.pause(),
        previoustrack: () => prevStationBtn && prevStationBtn.click(),
        nexttrack: () => nextStationBtn && nextStationBtn.click()
    };
    Object.entries(handlers).forEach(([action, fn]) => {
        try {
            navigator.mediaSession.setActionHandler(action, fn);
        } catch {
            // Игнорираме неподдържани media actions
        }
    });
}

setupMediaSessionHandlers();

function getFallbackAudio() {
    if (!fallbackAudio) {
        fallbackAudio = document.createElement('audio');
        fallbackAudio.preload = 'none';
        bindAudioEvents(fallbackAudio);
    }
    return fallbackAudio;
}

function stopInactiveAudio(otherAudio) {
    if (!otherAudio) return;
    otherAudio.pause();
    otherAudio.removeAttribute('src');
    otherAudio.load();
}

function bindAudioEvents(audioEl) {
    if (!audioEl || audioEl.dataset.bound === 'true') return;
    audioEl.dataset.bound = 'true';

    audioEl.addEventListener('play', () => {
        if (audioEl !== activeAudio) return;
        setPlayButtonState(currentAttemptState && !currentAttemptState.streamStarted ? 'loading' : 'pause');
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }
        updateActiveCardHighlight();
    });

    audioEl.addEventListener('pause', () => {
        if (audioEl !== activeAudio) return;
        clearPlaybackWatchdog();
        clearStallWatchdog();
        setPlayButtonState('play');
        liveDot.classList.remove('active');
        setVisualizerPlayingState(false);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
        updateActiveCardHighlight();
    });

    audioEl.addEventListener('timeupdate', () => {
        if (audioEl !== activeAudio) return;
        currentTimeEl.textContent = formatTime(audioEl.currentTime);
    });

    audioEl.addEventListener('playing', () => {
        if (audioEl !== activeAudio || !currentAttemptState || currentAttemptState.audioEl !== audioEl) return;
        currentAttemptState.streamStarted = true;
        clearPlaybackWatchdog();
        clearStallWatchdog();
        setPlayButtonState('pause');
        liveDot.classList.add('active');
        setVisualizerPlayingState(true);
        if (!statusRestoreTimer && currentStation && stationDetails.textContent === t('pressPlayToStart')) {
            stationDetails.textContent = formatMetaLine(currentStation);
        }
    });

    const handleStall = () => {
        if (audioEl !== activeAudio || audioEl.paused || !currentAttemptState || currentAttemptState.audioEl !== audioEl) return;
        setPlayButtonState('loading');
        const attemptSnapshot = currentAttemptState;
        clearStallWatchdog();
        stallWatchdogTimer = setTimeout(() => {
            if (
                activeAudio === audioEl &&
                !audioEl.paused &&
                currentAttemptState &&
                currentAttemptState.attemptId === attemptSnapshot.attemptId
            ) {
                advanceAfterFailure(attemptSnapshot.station, attemptSnapshot.retryCount, 'stream_stalled');
            }
        }, STREAM_STALL_TIMEOUT_MS);
    };

    audioEl.addEventListener('stalled', handleStall);
    audioEl.addEventListener('waiting', handleStall);

    audioEl.addEventListener('error', () => {
        if (
            audioEl !== activeAudio ||
            !audioEl.getAttribute('src') ||
            !currentAttemptState ||
            currentAttemptState.audioEl !== audioEl
        ) {
            return;
        }
        const attemptSnapshot = currentAttemptState;
        if (!attemptSnapshot.useCorsFallback) {
            playStation(attemptSnapshot.station, attemptSnapshot.retryCount, true);
            return;
        }
        advanceAfterFailure(attemptSnapshot.station, attemptSnapshot.retryCount, 'audio_error');
    });
}

bindAudioEvents(primaryAudio);

function updatePlayerHeaderForStation(station) {
    stationName.textContent = cleanString(station.name);
    stationDetails.textContent = formatMetaLine(station);
    stationIcon.src = getSafeIconUrl(station.favicon);
    stationIcon.onerror = () => { stationIcon.src = DEFAULT_ICON; };
    shareBtn.disabled = false;
    currentTimeEl.textContent = '0:00';
}

function advanceAfterFailure(failedStation, retryCount, reason = 'error') {
    clearPlaybackWatchdog();
    clearStallWatchdog();
    markStationFailed(failedStation, reason);
    setVisualizerPlayingState(false);
    liveDot.classList.remove('active');
    playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';

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
                showTemporaryPlayerNotice(`${t('skippedPrefix')} ${skippedLabel} → ${nextLabel}`, nextStation);
            }
        });
        return;
    }

    clearSongInfo();
    stationName.textContent = `${cleanString(failedStation.name)} ${t('offlineSuffix')}`;
    displayStations(displayedStations);
    updateActiveCardHighlight();
}

async function playStation(station, retryCount = 0, useCorsFallback = false) {
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

    const attemptId = ++playbackAttemptId;
    const targetAudio = useCorsFallback ? getFallbackAudio() : primaryAudio;
    const otherAudio = useCorsFallback ? primaryAudio : fallbackAudio;

    stopInactiveAudio(otherAudio);
    activeAudio = targetAudio;
    activeAudio.volume = Number(volumeSlider.value);

    currentStation = station;
    currentAttemptState = {
        attemptId,
        station,
        retryCount,
        useCorsFallback,
        audioEl: targetAudio,
        streamStarted: false
    };

    updatePlayerHeaderForStation(station);
    updateMediaSession(station);
    clearSongInfo();
    setPlayButtonState('loading');
    updateActiveCardHighlight();

    targetAudio.src = station.url_resolved;

    playbackWatchdogTimer = setTimeout(() => {
        if (
            currentAttemptState &&
            currentAttemptState.attemptId === attemptId &&
            !currentAttemptState.streamStarted
        ) {
            if (!useCorsFallback) {
                playStation(station, retryCount, true);
            } else {
                advanceAfterFailure(station, retryCount, 'silent_or_stalled_start');
            }
        }
    }, STREAM_START_TIMEOUT_MS);

    try {
        await targetAudio.play();
    } catch (err) {
        if (attemptId !== playbackAttemptId) return;

        if (err && err.name === 'AbortError') {
            return;
        }

        if (err && err.name === 'NotAllowedError') {
            clearPlaybackWatchdog();
            clearStallWatchdog();
            stationDetails.textContent = t('pressPlayToStart');
            playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            liveDot.classList.remove('active');
            setVisualizerPlayingState(false);
            updateActiveCardHighlight();
            return;
        }

        if (!useCorsFallback) {
            return playStation(station, retryCount, true);
        }
        advanceAfterFailure(station, retryCount, 'play_rejected');
        return;
    }

    if (attemptId !== playbackAttemptId) return;

    if (station.stationuuid) {
        registerStationClick(station.stationuuid).catch(() => {});
    }

    addRecentStation(station);
    updateActiveCardHighlight();
    checkCurrentSong(station);

    if (!useCorsFallback) {
        initAudioGraph(primaryAudio, visualizerCanvas);
        if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume().catch(() => {});
        }
    }
    setVisualizerPlayingState(true);
}

refreshSongBtn.addEventListener('click', () => {
    if (currentStation) checkCurrentSong(currentStation);
});

async function checkCurrentSong(station) {
    const reqId = ++songCheckRequestId;
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
                if (reqId !== songCheckRequestId) return;
                if (!response.ok) continue;

                const data = await response.json();
                if (reqId !== songCheckRequestId) return;

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

        if (reqId === songCheckRequestId) clearSongInfo();
    } catch {
        if (reqId === songCheckRequestId) clearSongInfo();
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
    copyStationShareLink(currentStation, shareBtn, true);
});

allCategoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        allCategoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (searchInput.value) {
            searchInput.value = '';
            searchRequestId++;
        }

        const genre = btn.getAttribute('data-genre');
        const country = btn.getAttribute('data-country');
        const countryCode = btn.getAttribute('data-country-code');
        const activeSort = document.querySelector('.sort-btn.active')?.getAttribute('data-sort') || 'clickcount';

        if (genre) {
            selectedCountry = null;
            selectedCountryCode = null;
            loadStations('genre', genre, activeSort);
            loadTopStations('genre', genre);
        } else if (country) {
            selectedCountry = country;
            selectedCountryCode = countryCode || null;
            loadStations('country', country, activeSort, { countryCode });
            loadTopStations('country', country, countryCode);
        }

        if (mobileFiltersToggle && sidebarCollapsible && window.innerWidth <= 768) {
            sidebarCollapsible.classList.remove('open');
            mobileFiltersToggle.setAttribute('aria-expanded', 'false');
        }
    });
});

playRandomBtn.addEventListener('click', () => {
    const sourcePool = displayedStations.length > 0 ? displayedStations : allStations;
    const playable = sourcePool.filter(s => isPlayableStation(s));
    if (playable.length > 0) {
        const randomIndex = Math.floor(Math.random() * playable.length);
        playStation(playable[randomIndex]);
    }
});

let isFetchingRandomGlobal = false;
playRandomGlobalBtn.addEventListener('click', async () => {
    if (isFetchingRandomGlobal) return;
    isFetchingRandomGlobal = true;
    playRandomGlobalBtn.disabled = true;
    playRandomGlobalBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span></span>';
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
        isFetchingRandomGlobal = false;
        playRandomGlobalBtn.disabled = false;
        playRandomGlobalBtn.innerHTML = '<i class="fa-solid fa-shuffle"></i> <span data-i18n="randomStation"></span>';
        playRandomGlobalBtn.querySelector('span').textContent = t('randomStation');
    }
});

// ======================== ПЛЕЪР, ЗВУК И MUTE ========================
const playPauseBtn = document.getElementById('play-pause-btn');
const currentTimeEl = document.getElementById('current-time');
const volumeSlider = document.getElementById('volume-slider');
const volumeIcon = document.getElementById('volume-icon');
const volumeIconBtn = document.getElementById('volume-icon-btn');

let lastVolume = 1;

playPauseBtn.addEventListener('click', async () => {
    if (!currentStation && displayedStations.length > 0) {
        playStation(displayedStations[0]);
        return;
    }
    if (!currentStation) return;

    if (activeAudio.paused) {
        try {
            await activeAudio.play();
            if (activeAudio === primaryAudio) {
                initAudioGraph(primaryAudio, visualizerCanvas);
                if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
            }
        } catch (e) {
            console.warn('Playback start error:', e);
            if (activeAudio === primaryAudio && currentAttemptState && !currentAttemptState.useCorsFallback) {
                playStation(currentStation, currentAttemptState.retryCount, true);
            }
        }
    } else {
        clearPlaybackWatchdog();
        clearStallWatchdog();
        activeAudio.pause();
    }
});

function applyVolume(vol) {
    const clamped = Math.max(0, Math.min(1, Number(vol)));
    primaryAudio.volume = clamped;
    if (fallbackAudio) fallbackAudio.volume = clamped;
    volumeSlider.value = String(clamped);
    updateVolumeIcon(clamped);
    safeStorageSet(localStorage, 'radio_volume', String(clamped));
}

volumeSlider.addEventListener('input', (e) => {
    const val = Number(e.target.value);
    if (val > 0) lastVolume = val;
    applyVolume(val);
});

(volumeIconBtn || volumeIcon).addEventListener('click', () => {
    if (activeAudio.volume > 0) {
        lastVolume = activeAudio.volume;
        applyVolume(0);
    } else {
        applyVolume(lastVolume || 1);
    }
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
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const totalSecs = Math.floor(seconds);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) {
        return `${hours}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
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
        const isOpen = sleepTimerMenu.style.display === 'flex';
        sleepTimerMenu.style.display = isOpen ? 'none' : 'flex';
        sleepTimerBtn.setAttribute('aria-expanded', String(!isOpen));
    });

    document.addEventListener('click', () => {
        sleepTimerMenu.style.display = 'none';
        sleepTimerBtn.setAttribute('aria-expanded', 'false');
    });

    document.querySelectorAll('.timer-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            const mins = parseInt(btn.getAttribute('data-mins'), 10);
            setSleepTimer(mins);
            sleepTimerMenu.style.display = 'none';
            sleepTimerBtn.setAttribute('aria-expanded', 'false');
        });
    });
}

function setSleepTimer(mins) {
    if (sleepTimerInterval) {
        clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
    }

    if (mins === 0) {
        timerCountdown.style.display = 'none';
        sleepTimerBtn.style.color = '';
        return;
    }

    sleepTimerBtn.style.color = 'var(--accent)';
    timerCountdown.style.display = 'block';

    let timeLeft = mins * 60;
    const renderCountdown = () => {
        const m = Math.floor(timeLeft / 60);
        const s = timeLeft % 60;
        timerCountdown.textContent = `${t('remainingPrefix')} ${m}:${s < 10 ? '0' : ''}${s}`;
    };

    renderCountdown();

    sleepTimerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(sleepTimerInterval);
            sleepTimerInterval = null;
            activeAudio.pause();
            timerCountdown.style.display = 'none';
            sleepTimerBtn.style.color = '';
            return;
        }
        renderCountdown();
    }, 1000);
}

// ======================== ЦЯЛ ЕКРАН ВИЗУАЛИЗАТОР ========================
const fullscreenVisBtn = document.getElementById('fullscreen-vis-btn');
const fullscreenModal = document.getElementById('fullscreen-modal');
const closeFullscreen = document.getElementById('close-fullscreen');
const fsVisualizerCanvas = document.getElementById('fullscreen-visualizer');
const fsStationName = document.getElementById('fs-station-name');

function closeFullscreenModal() {
    if (!fullscreenModal || fullscreenModal.style.display === 'none') return;
    fullscreenModal.style.display = 'none';
    stopFullscreenVisualizer();
}

if (fullscreenVisBtn) {
    fullscreenVisBtn.addEventListener('click', () => {
        if (!currentStation) return;
        fullscreenModal.style.display = 'flex';
        fsStationName.textContent = cleanString(currentStation.name);
        startFullscreenVisualizer(fsVisualizerCanvas);
    });

    closeFullscreen.addEventListener('click', closeFullscreenModal);
    fullscreenModal.addEventListener('click', (e) => {
        if (e.target === fullscreenModal) closeFullscreenModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeFullscreenModal();
    });
}

if (mobileFiltersToggle && sidebarCollapsible) {
    mobileFiltersToggle.addEventListener('click', () => {
        const isOpen = sidebarCollapsible.classList.toggle('open');
        mobileFiltersToggle.setAttribute('aria-expanded', String(isOpen));
    });
}

document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
    const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable);
    if (isTyping) {
        if (e.key === 'Escape') {
            e.target.blur();
        }
        return;
    }

    if (e.key === '/') {
        e.preventDefault();
        if (searchInput) searchInput.focus();
    } else if (e.key === ' ' && !(e.target && (e.target.tagName === 'BUTTON' || e.target.getAttribute('role') === 'button'))) {
        e.preventDefault();
        if (playPauseBtn) playPauseBtn.click();
    } else if (e.key === 'm' || e.key === 'M') {
        if (volumeIconBtn) volumeIconBtn.click();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nextVol = Math.min(1, Number(volumeSlider.value) + 0.05);
        if (nextVol > 0) lastVolume = nextVol;
        applyVolume(nextVol);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextVol = Math.max(0, Number(volumeSlider.value) - 0.05);
        if (nextVol > 0) lastVolume = nextVol;
        applyVolume(nextVol);
    } else if (e.key === 'f' || e.key === 'F') {
        if (fullscreenModal && fullscreenModal.style.display === 'flex') {
            closeFullscreenModal();
        } else if (fullscreenVisBtn && currentStation) {
            fullscreenVisBtn.click();
        }
    }
});

// ======================== СТАРТИРАНЕ ========================
document.addEventListener('DOMContentLoaded', async () => {
    initEqControls();
    const savedVol = Number(safeStorageGet(localStorage, 'radio_volume', '1'));
    if (Number.isFinite(savedVol) && savedVol >= 0 && savedVol <= 1) {
        if (savedVol > 0) lastVolume = savedVol;
        applyVolume(savedVol);
    }

    setLanguage(detectInitialLanguage());
    renderRecentStations();
    if (visualizerCanvas) {
        startVisualizer(visualizerCanvas);
    }

    const activeSort = document.querySelector('.sort-btn.active')?.getAttribute('data-sort') || 'clickcount';
    await loadCustomStations();
    loadTopStations();
    loadStations('genre', 'all', activeSort);

    const params = new URLSearchParams(window.location.search);
    const stationUuid = params.get('station');

    if (stationUuid) {
        const custom = await loadCustomStations();
        const customMatch = (Array.isArray(custom) ? custom : []).find(s => s.stationuuid === stationUuid);
        if (customMatch && isPlayableStation(customMatch)) {
            playStation(customMatch);
            return;
        }

        try {
            const data = await fetchStations(`${API_BASE}/byuuid/${encodeURIComponent(stationUuid)}`);
            if (Array.isArray(data) && data.length > 0 && isPlayableStation(data[0])) {
                playStation(data[0]);
            }
        } catch (e) {
            console.log('Share load error:', e);
        }
    }
});

if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.protocol === 'http:')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}