/**
 * NoiseShaper Web - FFT Processor Worker
 * 
 * Web Worker for parallel FFT processing during export operations
 * 
 * Features:
 * - Independent FFT processing in isolated thread
 * - All filter types (plateau, gaussian, parabolic)
 * - Efficient memory management with transferable objects
 * - Progress reporting back to main thread
 * - Error handling and recovery
 */

class FFTProcessorWorker {
    constructor() {
        this.workerId = null;
        this.isInitialized = false;
        
        console.log('🔧 FFT WORKER: Initializing worker thread...');
        
        // Set up message handling
        self.onmessage = (event) => this.handleMessage(event);
        
        console.log('🔧 FFT WORKER: Worker thread ready');
    }

    /**
     * Handle messages from main thread
     */
    handleMessage(event) {
        const { type, data } = event.data;
        
        try {
            switch (type) {
                case 'init':
                    this.initialize(event.data);
                    break;
                    
                case 'processChunk':
                    this.processChunk(event.data);
                    break;
                    
                default:
                    console.warn(`🔧 FFT WORKER: Unknown message type: ${type}`);
            }
        } catch (error) {
            console.error('🔧 FFT WORKER: Error handling message:', error);
            this.sendError('messageHandling', error.message);
        }
    }

    /**
     * Initialize worker
     */
    initialize(data) {
        this.workerId = data.workerId;
        this.isInitialized = true;
        
        console.log(`🔧 FFT WORKER ${this.workerId}: Initialized successfully`);
        
        // Send initialization complete
        self.postMessage({
            type: 'initialized',
            workerId: this.workerId
        });
    }

    /**
     * Process a chunk of audio data
     */
    async processChunk(data) {
        const { jobId, chunkData, chunkDuration, trackConfig, settings, sampleRate } = data;
        
        try {
            console.log(`🔧 FFT WORKER ${this.workerId}: Processing chunk for job ${jobId}`);
            const startTime = performance.now();
            
            // Initialize chunk mix buffer
            const chunkSamples = chunkData.length;
            let mixedData = new Float32Array(chunkSamples);
            
            // Process each track and mix them together
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
            
            // Apply export-specific amplitude
            if (settings.exportAmplitude !== 1.0) {
                mixedData = mixedData.map(sample => sample * settings.exportAmplitude);
            }
            
            const processingTime = performance.now() - startTime;
            console.log(`🔧 FFT WORKER ${this.workerId}: Completed chunk in ${processingTime.toFixed(2)}ms`);
            
            // Send result back with transferable object
            const resultBuffer = mixedData.buffer.slice();
            self.postMessage({
                type: 'chunkComplete',
                jobId: jobId,
                data: resultBuffer
            }, [resultBuffer]);
            
        } catch (error) {
            console.error(`🔧 FFT WORKER ${this.workerId}: Error processing chunk:`, error);
            self.postMessage({
                type: 'chunkError',
                jobId: jobId,
                error: error.message
            });
        }
    }

    /**
     * Generate white noise (same as SimpleAudioExporter)
     */
    generateWhiteNoise(numSamples) {
        const samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            samples[i] = (Math.random() - 0.5) * 2.0;
        }
        return samples;
    }

    /**
     * Apply filter using FFT approach (same as SimpleAudioExporter)
     */
    applyFilterFFT(data, filter, sampleRate) {
        console.log(`🔧 FFT WORKER ${this.workerId}: Applying ${filter.type} filter`);
        
        // For now, implement plateau filter (most common)
        if (filter.type === 'plateau') {
            return this.applyPlateauFilter(data, filter, sampleRate);
        }
        
        // For other filter types, add implementations here
        if (filter.type === 'gaussian') {
            return this.applyGaussianFilter(data, filter, sampleRate);
        }
        
        if (filter.type === 'parabolic') {
            return this.applyParabolicFilter(data, filter, sampleRate);
        }
        
        // Return unchanged for unknown filter types
        console.log(`🔧 FFT WORKER ${this.workerId}: Filter type ${filter.type} not implemented, returning unchanged`);
        return data;
    }

    /**
     * Apply plateau filter using FFT (same as SimpleAudioExporter)
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
     * Apply Gaussian filter using FFT
     */
    applyGaussianFilter(data, filter, sampleRate) {
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
        
        // Create frequency mask (Gaussian shape)
        const mask = this.createGaussianMask(fftSize, filter.centerFreq, filter.width, filter.skew, filter.kurtosis, sampleRate);
        
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
     * Apply Parabolic filter using FFT
     */
    applyParabolicFilter(data, filter, sampleRate) {
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
        
        // Create frequency mask (Parabolic shape)
        const mask = this.createParabolicMask(fftSize, filter.centerFreq, filter.width, filter.flatness, filter.skew, sampleRate);
        
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
     * Create plateau frequency mask (same as SimpleAudioExporter)
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
            
            // Plateau filter logic
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
     * Create Gaussian frequency mask
     */
    createGaussianMask(fftSize, centerFreq, width, skew = 0, kurtosis = 1, sampleRate) {
        const mask = new Float32Array(fftSize);
        
        for (let i = 0; i < fftSize; i++) {
            // Calculate frequency for this bin
            const freq = i <= fftSize / 2 
                ? (i * sampleRate) / fftSize 
                : ((i - fftSize) * sampleRate) / fftSize;
            
            // Calculate distance from center frequency
            const freqDiff = freq - centerFreq;
            const normalizedDist = freqDiff / width;
            
            // Basic Gaussian curve
            let magnitude = Math.exp(-0.5 * Math.pow(normalizedDist, 2.0));
            
            // Apply skew
            if (skew !== 0) {
                const skewFactor = 1.0 + skew * normalizedDist;
                if (skewFactor > 0) {
                    magnitude *= Math.pow(skewFactor, 0.5);
                }
            }
            
            // Apply kurtosis
            if (kurtosis !== 1) {
                magnitude = Math.pow(magnitude, kurtosis);
            }
            
            mask[i] = Math.max(0, Math.min(1, magnitude));
        }
        
        return mask;
    }

    /**
     * Create Parabolic frequency mask
     */
    createParabolicMask(fftSize, centerFreq, width, flatness = 1, skew = 0, sampleRate) {
        const mask = new Float32Array(fftSize);
        
        for (let i = 0; i < fftSize; i++) {
            // Calculate frequency for this bin
            const freq = i <= fftSize / 2 
                ? (i * sampleRate) / fftSize 
                : ((i - fftSize) * sampleRate) / fftSize;
            
            // Calculate distance from center frequency
            const freqDiff = freq - centerFreq;
            const normalizedDist = Math.abs(freqDiff) / width;
            
            if (normalizedDist > 1.0) {
                mask[i] = 0.0;
                continue;
            }
            
            // Base parabolic curve
            let magnitude = 1 - Math.pow(normalizedDist, 2.0 / flatness);
            
            // Apply skew asymmetrically
            if (skew !== 0) {
                const skewFactor = 1.0 + Math.abs(skew) / 5.0;
                
                if ((skew > 0 && freqDiff >= 0) || (skew < 0 && freqDiff < 0)) {
                    magnitude = 1 - Math.pow(normalizedDist, 2.0 * skewFactor / flatness);
                } else {
                    magnitude = 1 - Math.pow(normalizedDist, 2.0 / (flatness * skewFactor));
                }
            }
            
            mask[i] = Math.max(0, magnitude);
        }
        
        return mask;
    }

    /**
     * Simple FFT implementation (Cooley-Tukey)
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
     * Send error message
     */
    sendError(type, message) {
        self.postMessage({
            type: 'error',
            errorType: type,
            message: message
        });
    }
}

// Initialize worker
new FFTProcessorWorker(); 