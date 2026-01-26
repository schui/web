/**
 * NoiseShaper Web - Advanced Filter AudioWorklet Processor
 * FFT-based filtering implementation for Gaussian, Parabolic, and Plateau filters
 * 
 * Features:
 * - Real-time FFT processing
 * - Complex filter shapes in frequency domain
 * - Low-latency processing with overlap-add
 * - Professional audio quality
 */

class AdvancedFilterProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Configuration
        this.config = {
            type: 'gaussian',
            centerFreq: 1000,
            width: 500,
            gain: 0,
            skew: 0,
            kurtosis: 1,
            flatness: 1,
            flatWidth: 100,
            isActive: false,
            sampleRate: 48000
        };
        
        // FFT parameters
        this.fftSize = 2048; // Increased from 512 for better frequency resolution
        this.hopSize = this.fftSize / 8; // Reduced overlap to 87.5% (was 75%)
        this.windowSize = this.fftSize;
        
        // Processing buffers
        this.inputBuffer = new Float32Array(this.fftSize);
        this.outputBuffer = new Float32Array(this.fftSize);
        this.overlapBuffer = new Float32Array(this.fftSize);
        this.window = this.createWindow();
        this.filterMask = new Float32Array(this.fftSize);
        
        // Buffer management
        this.inputIndex = 0;
        this.outputIndex = 0;
        this.samplesProcessed = 0;
        
        // FFT arrays (real and imaginary)
        this.fftReal = new Float32Array(this.fftSize);
        this.fftImag = new Float32Array(this.fftSize);
        
        // Initialize filter mask
        this.updateFilterMask();
        
        // Handle messages from main thread
        this.port.onmessage = (event) => {
            const { type, data } = event.data;
            
            switch (type) {
                case 'config':
                    this.updateConfig(data);
                    break;
            }
        };
        
        // Signal initialization complete
        this.port.postMessage({
            type: 'initialized',
            data: { fftSize: this.fftSize, hopSize: this.hopSize }
        });
    }
    
    /**
     * Create Hanning window for smooth transitions
     */
    createWindow() {
        const window = new Float32Array(this.windowSize);
        for (let i = 0; i < this.windowSize; i++) {
            window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (this.windowSize - 1)));
        }
        return window;
    }
    
    /**
     * Update filter configuration
     */
    updateConfig(newConfig) {
        // Update configuration
        Object.assign(this.config, newConfig);
        
        // Recalculate filter mask
        this.updateFilterMask();
    }
    
    /**
     * Update the frequency domain filter mask
     */
    updateFilterMask() {
        if (!this.config.isActive) {
            // Bypass mode - unity gain
            this.filterMask.fill(1.0);
            return;
        }
        
        const gainLinear = Math.pow(10, this.config.gain / 20);
        
        // Calculate frequency for each bin
        for (let i = 0; i < this.fftSize / 2 + 1; i++) {
            const frequency = (i * this.config.sampleRate) / this.fftSize;
            let magnitude = 1.0;
            
            switch (this.config.type) {
                case 'gaussian':
                    magnitude = this.calculateGaussianMagnitude(frequency);
                    break;
                case 'parabolic':
                    magnitude = this.calculateParabolicMagnitude(frequency);
                    break;
                case 'plateau':
                    magnitude = this.calculatePlateauMagnitude(frequency);
                    break;
            }
            
            // Apply gain smoothly to avoid discontinuities
            magnitude = 1.0 + (magnitude - 1.0) * gainLinear;
            
            // Set magnitude for positive frequencies
            this.filterMask[i] = magnitude;
            
            // Mirror for negative frequencies (except DC and Nyquist)
            if (i > 0 && i < this.fftSize / 2) {
                this.filterMask[this.fftSize - i] = magnitude;
            }
        }
        
        // Apply smoothing to reduce artifacts
        this.smoothFilterMask();
    }
    
    /**
     * Apply smoothing to filter mask to reduce artifacts
     */
    smoothFilterMask() {
        // Light smoothing with 3-point average to reduce sharp transitions
        const smoothed = new Float32Array(this.filterMask.length);
        
        // Copy original mask
        smoothed.set(this.filterMask);
        
        // Apply smoothing only to positive frequencies
        for (let i = 1; i < this.fftSize / 2; i++) {
            const prev = this.filterMask[i - 1];
            const curr = this.filterMask[i];
            const next = this.filterMask[i + 1];
            
            // Light smoothing (80% original, 20% average)
            smoothed[i] = 0.8 * curr + 0.2 * (prev + curr + next) / 3;
            
            // Mirror for negative frequencies
            smoothed[this.fftSize - i] = smoothed[i];
        }
        
        this.filterMask.set(smoothed);
    }
    
    /**
     * Calculate Gaussian filter magnitude
     */
    calculateGaussianMagnitude(frequency) {
        const z = (frequency - this.config.centerFreq) / (this.config.width + 1e-10);
        const zSquared = z * z;
        const zKurtosis = Math.pow(zSquared, this.config.kurtosis);
        
        // Simplified error function approximation for skew
        const erfApprox = (x) => {
            const a1 =  0.254829592;
            const a2 = -0.284496736;
            const a3 =  1.421413741;
            const a4 = -1.453152027;
            const a5 =  1.061405429;
            const p  =  0.3275911;
            
            const sign = x < 0 ? -1 : 1;
            x = Math.abs(x);
            
            const t = 1.0 / (1.0 + p * x);
            const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
            
            return sign * y;
        };
        
        const skewnessTerm = 1 + erfApprox(this.config.skew * z / Math.sqrt(2));
        return Math.exp(-zKurtosis / 2) * Math.max(0, skewnessTerm);
    }
    
    /**
     * Calculate Parabolic filter magnitude
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
     * Calculate Plateau filter magnitude
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
     * Simple FFT implementation (radix-2)
     */
    fft(real, imag) {
        const N = real.length;
        
        // Bit-reverse permutation
        let j = 0;
        for (let i = 1; i < N; i++) {
            let bit = N >> 1;
            while (j & bit) {
                j ^= bit;
                bit >>= 1;
            }
            j ^= bit;
            
            if (i < j) {
                [real[i], real[j]] = [real[j], real[i]];
                [imag[i], imag[j]] = [imag[j], imag[i]];
            }
        }
        
        // FFT computation
        for (let len = 2; len <= N; len <<= 1) {
            const wlen = -2 * Math.PI / len;
            const wlenReal = Math.cos(wlen);
            const wlenImag = Math.sin(wlen);
            
            for (let i = 0; i < N; i += len) {
                let wReal = 1;
                let wImag = 0;
                
                for (let j = 0; j < len / 2; j++) {
                    const u = i + j;
                    const v = i + j + len / 2;
                    
                    const uReal = real[u];
                    const uImag = imag[u];
                    const vReal = real[v] * wReal - imag[v] * wImag;
                    const vImag = real[v] * wImag + imag[v] * wReal;
                    
                    real[u] = uReal + vReal;
                    imag[u] = uImag + vImag;
                    real[v] = uReal - vReal;
                    imag[v] = uImag - vImag;
                    
                    const nextWReal = wReal * wlenReal - wImag * wlenImag;
                    const nextWImag = wReal * wlenImag + wImag * wlenReal;
                    wReal = nextWReal;
                    wImag = nextWImag;
                }
            }
        }
    }
    
    /**
     * Inverse FFT implementation
     */
    ifft(real, imag) {
        // Conjugate
        for (let i = 0; i < imag.length; i++) {
            imag[i] = -imag[i];
        }
        
        // Forward FFT
        this.fft(real, imag);
        
        // Conjugate and scale
        const N = real.length;
        for (let i = 0; i < N; i++) {
            real[i] /= N;
            imag[i] = -imag[i] / N;
        }
    }
    
    /**
     * Process a frame of audio data
     */
    processFrame() {
        // Copy input buffer and apply window
        for (let i = 0; i < this.fftSize; i++) {
            this.fftReal[i] = this.inputBuffer[i] * this.window[i];
            this.fftImag[i] = 0;
        }
        
        // Forward FFT
        this.fft(this.fftReal, this.fftImag);
        
        // Apply filter in frequency domain
        for (let i = 0; i < this.fftSize; i++) {
            this.fftReal[i] *= this.filterMask[i];
            this.fftImag[i] *= this.filterMask[i];
        }
        
        // Inverse FFT
        this.ifft(this.fftReal, this.fftImag);
        
        // Apply window and overlap-add
        for (let i = 0; i < this.fftSize; i++) {
            this.outputBuffer[i] = this.fftReal[i] * this.window[i] + this.overlapBuffer[i];
        }
        
        // Store overlap for next frame with proper windowing
        for (let i = 0; i < this.fftSize - this.hopSize; i++) {
            this.overlapBuffer[i] = this.outputBuffer[i + this.hopSize];
        }
        // Clear remaining buffer
        this.overlapBuffer.fill(0, this.fftSize - this.hopSize);
    }
    
    /**
     * Main audio processing function
     */
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        
        if (!input || !input[0] || !output || !output[0]) {
            return true;
        }
        
        const inputChannel = input[0];
        const outputChannel = output[0];
        const frameSize = inputChannel.length;
        
        for (let i = 0; i < frameSize; i++) {
            // Fill input buffer
            this.inputBuffer[this.inputIndex] = inputChannel[i];
            this.inputIndex++;
            
            // Process when buffer is full
            if (this.inputIndex >= this.hopSize) {
                this.processFrame();
                
                // Shift input buffer
                this.inputBuffer.copyWithin(0, this.hopSize);
                this.inputIndex -= this.hopSize;
            }
            
            // Output processed sample with bounds checking
            outputChannel[i] = this.outputBuffer[this.outputIndex] || 0;
            this.outputIndex = (this.outputIndex + 1) % this.hopSize;
        }
        
        return true;
    }
}

registerProcessor('advanced-filter-processor', AdvancedFilterProcessor);