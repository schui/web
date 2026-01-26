/**
 * NoiseShaper Web - White Noise AudioWorklet Processor
 * High-performance white noise generation in dedicated audio thread
 * 
 * Features:
 * - High-quality white noise using Linear Congruential Generator
 * - Real-time gain parameter control
 * - Professional audio quality matching Python reference
 * - Optimized for 128-sample processing blocks
 */

class NoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Initialize high-quality noise generator
        // Linear Congruential Generator parameters (Park and Miller)
        this.seed = Math.floor(Math.random() * 2147483647);
        this.multiplier = 16807;
        this.modulus = 2147483647;
        
        // Audio parameters
        this.gain = 0.5; // Default gain (50%)
        this.isActive = false;
        
        // Setup parameter message handling
        this.port.onmessage = (event) => {
            const { type, value } = event.data;
            
            switch (type) {
                case 'setGain':
                    this.gain = Math.max(0, Math.min(1, value));
                    break;
                case 'start':
                    this.isActive = true;
                    // Re-seed for fresh noise on each start
                    this.seed = Math.floor(Math.random() * 2147483647);
                    break;
                case 'stop':
                    this.isActive = false;
                    break;
                default:
                    console.warn(`Unknown message type: ${type}`);
            }
        };
        
        // Notify main thread that processor is ready
        this.port.postMessage({ type: 'ready' });
    }
    
    /**
     * Generate high-quality white noise sample
     * Uses Linear Congruential Generator for consistent, high-quality noise
     * @returns {number} Noise sample in range [-1, 1]
     */
    generateNoiseSample() {
        // Linear Congruential Generator
        this.seed = (this.multiplier * this.seed) % this.modulus;
        
        // Convert to floating point in range [-1, 1]
        // Normalize from [1, modulus-1] to [-1, 1]
        return (2.0 * this.seed / this.modulus) - 1.0;
    }
    
    /**
     * Convert linear gain (0-1) to dB
     * @param {number} linearGain - Linear gain value 0-1
     * @returns {number} Gain in dB
     */
    linearToDb(linearGain) {
        return linearGain === 0 ? -Infinity : 20 * Math.log10(linearGain);
    }
    
    /**
     * Main audio processing function
     * Called by Web Audio API for each 128-sample block
     */
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        
        // Only process if we have output channels
        if (!output || output.length === 0) {
            return true;
        }
        
        const blockSize = output[0].length;
        
        // Generate noise samples for all channels
        for (let channel = 0; channel < output.length; channel++) {
            const channelData = output[channel];
            
            for (let i = 0; i < blockSize; i++) {
                if (this.isActive) {
                    // Generate high-quality white noise
                    const noiseSample = this.generateNoiseSample();
                    
                    // Apply gain
                    channelData[i] = noiseSample * this.gain;
                } else {
                    // Output silence when inactive
                    channelData[i] = 0;
                }
            }
        }
        
        // Continue processing
        return true;
    }
    
    /**
     * Define the processor's parameter descriptors
     * Currently using message-based parameter updates for more control
     */
    static get parameterDescriptors() {
        return [];
    }
}

// Register the processor
registerProcessor('noise-processor', NoiseProcessor); 