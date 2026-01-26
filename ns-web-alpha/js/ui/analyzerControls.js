/**
 * NoiseShaper Web - Analyzer Controls Manager
 * Manages the analyzer settings panel UI and interactions
 * 
 * Features:
 * - FFT size configuration (512-8192)
 * - Window function selection (Hann, Hamming, Blackman, Rectangle)
 * - Scale type selection (Logarithmic/Linear)
 * - Averaging control (1-10 frames)
 * - Smoothing control (0-0.95)
 * - Real-time parameter updates
 */

class AnalyzerControlsManager {
    constructor() {
        this.analyzer = null;
        this.visualizer = null;
        this.isVisible = false;
        
        // UI elements
        this.elements = {
            configBtn: null,
            controlsPanel: null,
            fftSizeSelect: null,
            windowTypeSelect: null,
            scaleTypeSelect: null,
            averagingSlider: null,
            averagingValue: null,
            smoothingSlider: null,
            smoothingValue: null
        };
        
        this.setupUI();
    }
    
    /**
     * Initialize UI elements and event listeners
     */
    setupUI() {
        // Get UI elements
        this.elements.configBtn = document.getElementById('analyzerConfigBtn');
        this.elements.controlsPanel = document.getElementById('analyzerControls');
        this.elements.fftSizeSelect = document.getElementById('fftSizeSelect');
        this.elements.windowTypeSelect = document.getElementById('windowTypeSelect');
        this.elements.scaleTypeSelect = document.getElementById('scaleTypeSelect');
        this.elements.averagingSlider = document.getElementById('averagingSlider');
        this.elements.averagingValue = document.getElementById('averagingValue');
        this.elements.smoothingSlider = document.getElementById('smoothingSlider');
        this.elements.smoothingValue = document.getElementById('smoothingValue');
        
        if (!this.elements.configBtn || !this.elements.controlsPanel) {
            console.error('AnalyzerControls: Required UI elements not found');
            return;
        }
        
        this.setupEventListeners();
    }
    
    /**
     * Set up event listeners for all controls
     */
    setupEventListeners() {
        // Toggle button
        this.elements.configBtn.addEventListener('click', () => {
            this.toggle();
        });
        
        // FFT Size
        this.elements.fftSizeSelect?.addEventListener('change', (e) => {
            const fftSize = parseInt(e.target.value);
            this.updateAnalyzerConfig({ fftSize });
            console.log('FFT Size changed to:', fftSize);
        });
        
        // Window Type (for display only - Web Audio doesn't support window functions directly)
        this.elements.windowTypeSelect?.addEventListener('change', (e) => {
            const windowType = e.target.value;
            this.updateAnalyzerConfig({ windowType });
            console.log('Window Type changed to:', windowType);
        });
        
        // Scale Type
        this.elements.scaleTypeSelect?.addEventListener('change', (e) => {
            const scaleType = e.target.value;
            this.updateAnalyzerConfig({ scaleType });
            console.log('Scale Type changed to:', scaleType);
        });
        
        // Averaging
        this.elements.averagingSlider?.addEventListener('input', (e) => {
            const averagingCount = parseInt(e.target.value);
            this.elements.averagingValue.textContent = averagingCount;
            this.updateAnalyzerConfig({ averagingCount });
        });
        
        // Smoothing
        this.elements.smoothingSlider?.addEventListener('input', (e) => {
            const smoothing = parseFloat(e.target.value);
            this.elements.smoothingValue.textContent = smoothing.toFixed(2);
            this.updateAnalyzerConfig({ smoothingTimeConstant: smoothing });
        });
    }
    
    /**
     * Connect to analyzer instance
     * @param {FFTAnalyzer} analyzer - FFT analyzer instance
     */
    connectAnalyzer(analyzer) {
        this.analyzer = analyzer;
        
        // Sync UI with analyzer's current configuration
        this.syncWithAnalyzer();
        
        // Listen for external config changes
        analyzer.on('configUpdated', (config) => {
            this.syncWithAnalyzer();
        });
    }
    
    /**
     * Connect to visualizer instance
     * @param {SpectrumVisualizer} visualizer - Spectrum visualizer instance
     */
    connectVisualizer(visualizer) {
        this.visualizer = visualizer;
    }
    
    /**
     * Sync UI controls with analyzer configuration
     */
    syncWithAnalyzer() {
        if (!this.analyzer) return;
        
        const config = this.analyzer.getConfig();
        
        // Update selects without triggering change events
        if (this.elements.fftSizeSelect) {
            this.elements.fftSizeSelect.value = config.fftSize;
        }
        
        if (this.elements.windowTypeSelect) {
            this.elements.windowTypeSelect.value = config.windowType;
        }
        
        if (this.elements.scaleTypeSelect) {
            this.elements.scaleTypeSelect.value = config.scaleType;
        }
        
        // Update sliders and their value displays
        if (this.elements.averagingSlider) {
            this.elements.averagingSlider.value = config.averagingCount;
            this.elements.averagingValue.textContent = config.averagingCount;
        }
        
        if (this.elements.smoothingSlider) {
            this.elements.smoothingSlider.value = config.smoothing;
            this.elements.smoothingValue.textContent = config.smoothing.toFixed(2);
        }
        
        console.log('AnalyzerControls: Synced with analyzer config:', config);
    }
    
    /**
     * Update analyzer configuration
     * @param {Object} configUpdate - Configuration changes
     */
    updateAnalyzerConfig(configUpdate) {
        if (!this.analyzer) {
            console.warn('AnalyzerControls: No analyzer connected');
            return;
        }
        
        try {
            this.analyzer.updateConfig(configUpdate);
            console.log('AnalyzerControls: Updated config:', configUpdate);
        } catch (error) {
            console.error('AnalyzerControls: Failed to update config:', error);
            this.showError(`Failed to update analyzer: ${error.message}`);
        }
    }
    
    /**
     * Toggle controls panel visibility
     */
    toggle() {
        this.isVisible = !this.isVisible;
        
        if (this.isVisible) {
            this.show();
        } else {
            this.hide();
        }
    }
    
    /**
     * Show controls panel
     */
    show() {
        if (this.elements.controlsPanel) {
            this.elements.controlsPanel.style.display = 'block';
            this.isVisible = true;
            
            // Update button appearance
            this.elements.configBtn.style.backgroundColor = 'var(--accent-blue)';
            this.elements.configBtn.style.color = 'white';
        }
    }
    
    /**
     * Hide controls panel
     */
    hide() {
        if (this.elements.controlsPanel) {
            this.elements.controlsPanel.style.display = 'none';
            this.isVisible = false;
            
            // Reset button appearance
            this.elements.configBtn.style.backgroundColor = '';
            this.elements.configBtn.style.color = '';
        }
    }
    
    /**
     * Get current configuration from UI
     */
    getUIConfig() {
        return {
            fftSize: parseInt(this.elements.fftSizeSelect?.value || '2048'),
            windowType: this.elements.windowTypeSelect?.value || 'hann',
            scaleType: this.elements.scaleTypeSelect?.value || 'logarithmic',
            averagingCount: parseInt(this.elements.averagingSlider?.value || '1'),
            smoothingTimeConstant: parseFloat(this.elements.smoothingSlider?.value || '0.8')
        };
    }
    
    /**
     * Apply configuration to UI controls
     * @param {Object} config - Configuration to apply
     */
    applyConfig(config) {
        if (config.fftSize && this.elements.fftSizeSelect) {
            this.elements.fftSizeSelect.value = config.fftSize;
        }
        
        if (config.windowType && this.elements.windowTypeSelect) {
            this.elements.windowTypeSelect.value = config.windowType;
        }
        
        if (config.scaleType && this.elements.scaleTypeSelect) {
            this.elements.scaleTypeSelect.value = config.scaleType;
        }
        
        if (config.averagingCount !== undefined && this.elements.averagingSlider) {
            this.elements.averagingSlider.value = config.averagingCount;
            this.elements.averagingValue.textContent = config.averagingCount;
        }
        
        if (config.smoothingTimeConstant !== undefined && this.elements.smoothingSlider) {
            this.elements.smoothingSlider.value = config.smoothingTimeConstant;
            this.elements.smoothingValue.textContent = config.smoothingTimeConstant.toFixed(2);
        }
        
        // Update analyzer with new config
        this.updateAnalyzerConfig(config);
    }
    
    /**
     * Show error message
     * @param {string} message - Error message
     */
    showError(message) {
        console.error('AnalyzerControls:', message);
        
        // You could integrate with the existing error display system here
        const errorDisplay = document.getElementById('errorDisplay');
        const errorMessage = document.getElementById('errorMessage');
        
        if (errorDisplay && errorMessage) {
            errorMessage.textContent = message;
            errorDisplay.style.display = 'block';
            
            setTimeout(() => {
                errorDisplay.style.display = 'none';
            }, 5000);
        }
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        this.hide();
        
        // Remove event listeners
        this.elements.configBtn?.removeEventListener('click', this.toggle);
        
        this.analyzer = null;
        this.visualizer = null;
        
        console.log('AnalyzerControls: Destroyed');
    }
}

// Export for use in other modules
window.AnalyzerControlsManager = AnalyzerControlsManager;