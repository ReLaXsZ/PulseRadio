export let audioContext = null;
export let analyser = null;
export let sourceNode = null;
let visualizerRAF = null;
let fsVisualizerRAF = null;

export function initAudioGraph(audioStream, visualizerCanvas) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            sourceNode = audioContext.createMediaElementSource(audioStream);

            const bass = audioContext.createBiquadFilter();
            bass.type = 'lowshelf'; bass.frequency.value = 200;
            const mid = audioContext.createBiquadFilter();
            mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1;
            const treble = audioContext.createBiquadFilter();
            treble.type = 'highshelf'; treble.frequency.value = 3000;

            const savedEq = JSON.parse(localStorage.getItem('radio_eq') || '{"bass":0,"mid":0,"treble":0}');
            bass.gain.value = savedEq.bass; mid.gain.value = savedEq.mid; treble.gain.value = savedEq.treble;
            
            const bassEl = document.getElementById('eq-bass');
            const midEl = document.getElementById('eq-mid');
            const trebleEl = document.getElementById('eq-treble');
            if(bassEl) bassEl.value = savedEq.bass;
            if(midEl) midEl.value = savedEq.mid;
            if(trebleEl) trebleEl.value = savedEq.treble;

            analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;

            sourceNode.connect(bass);
            bass.connect(mid);
            mid.connect(treble);
            treble.connect(analyser);
            analyser.connect(audioContext.destination);

            if(bassEl) bassEl.addEventListener('input', (e) => { bass.gain.value = e.target.value; saveEq(); });
            if(midEl) midEl.addEventListener('input', (e) => { mid.gain.value = e.target.value; saveEq(); });
            if(trebleEl) trebleEl.addEventListener('input', (e) => { treble.gain.value = e.target.value; saveEq(); });
        }

        startVisualizer(visualizerCanvas);
    } catch (e) {
        console.error('Web Audio error:', e);
    }
}

function saveEq() {
    localStorage.setItem('radio_eq', JSON.stringify({
        bass: +document.getElementById('eq-bass').value,
        mid: +document.getElementById('eq-mid').value,
        treble: +document.getElementById('eq-treble').value
    }));
}

export function startVisualizer(canvas) {
    if (!canvas) return;
    if (visualizerRAF) cancelAnimationFrame(visualizerRAF);

    const ctx = canvas.getContext('2d');
    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        visualizerRAF = requestAnimationFrame(draw);
        if (analyser) analyser.getByteFrequencyData(dataArray);

        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#38bdf8';
        ctx.fillStyle = accent;

        const barWidth = 6; 
        const gap = 4;      
        const totalBars = Math.floor(w / (barWidth + gap)); 
        
        let x = 0;
        for (let i = 0; i < totalBars; i++) {
            const value = dataArray[i] || 0;
            let barHeight = (value / 255) * h;
            if (barHeight < 4) barHeight = 4;

            ctx.beginPath();
            ctx.roundRect(x, h - barHeight, barWidth, barHeight, [3, 3, 0, 0]);
            ctx.fill();

            x += barWidth + gap;
        }
    }
    draw();
}

export function startFullscreenVisualizer(canvas) {
    if (!canvas) return;
    if (fsVisualizerRAF) cancelAnimationFrame(fsVisualizerRAF);

    canvas.width = window.innerWidth * 0.8;
    canvas.height = window.innerHeight * 0.6;

    const ctx = canvas.getContext('2d');
    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        fsVisualizerRAF = requestAnimationFrame(draw);
        if (analyser) analyser.getByteFrequencyData(dataArray);

        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const barWidth = 10;
        const gap = 6;
        const totalBars = Math.floor(w / (barWidth + gap));
        
        let x = (w - (totalBars * (barWidth + gap))) / 2;

        for (let i = 0; i < totalBars; i++) {
            const value = dataArray[i] || 10;
            let barHeight = (value / 255) * h * 0.8;
            if (barHeight < 8) barHeight = 8;

            let gradient = ctx.createLinearGradient(0, h, 0, 0);
            gradient.addColorStop(0, '#38bdf8');
            gradient.addColorStop(1, '#a855f7');

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
    if (fsVisualizerRAF) cancelAnimationFrame(fsVisualizerRAF);
}