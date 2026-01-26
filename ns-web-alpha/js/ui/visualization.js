/**
 * NoiseShaper Web - Spectrum Visualization
 * Canvas-based real-time FFT spectrum display
 * 
 * Features:
 * - High-performance Canvas 2D rendering at 60fps
 * - Logarithmic frequency scale (20 Hz - 20 kHz)
 * - Professional dB magnitude display (-120 to 0 dB)
 * - Frequency and amplitude grid markers
 * - Gradient spectrum fills matching audio software standards
 * - Responsive design with automatic scaling
 */

class SpectrumVisualizer {
    constructor(canvasElement, options = {}) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');
        this.isActive = false;
        this.animationId = null;
        
        // Configuration
        this.config = {
            backgroundColor: '#1a1a1a',
            gridColor: '#404040',
            textColor: '#b0b0b0',
            spectrumColor: '#4a9eff',
            gradientTop: '#4a9eff',
            gradientBottom: 'rgba(74, 158, 255, 0.1)',
            lineWidth: 1,
            fontSize: 11,
            fontFamily: 'Segoe UI, sans-serif',
            padding: {
                top: 20,
                right: 60,
                bottom: 40,
                left: 60
            },
            // Frequency range
            minFrequency: 20,
            maxFrequency: 20000,
            // dB range
            minDecibels: -120,
            maxDecibels: 0,
            // Scale type
            scaleType: 'logarithmic', // 'logarithmic' or 'linear'
            // Grid settings
            frequencyMarkers: {
                logarithmic: [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000],
                linear: [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000, 20000]
            },
            decibelMarkers: [-120, -100, -80, -60, -40, -20, 0],
            ...options
        };
        
        // Drawing properties
        this.width = 0;
        this.height = 0;
        this.plotWidth = 0;
        this.plotHeight = 0;
        this.plotX = 0;
        this.plotY = 0;
        
        // Data
        this.spectrumData = null;
        this.filterResponse = null;
        this.analyzer = null;
        this.filterManager = null;
        
        // Performance optimization
        this.lastFrameTime = 0;
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
        
        this.setupCanvas();
        this.setupEventListeners();
    }
    
    /**
     * Set up canvas and calculate drawing areas
     */
    setupCanvas() {
        this.updateCanvasSize();
        this.calculateDrawingAreas();
        
        // Set canvas properties for crisp rendering
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'center';
        this.ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`;
        
        // Initial render
        this.drawBackground();
    }
    
    /**
     * Update canvas size for high-DPI displays
     */
    updateCanvasSize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // Set actual canvas size
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        // Scale context for high-DPI
        this.ctx.scale(dpr, dpr);
        
        // Set CSS size
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        this.width = rect.width;
        this.height = rect.height;
    }
    
    /**
     * Calculate drawing areas within canvas
     */
    calculateDrawingAreas() {
        this.plotX = this.config.padding.left;
        this.plotY = this.config.padding.top;
        this.plotWidth = this.width - this.config.padding.left - this.config.padding.right;
        this.plotHeight = this.height - this.config.padding.top - this.config.padding.bottom;
    }
    
    /**
     * Set up event listeners for responsive behavior
     */
    setupEventListeners() {
        // Handle canvas resize
        const resizeObserver = new ResizeObserver(() => {
            this.updateCanvasSize();
            this.calculateDrawingAreas();
            if (!this.isActive) {
                this.drawBackground();
            }
        });
        resizeObserver.observe(this.canvas);
        
        // Handle visibility changes for performance
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isActive) {
                this.pause();
            } else if (!document.hidden && this.analyzer) {
                this.resume();
            }
        });
    }
    
    /**
     * Connect to FFT analyzer
     * @param {FFTAnalyzer} analyzer - FFT analyzer instance
     */
    connectAnalyzer(analyzer) {
        this.analyzer = analyzer;
        
        // Sync scale type with analyzer
        this.config.scaleType = analyzer.scaleType;
        
        analyzer.on('started', () => {
            this.start();
        });
        
        analyzer.on('stopped', () => {
            this.stop();
        });
        
        analyzer.on('configUpdated', (config) => {
            // Update visualization scale type to match analyzer
            if (config.scaleType !== this.config.scaleType) {
                this.config.scaleType = config.scaleType;
            }
            
            // Redraw background when config changes
            if (!this.isActive) {
                this.drawBackground();
            }
        });
    }
    
    /**
     * Connect to filter manager for response overlay
     * @param {AudioFilterManager} filterManager - Filter manager instance
     */
    connectFilterManager(filterManager) {
        this.filterManager = filterManager;
        
        filterManager.on('parameterChanged', () => {
            // Update filter response when parameters change
            this.updateFilterResponse();
        });
        
        filterManager.on('activeChanged', () => {
            // Update display when filter is enabled/disabled
            this.updateFilterResponse();
        });
    }
    
    /**
     * Start real-time visualization
     */
    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.lastFrameTime = performance.now();
        this.animate();
    }
    
    /**
     * Stop visualization
     */
    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // Draw static background
        this.drawBackground();
    }
    
    /**
     * Pause visualization (for performance)
     */
    pause() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    /**
     * Resume visualization
     */
    resume() {
        if (this.isActive && !this.animationId) {
            this.animate();
        }
    }
    
    /**
     * Main animation loop with frame rate limiting
     */
    animate() {
        if (!this.isActive) return;
        
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastFrameTime;
        
        // Frame rate limiting
        if (deltaTime >= this.frameInterval) {
            this.drawFrame();
            this.lastFrameTime = currentTime - (deltaTime % this.frameInterval);
        }
        
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    /**
     * Draw a complete frame
     */
    drawFrame() {
        if (!this.analyzer) {
            return;
        }
        
        // Get current spectrum data
        this.spectrumData = this.analyzer.getDisplayData(this.plotWidth);
        
        if (!this.spectrumData) {
            this.drawBackground();
            return;
        }
        
        // Clear and draw background
        this.drawBackground();
        
        // Draw spectrum
        this.drawSpectrum();
        
        // Draw filter response overlay
        this.drawFilterResponse();
    }
    
    /**
     * Draw background, grid, and labels
     */
    drawBackground() {
        // Clear canvas
        this.ctx.fillStyle = this.config.backgroundColor;
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw grid and labels
        this.drawGrid();
        this.drawFrequencyLabels();
        this.drawDecibelLabels();
    }
    
    /**
     * Draw frequency and dB grid lines
     */
    drawGrid() {
        this.ctx.strokeStyle = this.config.gridColor;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 4]);
        
        this.ctx.beginPath();
        
        // Frequency grid lines (vertical)
        const markers = this.config.frequencyMarkers[this.config.scaleType];
        
        if (this.config.scaleType === 'logarithmic') {
            const logMin = Math.log10(this.config.minFrequency);
            const logMax = Math.log10(this.config.maxFrequency);
            const logRange = logMax - logMin;
            
            markers.forEach(freq => {
                if (freq >= this.config.minFrequency && freq <= this.config.maxFrequency) {
                    const logFreq = Math.log10(freq);
                    const x = this.plotX + ((logFreq - logMin) / logRange) * this.plotWidth;
                    
                    this.ctx.moveTo(x, this.plotY);
                    this.ctx.lineTo(x, this.plotY + this.plotHeight);
                }
            });
        } else {
            // Linear scaling
            const freqRange = this.config.maxFrequency - this.config.minFrequency;
            
            markers.forEach(freq => {
                if (freq >= this.config.minFrequency && freq <= this.config.maxFrequency) {
                    const x = this.plotX + ((freq - this.config.minFrequency) / freqRange) * this.plotWidth;
                    
                    this.ctx.moveTo(x, this.plotY);
                    this.ctx.lineTo(x, this.plotY + this.plotHeight);
                }
            });
        }
        
        // dB grid lines (horizontal)
        const dbRange = this.config.maxDecibels - this.config.minDecibels;
        
        this.config.decibelMarkers.forEach(db => {
            if (db >= this.config.minDecibels && db <= this.config.maxDecibels) {
                const y = this.plotY + this.plotHeight - ((db - this.config.minDecibels) / dbRange) * this.plotHeight;
                
                this.ctx.moveTo(this.plotX, y);
                this.ctx.lineTo(this.plotX + this.plotWidth, y);
            }
        });
        
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }
    
    /**
     * Draw frequency labels on X-axis
     */
    drawFrequencyLabels() {
        this.ctx.fillStyle = this.config.textColor;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        
        const markers = this.config.frequencyMarkers[this.config.scaleType];
        
        if (this.config.scaleType === 'logarithmic') {
            const logMin = Math.log10(this.config.minFrequency);
            const logMax = Math.log10(this.config.maxFrequency);
            const logRange = logMax - logMin;
            
            markers.forEach(freq => {
                if (freq >= this.config.minFrequency && freq <= this.config.maxFrequency) {
                    const logFreq = Math.log10(freq);
                    const x = this.plotX + ((logFreq - logMin) / logRange) * this.plotWidth;
                    
                    let label;
                    if (freq >= 1000) {
                        label = (freq / 1000) + 'k';
                    } else {
                        label = freq.toString();
                    }
                    
                    this.ctx.fillText(label, x, this.plotY + this.plotHeight + 5);
                }
            });
        } else {
            // Linear scaling
            const freqRange = this.config.maxFrequency - this.config.minFrequency;
            
            markers.forEach(freq => {
                if (freq >= this.config.minFrequency && freq <= this.config.maxFrequency) {
                    const x = this.plotX + ((freq - this.config.minFrequency) / freqRange) * this.plotWidth;
                    
                    let label;
                    if (freq >= 1000) {
                        label = (freq / 1000) + 'k';
                    } else {
                        label = freq.toString();
                    }
                    
                    this.ctx.fillText(label, x, this.plotY + this.plotHeight + 5);
                }
            });
        }
        
        // X-axis label
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Frequency (Hz)', this.plotX + this.plotWidth / 2, this.height - 10);
    }
    
    /**
     * Draw dB labels on Y-axis
     */
    drawDecibelLabels() {
        this.ctx.fillStyle = this.config.textColor;
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'middle';
        
        const dbRange = this.config.maxDecibels - this.config.minDecibels;
        
        this.config.decibelMarkers.forEach(db => {
            if (db >= this.config.minDecibels && db <= this.config.maxDecibels) {
                const y = this.plotY + this.plotHeight - ((db - this.config.minDecibels) / dbRange) * this.plotHeight;
                
                this.ctx.fillText(db + ' dB', this.plotX - 10, y);
            }
        });
        
        // Y-axis label (rotated)
        this.ctx.save();
        this.ctx.translate(15, this.plotY + this.plotHeight / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Magnitude (dB)', 0, 0);
        this.ctx.restore();
    }
    
    /**
     * Draw spectrum curve with gradient fill
     */
    drawSpectrum() {
        if (!this.spectrumData || this.spectrumData.length === 0) return;
        
        const dbRange = this.config.maxDecibels - this.config.minDecibels;
        
        // Create gradient
        const gradient = this.ctx.createLinearGradient(0, this.plotY, 0, this.plotY + this.plotHeight);
        gradient.addColorStop(0, this.config.gradientTop);
        gradient.addColorStop(1, this.config.gradientBottom);
        
        // Draw filled spectrum
        this.ctx.beginPath();
        this.ctx.moveTo(this.plotX, this.plotY + this.plotHeight);
        
        for (let x = 0; x < this.spectrumData.length; x++) {
            const db = this.spectrumData[x];
            const clampedDb = Math.max(this.config.minDecibels, Math.min(this.config.maxDecibels, db));
            const y = this.plotY + this.plotHeight - ((clampedDb - this.config.minDecibels) / dbRange) * this.plotHeight;
            
            if (x === 0) {
                this.ctx.lineTo(this.plotX + x, y);
            } else {
                this.ctx.lineTo(this.plotX + x, y);
            }
        }
        
        this.ctx.lineTo(this.plotX + this.spectrumData.length, this.plotY + this.plotHeight);
        this.ctx.closePath();
        
        // Fill with gradient
        this.ctx.fillStyle = gradient;
        this.ctx.fill();
        
        // Draw spectrum line
        this.ctx.beginPath();
        for (let x = 0; x < this.spectrumData.length; x++) {
            const db = this.spectrumData[x];
            const clampedDb = Math.max(this.config.minDecibels, Math.min(this.config.maxDecibels, db));
            const y = this.plotY + this.plotHeight - ((clampedDb - this.config.minDecibels) / dbRange) * this.plotHeight;
            
            if (x === 0) {
                this.ctx.moveTo(this.plotX + x, y);
            } else {
                this.ctx.lineTo(this.plotX + x, y);
            }
        }
        
        this.ctx.strokeStyle = this.config.spectrumColor;
        this.ctx.lineWidth = this.config.lineWidth;
        this.ctx.stroke();
    }
    
    /**
     * Update filter response data
     */
    updateFilterResponse() {
        if (this.filterManager && this.filterManager.isActive) {
            this.filterResponse = this.filterManager.getDisplayResponse(
                this.plotWidth, 
                this.config.minFrequency, 
                this.config.maxFrequency
            );
        } else {
            this.filterResponse = null;
        }
        
        // Redraw if not actively animating
        if (!this.isActive) {
            this.drawBackground();
            this.drawFilterResponse();
        }
    }
    
    /**
     * Draw filter response overlay
     */
    drawFilterResponse() {
        if (!this.filterResponse || !this.filterResponse.magnitudeDB) return;
        
        const dbRange = this.config.maxDecibels - this.config.minDecibels;
        const responseData = this.filterResponse.magnitudeDB;
        
        // Draw filter response curve
        this.ctx.beginPath();
        for (let x = 0; x < responseData.length && x < this.plotWidth; x++) {
            const db = responseData[x];
            const clampedDb = Math.max(this.config.minDecibels, Math.min(this.config.maxDecibels, db));
            const y = this.plotY + this.plotHeight - ((clampedDb - this.config.minDecibels) / dbRange) * this.plotHeight;
            
            if (x === 0) {
                this.ctx.moveTo(this.plotX + x, y);
            } else {
                this.ctx.lineTo(this.plotX + x, y);
            }
        }
        
        // Style filter response line
        this.ctx.strokeStyle = '#4ade80'; // Green color for filter response
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]); // Dashed line
        this.ctx.stroke();
        this.ctx.setLineDash([]); // Reset line dash
    }
    
    /**
     * Update visualization configuration
     * @param {Object} newConfig - Configuration updates
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        
        if (!this.isActive) {
            this.drawBackground();
        }
    }
    
    /**
     * Get frequency at mouse position
     * @param {number} mouseX - Mouse X coordinate relative to canvas
     * @returns {number} Frequency in Hz
     */
    getFrequencyAtMouse(mouseX) {
        if (!this.analyzer) return null;
        
        const relativeX = mouseX - this.plotX;
        const normalizedX = relativeX / this.plotWidth;
        
        return this.analyzer.getFrequencyAtPosition(normalizedX * this.plotWidth, this.plotWidth);
    }
    
    /**
     * Clean up resources
     */
    destroy() {
        this.stop();
        
        if (this.analyzer) {
            this.analyzer = null;
        }
        
        this.spectrumData = null;
    }
}

// Export for use in other modules
window.SpectrumVisualizer = SpectrumVisualizer; 