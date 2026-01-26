/**
 * NoiseShaper Web - Track Manager
 * Manages multiple audio tracks with individual controls and mixing
 * 
 * Features:
 * - Multiple independent noise generation tracks
 * - Individual filter chains per track
 * - Track gain and mute controls
 * - Master mixing output
 * - Real-time FFT analysis of master mix
 */

class TrackManager {
    constructor(audioEngine) {
        console.log('TrackManager constructor called');
        this.audioEngine = audioEngine;
        this.tracks = [];
        this.masterMixNode = null;
        this.masterGainNode = null;
        this.masterAnalyzer = null;
        this.isPlaying = false;
        this.listeners = new Map();
        this.isSetup = false;
        
        console.log('TrackManager constructor completed - setup deferred');
    }
    
    /**
     * Initialize the track manager (call after setting up event listeners)
     */
    async initialize() {
        if (this.isSetup) {
            return;
        }
        
        console.log('TrackManager initialize() called');
        
        // Small delay to ensure event listeners are set up
        await new Promise(resolve => setTimeout(resolve, 10));
        
        console.log('TrackManager calling setupMasterChain...');
        this.setupMasterChain();
        this.isSetup = true;
        console.log('TrackManager initialization completed');
    }
    
    /**
     * Set up the master audio processing chain
     */
    setupMasterChain() {
        console.log('TrackManager setupMasterChain called');
        
        if (!this.audioEngine.isInitialized) {
            throw new Error('Audio engine not initialized');
        }
        
        try {
            // Create master mix node for combining all tracks
            this.masterMixNode = this.audioEngine.audioContext.createGain();
            this.masterMixNode.gain.value = 1.0; // Unity gain for mixing
            
            // Create master gain node for overall volume control (speaker output)
            this.masterGainNode = this.audioEngine.audioContext.createGain();
            this.masterGainNode.gain.value = 0.2; // Default 20% (≈ -14 dB)
            
            // Create master FFT analyzer
            this.masterAnalyzer = new FFTAnalyzer(this.audioEngine.audioContext);
            
            // CORRECTED AUDIO CHAIN ARCHITECTURE:
            // Tracks → MasterMix → Split Signal:
            //   1. → MasterAnalyzer (FFT shows pre-master-volume signal)
            //   2. → MasterGain → AudioDestination (speaker output with volume control)
            this.masterMixNode.connect(this.masterGainNode);
            this.masterAnalyzer.connect(this.masterMixNode);
            this.masterGainNode.connect(this.audioEngine.audioContext.destination);
            
            console.log('Master audio chain corrected: Tracks → MasterMix → [FFT (pre-volume) + MasterGain → Output]');
            
            // Forward analyzer events
            this.masterAnalyzer.on('analyzerReady', (data) => {
                this.emit('masterAnalyzerReady', data);
            });
            
            this.masterAnalyzer.on('error', (error) => {
                this.emit('error', `Master Analyzer: ${error}`);
            });
            
            console.log('Master chain ready - emitting event');
            this.emit('masterChainReady', { 
                hasMasterAnalyzer: true 
            });
            
        } catch (error) {
            console.error('Error in setupMasterChain:', error);
            this.emit('error', `Failed to setup master chain: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Add a new track
     * @returns {Track} The newly created track
     */
    addTrack() {
        try {
            const trackId = this.tracks.length;
            const track = new Track(trackId, this.audioEngine, this.masterMixNode);
            
            // Set up track event listeners
            track.on('stateChanged', (data) => {
                this.emit('trackStateChanged', { trackId, ...data });
            });
            
            track.on('gainChanged', (data) => {
                this.emit('trackGainChanged', { trackId, ...data });
            });
            
            track.on('muteChanged', (data) => {
                this.emit('trackMuteChanged', { trackId, ...data });
            });
            
            track.on('filterChanged', (data) => {
                this.emit('trackFilterChanged', { trackId, ...data });
            });
            
            track.on('error', (error) => {
                this.emit('error', `Track ${trackId}: ${error}`);
            });
            
            this.tracks.push(track);
            
            // If the system is already playing, automatically start the new track
            if (this.isPlaying && !track.isMuted) {
                console.log(`Auto-starting new track ${trackId} (system is playing)`);
                track.start().catch(error => {
                    console.error(`Failed to auto-start track ${trackId}:`, error);
                    this.emit('error', `Failed to auto-start track ${trackId}: ${error.message}`);
                });
            }
            
            this.emit('trackAdded', { trackId, track });
            
            return track;
            
        } catch (error) {
            this.emit('error', `Failed to add track: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Remove a track by ID
     * @param {number} trackId - ID of track to remove
     */
    removeTrack(trackId) {
        if (trackId < 0 || trackId >= this.tracks.length) {
            throw new Error(`Invalid track ID: ${trackId}`);
        }
        
        try {
            console.log(`DEBUG: Removing track ${trackId}. Current tracks:`, this.tracks.map(t => ({ id: t.id, isPlaying: t.isPlaying })));
            
            const track = this.tracks[trackId];
            
            // Stop and destroy the track
            if (track.isPlaying) {
                console.log(`DEBUG: Stopping track ${trackId} before removal`);
                track.stop();
            }
            track.destroy();
            
            // Remove from tracks array
            this.tracks.splice(trackId, 1);
            console.log(`DEBUG: After splice, tracks:`, this.tracks.map(t => ({ id: t.id, isPlaying: t.isPlaying })));
            
            // Update track IDs for remaining tracks
            this.tracks.forEach((track, index) => {
                console.log(`DEBUG: Updating track ID from ${track.id} to ${index}`);
                track.id = index;
            });
            
            console.log(`DEBUG: Final tracks after ID update:`, this.tracks.map(t => ({ id: t.id, isPlaying: t.isPlaying })));
            
            this.emit('trackRemoved', { trackId });
            
        } catch (error) {
            this.emit('error', `Failed to remove track ${trackId}: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Get track by ID
     * @param {number} trackId - ID of track to get
     * @returns {Track} The track instance
     */
    getTrack(trackId) {
        if (trackId < 0 || trackId >= this.tracks.length) {
            throw new Error(`Invalid track ID: ${trackId}`);
        }
        return this.tracks[trackId];
    }
    
    /**
     * Get all tracks
     * @returns {Track[]} Array of all tracks
     */
    getAllTracks() {
        return [...this.tracks];
    }
    
    /**
     * Start all unmuted tracks
     */
    async startAll() {
        if (this.isPlaying) {
            return;
        }
        
        try {
            // Ensure audio context is running
            await this.audioEngine.resumeContext();
            
            // Start master analyzer
            if (this.masterAnalyzer) {
                this.masterAnalyzer.start();
            }
            
            // Start all unmuted tracks
            const startPromises = this.tracks
                .filter(track => !track.isMuted)
                .map(track => track.start());
            
            await Promise.all(startPromises);
            
            this.isPlaying = true;
            this.emit('allStarted');
            
        } catch (error) {
            this.emit('error', `Failed to start all tracks: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Stop all tracks
     */
    async stopAll() {
        if (!this.isPlaying) {
            return;
        }
        
        try {
            // Stop master analyzer immediately
            if (this.masterAnalyzer) {
                this.masterAnalyzer.stop();
            }
            
            // Stop all tracks
            const stopPromises = this.tracks.map(track => track.stop());
            await Promise.all(stopPromises);
            
            this.isPlaying = false;
            this.emit('allStopped');
            
        } catch (error) {
            this.emit('error', `Failed to stop all tracks: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Set master gain
     * @param {number} linearGain - Linear gain value 0-1
     */
    setMasterGain(linearGain) {
        linearGain = Math.max(0, Math.min(1, linearGain));
        
        if (this.masterGainNode) {
            const currentTime = this.audioEngine.audioContext.currentTime;
            this.masterGainNode.gain.linearRampToValueAtTime(linearGain, currentTime + 0.01);
        }
        
        this.emit('masterGainChanged', {
            linearGain: linearGain,
            dbGain: this.linearToDb(linearGain)
        });
    }
    
    /**
     * Get the master FFT analyzer instance
     * @returns {FFTAnalyzer} The master analyzer instance
     */
    getMasterAnalyzer() {
        return this.masterAnalyzer;
    }
    
    /**
     * Get current state
     */
    getState() {
        return {
            isPlaying: this.isPlaying,
            trackCount: this.tracks.length,
            tracks: this.tracks.map(track => track.getState()),
            hasMasterAnalyzer: this.masterAnalyzer !== null
        };
    }
    
    /**
     * Get export configuration for all tracks
     */
    getExportConfig() {
        return {
            tracks: this.tracks.map(track => track.getExportConfig()),
            masterGain: this.masterGainNode ? this.masterGainNode.gain.value : 1.0
        };
    }
    
    /**
     * Convert linear gain to dB
     */
    linearToDb(linearGain) {
        if (linearGain === 0) {
            return -Infinity;
        }
        return 20 * Math.log10(linearGain);
    }
    
    /**
     * Clean shutdown
     */
    destroy() {
        if (this.isPlaying) {
            this.stopAll();
        }
        
        // Destroy all tracks
        this.tracks.forEach(track => track.destroy());
        this.tracks = [];
        
        // Destroy master analyzer
        if (this.masterAnalyzer) {
            this.masterAnalyzer.destroy();
            this.masterAnalyzer = null;
        }
        
        // Disconnect master nodes
        if (this.masterMixNode) {
            this.masterMixNode.disconnect();
            this.masterMixNode = null;
        }
        
        if (this.masterGainNode) {
            this.masterGainNode.disconnect();
            this.masterGainNode = null;
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
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
}

// Export for use in other modules
window.TrackManager = TrackManager; 