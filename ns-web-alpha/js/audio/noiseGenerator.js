/**
 * NoiseShaper Web - Noise Generator
 * High-level interface for white noise generation and control
 * 
 * Features:
 * - Professional gain control with dB conversion
 * - Clean start/stop with fade in/out
 * - Real-time parameter updates
 * - Audio chain management
 */

class NoiseGenerator {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.noiseNode = null;
        this.gainNode = null;
        this.filterManager = null;
        this.analyzer = null;
        this.isPlaying = false;
        this.currentGain = 0.5; // 50% linear gain
        this.listeners = new Map();
        
        // Audio parameters
        this.fadeTime = 0.01; // 10ms fade to prevent clicks
        
        this.setupAudioChain();
    }
    
    /**
     * Set up the audio processing chain
     * NoiseWorklet → GainNode → BiquadFilterNode → AnalyserNode → AudioDestination
     */
    setupAudioChain() {
        if (!this.audioEngine.isInitialized) {
            throw new Error('Audio engine not initialized');
        }
        
        try {
            // Create noise generator node
            this.noiseNode = this.audioEngine.createNoiseGenerator();
            
            // Create gain node for volume control
            this.gainNode = this.audioEngine.audioContext.createGain();
            this.gainNode.gain.value = 0; // Start with silence
            
            // Create filter manager
            this.filterManager = new AudioFilterManager(this.audioEngine.audioContext);
            
            // Create FFT analyzer
            this.analyzer = new FFTAnalyzer(this.audioEngine.audioContext);
            
            // Connect audio chain: Noise → Gain → Filter → Output
            this.noiseNode.connect(this.gainNode);
            this.filterManager.connect(this.gainNode, this.audioEngine.audioContext.destination);
            
            // Connect analyzer to monitor the filtered signal
            this.analyzer.connect(this.filterManager.filterNode);
            
            // Handle messages from the noise processor
            this.noiseNode.port.onmessage = (event) => {
                const { type, data } = event.data;
                
                switch (type) {
                    case 'ready':
                        this.emit('ready');
                        break;
                    default:
                        this.emit('processorMessage', { type, data });
                }
            };
            
            // Forward analyzer events
            this.analyzer.on('analyzerReady', (data) => {
                this.emit('analyzerReady', data);
            });
            
            this.analyzer.on('error', (error) => {
                this.emit('error', `Analyzer: ${error}`);
            });
            
            // Forward filter events
            this.filterManager.on('filterReady', (data) => {
                this.emit('filterReady', data);
            });
            
            this.filterManager.on('parameterChanged', (data) => {
                this.emit('filterParameterChanged', data);
            });
            
            this.filterManager.on('error', (error) => {
                this.emit('error', `Filter: ${error}`);
            });
            
            this.emit('chainSetup', { 
                hasAnalyzer: true, 
                hasFilter: true 
            });
            
        } catch (error) {
            this.emit('error', `Failed to setup audio chain: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Start noise generation with smooth fade-in
     */
    async start() {
        if (this.isPlaying) {
            return;
        }
        
        try {
            // Ensure audio context is running
            await this.audioEngine.resumeContext();
            
            // Start the noise processor
            this.noiseNode.port.postMessage({ type: 'start' });
            
            // Start analyzer
            if (this.analyzer) {
                this.analyzer.start();
            }
            
            // Smooth fade-in
            const currentTime = this.audioEngine.audioContext.currentTime;
            this.gainNode.gain.cancelScheduledValues(currentTime);
            this.gainNode.gain.setValueAtTime(0, currentTime);
            this.gainNode.gain.linearRampToValueAtTime(this.currentGain, currentTime + this.fadeTime);
            
            this.isPlaying = true;
            this.emit('started');
            
        } catch (error) {
            this.emit('error', `Failed to start noise generation: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Stop noise generation with smooth fade-out
     */
    async stop() {
        if (!this.isPlaying) {
            return;
        }
        
        try {
            // Stop analyzer immediately
            if (this.analyzer) {
                this.analyzer.stop();
            }
            
            // Smooth fade-out
            const currentTime = this.audioEngine.audioContext.currentTime;
            this.gainNode.gain.cancelScheduledValues(currentTime);
            this.gainNode.gain.setValueAtTime(this.currentGain, currentTime);
            this.gainNode.gain.linearRampToValueAtTime(0, currentTime + this.fadeTime);
            
            // Stop the noise processor after fade-out
            setTimeout(() => {
                this.noiseNode.port.postMessage({ type: 'stop' });
            }, this.fadeTime * 1000 + 10); // Add small buffer
            
            this.isPlaying = false;
            this.emit('stopped');
            
        } catch (error) {
            this.emit('error', `Failed to stop noise generation: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Set gain using linear value (0-1)
     * @param {number} linearGain - Linear gain value 0-1
     */
    setGain(linearGain) {
        // Clamp to valid range
        linearGain = Math.max(0, Math.min(1, linearGain));
        this.currentGain = linearGain;
        
        // Update processor gain
        this.noiseNode.port.postMessage({ 
            type: 'setGain', 
            value: linearGain 
        });
        
        // Update output gain node if playing
        if (this.isPlaying) {
            const currentTime = this.audioEngine.audioContext.currentTime;
            this.gainNode.gain.linearRampToValueAtTime(linearGain, currentTime + 0.01);
        }
        
        this.emit('gainChanged', { 
            linearGain: linearGain,
            dbGain: this.linearToDb(linearGain)
        });
    }
    
    /**
     * Set gain using percentage (0-100)
     * @param {number} percentage - Gain percentage 0-100
     */
    setGainPercentage(percentage) {
        const linearGain = percentage / 100;
        this.setGain(linearGain);
    }
    
    /**
     * Convert linear gain to dB
     * @param {number} linearGain - Linear gain value 0-1
     * @returns {number} Gain in dB
     */
    linearToDb(linearGain) {
        if (linearGain === 0) {
            return -Infinity;
        }
        return 20 * Math.log10(linearGain);
    }
    
    /**
     * Convert dB to linear gain
     * @param {number} dbGain - Gain in dB
     * @returns {number} Linear gain value 0-1
     */
    dbToLinear(dbGain) {
        if (dbGain === -Infinity) {
            return 0;
        }
        return Math.pow(10, dbGain / 20);
    }
    
    /**
     * Convert percentage (0-100) to dB with logarithmic scaling
     * @param {number} percentage - Percentage 0-100
     * @returns {number} Gain in dB
     */
    percentageToDb(percentage) {
        if (percentage === 0) {
            return -Infinity;
        }
        
        // Logarithmic scaling: 0% = -∞ dB, 100% = 0 dB
        // Using exponential curve for professional feel
        const linearGain = Math.pow(percentage / 100, 2); // Square law for more control at low levels
        return this.linearToDb(linearGain);
    }
    
    /**
     * Get the FFT analyzer instance
     * @returns {FFTAnalyzer} The analyzer instance
     */
    getAnalyzer() {
        return this.analyzer;
    }
    
    /**
     * Get the filter manager instance
     * @returns {AudioFilterManager} The filter manager instance
     */
    getFilterManager() {
        return this.filterManager;
    }
    
    /**
     * Get current state
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            currentGain: this.currentGain,
            gainDb: this.linearToDb(this.currentGain),
            gainPercentage: this.currentGain * 100,
            hasAudioChain: this.noiseNode !== null && this.gainNode !== null,
            hasAnalyzer: this.analyzer !== null,
            hasFilter: this.filterManager !== null
        };
    }
    
    /**
     * Clean shutdown
     */
    destroy() {
        if (this.isPlaying) {
            this.stop();
        }
        
        if (this.analyzer) {
            this.analyzer.destroy();
            this.analyzer = null;
        }
        
        if (this.filterManager) {
            this.filterManager.destroy();
            this.filterManager = null;
        }
        
        if (this.noiseNode) {
            this.noiseNode.disconnect();
            this.noiseNode = null;
        }
        
        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }
        
        this.listeners.clear();
        this.emit('destroyed');
    }
    
    /**
     * Event emitter functionality
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
    
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
}

// Export for use in other modules
window.NoiseGenerator = NoiseGenerator; 