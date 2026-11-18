export let audioContext = null;
export let analyser = null;
export let sourceNode = null;
let visualizerRAF = null;

export function initAudioGraph(audioStream, visualizerCanvas) {
    try {
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
        
        document.getElementById('eq-bass').value = savedEq.bass;
        document.getElementById('eq-mid').value = savedEq.mid;
        document.getElementById('eq-treble').value = savedEq.treble;

        analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;

        sourceNode.connect(bass);
        bass.connect(mid);
        mid.connect(treble);
        treble.connect(analyser);
        analyser.connect(audioContext.destination);

        document.getElementById('eq-bass').addEventListener('input', (e) => { bass.gain.value = e.target.value; saveEq(); });
        document.getElementById('eq-mid').addEventListener('input', (e) => { mid.gain.value = e.target.value; saveEq(); });
        document.getElementById('eq-treble').addEventListener('input', (e) => { treble.gain.value = e.target.value; saveEq(); });

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

export function startVisualizer(visualizerCanvas) {
    if (visualizerRAF) {
        cancelAnimationFrame(visualizerRAF);
    }

    const ctx = visualizerCanvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        visualizerRAF = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        const w = visualizerCanvas.width;
        const h = visualizerCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#38bdf8';
        ctx.fillStyle = accent;

        const barWidth = 6; 
        const gap = 4;      
        const totalBars = Math.floor(w / (barWidth + gap)); 
        
        const startFreq = Math.floor(bufferLength * 0.1); 
        const endFreq = Math.floor(bufferLength * 0.8);
        const step = (endFreq - startFreq) / totalBars;

        let x = 0;
        for (let i = 0; i < totalBars; i++) {
            const index = Math.floor(startFreq + i * step);
            const value = dataArray[index] || 0;
            
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