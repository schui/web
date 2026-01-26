/**
 * NoiseShaper Web - Audio Engine
 * Manages AudioContext, cross-browser compatibility, and audio system setup
 * 
 * Features:
 * - Cross-browser AudioContext support
 * - User gesture requirement handling (Safari/mobile)
 * - Robust error handling and recovery
 * - AudioWorklet management
 * - System information reporting
 */

class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.isInitialized = false;
        this.isSupported = false;
        this.userGestureRequired = true;
        this.listeners = new Map();
        
        // Audio system information
        this.systemInfo = {
            sampleRate: null,
            bufferSize: null,
            maxChannels: null,
            browserInfo: this.getBrowserInfo()
        };
        
        // Delay support check to allow event listeners to be set up
        setTimeout(() => this.checkSupport(), 0);
    }
    
    /**
     * Check Web Audio API support and feature availability
     */
    checkSupport() {
        // Check basic Web Audio API support
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        
        if (!AudioContext) {
            this.isSupported = false;
            this.emit('error', 'Web Audio API is not supported in this browser');
            return;
        }
        
        // Check AudioWorklet support
        if (!window.AudioWorkletNode) {
            this.isSupported = false;
            this.emit('error', 'AudioWorklet is not supported in this browser');
            return;
        }
        
        this.isSupported = true;
        this.emit('supportChecked', { isSupported: true });
    }
    
    /**
     * Initialize the audio system
     * Must be called from a user gesture (click, touch, etc.)
     */
    async initialize() {
        if (!this.isSupported) {
            throw new Error('Web Audio API is not supported');
        }
        
        if (this.isInitialized) {
            return;
        }
        
        try {
            // Create AudioContext with fallback for older browsers
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            
            // Handle suspended context (required for user gesture)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            // Gather system information
            this.systemInfo.sampleRate = this.audioContext.sampleRate;
            this.systemInfo.bufferSize = this.audioContext.baseLatency ? 
                Math.round(this.audioContext.baseLatency * this.audioContext.sampleRate) : 'Unknown';
            this.systemInfo.maxChannels = this.audioContext.destination.maxChannelCount;
            
            // Load AudioWorklet processor
            await this.loadAudioWorklet();
            
            this.isInitialized = true;
            this.userGestureRequired = false;
            
            this.emit('initialized', {
                systemInfo: this.systemInfo
            });
            
        } catch (error) {
            this.emit('error', `Failed to initialize audio: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Load the AudioWorklet processor
     */
    async loadAudioWorklet() {
        try {
            await this.audioContext.audioWorklet.addModule('worklets/noise-processor.js');
            this.emit('workletLoaded');
        } catch (error) {
            throw new Error(`Failed to load AudioWorklet: ${error.message}`);
        }
    }
    
    /**
     * Create and configure a noise generator node
     */
    createNoiseGenerator() {
        if (!this.isInitialized) {
            throw new Error('Audio engine not initialized');
        }
        
        try {
            const noiseNode = new AudioWorkletNode(this.audioContext, 'noise-processor');
            
            // Handle messages from the processor
            noiseNode.port.onmessage = (event) => {
                const { type, data } = event.data;
                this.emit('processorMessage', { type, data });
            };
            
            return noiseNode;
        } catch (error) {
            throw new Error(`Failed to create noise generator: ${error.message}`);
        }
    }
    
    /**
     * Get browser information for debugging
     */
    getBrowserInfo() {
        const userAgent = navigator.userAgent;
        
        if (userAgent.includes('Chrome')) {
            return 'Chrome/Chromium';
        } else if (userAgent.includes('Firefox')) {
            return 'Firefox';
        } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
            return 'Safari';
        } else if (userAgent.includes('Edge')) {
            return 'Edge';
        } else {
            return 'Unknown';
        }
    }
    
    /**
     * Check if user gesture is required for audio
     */
    requiresUserGesture() {
        return this.userGestureRequired || 
               (this.audioContext && this.audioContext.state === 'suspended');
    }
    
    /**
     * Resume audio context if suspended
     */
    async resumeContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                this.userGestureRequired = false;
                this.emit('contextResumed');
            } catch (error) {
                this.emit('error', `Failed to resume audio context: ${error.message}`);
                throw error;
            }
        }
    }
    
    /**
     * Get current audio context state
     */
    getState() {
        return {
            isSupported: this.isSupported,
            isInitialized: this.isInitialized,
            contextState: this.audioContext ? this.audioContext.state : 'not-created',
            userGestureRequired: this.requiresUserGesture(),
            systemInfo: this.systemInfo
        };
    }
    
    /**
     * Clean shutdown of audio system
     */
    async destroy() {
        if (this.audioContext) {
            try {
                await this.audioContext.close();
            } catch (error) {
                console.warn('Error closing audio context:', error);
            }
            this.audioContext = null;
        }
        
        this.isInitialized = false;
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
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
}

// Export for use in other modules
window.AudioEngine = AudioEngine; 