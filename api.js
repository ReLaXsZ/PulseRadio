const API_MIRRORS = [
    'https://de1.api.radio-browser.info/json/stations',
    'https://nl1.api.radio-browser.info/json/stations',
    'https://fr1.api.radio-browser.info/json/stations'
];

const API_BASE = API_MIRRORS[0];
let customStationsCache = null;

async function fetchWithTimeout(url, timeoutMs = 6000) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        return data;
    } finally {
        clearTimeout(timerId);
    }
}

export async function fetchStations(url) {
    if (typeof url !== 'string' || !url.startsWith('http')) {
        return await fetchWithTimeout(url);
    }

    const matchedMirror = API_MIRRORS.find((mirror) => url.startsWith(mirror));
    if (!matchedMirror) {
        return await fetchWithTimeout(url);
    }

    const suffix = url.slice(matchedMirror.length);
    const orderedMirrors = [matchedMirror, ...API_MIRRORS.filter((m) => m !== matchedMirror)];

    let lastError = null;
    for (const mirror of orderedMirrors) {
        try {
            return await fetchWithTimeout(`${mirror}${suffix}`);
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('All Radio Browser mirrors failed');
}

export async function loadCustomStations() {
    if (customStationsCache) return customStationsCache;
    try {
        const data = await fetchWithTimeout('custom_stations.json', 4000);
        customStationsCache = Array.isArray(data) ? data : [];
        return customStationsCache;
    } catch (e) {
        console.warn('Could not load custom_stations.json:', e);
        customStationsCache = [];
        return [];
    }
}

export { API_BASE };