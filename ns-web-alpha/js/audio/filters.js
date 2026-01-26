/**
 * NoiseShaper Web - Audio Filter Manager
 * Professional BiquadFilterNode management with real-time parameter control
 * 
 * Features:
 * - Multiple filter types (lowpass, highpass, bandpass, notch, allpass, peaking)
 * - Real-time frequency and Q parameter updates
 * - Professional audio parameter ranges and scaling
 * - Filter response calculation for visualization
 * - Clean audio chain integration
 */

class AudioFilterManager {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.filterNode = null;
        this.isConnected = false;
        this.isActive = false;
        this.listeners = new Map();
        this.lastToggleTime = 0; // Track last toggle time for debouncing
        
        // Filter configuration
        this.config = {
            type: 'lowpass',
            frequency: 1000, // Hz
            Q: 1.0,
            gain: 0 // dB (for peaking/shelving filters)
        };
        
        // Filter parameter ranges
        this.ranges = {
            frequency: { min: 20, max: 20000, default: 1000 },
            Q: { min: 0.1, max: 30, default: 1.0 },
            gain: { min: -40, max: 40, default: 0 }
        };
        
        // Available filter types
        this.filterTypes = [
            { value: 'lowpass', label: 'Low Pass' },
            { value: 'highpass', label: 'High Pass' },
            { value: 'bandpass', label: 'Band Pass' },
            { value: 'notch', label: 'Notch' },
            { value: 'allpass', label: 'All Pass' },
            { value: 'peaking', label: 'Peaking' }
        ];
        
        this.setupFilter();
    }
    
    /**
     * Create and configure the BiquadFilterNode
     */
    setupFilter() {
        try {
            this.filterNode = this.audioContext.createBiquadFilter();
            
            // FIXED: Set initial state based on isActive
            if (this.isActive) {
                // Apply actual filter configuration
                this.applyConfig();
            } else {
                // Start in bypass mode (allpass with flat response)
                this.applyBypassConfig();
            }
            
            this.emit('filterReady', {
                types: this.filterTypes,
                ranges: this.ranges,
                config: this.config
            });
            
        } catch (error) {
            this.emit('error', `Failed to setup filter: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Apply current configuration to the filter node
     */
    applyConfig() {
        if (!this.filterNode) return;
        
        // Set filter type
        this.filterNode.type = this.config.type;
        
        // Use immediate parameter setting instead of scheduled changes
        // This ensures getFrequencyResponse() returns correct values immediately
        this.filterNode.frequency.value = this.config.frequency;
        this.filterNode.Q.value = this.config.Q;
        
        // Set gain (for peaking/shelving filters)
        if (this.filterNode.gain) {
            this.filterNode.gain.value = this.config.gain;
        }
        
        this.emit('configApplied', this.config);
    }
    
    /**
     * Apply bypass configuration (allpass with flat response)
     */
    applyBypassConfig() {
        if (!this.filterNode) return;
        
        const currentTime = this.audioContext.currentTime;
        
        // Set to allpass for bypass (flat frequency response)
        this.filterNode.type = 'allpass';
        this.filterNode.frequency.setValueAtTime(1000, currentTime);
        this.filterNode.Q.setValueAtTime(0.1, currentTime);
        
        console.log('Filter: Applied bypass config (allpass)');
        this.emit('bypassApplied');
    }
    
    /**
     * Connect the filter to the audio chain
     * @param {AudioNode} inputNode - Node to connect as input
     * @param {AudioNode} outputNode - Node to connect as output
     */
    connect(inputNode, outputNode) {
        if (!inputNode || !outputNode) {
            throw new Error('Both input and output nodes are required');
        }
        
        try {
            // Disconnect if already connected
            this.disconnect();
            
            // Connect: input → filter → output
            inputNode.connect(this.filterNode);
            this.filterNode.connect(outputNode);
            
            this.isConnected = true;
            this.emit('connected', { inputNode, outputNode });
            
        } catch (error) {
            this.emit('error', `Failed to connect filter: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Disconnect the filter from the audio chain
     */
    disconnect() {
        if (this.isConnected && this.filterNode) {
            try {
                this.filterNode.disconnect();
                this.isConnected = false;
                this.emit('disconnected');
            } catch (error) {
                // Ignore disconnect errors
                console.warn('Filter disconnect warning:', error);
            }
        }
    }
    
    /**
     * Set filter type
     * @param {string} type - Filter type (lowpass, highpass, etc.)
     */
    setType(type) {
        if (!this.filterTypes.find(t => t.value === type)) {
            throw new Error(`Invalid filter type: ${type}`);
        }
        
        this.config.type = type;
        
        // FIXED: Only apply if filter is active, otherwise stay in bypass
        if (this.isActive) {
            this.applyConfig();
            console.log('Filter: Type changed to', type, '(active)');
        } else {
            console.log('Filter: Type changed to', type, '(bypassed - will apply when enabled)');
        }
        
        this.emit('parameterChanged', { 
            parameter: 'type', 
            value: type,
            config: this.config
        });
    }
    
    /**
     * Set filter frequency
     * @param {number} frequency - Frequency in Hz
     */
    setFrequency(frequency) {
        // Clamp to valid range
        frequency = Math.max(this.ranges.frequency.min, 
                           Math.min(this.ranges.frequency.max, frequency));
        
        this.config.frequency = frequency;
        
        // FIXED: Only apply if filter is active, otherwise stay in bypass
        if (this.filterNode && this.isActive) {
            // Use immediate parameter setting for consistent visualization
            this.filterNode.frequency.value = frequency;
            // console.log('Filter: Frequency changed to', frequency, 'Hz (active)');
        } // else if (this.filterNode) {
        //    console.log('Filter: Frequency changed to', frequency, 'Hz (bypassed - will apply when enabled)');
        //}
        
        this.emit('parameterChanged', { 
            parameter: 'frequency', 
            value: frequency,
            config: this.config
        });
    }
    
    /**
     * Set filter Q factor
     * @param {number} q - Q factor
     */
    setQ(q) {
        // Clamp to valid range
        q = Math.max(this.ranges.Q.min, Math.min(this.ranges.Q.max, q));
        
        this.config.Q = q;
        
        // FIXED: Only apply if filter is active, otherwise stay in bypass
        if (this.filterNode && this.isActive) {
            // Use immediate parameter setting for consistent visualization
            this.filterNode.Q.value = q;
            // console.log('Filter: Q changed to', q, '(active)');
        } // else if (this.filterNode) {
        //    console.log('Filter: Q changed to', q, '(bypassed - will apply when enabled)');
        //}
        
        this.emit('parameterChanged', { 
            parameter: 'Q', 
            value: q,
            config: this.config
        });
    }
    
    /**
     * Set filter gain (for peaking/shelving filters)
     * @param {number} gain - Gain in dB
     */
    setGain(gain) {
        // Clamp to valid range
        gain = Math.max(this.ranges.gain.min, Math.min(this.ranges.gain.max, gain));
        
        this.config.gain = gain;
        
        // FIXED: Only apply if filter is active, otherwise stay in bypass
        if (this.filterNode && this.filterNode.gain && this.isActive) {
            // Use immediate parameter setting for consistent visualization
            this.filterNode.gain.value = gain;
            console.log('Filter: Gain changed to', gain, 'dB (active)');
        } else if (this.filterNode && this.filterNode.gain) {
            console.log('Filter: Gain changed to', gain, 'dB (bypassed - will apply when enabled)');
        }
        
        this.emit('parameterChanged', { 
            parameter: 'gain', 
            value: gain,
            config: this.config
        });
    }
    
    /**
     * Calculate filter response for visualization
     * @param {Float32Array} frequencies - Frequency array in Hz
     * @returns {Object} Response data with magnitude and phase
     */
    calculateResponse(frequencies) {
        if (!this.filterNode || !frequencies) {
            return null;
        }
        
        const magResponse = new Float32Array(frequencies.length);
        const phaseResponse = new Float32Array(frequencies.length);
        
        try {
            this.filterNode.getFrequencyResponse(frequencies, magResponse, phaseResponse);
            
            // Convert magnitude to dB
            const magResponseDB = new Float32Array(frequencies.length);
            for (let i = 0; i < magResponse.length; i++) {
                magResponseDB[i] = 20 * Math.log10(Math.max(magResponse[i], 1e-6));
            }
            
            return {
                magnitude: magResponse,
                magnitudeDB: magResponseDB,
                phase: phaseResponse,
                frequencies: frequencies
            };
            
        } catch (error) {
            console.error('Failed to calculate filter response:', error);
            return null;
        }
    }
    
    /**
     * Get frequency response at display resolution
     * @param {number} displayWidth - Display width in pixels
     * @param {number} minFreq - Minimum frequency
     * @param {number} maxFreq - Maximum frequency
     * @returns {Object} Response data for display
     */
    getDisplayResponse(displayWidth = 800, minFreq = 20, maxFreq = 20000) {
        // Create logarithmic frequency array
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
     * @param {boolean} active - Whether filter should be active
     */
    setActive(active) {
        // DEBOUNCING: Prevent rapid toggle calls
        const now = Date.now();
        if (now - this.lastToggleTime < 50) { // 50ms debounce
            console.warn('Filter toggle too rapid, ignoring');
            return;
        }
        this.lastToggleTime = now;
        
        // Check if state is actually changing
        if (this.isActive === active) {
            console.log('Filter state unchanged:', active);
            return;
        }
        
        console.log('Filter setActive:', active, '(previous:', this.isActive, ')');
        this.isActive = active;
        
        if (this.filterNode) {
            if (active) {
                // FIXED: Restore original filter configuration
                this.applyConfig();
                console.log('Filter: Activated with config -', this.config);
                this.emit('activated');
            } else {
                // Apply bypass configuration
                this.applyBypassConfig();
                this.emit('deactivated', { originalType: this.config.type });
            }
        }
        
        this.emit('activeChanged', { active: this.isActive });
    }
    
    /**
     * Get current filter configuration
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
     * Get filter configuration optimized for export
     * Returns the actual filter state, not UI state
     */
    getExportConfig() {
        return {
            enabled: this.isActive,
            type: this.config.type,
            frequency: this.config.frequency,
            Q: this.config.Q,
            gain: this.config.gain,
            // Add bypass mode information for export consistency
            bypassMode: !this.isActive,
            // Include original type for bypass restoration
            originalType: this.config.type
        };
    }
    
    /**
     * Update multiple parameters at once
     * @param {Object} newConfig - Configuration updates
     */
    updateConfig(newConfig) {
        let changed = false;
        
        if (newConfig.type && newConfig.type !== this.config.type) {
            this.setType(newConfig.type);
            changed = true;
        }
        
        if (newConfig.frequency && newConfig.frequency !== this.config.frequency) {
            this.setFrequency(newConfig.frequency);
            changed = true;
        }
        
        if (newConfig.Q && newConfig.Q !== this.config.Q) {
            this.setQ(newConfig.Q);
            changed = true;
        }
        
        if (newConfig.gain !== undefined && newConfig.gain !== this.config.gain) {
            this.setGain(newConfig.gain);
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
        this.disconnect();
        
        if (this.filterNode) {
            this.filterNode = null;
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
                    console.error(`Error in filter event listener for ${event}:`, error);
                }
            });
        }
    }
}

// Export for use in other modules
window.AudioFilterManager = AudioFilterManager; 