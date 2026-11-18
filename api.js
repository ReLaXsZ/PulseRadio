const API_BASE = 'https://de1.api.radio-browser.info/json/stations';
let customStationsCache = null;

export async function fetchStations(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Network error');
    return await res.json();
}

export async function loadCustomStations() {
    if (customStationsCache) return customStationsCache;
    try {
        const res = await fetch('custom_stations.json');
        if (!res.ok) throw new Error('No custom file');
        customStationsCache = await res.json();
        return customStationsCache;
    } catch (e) {
        console.warn('Could not load custom_stations.json:', e);
        customStationsCache = [];
        return [];
    }
}

export { API_BASE };