class HearingTestApp {
    constructor() {
        this.audioCtx = null;
        this.oscillator = null;
        this.noiseSource = null;
        this.gainNode = null;
        this.pannerNode = null;
        
        this.isTesting = false;
        this.currentFreq = 0;
        this.currentLevelOffset = 0; // dB offset from base level
        this.testFrequencies = [];
        this.currentFreqIndex = 0;
        this.results = []; // Store results for JSON output

        // UI Elements
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.volUpBtn = document.getElementById('volUp');
        this.volDownBtn = document.getElementById('volDown');
        this.adjustmentPanel = document.getElementById('adjustmentPanel');
        this.currentFreqDisplay = document.getElementById('currentFreqDisplay');
        this.currentLevelDisplay = document.getElementById('currentLevelDisplay');
        this.resultsLog = document.getElementById('resultsLog');
        this.clearResultsBtn = document.getElementById('clearResults');
        this.showJsonBtn = document.getElementById('showJsonBtn');
        this.jsonOutput = document.getElementById('jsonOutput');
        this.jsonOutputContainer = document.getElementById('jsonOutputContainer');

        this.initEventListeners();
    }

    initEventListeners() {
        this.startBtn.addEventListener('click', () => this.startTest());
        this.stopBtn.addEventListener('click', () => this.stopTest());
        this.nextBtn.addEventListener('click', () => this.recordResultAndNext());
        this.volUpBtn.addEventListener('click', () => this.adjustVolume(1));
        this.volDownBtn.addEventListener('click', () => this.adjustVolume(-1));
        this.clearResultsBtn.addEventListener('click', () => this.clearResults());
        this.showJsonBtn.addEventListener('click', () => this.toggleJsonOutput());

        // Keyboard Controls
        document.addEventListener('keydown', (e) => {
            if (!this.isTesting) {
                if (e.code === 'Space' && !e.repeat) {
                    this.startTest();
                    e.preventDefault();
                }
                return;
            }

            switch (e.code) {
                case 'ArrowUp':
                    this.adjustVolume(1);
                    e.preventDefault();
                    break;
                case 'ArrowDown':
                    this.adjustVolume(-1);
                    e.preventDefault();
                    break;
                case 'Enter':
                    this.recordResultAndNext();
                    e.preventDefault();
                    break;
                case 'Escape':
                    this.stopTest();
                    e.preventDefault();
                    break;
                case 'Space':
                    this.stopTest();
                    e.preventDefault();
                    break;
            }
        });
    }

    clearResults() {
        this.results = [];
        this.resultsLog.innerHTML = '<p class="empty-msg">No results yet. Start a test to see your thresholds.</p>';
        this.jsonOutput.value = '';
        this.jsonOutputContainer.style.display = 'none';
        this.showJsonBtn.textContent = 'Show JSON Results';
    }

    toggleJsonOutput() {
        if (this.jsonOutputContainer.style.display === 'none') {
            this.jsonOutput.value = JSON.stringify(this.results, null, 2);
            this.jsonOutputContainer.style.display = 'block';
            this.showJsonBtn.textContent = 'Hide JSON Results';
            // Scroll to bottom
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        } else {
            this.jsonOutputContainer.style.display = 'none';
            this.showJsonBtn.textContent = 'Show JSON Results';
        }
    }

    async initAudio() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
    }

    setupAudioChain() {
        this.gainNode = this.audioCtx.createGain();
        this.pannerNode = this.audioCtx.createStereoPanner();
        
        this.gainNode.connect(this.pannerNode);
        this.pannerNode.connect(this.audioCtx.destination);

        const earSide = document.getElementById('earSide').value;
        if (earSide === 'left') this.pannerNode.pan.value = -1;
        else if (earSide === 'right') this.pannerNode.pan.value = 1;
        else this.pannerNode.pan.value = 0;

        this.updateGain();
    }

    updateGain() {
        if (!this.gainNode) return;
        const baseLevel = parseFloat(document.getElementById('baseLevel').value);
        const totalDb = baseLevel + this.currentLevelOffset;
        const linearGain = Math.pow(10, totalDb / 20);
        
        // Smooth transition to avoid clicks
        this.gainNode.gain.setTargetAtTime(linearGain, this.audioCtx.currentTime, 0.05);
        this.currentLevelDisplay.textContent = `Current Level: ${this.currentLevelOffset > 0 ? '+' : ''}${this.currentLevelOffset} dB (Total: ${totalDb.toFixed(1)} dB)`;
    }

    startTest() {
        this.initAudio().then(() => {
            const startFreq = parseInt(document.getElementById('startFreq').value);
            const endFreq = parseInt(document.getElementById('endFreq').value);
            const stepFreq = parseInt(document.getElementById('stepFreq').value);

            this.testFrequencies = [];
            for (let f = startFreq; f <= endFreq; f += stepFreq) {
                this.testFrequencies.push(f);
            }

            if (this.testFrequencies.length === 0) {
                alert('Invalid frequency range.');
                return;
            }

            this.currentFreqIndex = 0;
            this.isTesting = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.adjustmentPanel.style.display = 'block';
            
            // Clear empty message if first result
            if (this.resultsLog.querySelector('.empty-msg')) {
                this.resultsLog.innerHTML = '';
            }

            this.setupAudioChain();
            this.runFrequencyStep();
        });
    }

    stopTest() {
        this.isTesting = false;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.adjustmentPanel.style.display = 'none';
        this.cleanupSource();
        this.currentFreqDisplay.textContent = 'Frequency: -- Hz';
        this.currentLevelDisplay.textContent = 'Current Level: -- dB (offset)';
    }

    cleanupSource() {
        if (this.oscillator) {
            this.oscillator.stop();
            this.oscillator.disconnect();
            this.oscillator = null;
        }
        if (this.noiseSource) {
            this.noiseSource.stop();
            this.noiseSource.disconnect();
            this.noiseSource = null;
        }
    }

    runFrequencyStep() {
        this.cleanupSource();
        if (this.currentFreqIndex >= this.testFrequencies.length) {
            this.stopTest();
            alert('Test completed!');
            return;
        }

        this.currentFreq = this.testFrequencies[this.currentFreqIndex];
        this.currentFreqDisplay.textContent = `Frequency: ${this.currentFreq} Hz`;
        
        // Reset offset only for the first frequency
        if (this.currentFreqIndex === 0) {
            this.currentLevelOffset = 0;
        }
        
        this.updateGain();

        const testType = document.getElementById('testType').value;
        if (testType === 'puretone') {
            this.startPureTone();
        } else {
            this.startNoise();
        }
    }

    startPureTone() {
        this.oscillator = this.audioCtx.createOscillator();
        this.oscillator.type = 'sine';
        this.oscillator.frequency.setValueAtTime(this.currentFreq, this.audioCtx.currentTime);
        this.oscillator.connect(this.gainNode);
        this.oscillator.start();
    }

    startNoise() {
        // Create band-limited noise around the target frequency
        const bufferSize = 2 * this.audioCtx.sampleRate;
        const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }

        this.noiseSource = this.audioCtx.createBufferSource();
        this.noiseSource.buffer = noiseBuffer;
        this.noiseSource.loop = true;

        // Band-pass filter to center the noise at currentFreq
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = this.currentFreq;
        filter.Q.value = 5; // Moderate selectivity

        this.noiseSource.connect(filter);
        filter.connect(this.gainNode);
        this.noiseSource.start();
    }

    adjustVolume(delta) {
        this.currentLevelOffset += delta;
        this.updateGain();
    }

    recordResultAndNext() {
        const baseLevel = parseFloat(document.getElementById('baseLevel').value);
        const earSide = document.getElementById('earSide').value;
        const totalLevel = baseLevel + this.currentLevelOffset;
        
        // Save to internal results array
        this.results.push({
            timestamp: new Date().toISOString(),
            frequency: this.currentFreq,
            earSide: earSide,
            baseLevel: baseLevel,
            offset: this.currentLevelOffset,
            totalLevel: totalLevel,
            soundType: document.getElementById('testType').value
        });

        // Update JSON output if it's visible
        if (this.jsonOutputContainer.style.display === 'block') {
            this.jsonOutput.value = JSON.stringify(this.results, null, 2);
        }

        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';
        resultItem.innerHTML = `
            <span><strong>${this.currentFreq} Hz</strong> (${earSide})</span>
            <span>Threshold: ${this.currentLevelOffset > 0 ? '+' : ''}${this.currentLevelOffset} dB (at ${totalLevel.toFixed(1)} dB)</span>
        `;
        this.resultsLog.appendChild(resultItem);
        this.resultsLog.scrollTop = this.resultsLog.scrollHeight;

        this.currentFreqIndex++;
        this.runFrequencyStep();
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new HearingTestApp();
});
