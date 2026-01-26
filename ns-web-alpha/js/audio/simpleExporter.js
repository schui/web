// Simple Audio Exporter - Python version approach
// Generates samples directly and applies filters via FFT

class SimpleAudioExporter {
    constructor() {
        this.isExporting = false;
        
        // Export settings (matching Python defaults)
        this.exportSettings = {
            enableNormalization: true,
            normalizeValue: 0.5,  // Python default
            exportAmplitude: 1.0,  // Separate from UI master gain
            enableFadeIn: true,   // Python default
            enableFadeOut: true,  // Python default
            fadeInDuration: 5.0,  // 5 seconds default
            fadeOutDuration: 5.0, // 5 seconds default
            fadeInPower: 2.0,     // Python default
            fadeOutPower: 2.0,    // Python default
            fadeBeforeNorm: false // Default to "Normalize then Fade" (Python default)
        };

        // Web Workers integration
        this.workerPool = null;
        this.workersSupported = false;
        this.workersInitialized = false;
        this.initializeWorkers();
    }

    /**
     * Initialize Web Workers for parallel processing
     */
    async initializeWorkers() {
        try {
            console.log('🎯 SIMPLE EXPORT: Initializing Web Workers for parallel processing...');
            
            // Check if WorkerPool class is available
            if (typeof WorkerPool === 'undefined') {
                console.log('🎯 SIMPLE EXPORT: WorkerPool class not available, will use sequential processing');
                return false;
            }
            
            // Create worker pool
            this.workerPool = new WorkerPool();
            
            // Wait for initialization
            const initialized = await this.workerPool.initPromise;
            
            if (initialized) {
                this.workersSupported = true;
                this.workersInitialized = true;
                console.log('🎯 SIMPLE EXPORT: Web Workers initialized successfully for parallel processing');
                
                // Set up progress callback
                this.workerPool.setProgressCallback((progressInfo) => {
                    if (this.currentProgressCallback) {
                        // Enhance progress info with worker details
                        this.currentProgressCallback({
                            ...progressInfo,
                            phase: 'processing',
                            overallProgress: Math.round((progressInfo.completedJobs / progressInfo.totalJobs) * 100)
                        });
                    }
                });
                
                return true;
            } else {
                console.log('🎯 SIMPLE EXPORT: Web Workers initialization failed, will use sequential processing');
                return false;
            }
            
        } catch (error) {
            console.warn('🎯 SIMPLE EXPORT: Error initializing Web Workers:', error.message);
            console.log('🎯 SIMPLE EXPORT: Will fall back to sequential processing');
            this.workersSupported = false;
            this.workersInitialized = false;
            return false;
        }
    }

    /**
     * Efficiently find maximum absolute value in array (stack-safe for large arrays)
     * @param {Float32Array} array - Input array
     * @returns {number} Maximum absolute value
     */
    findMaxAbs(array) {
        let max = 0;
        for (let i = 0; i < array.length; i++) {
            const abs = Math.abs(array[i]);
            if (abs > max) max = abs;
        }
        return max;
    }

    /**
     * Determine if we should use chunked processing based on memory requirements
     * @param {number} totalSamples - Total samples needed
     * @returns {boolean} True if chunked processing should be used
     */
    shouldUseChunkedProcessing(totalSamples) {
        // Estimate memory requirements:
        // - Audio data: totalSamples * 4 bytes
        // - FFT processing: ~4x additional memory for complex arrays and padding
        const estimatedMemoryMB = (totalSamples * 4 * 5) / (1024 * 1024);  // 5x for safety margin
        
        // Use chunked processing if estimated memory > 500MB
        // This is conservative but ensures browser stability
        const memoryLimitMB = 500;
        const useChunked = estimatedMemoryMB > memoryLimitMB;
        
        console.log('🎵 MEMORY CHECK: Estimated memory needed:', Math.round(estimatedMemoryMB), 'MB');
        console.log('🎵 MEMORY CHECK: Memory limit:', memoryLimitMB, 'MB');
        console.log('🎵 MEMORY CHECK: Use chunked processing:', useChunked);
        
        return useChunked;
    }

    /**
     * Normalize signal to target amplitude (like Python AudioNormalizer.normalize_signal)
     * @param {Float32Array} signal - Input signal
     * @param {number} targetAmplitude - Target amplitude (default 0.5 like Python)
     * @returns {Float32Array} Normalized signal
     */
    normalizeSignal(signal, targetAmplitude = 0.5) {
        console.log('🎵 NORMALIZE: Target amplitude:', targetAmplitude);
        
        // Get the maximum absolute value (essential for normalization algorithm)
        const maxAbs = this.findMaxAbs(signal);
        
        if (maxAbs === 0) {
            console.log('🎵 NORMALIZE: Signal is silent, returning unchanged');
            return signal;
        }
        
        // First normalize to [-1,1] range, then scale to target amplitude
        const normalizedSignal = new Float32Array(signal.length);
        const scaleFactor = targetAmplitude / maxAbs;
        
        for (let i = 0; i < signal.length; i++) {
            normalizedSignal[i] = signal[i] * scaleFactor;
        }
        
        console.log('🎵 NORMALIZE: Normalized', signal.length, 'samples with scale factor:', scaleFactor);
        return normalizedSignal;
    }

    /**
     * Main export function - automatically chooses chunked or direct processing
     * @param {number} durationSeconds - Duration in seconds
     * @param {Object} trackConfig - Track configuration
     * @param {Object} settings - Export settings
     * @returns {Promise<Float32Array>} Exported audio data
     */
    async exportSimple(durationSeconds, trackConfig, settings = {}) {
        console.log('🎵 SIMPLE EXPORT: Starting with duration:', durationSeconds, 'seconds');
        
        // Merge with default settings
        const mergedSettings = Object.assign({}, this.exportSettings, settings);
        console.log('🎵 SIMPLE EXPORT: Export settings:', mergedSettings);
        
        // Store progress callback for worker integration
        this.currentProgressCallback = mergedSettings.onProgress;
        
        const sampleRate = mergedSettings.exportSampleRate || 44100;
        const totalSamples = Math.floor(durationSeconds * sampleRate);
        
        console.log('🎵 SIMPLE EXPORT: Sample rate:', sampleRate, 'Hz');
        console.log('🎵 SIMPLE EXPORT: Duration:', durationSeconds, 'seconds');
        console.log('🎵 SIMPLE EXPORT: Total samples needed:', totalSamples);
        console.log('🎵 SIMPLE EXPORT: Calculation:', durationSeconds, '×', sampleRate, '=', totalSamples);
        
        // Decide processing method based on memory requirements
        if (this.shouldUseChunkedProcessing(totalSamples)) {
            console.log('🎵 EXPORT MODE: Using chunked processing for large file');
            return await this.exportChunked(durationSeconds, trackConfig, mergedSettings);
        } else {
            console.log('🎵 EXPORT MODE: Using direct processing for manageable file size');
            return await this.exportDirect(durationSeconds, trackConfig, mergedSettings);
        }
    }

    /**
     * Direct export for smaller files (original method, renamed)
     * @param {number} durationSeconds - Duration in seconds
     * @param {Object} trackConfig - Track configuration
     * @param {Object} settings - Export settings
     * @returns {Promise<Float32Array>} Exported audio data
     */
    async exportDirect(durationSeconds, trackConfig, settings) {
        console.log('🎵 DIRECT EXPORT: Starting direct export with duration:', durationSeconds, 'seconds');
        
        const sampleRate = settings.exportSampleRate || 44100;
        const totalSamples = Math.floor(durationSeconds * sampleRate);
        
        // Initialize mix buffer
        let mixedData = new Float32Array(totalSamples);
        
        // Process each track and mix them together
        if (trackConfig.tracks && trackConfig.tracks.length > 0) {
            console.log('🎵 SIMPLE EXPORT: Processing', trackConfig.tracks.length, 'tracks');
            
            for (let trackIndex = 0; trackIndex < trackConfig.tracks.length; trackIndex++) {
                const track = trackConfig.tracks[trackIndex];
                
                if (!track.enabled) {
                    console.log('🎵 SIMPLE EXPORT: Track', trackIndex, 'disabled, skipping');
                    continue;
                }
                
                console.log('🎵 SIMPLE EXPORT: Processing track', trackIndex);
                
                // Generate white noise for this track
                const trackNoise = this.generateWhiteNoise(totalSamples);
                console.log('🎵 SIMPLE EXPORT: Track', trackIndex, 'generated', totalSamples, 'noise samples');
                
                // Apply filters to this track
                let trackData = trackNoise;
                
                if (track.filters && track.filters.length > 0) {
                    console.log('🎵 SIMPLE EXPORT: Track', trackIndex, 'applying', track.filters.length, 'filters');
                    
                    for (let i = 0; i < track.filters.length; i++) {
                        const filter = track.filters[i];
                        if (filter.enabled) {
                            console.log('🎵 SIMPLE EXPORT: Track', trackIndex, 'applying filter:', filter.type, 'gain:', filter.gain, 'dB', 'centerFreq:', filter.centerFreq, 'Hz');
                            trackData = this.applyFilterFFT(trackData, filter, sampleRate);
                            console.log('🎵 SIMPLE EXPORT: Track', trackIndex, 'applied', filter.type, 'filter');
                        }
                    }
                }
                
                // Apply track gain
                if (track.gain !== undefined && track.gain !== 1.0) {
                    const trackGainLinear = typeof track.gain === 'number' && track.gain > 0 && track.gain < 10
                        ? track.gain  // Already linear
                        : Math.pow(10, (track.gain || 0) / 20);  // Convert dB to linear
                    
                    console.log('🎵 SIMPLE EXPORT: Track', trackIndex, 'applying track gain:', trackGainLinear);
                    trackData = trackData.map(sample => sample * trackGainLinear);
                }
                
                // Mix this track into the final mix
                for (let i = 0; i < totalSamples; i++) {
                    mixedData[i] += trackData[i];
                }
                
                console.log('🎵 SIMPLE EXPORT: Track', trackIndex, 'mixed into final output');
            }
        } else {
            console.log('🎵 SIMPLE EXPORT: No tracks configured, generating single white noise');
            // Fallback: generate single white noise if no tracks
            mixedData = this.generateWhiteNoise(totalSamples);
        }
        
        console.log('🎵 SIMPLE EXPORT: Final mixed data ready,', mixedData.length, 'samples');
        
        // Apply export-specific amplitude (like Python version)
        if (settings.exportAmplitude !== 1.0) {
            console.log('🎵 SIMPLE EXPORT: Applying export amplitude:', settings.exportAmplitude);
            mixedData = mixedData.map(sample => sample * settings.exportAmplitude);
        }

        // Calculate fade samples
        const fadeInSamples = settings.enableFadeIn ? 
            Math.floor(settings.fadeInDuration * sampleRate) : 0;
        const fadeOutSamples = settings.enableFadeOut ? 
            Math.floor(settings.fadeOutDuration * sampleRate) : 0;
        
        console.log('🎵 FADE CALC: Fade-in duration:', settings.fadeInDuration, 'seconds');
        console.log('🎵 FADE CALC: Fade-out duration:', settings.fadeOutDuration, 'seconds');
        console.log('🎵 FADE CALC: Fade-in samples:', fadeInSamples, '(' + settings.fadeInDuration + ' × ' + sampleRate + ')');
        console.log('🎵 FADE CALC: Fade-out samples:', fadeOutSamples, '(' + settings.fadeOutDuration + ' × ' + sampleRate + ')');

        // Apply fade and normalization in the correct order (matching Python version)
        if (settings.fadeBeforeNorm) {
            console.log('🎵 SIMPLE EXPORT: Processing order: Fade then Normalize');
            
            // Apply fades first
            if (fadeInSamples > 0 || fadeOutSamples > 0) {
                console.log('🎵 SIMPLE EXPORT: Applying fades...');
                mixedData = this.applyFadeEnvelope(
                    mixedData, fadeInSamples, fadeOutSamples,
                    settings.fadeInPower, settings.fadeOutPower
                );
            }
            
            // Then normalize
            if (settings.enableNormalization) {
                console.log('🎵 SIMPLE EXPORT: Applying normalization...');
                mixedData = this.normalizeSignal(mixedData, settings.normalizeValue);
            }
        } else {
            console.log('🎵 SIMPLE EXPORT: Processing order: Normalize then Fade');
            
            // Normalize first
            if (settings.enableNormalization) {
                console.log('🎵 SIMPLE EXPORT: Applying normalization...');
                mixedData = this.normalizeSignal(mixedData, settings.normalizeValue);
            }
            
            // Then apply fades
            if (fadeInSamples > 0 || fadeOutSamples > 0) {
                console.log('🎵 SIMPLE EXPORT: Applying fades...');
                mixedData = this.applyFadeEnvelope(
                    mixedData, fadeInSamples, fadeOutSamples,
                    settings.fadeInPower, settings.fadeOutPower
                );
            }
        }
        
        console.log('🎵 DIRECT EXPORT: Export complete,', mixedData.length, 'samples ready');
        
        return new Float32Array(mixedData);
    }

    /**
     * Chunked export for large files - maintains perfect audio quality
     * @param {number} durationSeconds - Duration in seconds
     * @param {Object} trackConfig - Track configuration
     * @param {Object} settings - Export settings
     * @returns {Promise<Float32Array>} Exported audio data
     */
    async exportChunked(durationSeconds, trackConfig, settings) {
        console.log('🎵 CHUNKED EXPORT: Starting chunked export with duration:', durationSeconds, 'seconds');
        
        const sampleRate = settings.exportSampleRate || 44100;
        const totalSamples = Math.floor(durationSeconds * sampleRate);
        
        // Optimized chunk size: 30 seconds = ~1.3M samples = ~2M FFT size
        // This is ~4x faster per chunk than 90 seconds due to FFT complexity O(N log N)
        const chunkDurationSeconds = 30;
        const chunkSamples = Math.floor(chunkDurationSeconds * sampleRate);
        
        console.log('🎵 CHUNKED EXPORT: Total samples:', totalSamples);
        console.log('🎵 CHUNKED EXPORT: Chunk size:', chunkSamples, 'samples (', chunkDurationSeconds, 'seconds )');
        
        // Calculate number of chunks needed
        const numChunks = Math.ceil(totalSamples / chunkSamples);
        console.log('🎵 CHUNKED EXPORT: Processing', numChunks, 'chunks');
        
        // Check if we can use parallel processing
        const useParallelProcessing = this.workersSupported && 
                                     this.workersInitialized && 
                                     this.workerPool && 
                                     this.workerPool.isAvailable() &&
                                     numChunks >= 2; // Only worth it for multiple chunks
        
        if (useParallelProcessing) {
            console.log('🎯 CHUNKED EXPORT: Using PARALLEL processing with Web Workers');
            return await this.exportChunkedParallel(durationSeconds, trackConfig, settings);
        } else {
            console.log('🎵 CHUNKED EXPORT: Using SEQUENTIAL processing (workers not available or not beneficial)');
            return await this.exportChunkedSequential(durationSeconds, trackConfig, settings);
        }
    }

    /**
     * Parallel chunked export using Web Workers
     */
    async exportChunkedParallel(durationSeconds, trackConfig, settings) {
        console.log('🎯 PARALLEL EXPORT: Starting parallel chunked export with Web Workers');
        
        const sampleRate = settings.exportSampleRate || 44100;
        const totalSamples = Math.floor(durationSeconds * sampleRate);
        
        // Use smaller chunks for parallel processing to avoid memory issues in workers
        // 10 seconds = ~441K samples = ~1M FFT size (manageable for workers)
        const chunkDurationSeconds = 10;
        const chunkSamples = Math.floor(chunkDurationSeconds * sampleRate);
        const numChunks = Math.ceil(totalSamples / chunkSamples);
        
        console.log('🎯 PARALLEL EXPORT: Using optimized chunk size for workers:', chunkDurationSeconds, 'seconds');
        
        // Check if export was cancelled
        if (settings.onProgress) {
            const shouldContinue = settings.onProgress({
                phase: 'starting',
                chunksTotal: numChunks,
                chunksCompleted: 0,
                overallProgress: 0
            });
            if (!shouldContinue) {
                throw new Error('Export cancelled by user');
            }
        }
        
        // Prepare chunk data for workers
        const chunks = [];
        for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
            const chunkStart = chunkIndex * chunkSamples;
            const chunkEnd = Math.min(chunkStart + chunkSamples, totalSamples);
            const currentChunkSamples = chunkEnd - chunkStart;
            const chunkDuration = currentChunkSamples / sampleRate;
            
            // Generate noise samples for this chunk (will be done in worker)
            chunks.push({
                index: chunkIndex,
                samples: new Float32Array(currentChunkSamples), // Placeholder
                duration: chunkDuration,
                startSample: chunkStart,
                endSample: chunkEnd
            });
        }
        
        // Process chunks in parallel using worker pool
        console.log(`🎯 PARALLEL EXPORT: Processing ${numChunks} chunks in parallel...`);
        const startTime = performance.now();
        
        const chunkResults = await this.workerPool.processChunksParallel(chunks, trackConfig, settings);
        
        const processingTime = performance.now() - startTime;
        console.log(`🎯 PARALLEL EXPORT: Completed all chunks in ${processingTime.toFixed(2)}ms`);
        console.log(`🎯 PARALLEL EXPORT: Average time per chunk: ${(processingTime / numChunks).toFixed(2)}ms`);
        
        // Assemble final result
        const finalResult = new Float32Array(totalSamples);
        let outputOffset = 0;
        
        for (let i = 0; i < chunkResults.length; i++) {
            const chunkResult = chunkResults[i];
            finalResult.set(chunkResult, outputOffset);
            outputOffset += chunkResult.length;
        }
        
        // Apply final processing (normalization and fade) to complete signal
        console.log('🎯 PARALLEL EXPORT: Applying final processing to complete signal...');
        
        // Report final processing phase
        if (settings.onProgress) {
            const shouldContinue = settings.onProgress({
                phase: 'finalizing',
                chunksTotal: numChunks,
                chunksCompleted: numChunks,
                overallProgress: 100
            });
            if (!shouldContinue) {
                throw new Error('Export cancelled by user');
            }
        }
        
        let finalData = finalResult;
        
        // Calculate fade samples
        const fadeInSamples = settings.enableFadeIn ? 
            Math.floor(settings.fadeInDuration * sampleRate) : 0;
        const fadeOutSamples = settings.enableFadeOut ? 
            Math.floor(settings.fadeOutDuration * sampleRate) : 0;
        
        // Apply fade and normalization in the correct order
        if (settings.fadeBeforeNorm) {
            // Apply fades first
            if (fadeInSamples > 0 || fadeOutSamples > 0) {
                console.log('🎯 PARALLEL EXPORT: Applying fades to complete signal...');
                finalData = this.applyFadeEnvelope(
                    finalData, fadeInSamples, fadeOutSamples,
                    settings.fadeInPower, settings.fadeOutPower
                );
            }
            
            // Then normalize
            if (settings.enableNormalization) {
                console.log('🎯 PARALLEL EXPORT: Applying normalization to complete signal...');
                finalData = this.normalizeSignal(finalData, settings.normalizeValue);
            }
        } else {
            // Normalize first
            if (settings.enableNormalization) {
                console.log('🎯 PARALLEL EXPORT: Applying normalization to complete signal...');
                finalData = this.normalizeSignal(finalData, settings.normalizeValue);
            }
            
            // Then apply fades
            if (fadeInSamples > 0 || fadeOutSamples > 0) {
                console.log('🎯 PARALLEL EXPORT: Applying fades to complete signal...');
                finalData = this.applyFadeEnvelope(
                    finalData, fadeInSamples, fadeOutSamples,
                    settings.fadeInPower, settings.fadeOutPower
                );
            }
        }
        
        console.log('🎯 PARALLEL EXPORT: Export complete,', finalData.length, 'samples ready');
        return finalData;
    }

    /**
     * Sequential chunked export (original implementation)
     */
    async exportChunkedSequential(durationSeconds, trackConfig, settings) {
        console.log('🎵 SEQUENTIAL EXPORT: Starting sequential chunked export');
        
        const sampleRate = settings.exportSampleRate || 44100;
        const totalSamples = Math.floor(durationSeconds * sampleRate);
        const chunkDurationSeconds = 30;
        const chunkSamples = Math.floor(chunkDurationSeconds * sampleRate);
        const numChunks = Math.ceil(totalSamples / chunkSamples);
        
        // Initialize result array
        const finalResult = new Float32Array(totalSamples);
        let outputOffset = 0;
        
        // Check if export was cancelled
        if (settings.onProgress) {
            const shouldContinue = settings.onProgress({
                phase: 'starting',
                chunksTotal: numChunks,
                chunksCompleted: 0,
                overallProgress: 0
            });
            if (!shouldContinue) {
                throw new Error('Export cancelled by user');
            }
        }
        
        // Process each chunk sequentially
        for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
            const chunkStart = chunkIndex * chunkSamples;
            const chunkEnd = Math.min(chunkStart + chunkSamples, totalSamples);
            const currentChunkSamples = chunkEnd - chunkStart;
            
            console.log(`🎵 SEQUENTIAL CHUNK ${chunkIndex + 1}/${numChunks}: Processing samples ${chunkStart} to ${chunkEnd} (${currentChunkSamples} samples)`);
            
            // Create chunk duration and process it using existing direct export logic
            const chunkDuration = currentChunkSamples / sampleRate;
            
            // Use direct export for this chunk (no recursion - direct call to processing logic)
            const chunkResult = await this.processChunk(chunkDuration, trackConfig, settings);
            
            // Copy chunk result to final array
            finalResult.set(chunkResult, outputOffset);
            outputOffset += chunkResult.length;
            
            const progress = Math.round((chunkIndex + 1) / numChunks * 100);
            console.log(`🎵 SEQUENTIAL CHUNK ${chunkIndex + 1}/${numChunks}: Completed, progress: ${progress}%`);
            
            // Report progress and check for cancellation
            if (settings.onProgress) {
                const shouldContinue = settings.onProgress({
                    phase: 'processing',
                    chunksTotal: numChunks,
                    chunksCompleted: chunkIndex + 1,
                    currentChunk: chunkIndex + 1,
                    overallProgress: progress
                });
                if (!shouldContinue) {
                    throw new Error('Export cancelled by user');
                }
            }
            
            // Allow UI to update between chunks
            await new Promise(resolve => setTimeout(resolve, 1));
        }
        
        // Apply final processing (normalization and fade) to complete signal
        console.log('🎵 SEQUENTIAL EXPORT: Applying final processing to complete signal...');
        
        // Report final processing phase
        if (settings.onProgress) {
            const shouldContinue = settings.onProgress({
                phase: 'finalizing',
                chunksTotal: numChunks,
                chunksCompleted: numChunks,
                overallProgress: 100
            });
            if (!shouldContinue) {
                throw new Error('Export cancelled by user');
            }
        }
        
        let finalData = finalResult;
        
        // Calculate fade samples
        const fadeInSamples = settings.enableFadeIn ? 
            Math.floor(settings.fadeInDuration * sampleRate) : 0;
        const fadeOutSamples = settings.enableFadeOut ? 
            Math.floor(settings.fadeOutDuration * sampleRate) : 0;
        
        // Apply fade and normalization in the correct order
        if (settings.fadeBeforeNorm) {
            // Apply fades first
            if (fadeInSamples > 0 || fadeOutSamples > 0) {
                console.log('🎵 SEQUENTIAL EXPORT: Applying fades to complete signal...');
                finalData = this.applyFadeEnvelope(
                    finalData, fadeInSamples, fadeOutSamples,
                    settings.fadeInPower, settings.fadeOutPower
                );
            }
            
            // Then normalize
            if (settings.enableNormalization) {
                console.log('🎵 SEQUENTIAL EXPORT: Applying normalization to complete signal...');
                finalData = this.normalizeSignal(finalData, settings.normalizeValue);
            }
        } else {
            // Normalize first
            if (settings.enableNormalization) {
                console.log('🎵 SEQUENTIAL EXPORT: Applying normalization to complete signal...');
                finalData = this.normalizeSignal(finalData, settings.normalizeValue);
            }
            
            // Then apply fades
            if (fadeInSamples > 0 || fadeOutSamples > 0) {
                console.log('🎵 SEQUENTIAL EXPORT: Applying fades to complete signal...');
                finalData = this.applyFadeEnvelope(
                    finalData, fadeInSamples, fadeOutSamples,
                    settings.fadeInPower, settings.fadeOutPower
                );
            }
        }
        
        console.log('🎵 SEQUENTIAL EXPORT: Export complete,', finalData.length, 'samples ready');
        return finalData;
    }

    /**
     * Process a single chunk (internal method for chunked export)
     * @param {number} chunkDuration - Duration of chunk in seconds
     * @param {Object} trackConfig - Track configuration
     * @param {Object} settings - Export settings  
     * @returns {Promise<Float32Array>} Processed chunk data
     */
    async processChunk(chunkDuration, trackConfig, settings) {
        const sampleRate = settings.exportSampleRate || 44100;
        const chunkSamples = Math.floor(chunkDuration * sampleRate);
        
        // Initialize chunk mix buffer
        let mixedData = new Float32Array(chunkSamples);
        
        // Process each track and mix them together (same logic as direct export)
        if (trackConfig.tracks && trackConfig.tracks.length > 0) {
            for (let trackIndex = 0; trackIndex < trackConfig.tracks.length; trackIndex++) {
                const track = trackConfig.tracks[trackIndex];
                
                if (!track.enabled) {
                    continue;
                }
                
                // Generate white noise for this track chunk
                const trackNoise = this.generateWhiteNoise(chunkSamples);
                
                // Apply filters to this track chunk
                let trackData = trackNoise;
                
                if (track.filters && track.filters.length > 0) {
                    for (let i = 0; i < track.filters.length; i++) {
                        const filter = track.filters[i];
                        if (filter.enabled) {
                            trackData = this.applyFilterFFT(trackData, filter, sampleRate);
                        }
                    }
                }
                
                // Apply track gain
                if (track.gain !== undefined && track.gain !== 1.0) {
                    const trackGainLinear = typeof track.gain === 'number' && track.gain > 0 && track.gain < 10
                        ? track.gain  // Already linear
                        : Math.pow(10, (track.gain || 0) / 20);  // Convert dB to linear
                    
                    trackData = trackData.map(sample => sample * trackGainLinear);
                }
                
                // Mix this track into the chunk
                for (let i = 0; i < chunkSamples; i++) {
                    mixedData[i] += trackData[i];
                }
            }
        } else {
            // Fallback: generate single white noise if no tracks
            mixedData = this.generateWhiteNoise(chunkSamples);
        }
        
        // Apply export-specific amplitude (like Python version)
        if (settings.exportAmplitude !== 1.0) {
            mixedData = mixedData.map(sample => sample * settings.exportAmplitude);
        }
        
        return mixedData;
    }

    /**
     * Generate white noise samples directly (no AudioWorklet)
     * @param {number} numSamples - Number of samples to generate
     * @returns {Float32Array} White noise samples
     */
    generateWhiteNoise(numSamples) {
        const samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            // Generate white noise: random values between -1 and 1
            samples[i] = (Math.random() - 0.5) * 2.0;
        }
        return samples;
    }

    /**
     * Apply filter using FFT approach (like Python version)
     * @param {Float32Array} data - Input audio data
     * @param {Object} filter - Filter configuration
     * @param {number} sampleRate - Sample rate
     * @returns {Float32Array} Filtered audio data
     */
    applyFilterFFT(data, filter, sampleRate) {
        // Reduced logging for performance - only log filter type, not sample count
        console.log('🎵 FFT FILTER:', filter.type);
        
        // For now, implement plateau filter (most common in our tests)
        if (filter.type === 'plateau') {
            return this.applyPlateauFilter(data, filter, sampleRate);
        }
        
        // For other filters, return data unchanged for now
        console.log('🎵 FFT FILTER: Filter type', filter.type, 'not implemented yet, returning unchanged');
        return data;
    }

    /**
     * Apply plateau filter using FFT (Python-style)
     * @param {Float32Array} data - Input audio data
     * @param {Object} filter - Plateau filter configuration
     * @param {number} sampleRate - Sample rate
     * @returns {Float32Array} Filtered audio data
     */
    applyPlateauFilter(data, filter, sampleRate) {
        // Create FFT-friendly size (power of 2)
        const fftSize = Math.pow(2, Math.ceil(Math.log2(data.length)));
        
        // Pad data to FFT size
        const paddedData = new Float32Array(fftSize);
        paddedData.set(data);
        
        // Convert to complex numbers for FFT
        const complexData = new Array(fftSize);
        for (let i = 0; i < fftSize; i++) {
            complexData[i] = [paddedData[i], 0]; // [real, imaginary]
        }
        
        // Apply FFT
        const spectrum = this.fft(complexData);
        
        // Create frequency mask (plateau shape)
        const mask = this.createPlateauMask(fftSize, filter.centerFreq, filter.width, filter.flatWidth, sampleRate);
        
        // Convert filter gain from dB to linear
        const gainLinear = Math.pow(10, (filter.gain || 0) / 20);
        
        // Apply filter mask with gain
        for (let i = 0; i < fftSize; i++) {
            const maskValue = mask[i] * gainLinear;
            spectrum[i][0] *= maskValue; // real part
            spectrum[i][1] *= maskValue; // imaginary part
        }
        
        // Apply inverse FFT
        const filteredComplex = this.ifft(spectrum);
        
        // Convert back to real values and trim to original size
        const result = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            result[i] = filteredComplex[i][0]; // Take real part
        }
        
        return result;
    }

    /**
     * Create plateau frequency mask (improved to match Python version)
     * @param {number} fftSize - FFT size
     * @param {number} centerFreq - Center frequency in Hz
     * @param {number} width - Total filter width in Hz
     * @param {number} flatWidth - Flat section width in Hz
     * @param {number} sampleRate - Sample rate
     * @returns {Float32Array} Frequency mask
     */
    createPlateauMask(fftSize, centerFreq, width, flatWidth = width * 0.5, sampleRate) {
        const mask = new Float32Array(fftSize);
        
        for (let i = 0; i < fftSize; i++) {
            // Calculate frequency for this bin (handle positive and negative frequencies)
            const freq = i <= fftSize / 2 
                ? (i * sampleRate) / fftSize 
                : ((i - fftSize) * sampleRate) / fftSize;
            
            // Calculate distance from center frequency
            const freqDiff = Math.abs(freq - centerFreq);
            
            // Plateau filter logic (matching Python version)
            if (freqDiff < flatWidth / 2) {
                // Flat plateau region
                mask[i] = 1.0;
            } else if (freqDiff <= width / 2) {
                // Cosine rolloff from plateau to zero
                const rolloffDistance = freqDiff - flatWidth / 2;
                const rolloffRange = width / 2 - flatWidth / 2;
                
                if (rolloffRange > 0) {
                    const rolloffPosition = rolloffDistance / rolloffRange;
                    mask[i] = 0.5 * (1 + Math.cos(Math.PI * rolloffPosition));
                } else {
                    mask[i] = 1.0; // No rolloff range
                }
            } else {
                // Outside filter width
                mask[i] = 0.0;
            }
        }
        
        return mask;
    }

    /**
     * Simple FFT implementation (Cooley-Tukey)
     * @param {Array} x - Complex input array [[real, imag], ...]
     * @returns {Array} Complex output array
     */
    fft(x) {
        const N = x.length;
        if (N <= 1) return x;
        
        // Divide
        const even = this.fft(x.filter((_, i) => i % 2 === 0));
        const odd = this.fft(x.filter((_, i) => i % 2 === 1));
        
        // Combine
        const combined = new Array(N);
        for (let k = 0; k < N / 2; k++) {
            const angle = -2 * Math.PI * k / N;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            // Complex multiplication: odd[k] * e^(-2πik/N)
            const tReal = cos * odd[k][0] - sin * odd[k][1];
            const tImag = cos * odd[k][1] + sin * odd[k][0];
            
            combined[k] = [even[k][0] + tReal, even[k][1] + tImag];
            combined[k + N/2] = [even[k][0] - tReal, even[k][1] - tImag];
        }
        
        return combined;
    }

    /**
     * Inverse FFT
     * @param {Array} X - Complex input array
     * @returns {Array} Complex output array
     */
    ifft(X) {
        // Conjugate the complex numbers
        const conjugated = X.map(([real, imag]) => [real, -imag]);
        
        // Apply FFT
        const result = this.fft(conjugated);
        
        // Conjugate and normalize
        return result.map(([real, imag]) => [real / X.length, -imag / X.length]);
    }

    /**
     * Apply cosine fade envelope to signal (like Python AudioExporter.apply_envelope)
     * @param {Float32Array} signal - Input signal
     * @param {number} fadeInSamples - Number of fade-in samples
     * @param {number} fadeOutSamples - Number of fade-out samples
     * @param {number} fadeInPower - Fade-in power curve (default 2.0)
     * @param {number} fadeOutPower - Fade-out power curve (default 2.0)
     * @returns {Float32Array} Signal with fade envelope applied
     */
    applyFadeEnvelope(signal, fadeInSamples, fadeOutSamples, fadeInPower = 2.0, fadeOutPower = 2.0) {
        console.log('🎵 FADE: Applying fade envelope to', signal.length, 'samples');
        console.log('🎵 FADE: Fade-in samples:', fadeInSamples, 'Fade-out samples:', fadeOutSamples);
        
        if (fadeInSamples <= 0 && fadeOutSamples <= 0) {
            console.log('🎵 FADE: No fade requested, returning unchanged');
            return signal;
        }
        
        const result = new Float32Array(signal.length);
        
        // Validate fade lengths don't exceed signal length
        const totalFade = fadeInSamples + fadeOutSamples;
        if (totalFade >= signal.length) {
            console.log('🎵 FADE: Warning - fade lengths exceed signal length, adjusting');
            const scaleFactor = (signal.length - 1) / totalFade;
            fadeInSamples = Math.floor(fadeInSamples * scaleFactor);
            fadeOutSamples = Math.floor(fadeOutSamples * scaleFactor);
        }
        
        for (let i = 0; i < signal.length; i++) {
            let envelope = 1.0;
            
            // Apply fade-in
            if (i < fadeInSamples) {
                const t = i / fadeInSamples;  // 0 to 1
                envelope = Math.pow(0.5 * (1 - Math.cos(Math.PI * t)), fadeInPower);
            }
            // Apply fade-out
            else if (i >= signal.length - fadeOutSamples) {
                const t = (signal.length - 1 - i) / fadeOutSamples;  // 1 to 0
                envelope = Math.pow(0.5 * (1 - Math.cos(Math.PI * t)), fadeOutPower);
            }
            
            result[i] = signal[i] * envelope;
        }
        
        console.log('🎵 FADE: Fade envelope applied successfully');
        return result;
    }

    /**
     * Create WAV blob from audio data
     * @param {Float32Array} audioData - Audio samples
     * @param {number} sampleRate - Sample rate
     * @returns {Blob} WAV file blob
     */
    createWavBlob(audioData, sampleRate) {
        const length = audioData.length;
        console.log('🎵 WAV CREATION: Input audio data length:', length, 'samples');
        console.log('🎵 WAV CREATION: Sample rate:', sampleRate, 'Hz');
        console.log('🎵 WAV CREATION: Duration:', length / sampleRate, 'seconds');
        
        const buffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(buffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);
        
        console.log('🎵 WAV CREATION: WAV header data chunk size:', length * 2, 'bytes');
        console.log('🎵 WAV CREATION: Total file size:', 44 + length * 2, 'bytes');
        
        // Audio data
        const offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, audioData[i]));
            view.setInt16(offset + i * 2, sample * 0x7FFF, true);
        }
        
        console.log('🎵 WAV CREATION: Audio data written:', length, 'samples');
        
        return new Blob([buffer], { type: 'audio/wav' });
    }

    /**
     * Download WAV file
     * @param {Blob} blob - WAV blob
     * @param {string} filename - Filename
     */
    downloadWav(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Export for use in other modules
window.SimpleAudioExporter = SimpleAudioExporter; 