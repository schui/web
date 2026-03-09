class HearingTestApp {
    constructor() {
        this.audioCtx = null;
        this.oscillator = null;
        this.noiseSource = null;
        this.gainNode = null;
        this.pulseGainNode = null;
        this.pannerNode = null;
        this.pulseInterval = null;
        
        this.isTesting = false;
        this.currentFreq = 0;
        this.currentLevelOffset = 0; // dB offset from base level
        this.testFrequencies = [];
        this.currentFreqIndex = 0;
        this.results = {
            soundType: '',
            left: [],
            right: []
        }; // Store results for JSON output

        // UI Elements
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.volUpBtn = document.getElementById('volUp');
        this.volDownBtn = document.getElementById('volDown');
        this.responseBtn = document.getElementById('responseBtn');
        this.responseStatus = document.getElementById('responseStatus');
        this.countdownTimer = document.getElementById('countdownTimer');
        this.manualControls = document.getElementById('manualControls');
        this.responseControls = document.getElementById('responseControls');
        this.adjustmentPanel = document.getElementById('adjustmentPanel');
        this.currentFreqDisplay = document.getElementById('currentFreqDisplay');
        this.currentLevelDisplay = document.getElementById('currentLevelDisplay');
        this.resultsLog = document.getElementById('resultsLog');
        this.clearResultsBtn = document.getElementById('clearResults');
        this.showJsonBtn = document.getElementById('showJsonBtn');
        this.jsonOutput = document.getElementById('jsonOutput');
        this.jsonOutputContainer = document.getElementById('jsonOutputContainer');
        this.testModeSelect = document.getElementById('testMode');
        this.beepIntervalConfig = document.getElementById('beepIntervalConfig');
        this.beepIntervalInput = document.getElementById('beepInterval');

        this.initEventListeners();
    }

    initEventListeners() {
        this.testModeSelect.addEventListener('change', () => this.toggleTestModeUI());
        this.startBtn.addEventListener('click', () => this.startTest());
        this.stopBtn.addEventListener('click', () => this.stopTest());
        this.nextBtn.addEventListener('click', () => this.recordResultAndNext());
        this.volUpBtn.addEventListener('click', () => this.adjustVolume(1));
        this.volDownBtn.addEventListener('click', () => this.adjustVolume(-1));
        this.responseBtn.addEventListener('click', () => this.handleResponse());
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
                    if (document.getElementById('testMode').value === 'audiologist') {
                        this.handleResponse();
                    } else {
                        this.recordResultAndNext();
                    }
                    e.preventDefault();
                    break;
                case 'Escape':
                    this.stopTest();
                    e.preventDefault();
                    break;
                case 'Space':
                    if (document.getElementById('testMode').value === 'audiologist') {
                        this.handleResponse();
                    } else {
                        this.stopTest();
                    }
                    e.preventDefault();
                    break;
            }
        });
    }

    clearResults() {
        this.results = {
            soundType: '',
            left: [],
            right: []
        };
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

    toggleTestModeUI() {
        if (this.testModeSelect.value === 'audiologist') {
            this.beepIntervalConfig.style.display = 'flex';
        } else {
            this.beepIntervalConfig.style.display = 'none';
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
        this.pulseGainNode = this.audioCtx.createGain();
        this.pannerNode = this.audioCtx.createStereoPanner();
        
        this.gainNode.connect(this.pulseGainNode);
        this.pulseGainNode.connect(this.pannerNode);
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
        this.testMode = document.getElementById('testMode').value;
        this.startBtn.disabled = true;
        this.stopBtn.disabled = false;
        this.adjustmentPanel.style.display = 'block';

        if (this.testMode === 'audiologist') {
            this.manualControls.style.display = 'none';
            this.responseControls.style.display = 'block';
            this.responseBtn.disabled = true;
            this.responseStatus.textContent = 'Preparing...';
            this.consecutiveSuccesses = 0;
            this.consecutiveFailures = 0;
            this.isBeeping = false;
        } else {
            this.manualControls.style.display = 'block';
            this.responseControls.style.display = 'none';
        }
        
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
        if (this.audiologistTimeout) clearTimeout(this.audiologistTimeout);
        if (this.beepTimeout) clearTimeout(this.beepTimeout);
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        this.adjustmentPanel.style.display = 'none';
        this.cleanupSource();
        this.currentFreqDisplay.textContent = 'Frequency: -- Hz';
        this.currentLevelDisplay.textContent = 'Current Level: -- dB (offset)';
        if (this.countdownTimer) this.countdownTimer.textContent = '--';
    }

    cleanupSource() {
        if (this.pulseInterval) {
            clearInterval(this.pulseInterval);
            this.pulseInterval = null;
        }
        if (this.pulseGainNode) {
            this.pulseGainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
            this.pulseGainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.05);
        }
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

        if (this.testMode === 'audiologist') {
            this.consecutiveSuccesses = 0;
            this.consecutiveFailures = 0;
            this.startAudiologistCycle();
        } else {
            this.startNormalSound();
        }
    }

    startNormalSound() {
        const pulseMode = document.getElementById('pulseMode').value;
        if (pulseMode === 'pulsed') {
            this.pulseGainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
            this.pulseGainNode.gain.setValueAtTime(0, this.audioCtx.currentTime);
            this.startPulsing();
        } else {
            if (this.pulseInterval) {
                clearInterval(this.pulseInterval);
                this.pulseInterval = null;
            }
            this.pulseGainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
            this.pulseGainNode.gain.setTargetAtTime(1, this.audioCtx.currentTime, 0.05);
        }

        const testType = document.getElementById('testType').value;
        if (testType === 'puretone') {
            this.startPureTone();
        } else {
            this.startNoise();
        }
    }

    startAudiologistCycle() {
        if (!this.isTesting) return;
        
        this.cleanupSource();
        if (this.audiologistTimeout) clearTimeout(this.audiologistTimeout);
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        
        this.isBeeping = false;
        this.responseBtn.disabled = true;
        this.responseStatus.textContent = 'Waiting for beep...';

        // Get configurable interval
        const intervalSeconds = parseInt(this.beepIntervalInput.value) || 4;
        let secondsLeft = intervalSeconds;
        this.countdownTimer.textContent = secondsLeft;
        
        this.countdownInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft >= 0) {
                this.countdownTimer.textContent = secondsLeft;
            }
            if (secondsLeft <= 0) {
                clearInterval(this.countdownInterval);
            }
        }, 1000);
        
        this.audiologistTimeout = setTimeout(() => {
            if (!this.isTesting) return;
            this.playAudiologistBeep();
        }, intervalSeconds * 1000);
    }

    playAudiologistBeep() {
        this.isBeeping = true;
        this.responseBtn.disabled = false;
        this.responseStatus.textContent = 'DID YOU HEAR THAT?';
        if (this.countdownTimer) this.countdownTimer.textContent = '0';
        
        const testType = document.getElementById('testType').value;
        if (testType === 'puretone') {
            this.startPureTone();
        } else {
            this.startNoise();
        }

        // Tone duration: 1 second
        this.pulseGainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.pulseGainNode.gain.setTargetAtTime(1, this.audioCtx.currentTime, 0.05);
        this.pulseGainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime + 1.0, 0.05);

        this.beepTimeout = setTimeout(() => {
            if (!this.isTesting || !this.isBeeping) return;
            // User didn't respond in time
            this.handleMiss();
        }, 2000); // 2 seconds to respond (1s beep + 1s silence)
    }

    handleResponse() {
        if (!this.isTesting || this.testMode !== 'audiologist') return;
        
        if (this.isBeeping) {
            // Success!
            this.isBeeping = false;
            clearTimeout(this.beepTimeout);
            this.cleanupSource();
            
            this.responseStatus.textContent = 'Heard it!';
            this.consecutiveSuccesses++;
            this.consecutiveFailures = 0;
            
            if (this.consecutiveSuccesses >= 2) {
                // We found a threshold (or at least we want to go lower)
                // In a real Hughson-Westlake, we go down 10dB after success
                // and up 5dB after failure.
                // For simplicity here, let's just go down 5dB until they miss twice.
                this.currentLevelOffset -= 5;
                this.updateGain();
                this.consecutiveSuccesses = 0;
                setTimeout(() => this.startAudiologistCycle(), 1000);
            } else {
                // One more success at this level to be sure? 
                // Let's just go down immediately for better UX in a web app.
                this.currentLevelOffset -= 5;
                this.updateGain();
                setTimeout(() => this.startAudiologistCycle(), 1000);
            }
        } else {
            // False positive
            this.responseStatus.textContent = 'False alarm!';
            // Just wait and try again
        }
    }

    handleMiss() {
        this.isBeeping = false;
        this.cleanupSource();
        this.responseStatus.textContent = 'Missed it.';
        
        this.consecutiveFailures++;
        this.consecutiveSuccesses = 0;
        
        if (this.consecutiveFailures >= 2) {
            // Two misses in a row means the threshold is probably the PREVIOUS level
            // but since we go down 5dB each time, let's say it's current + 5.
            this.currentLevelOffset += 5;
            this.recordResultAndNext();
        } else {
            // Try going up
            this.currentLevelOffset += 5;
            this.updateGain();
            setTimeout(() => this.startAudiologistCycle(), 1000);
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

    startPulsing() {
        if (this.pulseInterval) clearInterval(this.pulseInterval);
        
        const pulseOn = 0.5; // 500ms on
        const pulseOff = 0.5; // 500ms off
        const rampTime = 0.05; // 50ms ramp
        
        const cycle = () => {
            if (!this.isTesting || !this.pulseGainNode || !this.audioCtx) return;
            const now = this.audioCtx.currentTime;
            // Ensure we are not scheduling too far in the future or past
            this.pulseGainNode.gain.setTargetAtTime(1, now, rampTime);
            this.pulseGainNode.gain.setTargetAtTime(0, now + pulseOn, rampTime);
        };

        cycle();
        this.pulseInterval = setInterval(cycle, (pulseOn + pulseOff) * 1000);
    }

    adjustVolume(delta) {
        this.currentLevelOffset += delta;
        this.updateGain();
    }

    recordResultAndNext() {
        const baseLevel = parseFloat(document.getElementById('baseLevel').value);
        const earSide = document.getElementById('earSide').value;
        const totalLevel = baseLevel + this.currentLevelOffset;
        const soundType = document.getElementById('testType').value;
        
        // Save to internal results object
        this.results.soundType = soundType;
        if (earSide === 'left' || earSide === 'right') {
            this.results[earSide].push({
                frequency: this.currentFreq,
                offset: this.currentLevelOffset
            });
        }

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
