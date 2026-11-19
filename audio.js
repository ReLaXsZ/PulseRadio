export let audioContext = null;
export let analyser = null;
export let sourceNode = null;
let visualizerRAF = null;
let fsVisualizerRAF = null;
let isPlayingForVis = false;

export function setVisualizerPlayingState(playing) {
    isPlayingForVis = Boolean(playing);
}

function readSavedEq() {
    try {
        const parsed = JSON.parse(localStorage.getItem('radio_eq') || '{}');
        return {
            bass: Number.isFinite(Number(parsed.bass)) ? Number(parsed.bass) : 0,
            mid: Number.isFinite(Number(parsed.mid)) ? Number(parsed.mid) : 0,
            treble: Number.isFinite(Number(parsed.treble)) ? Number(parsed.treble) : 0
        };
    } catch {
        return { bass: 0, mid: 0, treble: 0 };
    }
}

export function initAudioGraph(audioStream, visualizerCanvas) {
    try {
        if (!audioContext && audioStream) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;

            audioContext = new AudioCtx();
            sourceNode = audioContext.createMediaElementSource(audioStream);

            const bass = audioContext.createBiquadFilter();
            bass.type = 'lowshelf';
            bass.frequency.value = 200;

            const mid = audioContext.createBiquadFilter();
            mid.type = 'peaking';
            mid.frequency.value = 1000;
            mid.Q.value = 1;

            const treble = audioContext.createBiquadFilter();
            treble.type = 'highshelf';
            treble.frequency.value = 3000;

            const savedEq = readSavedEq();
            bass.gain.value = savedEq.bass;
            mid.gain.value = savedEq.mid;
            treble.gain.value = savedEq.treble;

            const bassEl = document.getElementById('eq-bass');
            const midEl = document.getElementById('eq-mid');
            const trebleEl = document.getElementById('eq-treble');
            if (bassEl) bassEl.value = savedEq.bass;
            if (midEl) midEl.value = savedEq.mid;
            if (trebleEl) trebleEl.value = savedEq.treble;

            analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;
            analyser.smoothingTimeConstant = 0.82;

            sourceNode.connect(bass);
            bass.connect(mid);
            mid.connect(treble);
            treble.connect(analyser);
            analyser.connect(audioContext.destination);

            if (bassEl) bassEl.addEventListener('input', (e) => { bass.gain.value = +e.target.value; saveEq(); });
            if (midEl) midEl.addEventListener('input', (e) => { mid.gain.value = +e.target.value; saveEq(); });
            if (trebleEl) trebleEl.addEventListener('input', (e) => { treble.gain.value = +e.target.value; saveEq(); });
        }

        if (visualizerCanvas && !visualizerRAF) {
            startVisualizer(visualizerCanvas);
        }
    } catch (e) {
        console.warn('Web Audio fallback mode active:', e);
        if (visualizerCanvas && !visualizerRAF) {
            startVisualizer(visualizerCanvas);
        }
    }
}

function saveEq() {
    const bassEl = document.getElementById('eq-bass');
    const midEl = document.getElementById('eq-mid');
    const trebleEl = document.getElementById('eq-treble');
    try {
        localStorage.setItem('radio_eq', JSON.stringify({
            bass: bassEl ? +bassEl.value : 0,
            mid: midEl ? +midEl.value : 0,
            treble: trebleEl ? +trebleEl.value : 0
        }));
    } catch {
        // Игнорираме при ограничен достъп до storage
    }
}

export function startVisualizer(canvas) {
    if (!canvas) return;
    if (visualizerRAF) cancelAnimationFrame(visualizerRAF);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);
    let phase = 0;

    function draw() {
        visualizerRAF = requestAnimationFrame(draw);
        phase += 0.085;

        let hasRealAudioData = false;
        if (analyser && isPlayingForVis) {
            analyser.getByteFrequencyData(dataArray);
            for (let k = 0; k < Math.min(24, dataArray.length); k++) {
                if (dataArray[k] > 4) {
                    hasRealAudioData = true;
                    break;
                }
            }
        }

        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const barWidth = 4;
        const gap = 3;
        const totalBars = Math.max(8, Math.floor((w + gap) / (barWidth + gap)));
        const totalUsedWidth = totalBars * (barWidth + gap) - gap;
        let x = Math.max(0, (w - totalUsedWidth) / 2);

        const isLight = document.body.classList.contains('light-theme');
        const gradient = ctx.createLinearGradient(0, h, 0, 0);
        if (isLight) {
            gradient.addColorStop(0, '#0284c7');
            gradient.addColorStop(0.6, '#38bdf8');
            gradient.addColorStop(1, '#7c3aed');
        } else {
            gradient.addColorStop(0, '#38bdf8');
            gradient.addColorStop(0.6, '#818cf8');
            gradient.addColorStop(1, '#c084fc');
        }

        ctx.save();
        ctx.fillStyle = gradient;
        if (isPlayingForVis) {
            ctx.shadowColor = isLight ? 'rgba(2, 132, 199, 0.45)' : 'rgba(56, 189, 248, 0.55)';
            ctx.shadowBlur = 8;
        }

        for (let i = 0; i < totalBars; i++) {
            let norm = 0;
            if (isPlayingForVis) {
                if (hasRealAudioData) {
                    const binIndex = Math.min(bufferLength - 1, Math.floor((i / totalBars) * 40));
                    norm = (dataArray[binIndex] || 0) / 255;
                } else {
                    const wave1 = Math.sin(phase + i * 0.45) * 0.5 + 0.5;
                    const wave2 = Math.cos(phase * 1.35 - i * 0.28) * 0.5 + 0.5;
                    const envelope = Math.sin((i / Math.max(1, totalBars - 1)) * Math.PI);
                    norm = (0.22 + 0.65 * wave1 * wave2) * (0.45 + 0.55 * envelope);
                }
            }

            const minHeight = 3;
            const maxHeight = Math.max(8, h - 6);
            const barHeight = isPlayingForVis
                ? Math.max(minHeight, norm * maxHeight)
                : minHeight;

            const y = h - barHeight - 2;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 1, 1]);
            ctx.fill();

            x += barWidth + gap;
        }
        ctx.restore();
    }

    draw();
}

export function startFullscreenVisualizer(canvas) {
    if (!canvas) return;
    if (fsVisualizerRAF) cancelAnimationFrame(fsVisualizerRAF);

    canvas.width = Math.floor(window.innerWidth * 0.8);
    canvas.height = Math.floor(window.innerHeight * 0.6);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);
    let phase = 0;

    function draw() {
        fsVisualizerRAF = requestAnimationFrame(draw);
        phase += 0.09;

        let hasRealAudioData = false;
        if (analyser && isPlayingForVis) {
            analyser.getByteFrequencyData(dataArray);
            for (let k = 0; k < Math.min(32, dataArray.length); k++) {
                if (dataArray[k] > 4) {
                    hasRealAudioData = true;
                    break;
                }
            }
        }

        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const barWidth = 10;
        const gap = 6;
        const totalBars = Math.floor(w / (barWidth + gap));
        let x = (w - (totalBars * (barWidth + gap))) / 2;

        for (let i = 0; i < totalBars; i++) {
            let value = 6;
            if (isPlayingForVis) {
                if (hasRealAudioData) {
                    const idx = Math.min(bufferLength - 1, i);
                    value = Math.max(10, dataArray[idx] || 10);
                } else {
                    const w1 = Math.sin(phase + i * 0.35) * 0.5 + 0.5;
                    const w2 = Math.cos(phase * 0.8 - i * 0.2) * 0.5 + 0.5;
                    value = 25 + w1 * w2 * 210;
                }
            }

            let barHeight = (value / 255) * h * 0.8;
            if (barHeight < 8) barHeight = 8;

            const gradient = ctx.createLinearGradient(0, h, 0, 0);
            gradient.addColorStop(0, '#38bdf8');
            gradient.addColorStop(0.5, '#818cf8');
            gradient.addColorStop(1, '#c084fc');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(x, (h / 2) - (barHeight / 2), barWidth, barHeight, [6, 6, 6, 6]);
            ctx.fill();

            x += barWidth + gap;
        }
    }
    draw();
}

export function stopFullscreenVisualizer() {
    if (fsVisualizerRAF) {
        cancelAnimationFrame(fsVisualizerRAF);
        fsVisualizerRAF = null;
    }
}