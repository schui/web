/**
 * NoiseShaper Web - Individual Track
 * Represents a single audio track with noise generation and filter chain
 * 
 * Features:
 * - Independent noise generation
 * - Multiple filters per track (filter chain)
 * - Individual gain and mute controls
 * - Real-time parameter updates
 */

class Track {
    constructor(id, audioEngine, masterMixNode) {
        this.id = id;
        this.audioEngine = audioEngine;
        this.masterMixNode = masterMixNode;
        
        // Audio nodes
        this.noiseNode = null;
        this.gainNode = null;
        this.filterChain = null;
        
        // State
        this.isPlaying = false;
        this.isMuted = false;
        this.currentGain = 1.0; // 100% linear gain (0dB) - matches Python default
        this.listeners = new Map();
        
        // Audio parameters
        this.fadeTime = 0.01; // 10ms fade to prevent clicks
        
        this.setupAudioChain();
    }
    
    /**
     * Set up the audio processing chain for this track
     * NoiseWorklet → FilterChain → GainNode → MasterGain
     */
    setupAudioChain() {
        if (!this.audioEngine.isInitialized) {
            throw new Error('Audio engine not initialized');
        }
        
        try {
            // Create noise generator node
            this.noiseNode = this.audioEngine.createNoiseGenerator();
            
            // Create track gain node
            this.gainNode = this.audioEngine.audioContext.createGain();
            this.gainNode.gain.value = 0; // Start with silence
            
            // Create filter chain
            this.filterChain = new FilterChain(this.audioEngine.audioContext);
            
            // Connect audio chain: Noise → FilterChain → TrackGain → MasterMix
            this.noiseNode.connect(this.filterChain.getInputNode());
            this.filterChain.connect(this.gainNode);
            this.gainNode.connect(this.masterMixNode);
            
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
            
            // Forward filter chain events
            this.filterChain.on('filterAdded', (data) => {
                this.emit('filterChanged', { action: 'added', ...data });
            });
            
            this.filterChain.on('filterRemoved', (data) => {
                this.emit('filterChanged', { action: 'removed', ...data });
            });
            
            this.filterChain.on('filterParameterChanged', (data) => {
                this.emit('filterChanged', { action: 'parameterChanged', ...data });
            });
            
            this.filterChain.on('error', (error) => {
                this.emit('error', `Filter Chain: ${error}`);
            });
            
            this.emit('chainSetup', { 
                trackId: this.id,
                hasFilterChain: true 
            });
            
        } catch (error) {
            this.emit('error', `Failed to setup audio chain: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Start noise generation for this track
     */
    async start() {
        if (this.isPlaying || this.isMuted) {
            return;
        }
        
        try {
            // Start the noise processor
            this.noiseNode.port.postMessage({ type: 'start' });
            
            // Smooth fade-in
            const currentTime = this.audioEngine.audioContext.currentTime;
            this.gainNode.gain.cancelScheduledValues(currentTime);
            this.gainNode.gain.setValueAtTime(0, currentTime);
            this.gainNode.gain.linearRampToValueAtTime(this.currentGain, currentTime + this.fadeTime);
            
            this.isPlaying = true;
            this.emit('stateChanged', { isPlaying: true });
            
        } catch (error) {
            this.emit('error', `Failed to start track: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Stop noise generation for this track
     */
    async stop() {
        if (!this.isPlaying) {
            return;
        }
        
        try {
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
            this.emit('stateChanged', { isPlaying: false });
            
        } catch (error) {
            this.emit('error', `Failed to stop track: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Set track gain using linear value (0-1)
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
        
        // Update output gain node if playing and not muted
        if (this.isPlaying && !this.isMuted) {
            const currentTime = this.audioEngine.audioContext.currentTime;
            this.gainNode.gain.linearRampToValueAtTime(linearGain, currentTime + 0.01);
        }
        
        this.emit('gainChanged', { 
            linearGain: linearGain,
            dbGain: this.linearToDb(linearGain)
        });
    }
    
    /**
     * Set track gain using percentage (0-100)
     * @param {number} percentage - Gain percentage 0-100
     */
    setGainPercentage(percentage) {
        const linearGain = percentage / 100;
        this.setGain(linearGain);
    }
    
    /**
     * Set mute state
     * @param {boolean} muted - Whether track should be muted
     */
    setMuted(muted) {
        this.isMuted = muted;
        
        if (this.isPlaying) {
            const currentTime = this.audioEngine.audioContext.currentTime;
            const targetGain = muted ? 0 : this.currentGain;
            this.gainNode.gain.linearRampToValueAtTime(targetGain, currentTime + 0.01);
        }
        
        this.emit('muteChanged', { isMuted: muted });
    }
    
    /**
     * Get the filter chain instance
     * @returns {FilterChain} The filter chain instance
     */
    getFilterChain() {
        return this.filterChain;
    }
    
    /**
     * Add a filter to this track's filter chain
     * @param {string} type - Filter type (lowpass, highpass, etc.)
     * @returns {Promise<number>} Filter index in the chain
     */
    async addFilter(type = 'lowpass') {
        return await this.filterChain.addFilter(type);
    }
    
    /**
     * Remove a filter from this track's filter chain
     * @param {number} filterIndex - Index of filter to remove
     */
    removeFilter(filterIndex) {
        this.filterChain.removeFilter(filterIndex);
    }
    
    /**
     * Get current state
     */
    getState() {
        return {
            id: this.id,
            isPlaying: this.isPlaying,
            isMuted: this.isMuted,
            currentGain: this.currentGain,
            gainDb: this.linearToDb(this.currentGain),
            gainPercentage: this.currentGain * 100,
            filterCount: this.filterChain ? this.filterChain.getFilterCount() : 0,
            filters: this.filterChain ? this.filterChain.getAllFilters() : [],
            hasAudioChain: this.noiseNode !== null && this.gainNode !== null,
            hasFilterChain: this.filterChain !== null
        };
    }
    
    /**
     * Get export configuration for this track
     */
    getExportConfig() {
        return {
            id: this.id,
            enabled: !this.isMuted,
            gain: this.currentGain,
            filters: this.filterChain ? this.filterChain.getExportConfig() : []
        };
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
     * Clean shutdown
     */
    destroy() {
        if (this.isPlaying) {
            this.stop();
        }
        
        if (this.filterChain) {
            this.filterChain.destroy();
            this.filterChain = null;
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
                    console.error(`Error in track ${this.id} event listener for ${event}:`, error);
                }
            });
        }
    }
}

// Export for use in other modules
window.Track = Track; 