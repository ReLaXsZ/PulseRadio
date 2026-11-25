export let audioContext = null;
export let analyser = null;
export let sourceNode = null;
let visualizerRAF = null;
let fsVisualizerRAF = null;
let isPlayingForVis = false;
let activeMiniCanvas = null;
let activeFsCanvas = null;

function drawRoundedBar(ctx, x, y, width, height, radii) {
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radii);
        ctx.fill();
        return;
    }
    ctx.fillRect(x, y, width, height);
}

export function setVisualizerPlayingState(playing) {
    const nextState = Boolean(playing);
    if (isPlayingForVis === nextState) return;
    isPlayingForVis = nextState;

    if (activeMiniCanvas) {
        startVisualizer(activeMiniCanvas);
    }
    if (activeFsCanvas) {
        startFullscreenVisualizer(activeFsCanvas);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (visualizerRAF) {
            cancelAnimationFrame(visualizerRAF);
            visualizerRAF = null;
        }
        if (fsVisualizerRAF) {
            cancelAnimationFrame(fsVisualizerRAF);
            fsVisualizerRAF = null;
        }
    } else if (isPlayingForVis) {
        if (activeMiniCanvas && !visualizerRAF) {
            startVisualizer(activeMiniCanvas);
        }
        if (activeFsCanvas && !fsVisualizerRAF) {
            startFullscreenVisualizer(activeFsCanvas);
        }
    }
});

let bassFilter = null;
let midFilter = null;
let trebleFilter = null;
let eqControlsBound = false;

export const EQ_PRESETS = {
    flat: { bass: 0, mid: 0, treble: 0 },
    bass: { bass: 6, mid: 0, treble: -1 },
    rock: { bass: 4, mid: -1, treble: 4 },
    vocal: { bass: -3, mid: 5, treble: 2 }
};

function readSavedEq() {
    try {
        const parsed = JSON.parse(localStorage.getItem('radio_eq') || '{}');
        return {
            bass: Number.isFinite(Number(parsed.bass)) ? Number(parsed.bass) : 0,
            mid: Number.isFinite(Number(parsed.mid)) ? Number(parsed.mid) : 0,
            treble: Number.isFinite(Number(parsed.treble)) ? Number(parsed.treble) : 0,
            preset: typeof parsed.preset === 'string' ? parsed.preset : 'flat'
        };
    } catch {
        return { bass: 0, mid: 0, treble: 0, preset: 'flat' };
    }
}

function applyEqValues(bassVal, midVal, trebleVal, presetName = 'custom') {
    const bassEl = document.getElementById('eq-bass');
    const midEl = document.getElementById('eq-mid');
    const trebleEl = document.getElementById('eq-treble');
    const presetEl = document.getElementById('eq-preset');

    if (bassEl) bassEl.value = String(bassVal);
    if (midEl) midEl.value = String(midVal);
    if (trebleEl) trebleEl.value = String(trebleVal);
    if (presetEl) presetEl.value = presetName;

    if (bassFilter) bassFilter.gain.value = bassVal;
    if (midFilter) midFilter.gain.value = midVal;
    if (trebleFilter) trebleFilter.gain.value = trebleVal;

    saveEq(presetName);
}

export function initEqControls() {
    if (eqControlsBound) return;
    eqControlsBound = true;

    const bassEl = document.getElementById('eq-bass');
    const midEl = document.getElementById('eq-mid');
    const trebleEl = document.getElementById('eq-treble');
    const presetEl = document.getElementById('eq-preset');

    const saved = readSavedEq();
    if (bassEl) bassEl.value = String(saved.bass);
    if (midEl) midEl.value = String(saved.mid);
    if (trebleEl) trebleEl.value = String(saved.treble);
    if (presetEl) presetEl.value = saved.preset;

    const onSliderInput = () => {
        const b = bassEl ? +bassEl.value : 0;
        const m = midEl ? +midEl.value : 0;
        const t = trebleEl ? +trebleEl.value : 0;
        if (bassFilter) bassFilter.gain.value = b;
        if (midFilter) midFilter.gain.value = m;
        if (trebleFilter) trebleFilter.gain.value = t;
        if (presetEl) presetEl.value = 'custom';
        saveEq('custom');
    };

    if (bassEl) bassEl.addEventListener('input', onSliderInput);
    if (midEl) midEl.addEventListener('input', onSliderInput);
    if (trebleEl) trebleEl.addEventListener('input', onSliderInput);

    if (presetEl) {
        presetEl.addEventListener('change', () => {
            const preset = EQ_PRESETS[presetEl.value];
            if (preset) {
                applyEqValues(preset.bass, preset.mid, preset.treble, presetEl.value);
            }
        });
    }

    const resetBtn = document.getElementById('eq-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            applyEqValues(0, 0, 0, 'flat');
            if (presetEl) presetEl.value = 'flat';
        });
    }
}

export function initAudioGraph(audioStream, visualizerCanvas) {
    initEqControls();
    try {
        if (!audioContext && audioStream) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;

            audioContext = new AudioCtx();
            sourceNode = audioContext.createMediaElementSource(audioStream);

            bassFilter = audioContext.createBiquadFilter();
            bassFilter.type = 'lowshelf';
            bassFilter.frequency.value = 200;

            midFilter = audioContext.createBiquadFilter();
            midFilter.type = 'peaking';
            midFilter.frequency.value = 1000;
            midFilter.Q.value = 1;

            trebleFilter = audioContext.createBiquadFilter();
            trebleFilter.type = 'highshelf';
            trebleFilter.frequency.value = 3000;

            const savedEq = readSavedEq();
            bassFilter.gain.value = savedEq.bass;
            midFilter.gain.value = savedEq.mid;
            trebleFilter.gain.value = savedEq.treble;

            analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;
            analyser.smoothingTimeConstant = 0.82;

            sourceNode.connect(bassFilter);
            bassFilter.connect(midFilter);
            midFilter.connect(trebleFilter);
            trebleFilter.connect(analyser);
            analyser.connect(audioContext.destination);
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

function saveEq(presetName) {
    const bassEl = document.getElementById('eq-bass');
    const midEl = document.getElementById('eq-mid');
    const trebleEl = document.getElementById('eq-treble');
    const presetEl = document.getElementById('eq-preset');
    try {
        localStorage.setItem('radio_eq', JSON.stringify({
            bass: bassEl ? +bassEl.value : 0,
            mid: midEl ? +midEl.value : 0,
            treble: trebleEl ? +trebleEl.value : 0,
            preset: presetName || (presetEl ? presetEl.value : 'custom')
        }));
    } catch {
        // Игнорираме при ограничен достъп до storage
    }
}

export function startVisualizer(canvas) {
    if (!canvas) return;
    activeMiniCanvas = canvas;
    if (visualizerRAF) {
        cancelAnimationFrame(visualizerRAF);
        visualizerRAF = null;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);
    let phase = 0;

    function draw() {
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
            drawRoundedBar(ctx, x, y, barWidth, barHeight, [2, 2, 1, 1]);

            x += barWidth + gap;
        }
        ctx.restore();

        if (isPlayingForVis && !document.hidden) {
            visualizerRAF = requestAnimationFrame(draw);
        } else {
            visualizerRAF = null;
        }
    }

    draw();
}

export function startFullscreenVisualizer(canvas) {
    if (!canvas) return;
    activeFsCanvas = canvas;
    if (fsVisualizerRAF) {
        cancelAnimationFrame(fsVisualizerRAF);
        fsVisualizerRAF = null;
    }

    canvas.width = Math.max(240, Math.floor(window.innerWidth * 0.8));
    canvas.height = Math.max(160, Math.floor(window.innerHeight * 0.6));

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);
    let phase = 0;

    function draw() {
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
            drawRoundedBar(ctx, x, (h / 2) - (barHeight / 2), barWidth, barHeight, [6, 6, 6, 6]);

            x += barWidth + gap;
        }

        if (isPlayingForVis && !document.hidden) {
            fsVisualizerRAF = requestAnimationFrame(draw);
        } else {
            fsVisualizerRAF = null;
        }
    }
    draw();
}

export function stopFullscreenVisualizer() {
    activeFsCanvas = null;
    if (fsVisualizerRAF) {
        cancelAnimationFrame(fsVisualizerRAF);
        fsVisualizerRAF = null;
    }
}