/**
 * NoiseShaper Web - FFT Analyzer
 * Real-time spectrum analysis using Web Audio API AnalyserNode
 * 
 * Features:
 * - High-resolution FFT analysis (configurable size: 512-4096)
 * - Logarithmic frequency scaling (20 Hz - 20 kHz)
 * - Professional dB magnitude display (-120 to 0 dB)
 * - Efficient data processing for real-time visualization
 * - Frequency bin mapping and smoothing
 */

class FFTAnalyzer {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.analyserNode = null;
        this.isConnected = false;
        this.isActive = false;
        
        // FFT Configuration
        this.fftSize = 2048; // Good balance of resolution and performance
        this.smoothingTimeConstant = 0.8; // Smooth visualization
        this.minDecibels = -120;
        this.maxDecibels = 0;
        this.windowType = 'hann'; // Window function (not directly supported by Web Audio, for display only)
        this.scaleType = 'logarithmic'; // 'logarithmic' or 'linear'
        this.averagingCount = 1; // Manual averaging
        
        // Frequency range for display
        this.minFrequency = 20; // Hz
        this.maxFrequency = 20000; // Hz
        
        // Averaging support
        this.averagingBuffer = [];
        this.averagingIndex = 0;
        
        // Data arrays
        this.frequencyData = null;
        this.frequencies = null;
        this.binIndices = null;
        
        // Callbacks
        this.listeners = new Map();
        
        this.setupAnalyzer();
    }
    
    /**
     * Set up the AnalyserNode with optimal settings
     */
    setupAnalyzer() {
        try {
            this.analyserNode = this.audioContext.createAnalyser();
            
            // Configure analyzer
            this.analyserNode.fftSize = this.fftSize;
            this.analyserNode.smoothingTimeConstant = this.smoothingTimeConstant;
            this.analyserNode.minDecibels = this.minDecibels;
            this.analyserNode.maxDecibels = this.maxDecibels;
            
            // Initialize data arrays
            const bufferLength = this.analyserNode.frequencyBinCount;
            this.frequencyData = new Float32Array(bufferLength);
            
            // Pre-calculate frequency mappings for efficiency
            this.calculateFrequencyMappings();
            
            this.emit('analyzerReady', {
                fftSize: this.fftSize,
                sampleRate: this.audioContext.sampleRate,
                binCount: bufferLength,
                frequencyResolution: this.audioContext.sampleRate / this.fftSize
            });
            
        } catch (error) {
            this.emit('error', `Failed to setup analyzer: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Pre-calculate frequency mappings for logarithmic display
     */
    calculateFrequencyMappings() {
        const sampleRate = this.audioContext.sampleRate;
        const nyquist = sampleRate / 2;
        const binCount = this.analyserNode.frequencyBinCount;
        
        // Calculate frequency for each bin
        this.frequencies = new Float32Array(binCount);
        for (let i = 0; i < binCount; i++) {
            this.frequencies[i] = (i * nyquist) / binCount;
        }
        
        // Pre-calculate which bins to use for logarithmic display
        this.calculateDisplayBins();
    }
    
    /**
     * Calculate bin indices for frequency display (logarithmic or linear)
     * @param {number} displayWidth - Width of display in pixels
     */
    calculateDisplayBins(displayWidth = 800) {
        this.binIndices = new Array(displayWidth);
        
        if (this.scaleType === 'logarithmic') {
            // Logarithmic scaling
            const logMin = Math.log10(this.minFrequency);
            const logMax = Math.log10(this.maxFrequency);
            const logRange = logMax - logMin;
            
            for (let x = 0; x < displayWidth; x++) {
                const logFreq = logMin + (x / displayWidth) * logRange;
                const frequency = Math.pow(10, logFreq);
                const bin = Math.round((frequency * this.fftSize) / this.audioContext.sampleRate);
                this.binIndices[x] = Math.min(bin, this.frequencyData.length - 1);
            }
        } else {
            // Linear scaling
            const freqRange = this.maxFrequency - this.minFrequency;
            
            for (let x = 0; x < displayWidth; x++) {
                const frequency = this.minFrequency + (x / displayWidth) * freqRange;
                const bin = Math.round((frequency * this.fftSize) / this.audioContext.sampleRate);
                this.binIndices[x] = Math.min(bin, this.frequencyData.length - 1);
            }
        }
    }
    
    /**
     * Connect the analyzer to an audio node
     * @param {AudioNode} sourceNode - Audio node to analyze
     */
    connect(sourceNode) {
        if (!sourceNode) {
            throw new Error('Source node is required');
        }
        
        try {
            // Disconnect if already connected
            this.disconnect();
            
            // Connect for analysis (doesn't affect audio flow)
            sourceNode.connect(this.analyserNode);
            this.isConnected = true;
            
            this.emit('connected', { sourceNode });
            
        } catch (error) {
            this.emit('error', `Failed to connect analyzer: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Disconnect the analyzer
     */
    disconnect() {
        if (this.isConnected && this.analyserNode) {
            try {
                this.analyserNode.disconnect();
                this.isConnected = false;
                this.emit('disconnected');
            } catch (error) {
                // Ignore disconnect errors
                console.warn('Analyzer disconnect warning:', error);
            }
        }
    }
    
    /**
     * Start real-time analysis
     */
    start() {
        if (!this.isConnected) {
            throw new Error('Analyzer not connected to audio source');
        }
        
        this.isActive = true;
        this.emit('started');
    }
    
    /**
     * Stop real-time analysis
     */
    stop() {
        this.isActive = false;
        this.emit('stopped');
    }
    
    /**
     * Get current frequency data
     * @returns {Float32Array} Frequency data in dB
     */
    getFrequencyData() {
        if (!this.analyserNode || !this.isActive) {
            return null;
        }
        
        // Get current frequency data
        this.analyserNode.getFloatFrequencyData(this.frequencyData);
        
        return this.frequencyData;
    }
    
    /**
     * Get frequency data mapped for display with averaging support
     * @param {number} displayWidth - Width of display in pixels
     * @returns {Float32Array} Mapped frequency data
     */
    getDisplayData(displayWidth = 800) {
        const rawData = this.getFrequencyData();
        if (!rawData) {
            return null;
        }
        
        // Recalculate bins if display width changed or scale type changed
        if (!this.binIndices || this.binIndices.length !== displayWidth) {
            this.calculateDisplayBins(displayWidth);
        }
        
        // Map data to display bins
        const displayData = new Float32Array(displayWidth);
        
        for (let x = 0; x < displayWidth; x++) {
            const binIndex = this.binIndices[x];
            displayData[x] = rawData[binIndex];
        }
        
        // Apply averaging if enabled
        if (this.averagingCount > 1) {
            return this.applyAveraging(displayData);
        }
        
        return displayData;
    }
    
    /**
     * Apply averaging to frequency data
     * @param {Float32Array} currentData - Current frame data
     * @returns {Float32Array} Averaged data
     */
    applyAveraging(currentData) {
        const length = currentData.length;
        
        // Initialize averaging buffer if needed
        if (this.averagingBuffer.length !== this.averagingCount) {
            this.averagingBuffer = [];
            for (let i = 0; i < this.averagingCount; i++) {
                this.averagingBuffer.push(new Float32Array(length));
            }
            this.averagingIndex = 0;
        }
        
        // Store current data in circular buffer
        this.averagingBuffer[this.averagingIndex].set(currentData);
        this.averagingIndex = (this.averagingIndex + 1) % this.averagingCount;
        
        // Calculate average
        const averaged = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            let sum = 0;
            for (let j = 0; j < this.averagingBuffer.length; j++) {
                sum += this.averagingBuffer[j][i];
            }
            averaged[i] = sum / this.averagingBuffer.length;
        }
        
        return averaged;
    }
    
    /**
     * Get frequency value for a display position
     * @param {number} x - Display position (0 to width)
     * @param {number} width - Total display width
     * @returns {number} Frequency in Hz
     */
    getFrequencyAtPosition(x, width) {
        if (this.scaleType === 'logarithmic') {
            const logMin = Math.log10(this.minFrequency);
            const logMax = Math.log10(this.maxFrequency);
            const logRange = logMax - logMin;
            
            const logFreq = logMin + (x / width) * logRange;
            return Math.pow(10, logFreq);
        } else {
            // Linear scaling
            const freqRange = this.maxFrequency - this.minFrequency;
            return this.minFrequency + (x / width) * freqRange;
        }
    }
    
    /**
     * Get analysis configuration
     */
    getConfig() {
        return {
            fftSize: this.fftSize,
            sampleRate: this.audioContext.sampleRate,
            binCount: this.analyserNode ? this.analyserNode.frequencyBinCount : 0,
            frequencyResolution: this.audioContext.sampleRate / this.fftSize,
            minFrequency: this.minFrequency,
            maxFrequency: this.maxFrequency,
            minDecibels: this.minDecibels,
            maxDecibels: this.maxDecibels,
            smoothing: this.smoothingTimeConstant,
            windowType: this.windowType,
            scaleType: this.scaleType,
            averagingCount: this.averagingCount
        };
    }
    
    /**
     * Update analyzer configuration
     * @param {Object} config - Configuration options
     */
    updateConfig(config) {
        let changed = false;
        
        if (config.fftSize && config.fftSize !== this.fftSize) {
            this.fftSize = config.fftSize;
            this.analyserNode.fftSize = this.fftSize;
            
            // Reinitialize data arrays
            const bufferLength = this.analyserNode.frequencyBinCount;
            this.frequencyData = new Float32Array(bufferLength);
            this.calculateFrequencyMappings();
            
            // Clear averaging buffer since data size changed
            this.averagingBuffer = [];
            this.averagingIndex = 0;
            changed = true;
        }
        
        if (config.smoothingTimeConstant !== undefined && config.smoothingTimeConstant !== this.smoothingTimeConstant) {
            this.smoothingTimeConstant = config.smoothingTimeConstant;
            this.analyserNode.smoothingTimeConstant = this.smoothingTimeConstant;
            changed = true;
        }
        
        if (config.minDecibels !== undefined && config.minDecibels !== this.minDecibels) {
            this.minDecibels = config.minDecibels;
            this.analyserNode.minDecibels = this.minDecibels;
            changed = true;
        }
        
        if (config.maxDecibels !== undefined && config.maxDecibels !== this.maxDecibels) {
            this.maxDecibels = config.maxDecibels;
            this.analyserNode.maxDecibels = this.maxDecibels;
            changed = true;
        }
        
        if (config.windowType && config.windowType !== this.windowType) {
            this.windowType = config.windowType;
            changed = true;
        }
        
        if (config.scaleType && config.scaleType !== this.scaleType) {
            this.scaleType = config.scaleType;
            // Force recalculation of display bins
            this.binIndices = null;
            changed = true;
        }
        
        if (config.averagingCount !== undefined && config.averagingCount !== this.averagingCount) {
            this.averagingCount = Math.max(1, Math.min(10, config.averagingCount));
            // Clear averaging buffer when count changes
            this.averagingBuffer = [];
            this.averagingIndex = 0;
            changed = true;
        }
        
        if (changed) {
            this.emit('configUpdated', this.getConfig());
        }
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        this.stop();
        this.disconnect();
        
        if (this.analyserNode) {
            this.analyserNode = null;
        }
        
        this.frequencyData = null;
        this.frequencies = null;
        this.binIndices = null;
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
                    console.error(`Error in analyzer event listener for ${event}:`, error);
                }
            });
        }
    }
}

// Export for use in other modules
window.FFTAnalyzer = FFTAnalyzer; 