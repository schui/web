/**
 * NoiseShaper Web - Filter Chain
 * Manages multiple BiquadFilterNodes in series for a single track
 * 
 * Features:
 * - Multiple filters in series (unlimited)
 * - Add/remove/reorder filters
 * - Individual filter parameter control
 * - Professional filter configuration
 * - Real-time parameter updates
 */

class FilterChain {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.filters = []; // Array of filter objects with metadata
        this.inputNode = null;
        this.routingNode = null;
        this.outputNode = null;
        this.listeners = new Map();
        

        
        this.setupChain();
    }
    
    /**
     * Set up the basic input/output chain
     */
    setupChain() {
        // Create input and output gain nodes for clean connections
        this.inputNode = this.audioContext.createGain();
        this.outputNode = this.audioContext.createGain();
        
        // Create a routing node that stays connected to inputNode
        this.routingNode = this.audioContext.createGain();
        
        this.inputNode.gain.value = 1.0;
        this.outputNode.gain.value = 1.0;
        this.routingNode.gain.value = 1.0;
        
        // PERMANENT connection: inputNode → routingNode (never disconnected)
        this.inputNode.connect(this.routingNode);
        
        // Initially connect routing directly to output (no filters)
        this.rebuildChain();
    }
    
    /**
     * Add a filter to the chain
     * @param {string} type - Filter type (lowpass, highpass, gaussian, etc.)
     * @param {object} config - Optional initial configuration
     * @returns {Promise<number>} Filter index in the chain
     */
    async addFilter(type = 'lowpass', config = {}) {
        try {
            console.log(`DEBUG FilterChain: Adding ${type} filter. Current filter count: ${this.filters.length}`);
            
            // Check if this is an advanced filter type
            const advancedFilterTypes = ['gaussian', 'parabolic', 'plateau'];
            const isAdvancedFilter = advancedFilterTypes.includes(type);
            
            let filterNode, finalConfig;
            
            if (isAdvancedFilter) {
                // Create direct FFT filter manager (research-validated artifact elimination)
                filterNode = new DirectFFTManager(this.audioContext);
                
                // Set default configuration for advanced filters
                const defaultConfig = {
                    type: type,
                    centerFreq: 1000,
                    width: 500,
                    gain: 0,
                    skew: 0,
                    kurtosis: 1,
                    flatness: 1,
                    flatWidth: 100
                };
                
                finalConfig = { ...defaultConfig, ...config };
                
                // Wait for the processor to be ready before connecting
                console.log(`DEBUG FilterChain: Waiting for advanced filter processor to be ready...`);
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Advanced filter initialization timeout'));
                    }, 5000);
                    
                    // Check if already ready
                    if (filterNode.processorInitialized) {
                        clearTimeout(timeout);
                        resolve();
                        return;
                    }
                    
                    // Wait for processor ready event
                    filterNode.on('processorReady', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                    
                    filterNode.on('error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
                });
                
                console.log(`DEBUG FilterChain: Advanced filter processor ready, configuring...`);
                
                // Configure the advanced filter
                filterNode.setType(finalConfig.type);
                filterNode.setCenterFreq(finalConfig.centerFreq);
                filterNode.setWidth(finalConfig.width);
                filterNode.setGain(finalConfig.gain);
                filterNode.setSkew(finalConfig.skew);
                filterNode.setKurtosis(finalConfig.kurtosis);
                filterNode.setFlatness(finalConfig.flatness);
                filterNode.setFlatWidth(finalConfig.flatWidth);
                filterNode.setActive(true);
                
            } else {
                // Create standard BiquadFilterNode
                filterNode = this.audioContext.createBiquadFilter();
                
                // Set default configuration for standard filters
                const defaultConfig = {
                    type: type,
                    frequency: 1000,
                    Q: 1.0,
                    gain: 0
                };
                
                finalConfig = { ...defaultConfig, ...config };
                
                // Apply configuration
                filterNode.type = finalConfig.type;
                filterNode.frequency.value = finalConfig.frequency;
                filterNode.Q.value = finalConfig.Q;
                filterNode.gain.value = finalConfig.gain;
            }
            
            // Create filter metadata object
            const filterData = {
                id: this.filters.length, // Will be updated in rebuildChain
                node: filterNode,
                config: finalConfig,
                enabled: true,
                isAdvanced: isAdvancedFilter
            };
            
            this.filters.push(filterData);
            console.log(`DEBUG FilterChain: Filter added to array. New count: ${this.filters.length}`);
            
            // Rebuild the chain with the new filter
            console.log(`DEBUG FilterChain: About to rebuild chain...`);
            this.rebuildChain();
            console.log(`DEBUG FilterChain: Chain rebuild completed`);
            
            const filterIndex = this.filters.length - 1;
            this.emit('filterAdded', { 
                filterIndex, 
                type: finalConfig.type,
                config: finalConfig,
                isAdvanced: isAdvancedFilter
            });
            
            console.log(`DEBUG FilterChain: Filter ${type} added successfully at index ${filterIndex}`);
            return filterIndex;
            
        } catch (error) {
            console.error(`DEBUG FilterChain: Error adding filter:`, error);
            this.emit('error', `Failed to add filter: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Remove a filter from the chain
     * @param {number} filterIndex - Index of filter to remove
     */
    removeFilter(filterIndex) {
        if (filterIndex < 0 || filterIndex >= this.filters.length) {
            throw new Error(`Invalid filter index: ${filterIndex}`);
        }
        
        try {
            const filterData = this.filters[filterIndex];
            
            // Disconnect the filter node
            if (filterData.isAdvanced) {
                // DirectFFTManager: use destroy method for proper cleanup
                filterData.node.destroy();
            } else {
                filterData.node.disconnect();
            }
            
            // Remove from filters array
            this.filters.splice(filterIndex, 1);
            
            // Rebuild the chain
            this.rebuildChain();
            
            this.emit('filterRemoved', { filterIndex });
            
        } catch (error) {
            this.emit('error', `Failed to remove filter ${filterIndex}: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Move a filter to a different position in the chain
     * @param {number} fromIndex - Current index of filter
     * @param {number} toIndex - New index for filter
     */
    moveFilter(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.filters.length ||
            toIndex < 0 || toIndex >= this.filters.length) {
            throw new Error(`Invalid filter indices: ${fromIndex} -> ${toIndex}`);
        }
        
        if (fromIndex === toIndex) {
            return;
        }
        
        try {
            // Move filter in array
            const filterData = this.filters.splice(fromIndex, 1)[0];
            this.filters.splice(toIndex, 0, filterData);
            
            // Rebuild the chain
            this.rebuildChain();
            
            this.emit('filterMoved', { fromIndex, toIndex });
            
        } catch (error) {
            this.emit('error', `Failed to move filter: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Set filter parameter
     * @param {number} filterIndex - Index of filter
     * @param {string} parameter - Parameter name (type, frequency, Q, gain, centerFreq, width, etc.)
     * @param {*} value - Parameter value
     */
    setFilterParameter(filterIndex, parameter, value) {
        if (filterIndex < 0 || filterIndex >= this.filters.length) {
            throw new Error(`Invalid filter index: ${filterIndex}`);
        }
        
        try {
            const filterData = this.filters[filterIndex];
            const filterNode = filterData.node;
            
            // Update the filter configuration
            filterData.config[parameter] = value;
            
            // Apply to the audio node
            if (filterData.enabled) {
                if (filterData.isAdvanced) {
                    // Handle advanced filter parameters
                    switch (parameter) {
                        case 'type':
                            filterNode.setType(value);
                            break;
                        case 'centerFreq':
                            filterNode.setCenterFreq(value);
                            break;
                        case 'width':
                            filterNode.setWidth(value);
                            break;
                        case 'gain':
                            filterNode.setGain(value);
                            break;
                        case 'skew':
                            filterNode.setSkew(value);
                            break;
                        case 'kurtosis':
                            filterNode.setKurtosis(value);
                            break;
                        case 'flatness':
                            filterNode.setFlatness(value);
                            break;
                        case 'flatWidth':
                            filterNode.setFlatWidth(value);
                            break;
                        default:
                            console.warn(`Unknown advanced filter parameter: ${parameter}`);
                    }
                } else {
                    // Handle standard BiquadFilter parameters
                    switch (parameter) {
                        case 'type':
                            filterNode.type = value;
                            break;
                        case 'frequency':
                            filterNode.frequency.value = value;
                            break;
                        case 'Q':
                            filterNode.Q.value = value;
                            break;
                        case 'gain':
                            filterNode.gain.value = value;
                            break;
                        default:
                            console.warn(`Unknown standard filter parameter: ${parameter}`);
                    }
                }
            }
            
            this.emit('filterParameterChanged', { 
                filterIndex, 
                parameter, 
                value,
                config: filterData.config,
                isAdvanced: filterData.isAdvanced
            });
            
        } catch (error) {
            this.emit('error', `Failed to set filter parameter: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Enable/disable a filter
     * @param {number} filterIndex - Index of filter
     * @param {boolean} enabled - Whether filter should be enabled
     */
    setFilterEnabled(filterIndex, enabled) {
        if (filterIndex < 0 || filterIndex >= this.filters.length) {
            throw new Error(`Invalid filter index: ${filterIndex}`);
        }
        
        try {
            const filterData = this.filters[filterIndex];
            filterData.enabled = enabled;
            
            if (filterData.isAdvanced) {
                // Advanced filters handle enable/disable internally
                filterData.node.setActive(enabled);
            } else {
                if (enabled) {
                    // Apply the stored configuration
                    this.applyFilterConfig(filterData);
                } else {
                    // Set to allpass (bypass)
                    filterData.node.type = 'allpass';
                    filterData.node.frequency.value = 1000;
                    filterData.node.Q.value = 0.1;
                }
            }
            
            this.emit('filterEnabledChanged', { 
                filterIndex, 
                enabled,
                config: filterData.config,
                isAdvanced: filterData.isAdvanced
            });
            
        } catch (error) {
            this.emit('error', `Failed to set filter enabled state: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Apply stored configuration to a filter node
     * @param {object} filterData - Filter data object
     */
    applyFilterConfig(filterData) {
        const { node, config } = filterData;
        
        node.type = config.type;
        node.frequency.value = config.frequency;
        node.Q.value = config.Q;
        node.gain.value = config.gain;
    }
    
    /**
     * Rebuild the entire filter chain connections
     */
    rebuildChain() {
        try {
            // FIXED: Use routingNode to avoid breaking external connections
            // External connections: NoiseGenerator → inputNode → routingNode (never disconnected)
            // Internal routing: routingNode → [filters] → outputNode (only this gets rebuilt)
            
            // Disconnect only internal routing (routingNode and filter connections)
            this.routingNode.disconnect();
            
            // Disconnect all filter nodes
            this.filters.forEach(filterData => {
                if (filterData.isAdvanced) {
                    // DirectFFTManager: use disconnect method
                    filterData.node.disconnect();
                } else {
                    filterData.node.disconnect();
                }
            });
            
            // Rebuild internal routing from routingNode
            if (this.filters.length === 0) {
                // No filters: connect routing directly to output
                this.routingNode.connect(this.outputNode);
            } else {
                // Connect routing to first filter
                const firstFilter = this.filters[0];
                if (firstFilter.isAdvanced) {
                    // DirectFFTManager: connect routing node to processor node
                    this.routingNode.connect(firstFilter.node.processorNode);
                } else {
                    this.routingNode.connect(firstFilter.node);
                }
                
                // Connect filters in series
                for (let i = 0; i < this.filters.length - 1; i++) {
                    const currentFilter = this.filters[i];
                    const nextFilter = this.filters[i + 1];
                    
                    if (currentFilter.isAdvanced && nextFilter.isAdvanced) {
                        // DirectFFTManager to DirectFFTManager
                        currentFilter.node.processorNode.connect(nextFilter.node.processorNode);
                    } else if (currentFilter.isAdvanced && !nextFilter.isAdvanced) {
                        // DirectFFTManager to standard
                        currentFilter.node.processorNode.connect(nextFilter.node);
                    } else if (!currentFilter.isAdvanced && nextFilter.isAdvanced) {
                        // Standard to DirectFFTManager
                        currentFilter.node.connect(nextFilter.node.processorNode);
                    } else {
                        // Standard to standard
                        currentFilter.node.connect(nextFilter.node);
                    }
                }
                
                // Connect last filter to output
                const lastFilter = this.filters[this.filters.length - 1];
                if (lastFilter.isAdvanced) {
                    // DirectFFTManager: connect processor node to output
                    lastFilter.node.processorNode.connect(this.outputNode);
                } else {
                    lastFilter.node.connect(this.outputNode);
                }
                
                // Update filter IDs
                this.filters.forEach((filterData, index) => {
                    filterData.id = index;
                });
            }
            
            this.emit('chainRebuilt', { 
                filterCount: this.filters.length 
            });
            
        } catch (error) {
            this.emit('error', `Failed to rebuild filter chain: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Get the input node for external connections
     * @returns {GainNode} The input node
     */
    getInputNode() {
        return this.inputNode;
    }
    
    /**
     * Get the output node for external connections
     * @returns {GainNode} The output node
     */
    getOutputNode() {
        return this.outputNode;
    }
    
    /**
     * Connect the filter chain output to a destination
     * @param {AudioNode} destination - Destination audio node
     */
    connect(destination) {
        this.outputNode.connect(destination);
    }
    
    /**
     * Disconnect the filter chain
     */
    disconnect() {
        this.outputNode.disconnect();
    }
    
    /**
     * Get filter count
     * @returns {number} Number of filters in chain
     */
    getFilterCount() {
        return this.filters.length;
    }
    
    /**
     * Get filter data by index
     * @param {number} filterIndex - Index of filter
     * @returns {object} Filter data object
     */
    getFilter(filterIndex) {
        if (filterIndex < 0 || filterIndex >= this.filters.length) {
            throw new Error(`Invalid filter index: ${filterIndex}`);
        }
        return this.filters[filterIndex];
    }
    
    /**
     * Get all filters data
     * @returns {object[]} Array of filter data objects
     */
    getAllFilters() {
        return this.filters.map(filterData => ({
            id: filterData.id,
            config: { ...filterData.config },
            enabled: filterData.enabled,
            isAdvanced: filterData.isAdvanced
        }));
    }
    
    /**
     * Get export configuration for all filters
     */
    getExportConfig() {
        return this.filters.map(filterData => {
            const baseConfig = {
                type: filterData.config.type,
                enabled: filterData.enabled,
                isAdvanced: filterData.isAdvanced
            };
            
            if (filterData.isAdvanced) {
                // Advanced filter: only include advanced parameters
                return {
                    ...baseConfig,
                    centerFreq: filterData.config.centerFreq || 1000,
                    width: filterData.config.width || 500,
                    gain: filterData.config.gain || 0,
                    skew: filterData.config.skew || 0,
                    kurtosis: filterData.config.kurtosis || 1,
                    flatness: filterData.config.flatness || 1,
                    flatWidth: filterData.config.flatWidth || 100
                };
            } else {
                // Standard filter: only include standard parameters
                return {
                    ...baseConfig,
                    frequency: filterData.config.frequency || 1000,
                    Q: filterData.config.Q || 1.0,
                    gain: filterData.config.gain || 0
                };
            }
        });
    }
    
    /**
     * Get frequency response for the entire filter chain
     * @param {Float32Array} frequencyArray - Frequency array for response calculation
     * @returns {Float32Array} Magnitude response array
     */
    getFrequencyResponse(frequencyArray) {
        if (this.filters.length === 0) {
            // No filters - flat response
            return new Float32Array(frequencyArray.length).fill(0); // 0 dB
        }
        
        try {
            // Calculate combined response of all enabled filters
            let combinedMagnitude = new Float32Array(frequencyArray.length).fill(0);
            
            this.filters.forEach(filterData => {
                if (filterData.enabled) {
                    const magnitude = new Float32Array(frequencyArray.length);
                    const phase = new Float32Array(frequencyArray.length);
                    
                    filterData.node.getFrequencyResponse(frequencyArray, magnitude, phase);
                    
                    // Add to combined response (in dB)
                    for (let i = 0; i < frequencyArray.length; i++) {
                        const magnitudeDb = 20 * Math.log10(Math.max(magnitude[i], 1e-10));
                        combinedMagnitude[i] += magnitudeDb;
                    }
                }
            });
            
            return combinedMagnitude;
            
        } catch (error) {
            this.emit('error', `Failed to calculate frequency response: ${error.message}`);
            return new Float32Array(frequencyArray.length).fill(0);
        }
    }
    
    /**
     * Clear all filters
     */
    clear() {
        while (this.filters.length > 0) {
            this.removeFilter(0);
        }
    }
    
    /**
     * Clean shutdown
     */
    destroy() {
        // Disconnect all nodes
        this.inputNode.disconnect();
        this.routingNode.disconnect();
        this.outputNode.disconnect();
        
        this.filters.forEach(filterData => {
            filterData.node.disconnect();
        });
        
        this.filters = [];
        this.inputNode = null;
        this.routingNode = null;
        this.outputNode = null;
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
                    console.error(`Error in filter chain event listener for ${event}:`, error);
                }
            });
        }
    }
}

// Export for use in other modules
window.FilterChain = FilterChain; 