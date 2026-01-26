/**
 * NoiseShaper Web - Advanced FFT-based Filters
 * Implements Gaussian, Parabolic, and Plateau filters using frequency domain processing
 * 
 * Features:
 * - FFT-based frequency shaping filters
 * - Gaussian filter with skew and kurtosis controls
 * - Parabolic filter with asymmetric skew and flatness controls
 * - Plateau filter with flat center and cosine rolloff
 * - Real-time parameter updates
 * - Professional audio parameter ranges
 */

class AdvancedFilterManager {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.isConnected = false;
        this.isActive = false;
        this.listeners = new Map();
        
        // Filter configuration
        this.config = {
            type: 'gaussian',
            centerFreq: 1000,
            width: 500,
            gain: 0, // dB
            // Gaussian-specific
            skew: 0,
            kurtosis: 1,
            // Parabolic-specific
            flatness: 1,
            // Plateau-specific
            flatWidth: 100
        };
        
        // Available filter types
        this.filterTypes = [
            { value: 'gaussian', label: 'Gaussian' },
            { value: 'parabolic', label: 'Parabolic' },
            { value: 'plateau', label: 'Plateau' }
        ];
        
        // Parameter ranges
        this.ranges = {
            centerFreq: { min: 20, max: 20000, default: 1000 },
            width: { min: 50, max: 10000, default: 500 },
            gain: { min: -40, max: 40, default: 0 },
            skew: { min: -5, max: 5, default: 0 },
            kurtosis: { min: 0.2, max: 5, default: 1 },
            flatness: { min: 0.5, max: 3, default: 1 },
            flatWidth: { min: 10, max: 2000, default: 100 }
        };
        
        // Audio processing components
        this.inputNode = null;
        this.outputNode = null;
        this.processorNode = null;
        this.processorInitialized = false;
        
        this.setupProcessor();
    }
    
    /**
     * Set up AudioWorkletProcessor for FFT processing
     */
    async setupProcessor() {
        try {
            // Register the worklet processor
            await this.audioContext.audioWorklet.addModule('worklets/advanced-filter-processor.js');
            
            // Create the processor node
            this.processorNode = new AudioWorkletNode(this.audioContext, 'advanced-filter-processor');
            
            // Handle messages from the processor
            this.processorNode.port.onmessage = (event) => {
                const { type, data } = event.data;
                
                switch (type) {
                    case 'initialized':
                        this.processorInitialized = true;
                        console.log('Advanced filter processor initialized');
                        this.emit('processorReady');
                        break;
                    case 'error':
                        console.error('Advanced filter processor error:', data);
                        this.emit('error', data);
                        break;
                }
            };
            
            // Send initial configuration
            this.updateProcessorConfig();
            
            this.emit('filterReady', {
                types: this.filterTypes,
                ranges: this.ranges,
                config: this.config
            });
            
        } catch (error) {
            console.error('Failed to setup advanced filter processor:', error);
            this.emit('error', `Failed to setup advanced filter: ${error.message}`);
        }
    }
    
    /**
     * Update processor configuration
     */
    updateProcessorConfig() {
        if (!this.processorNode) return;
        
        this.processorNode.port.postMessage({
            type: 'config',
            data: {
                ...this.config,
                isActive: this.isActive,
                sampleRate: this.audioContext.sampleRate
            }
        });
    }
    
    /**
     * Connect the filter to the audio chain
     */
    connect(inputNode, outputNode) {
        if (!inputNode || !outputNode) {
            throw new Error('Both input and output nodes are required');
        }
        
        if (!this.processorNode) {
            throw new Error('Processor not initialized');
        }
        
        try {
            // Disconnect if already connected
            this.disconnect();
            
            // Store references
            this.inputNode = inputNode;
            this.outputNode = outputNode;
            
            // Connect: input → processor → output
            inputNode.connect(this.processorNode);
            this.processorNode.connect(outputNode);
            
            this.isConnected = true;
            this.emit('connected', { inputNode, outputNode });
            
        } catch (error) {
            this.emit('error', `Failed to connect advanced filter: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Disconnect the filter from the audio chain
     */
    disconnect() {
        if (this.isConnected && this.processorNode) {
            try {
                this.processorNode.disconnect();
                this.isConnected = false;
                this.emit('disconnected');
            } catch (error) {
                console.warn('Advanced filter disconnect warning:', error);
            }
        }
        
        this.inputNode = null;
        this.outputNode = null;
    }
    
    /**
     * Set filter type
     */
    setType(type) {
        if (!this.filterTypes.find(t => t.value === type)) {
            throw new Error(`Invalid filter type: ${type}`);
        }
        
        this.config.type = type;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'type', 
            value: type,
            config: this.config
        });
    }
    
    /**
     * Set center frequency
     */
    setCenterFreq(frequency) {
        frequency = Math.max(this.ranges.centerFreq.min, 
                           Math.min(this.ranges.centerFreq.max, frequency));
        
        this.config.centerFreq = frequency;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'centerFreq', 
            value: frequency,
            config: this.config
        });
    }
    
    /**
     * Set filter width
     */
    setWidth(width) {
        width = Math.max(this.ranges.width.min, 
                        Math.min(this.ranges.width.max, width));
        
        this.config.width = width;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'width', 
            value: width,
            config: this.config
        });
    }
    
    /**
     * Set filter gain
     */
    setGain(gain) {
        gain = Math.max(this.ranges.gain.min, 
                       Math.min(this.ranges.gain.max, gain));
        
        this.config.gain = gain;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'gain', 
            value: gain,
            config: this.config
        });
    }
    
    /**
     * Set skew parameter (Gaussian/Parabolic)
     */
    setSkew(skew) {
        skew = Math.max(this.ranges.skew.min, 
                       Math.min(this.ranges.skew.max, skew));
        
        this.config.skew = skew;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'skew', 
            value: skew,
            config: this.config
        });
    }
    
    /**
     * Set kurtosis parameter (Gaussian)
     */
    setKurtosis(kurtosis) {
        kurtosis = Math.max(this.ranges.kurtosis.min, 
                           Math.min(this.ranges.kurtosis.max, kurtosis));
        
        this.config.kurtosis = kurtosis;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'kurtosis', 
            value: kurtosis,
            config: this.config
        });
    }
    
    /**
     * Set flatness parameter (Parabolic)
     */
    setFlatness(flatness) {
        flatness = Math.max(this.ranges.flatness.min, 
                           Math.min(this.ranges.flatness.max, flatness));
        
        this.config.flatness = flatness;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'flatness', 
            value: flatness,
            config: this.config
        });
    }
    
    /**
     * Set flat width parameter (Plateau)
     */
    setFlatWidth(flatWidth) {
        flatWidth = Math.max(this.ranges.flatWidth.min, 
                            Math.min(this.ranges.flatWidth.max, flatWidth));
        
        this.config.flatWidth = flatWidth;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'flatWidth', 
            value: flatWidth,
            config: this.config
        });
    }
    
    /**
     * Calculate filter response for visualization
     */
    calculateResponse(frequencies) {
        if (!frequencies) return null;
        
        const magnitudeDB = new Float32Array(frequencies.length);
        const amplitude = Math.pow(10, this.config.gain / 20);
        
        for (let i = 0; i < frequencies.length; i++) {
            const freq = frequencies[i];
            let magnitude = 1.0;
            
            switch (this.config.type) {
                case 'gaussian':
                    magnitude = this.calculateGaussianMagnitude(freq);
                    break;
                case 'parabolic':
                    magnitude = this.calculateParabolicMagnitude(freq);
                    break;
                case 'plateau':
                    magnitude = this.calculatePlateauMagnitude(freq);
                    break;
            }
            
            // Apply gain and convert to dB
            magnitudeDB[i] = 20 * Math.log10(Math.max(magnitude * amplitude, 1e-6));
        }
        
        return {
            magnitudeDB: magnitudeDB,
            frequencies: frequencies
        };
    }
    
    /**
     * Calculate Gaussian filter magnitude response
     */
    calculateGaussianMagnitude(frequency) {
        const z = (frequency - this.config.centerFreq) / (this.config.width + 1e-10);
        const zSquared = z * z;
        const zKurtosis = Math.pow(zSquared, this.config.kurtosis);
        
        // Simplified skew implementation for visualization
        const skewFactor = 1 + 0.5 * this.config.skew * z;
        return Math.exp(-zKurtosis / 2) * Math.max(0, skewFactor);
    }
    
    /**
     * Calculate Parabolic filter magnitude response
     */
    calculateParabolicMagnitude(frequency) {
        const freqDiff = frequency - this.config.centerFreq;
        const normalizedDist = Math.abs(freqDiff) / this.config.width;
        
        if (normalizedDist > 1) return 0;
        
        let baseCurve = 1 - Math.pow(normalizedDist, 2.0 / this.config.flatness);
        
        // Apply skew
        if (this.config.skew !== 0) {
            const skewFactor = 1.0 + Math.abs(this.config.skew) / 5.0;
            if ((this.config.skew > 0 && freqDiff >= 0) || (this.config.skew < 0 && freqDiff < 0)) {
                baseCurve = 1 - Math.pow(normalizedDist, 2.0 * skewFactor / this.config.flatness);
            } else {
                baseCurve = 1 - Math.pow(normalizedDist, 2.0 / (this.config.flatness * skewFactor));
            }
        }
        
        return Math.max(0, baseCurve);
    }
    
    /**
     * Calculate Plateau filter magnitude response
     */
    calculatePlateauMagnitude(frequency) {
        const freqDiff = Math.abs(frequency - this.config.centerFreq);
        
        if (freqDiff < this.config.flatWidth) {
            return 1.0;
        } else if (freqDiff <= this.config.width) {
            return 0.5 * (1 + Math.cos(Math.PI * (freqDiff - this.config.flatWidth) / 
                                      (this.config.width - this.config.flatWidth)));
        } else {
            return 0.0;
        }
    }
    
    /**
     * Get display response for visualization
     */
    getDisplayResponse(displayWidth = 800, minFreq = 20, maxFreq = 20000) {
        const frequencies = new Float32Array(displayWidth);
        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);
        const logRange = logMax - logMin;
        
        for (let i = 0; i < displayWidth; i++) {
            const logFreq = logMin + (i / displayWidth) * logRange;
            frequencies[i] = Math.pow(10, logFreq);
        }
        
        return this.calculateResponse(frequencies);
    }
    
    /**
     * Enable/disable filter processing
     */
    setActive(active) {
        if (this.isActive === active) return;
        
        this.isActive = active;
        this.updateProcessorConfig();
        
        if (active) {
            this.emit('activated');
        } else {
            this.emit('deactivated');
        }
        
        this.emit('activeChanged', { active: this.isActive });
    }
    
    /**
     * Get current configuration
     */
    getConfig() {
        return {
            ...this.config,
            isActive: this.isActive,
            isConnected: this.isConnected,
            ranges: this.ranges,
            types: this.filterTypes
        };
    }
    
    /**
     * Update multiple parameters at once
     */
    updateConfig(newConfig) {
        let changed = false;
        
        Object.keys(newConfig).forEach(key => {
            if (this.config.hasOwnProperty(key) && this.config[key] !== newConfig[key]) {
                this.config[key] = newConfig[key];
                changed = true;
            }
        });
        
        if (changed) {
            this.updateProcessorConfig();
            this.emit('configUpdated', this.getConfig());
        }
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        this.disconnect();
        
        if (this.processorNode) {
            this.processorNode.port.close();
            this.processorNode = null;
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
                    console.error(`Error in advanced filter event listener for ${event}:`, error);
                }
            });
        }
    }
}

// Export for use in other modules
window.AdvancedFilterManager = AdvancedFilterManager;