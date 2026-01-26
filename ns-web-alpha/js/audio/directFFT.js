/**
 * NoiseShaper Web - Direct FFT Manager
 * 
 * Manager class for the research-validated direct FFT processor
 * Replaces AdvancedFilterManager to eliminate harmonic artifacts
 * 
 * Features:
 * - Ring buffer AudioWorklet management
 * - Smooth filter mask generation
 * - Performance monitoring and optimization
 * - Identical API to AdvancedFilterManager for seamless transition
 * - Professional audio quality with artifact elimination
 */

class DirectFFTManager {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.isConnected = false;
        this.isActive = false;
        this.listeners = new Map();
        
        // Filter configuration - identical API to AdvancedFilterManager
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
        
        // Parameter ranges - identical to AdvancedFilterManager
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
        
        // Performance monitoring
        this.performanceData = {
            averageMs: 0,
            maxMs: 0,
            minMs: 0,
            processCount: 0,
            bufferUtilization: 0
        };
        
        this.setupProcessor();
    }
    
    /**
     * Set up the direct FFT AudioWorklet processor
     */
    async setupProcessor() {
        try {
            console.log('DirectFFTManager: Setting up direct FFT processor...');
            
            // Register the worklet processor
            await this.audioContext.audioWorklet.addModule('worklets/direct-fft-processor.js');
            
            // Create the processor node
            this.processorNode = new AudioWorkletNode(this.audioContext, 'direct-fft-processor', {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [1],
                processorOptions: {
                    sampleRate: this.audioContext.sampleRate
                }
            });
            
            // Handle messages from the processor
            this.processorNode.port.onmessage = (event) => {
                this.handleProcessorMessage(event.data);
            };
            
            // Handle processor errors
            this.processorNode.onprocessorerror = (event) => {
                console.error('DirectFFTManager: Processor error:', event);
                this.emit('error', `Direct FFT processor error: ${event.message}`);
            };
            
            console.log('DirectFFTManager: Processor setup complete');
            
        } catch (error) {
            console.error('DirectFFTManager: Failed to setup processor:', error);
            this.emit('error', `Failed to setup direct FFT processor: ${error.message}`);
        }
    }
    
    /**
     * Handle messages from the AudioWorklet processor
     */
    handleProcessorMessage(message) {
        const { type, data } = message;
        
        switch (type) {
            case 'initialized':
                this.processorInitialized = true;
                console.log('DirectFFTManager: Processor initialized', data);
                
                // Store FFT initialization info
                this.fftInfo = data.fftInfo || null;
                
                this.emit('processorReady', data);
                
                // Send initial configuration
                this.updateProcessorConfig();
                
                this.emit('filterReady', {
                    types: this.filterTypes,
                    ranges: this.ranges,
                    config: this.config,
                    fftInfo: this.fftInfo
                });
                break;
                
            case 'performance':
                this.performanceData = { ...data };
                this.emit('performance', data);
                break;
                
            case 'fftInfo':
                this.fftInfo = data;
                this.emit('fftInfo', data);
                break;
                
            case 'fftUpgrade':
                console.log('DirectFFTManager: WebAssembly FFT upgrade available:', data);
                this.emit('fftUpgrade', data);
                break;
                
            case 'fftSwitchResult':
                console.log('DirectFFTManager: FFT switch result:', data);
                if (data.success) {
                    this.fftInfo = data.info;
                }
                this.emit('fftSwitchResult', data);
                break;
                
            case 'error':
                console.error('DirectFFTManager: Processor error:', data);
                this.emit('error', data);
                break;
                
            case 'debug':
                // Handle debug messages from processor (can be ignored in production)
                break;
                
            case 'criticalError':
                console.error('DirectFFTManager: Critical processor error:', data);
                this.emit('criticalError', data);
                break;
                
            default:
                console.warn('DirectFFTManager: Unknown message type:', type);
        }
    }
    
    /**
     * Update processor configuration
     */
    updateProcessorConfig() {
        if (!this.processorNode || !this.processorInitialized) {
            return;
        }
        
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
     * Connect the processor to audio graph
     */
    connect(source, destination) {
        if (!this.processorNode) {
            throw new Error('Processor not initialized');
        }
        
        try {
            // Connect: source → processor → destination
            source.connect(this.processorNode);
            this.processorNode.connect(destination);
            
            this.isConnected = true;
            
            console.log('DirectFFTManager: Connected to audio graph');
            
        } catch (error) {
            console.error('DirectFFTManager: Connection failed:', error);
            throw error;
        }
    }
    
    /**
     * Disconnect from audio graph
     */
    disconnect() {
        if (this.processorNode && this.isConnected) {
            try {
                this.processorNode.disconnect();
                this.isConnected = false;
                
                console.log('DirectFFTManager: Disconnected from audio graph');
                
            } catch (error) {
                console.error('DirectFFTManager: Disconnect failed:', error);
            }
        }
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
    setCenterFreq(freq) {
        const { min, max } = this.ranges.centerFreq;
        freq = Math.max(min, Math.min(max, freq));
        
        this.config.centerFreq = freq;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'centerFreq', 
            value: freq,
            config: this.config
        });
    }
    
    /**
     * Set filter width
     */
    setWidth(width) {
        const { min, max } = this.ranges.width;
        width = Math.max(min, Math.min(max, width));
        
        this.config.width = width;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'width', 
            value: width,
            config: this.config
        });
    }
    
    /**
     * Set gain in dB
     */
    setGain(gain) {
        const { min, max } = this.ranges.gain;
        gain = Math.max(min, Math.min(max, gain));
        
        this.config.gain = gain;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'gain', 
            value: gain,
            config: this.config
        });
    }
    
    /**
     * Set skew parameter
     */
    setSkew(skew) {
        const { min, max } = this.ranges.skew;
        skew = Math.max(min, Math.min(max, skew));
        
        this.config.skew = skew;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'skew', 
            value: skew,
            config: this.config
        });
    }
    
    /**
     * Set kurtosis parameter
     */
    setKurtosis(kurtosis) {
        const { min, max } = this.ranges.kurtosis;
        kurtosis = Math.max(min, Math.min(max, kurtosis));
        
        this.config.kurtosis = kurtosis;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'kurtosis', 
            value: kurtosis,
            config: this.config
        });
    }
    
    /**
     * Set flatness parameter
     */
    setFlatness(flatness) {
        const { min, max } = this.ranges.flatness;
        flatness = Math.max(min, Math.min(max, flatness));
        
        this.config.flatness = flatness;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'flatness', 
            value: flatness,
            config: this.config
        });
    }
    
    /**
     * Set flat width parameter
     */
    setFlatWidth(flatWidth) {
        const { min, max } = this.ranges.flatWidth;
        flatWidth = Math.max(min, Math.min(max, flatWidth));
        
        this.config.flatWidth = flatWidth;
        this.updateProcessorConfig();
        
        this.emit('parameterChanged', { 
            parameter: 'flatWidth', 
            value: flatWidth,
            config: this.config
        });
    }
    
    /**
     * Calculate filter response for visualization - Research-validated formulas
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
     * Calculate Gaussian filter magnitude response (matches Python formula)
     */
    calculateGaussianMagnitude(frequency) {
        const freqDiff = frequency - this.config.centerFreq;
        
        // Match Python formula exactly: z = (freq - center) / width
        const z = freqDiff / (this.config.width + 1e-10);
        const zSquared = z * z;
        const zKurtosis = Math.pow(zSquared, this.config.kurtosis);
        
        // Base Gaussian curve (matches Python)
        let magnitude = Math.exp(-zKurtosis / 2);
        
        // Apply skew using error function approximation (matches Python)
        if (this.config.skew !== 0) {
            const skewTerm = 1 + this.erf(this.config.skew * z / Math.sqrt(2));
            magnitude *= Math.max(0, skewTerm);
        }
        
        return magnitude;
    }
    
    /**
     * Calculate Parabolic filter magnitude response (matches Python approach)
     */
    calculateParabolicMagnitude(frequency) {
        const freqDiff = frequency - this.config.centerFreq;
        const normalizedDist = Math.abs(freqDiff) / this.config.width;
        
        if (normalizedDist > 1.0) return 0;
        
        // Base parabolic curve
        let baseCurve = 1 - Math.pow(normalizedDist, 2.0 / this.config.flatness);
        
        // Apply skew asymmetrically (matches Python logic)
        if (this.config.skew !== 0) {
            const skewFactor = 1.0 + Math.abs(this.config.skew) / 5.0;
            
            if ((this.config.skew > 0 && freqDiff >= 0) || 
                (this.config.skew < 0 && freqDiff < 0)) {
                baseCurve = 1 - Math.pow(normalizedDist, 2.0 * skewFactor / this.config.flatness);
            } else {
                baseCurve = 1 - Math.pow(normalizedDist, 2.0 / (this.config.flatness * skewFactor));
            }
        }
        
        // Apply Hanning window smoothing for artifact prevention
        const halfWidth = this.config.width / 2;
        const startFreq = this.config.centerFreq - halfWidth;
        const endFreq = this.config.centerFreq + halfWidth;
        const relativePos = (frequency - startFreq) / (endFreq - startFreq);
        const hanningSmooth = 0.5 * (1 - Math.cos(2 * Math.PI * relativePos));
        
        return Math.max(0, baseCurve * hanningSmooth);
    }
    
    /**
     * Calculate Plateau filter magnitude response
     */
    calculatePlateauMagnitude(frequency) {
        const halfFlatWidth = this.config.flatWidth / 2;
        const transitionWidth = (this.config.width - this.config.flatWidth) / 2;
        const riseCenter = this.config.centerFreq - halfFlatWidth;
        const fallCenter = this.config.centerFreq + halfFlatWidth;
        const widthFactor = Math.sqrt(2);
        
        // Smooth sigmoid transitions using erf
        const rise = 0.5 * (1 + this.erf((frequency - riseCenter) / (transitionWidth / widthFactor)));
        const fall = 0.5 * (1 - this.erf((frequency - fallCenter) / (transitionWidth / widthFactor)));
        
        return rise * fall;
    }
    
    /**
     * Error function approximation
     */
    erf(x) {
        // Abramowitz and Stegun approximation
        const a1 =  0.254829592;
        const a2 = -0.284496736;
        const a3 =  1.421413741;
        const a4 = -1.453152027;
        const a5 =  1.061405429;
        const p  =  0.3275911;
        
        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);
        
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        
        return sign * y;
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
     * Get FFT implementation information
     */
    getFFTInfo() {
        if (!this.processorNode || !this.processorInitialized) {
            return null;
        }
        
        this.processorNode.port.postMessage({
            type: 'getFFTInfo'
        });
        
        return this.fftInfo;
    }
    
    /**
     * Switch FFT implementation (for testing and optimization)
     */
    switchFFTImplementation(implementationName) {
        if (!this.processorNode || !this.processorInitialized) {
            throw new Error('Processor not initialized');
        }
        
        this.processorNode.port.postMessage({
            type: 'switchFFT',
            data: { implementation: implementationName }
        });
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
            types: this.filterTypes,
            performance: this.performanceData
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
     * Get performance data
     */
    getPerformance() {
        if (this.processorNode && this.processorInitialized) {
            this.processorNode.port.postMessage({ type: 'getPerformance' });
        }
        return this.performanceData;
    }
    
    /**
     * Event listener management
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
                    console.error(`DirectFFTManager: Error in event listener for ${event}:`, error);
                }
            });
        }
    }
    
    /**
     * Cleanup resources
     */
    destroy() {
        this.disconnect();
        
        if (this.processorNode) {
            this.processorNode.port.onmessage = null;
            this.processorNode.onprocessorerror = null;
        }
        
        this.listeners.clear();
        
        console.log('DirectFFTManager: Destroyed');
    }
} 