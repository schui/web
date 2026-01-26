/**
 * Export Manager - Handles the export modal dialog and export functionality
 */

class ExportManager extends EventTarget {
    constructor(audioExporter, trackManager) {
        super();
        // Legacy audioExporter parameter kept for compatibility but not used
        this.simpleExporter = new SimpleAudioExporter(); // Simple exporter is the main export system
        this.trackManager = trackManager;
        
        // Modal elements
        this.modal = null;
        this.isVisible = false;
        
        // Form elements (will be initialized in initializeElements)
        this.elements = {};
        
        // Current export settings
        this.currentSettings = this.getDefaultSettings();
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }
    
    initialize() {
        this.modal = document.getElementById('exportModal');
        if (!this.modal) {
            console.error('Export modal not found in DOM');
            return;
        }
        
        this.initializeElements();
        this.initializeMaskedInputs();
        this.bindEvents();
        this.updateControlStates();
        
        console.log('ExportManager initialized');
    }
    
    initializeElements() {
        // Get all form elements
        this.elements = {
            // Audio Generation
            durationTime: document.getElementById('exportDurationTime'),
            durationSlider: document.getElementById('exportDurationSlider'),
            clipsInput: document.getElementById('exportClipsInput'),
            clipsSlider: document.getElementById('exportClipsSlider'),
            silenceEnable: document.getElementById('exportSilenceEnable'),
            silenceTime: document.getElementById('exportSilenceTime'),
            silenceSlider: document.getElementById('exportSilenceSlider'),
            finalSilence: document.getElementById('exportFinalSilence'),
            
            // Processing
            normalizationEnable: document.getElementById('exportNormalizationEnable'),
            normalizationType: document.getElementById('exportNormalizationType'),
            normalizationValue: document.getElementById('exportNormalizationValue'),
            normalizationSlider: document.getElementById('exportNormalizationSlider'),
            processOrder: document.getElementById('exportProcessOrder'),
            fadeInEnable: document.getElementById('exportFadeInEnable'),
            fadeInTime: document.getElementById('exportFadeInTime'),
            fadeInSlider: document.getElementById('exportFadeInSlider'),
            fadeOutEnable: document.getElementById('exportFadeOutEnable'),
            fadeOutTime: document.getElementById('exportFadeOutTime'),
            fadeOutSlider: document.getElementById('exportFadeOutSlider'),
            
            // Output
            sampleRate: document.getElementById('exportSampleRate'),
            wavEnable: document.getElementById('exportWavEnable'),
            cppEnable: document.getElementById('exportCppEnable'),
            
            // Modal controls
            closeBtn: document.getElementById('exportModalClose'),
            cancelBtn: document.getElementById('exportModalCancel'),
            startBtn: document.getElementById('exportModalStart'),
            
            // Progress
            progressContainer: document.getElementById('exportProgressContainer'),
            progressFill: document.getElementById('exportProgressFill'),
            progressText: document.getElementById('exportProgressText'),
            modalActions: document.getElementById('exportModalActions')
        };
        
        // Validate all elements exist
        for (const [key, element] of Object.entries(this.elements)) {
            if (!element) {
                console.warn(`Export element not found: ${key}`);
            }
        }
    }
    
    initializeMaskedInputs() {
        // Initialize custom time input masking
        // Format: 00H 00M 00S 001ms
        
        if (this.elements.durationTime) {
            this.setupTimeInputMask(this.elements.durationTime, () => this.syncTimeToSlider());
        }
        
        if (this.elements.silenceTime) {
            this.setupTimeInputMask(this.elements.silenceTime, () => this.syncSilenceTimeToSlider());
        }
        
        if (this.elements.fadeInTime) {
            this.setupTimeInputMask(this.elements.fadeInTime, () => this.syncFadeInTimeToSlider());
        }
        
        if (this.elements.fadeOutTime) {
            this.setupTimeInputMask(this.elements.fadeOutTime, () => this.syncFadeOutTimeToSlider());
        }
        
        console.log('Masked inputs initialized');
    }
    
    setupTimeInputMask(input, onChangeCallback) {
        // Set up custom time input masking for format: 00H 00M 00S 001ms
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            const formatted = this.formatTimeInput(value);
            if (formatted !== value) {
                const cursorPos = e.target.selectionStart;
                e.target.value = formatted;
                // Restore cursor position approximately
                e.target.setSelectionRange(cursorPos, cursorPos);
            }
            onChangeCallback();
        });
        
        input.addEventListener('keydown', (e) => {
            // Allow backspace, delete, tab, escape, enter, and arrow keys
            if ([8, 9, 27, 13, 37, 38, 39, 40, 46].includes(e.keyCode) ||
                // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z
                (e.ctrlKey === true && [65, 67, 86, 88, 90].includes(e.keyCode))) {
                return;
            }
            // Ensure that it is a number and stop the keypress
            if (e.shiftKey || (e.keyCode < 48 || e.keyCode > 57) && (e.keyCode < 96 || e.keyCode > 105)) {
                e.preventDefault();
            }
        });
    }
    
    formatTimeInput(input) {
        // Remove all non-digit characters
        const digits = input.replace(/\D/g, '');
        
        // Pad with leading zeros if needed and limit to 9 digits total
        const padded = digits.padStart(9, '0').slice(0, 9);
        
        // Extract parts: HH, MM, SS, MMM
        const hours = padded.slice(0, 2);
        const minutes = padded.slice(2, 4);
        const seconds = padded.slice(4, 6);
        const milliseconds = padded.slice(6, 9);
        
        // Format as: 00H 00M 00S 001ms
        return `${hours}H ${minutes}M ${seconds}S ${milliseconds}ms`;
    }
    
    bindEvents() {
        // Modal show/hide events
        this.elements.closeBtn?.addEventListener('click', () => this.hide());
        this.elements.cancelBtn?.addEventListener('click', () => this.hide());
        
        // Click outside modal to close
        this.modal?.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });
        
        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
        
        // Form control events
        this.elements.silenceEnable?.addEventListener('change', () => this.updateSilenceControls());
        this.elements.normalizationEnable?.addEventListener('change', () => this.updateNormalizationControls());
        this.elements.fadeInEnable?.addEventListener('change', () => this.updateFadeControls());
        this.elements.fadeOutEnable?.addEventListener('change', () => this.updateFadeControls());
        this.elements.wavEnable?.addEventListener('change', () => this.updateFormatControls());
        this.elements.cppEnable?.addEventListener('change', () => this.updateFormatControls());
        this.elements.clipsInput?.addEventListener('input', () => this.updateClipsControls());
        
        // Slider synchronization
        this.elements.durationTime?.addEventListener('input', () => this.syncTimeToSlider());
        this.elements.durationSlider?.addEventListener('input', () => this.syncSliderToTime());
        this.elements.clipsInput?.addEventListener('input', () => this.syncClipsInputToSlider());
        this.elements.clipsSlider?.addEventListener('input', () => this.syncClipsSliderToInput());
        this.elements.silenceTime?.addEventListener('input', () => this.syncSilenceTimeToSlider());
        this.elements.silenceSlider?.addEventListener('input', () => this.syncSilenceSliderToTime());
        this.elements.fadeInTime?.addEventListener('input', () => this.syncFadeInTimeToSlider());
        this.elements.fadeInSlider?.addEventListener('input', () => this.syncFadeInSliderToTime());
        this.elements.fadeOutTime?.addEventListener('input', () => this.syncFadeOutTimeToSlider());
        this.elements.fadeOutSlider?.addEventListener('input', () => this.syncFadeOutSliderToTime());
        this.elements.normalizationValue?.addEventListener('input', () => this.syncNormalizationValueToSlider());
        this.elements.normalizationSlider?.addEventListener('input', () => this.syncNormalizationSliderToValue());
        
        // Export button
        this.elements.startBtn?.addEventListener('click', () => this.startExport());
        
        // Real-time validation
        this.elements.durationTime?.addEventListener('input', () => this.validateDuration());
        this.elements.fadeInTime?.addEventListener('input', () => this.validateFadeTimes());
        this.elements.fadeOutTime?.addEventListener('input', () => this.validateFadeTimes());
    }
    
    getDefaultSettings() {
        return {
            // Audio Generation
            duration: 60000.0, // 1 minute default (60 seconds in milliseconds)
            clips: 5, // 5 clips as requested
            silenceEnabled: true, // enabled by default
            silenceDuration: 10000.0, // 10 seconds in milliseconds
            finalSilence: true, // include final silence by default
            
            // Processing
            normalizationEnabled: true, // enabled by default
            normalizationType: 'global', // global by default
            normalizationValue: 0.5, // Python default
            processOrder: 'fade-then-normalize',
            fadeInEnabled: true, // enabled by default as requested
            fadeInDuration: 5000.0, // 5 seconds in milliseconds
            fadeInPower: 2.0, // hardcoded power value
            fadeOutEnabled: true, // enabled by default as requested
            fadeOutDuration: 5000.0, // 5 seconds in milliseconds
            fadeOutPower: 2.0, // hardcoded power value
            
            // Output
            wavEnabled: true, // enabled by default
            cppEnabled: true // enabled by default as requested
        };
    }
    
    show() {
        if (!this.modal) return;
        
        this.loadCurrentSettings();
        this.updateControlStates();
        this.validateForm();
        
        this.modal.classList.add('show');
        this.isVisible = true;
        
        // Focus first input
        this.elements.durationTime?.focus();
        
        this.emit('shown');
    }
    
    hide() {
        if (!this.modal) return;
        
        this.modal.classList.remove('show');
        this.isVisible = false;
        
        // Hide progress if showing
        this.hideProgress();
        
        this.emit('hidden');
    }
    
    loadCurrentSettings() {
        const settings = this.currentSettings;
        
        // Load values into form elements
        if (this.elements.durationTime) {
            const timeStr = this.msToTimeString(settings.duration);
            this.elements.durationTime.value = timeStr;
        }
        if (this.elements.durationSlider) {
            this.elements.durationSlider.value = settings.duration / 1000; // convert to seconds for slider
        }
        
        if (this.elements.clipsInput) this.elements.clipsInput.value = settings.clips;
        if (this.elements.clipsSlider) this.elements.clipsSlider.value = settings.clips;
        
        if (this.elements.silenceEnable) this.elements.silenceEnable.checked = settings.silenceEnabled;
        if (this.elements.silenceTime) {
            const silenceTimeStr = this.msToTimeString(settings.silenceDuration);
            this.elements.silenceTime.value = silenceTimeStr;
        }
        if (this.elements.silenceSlider) {
            this.elements.silenceSlider.value = settings.silenceDuration / 1000; // convert to seconds for slider
        }
        if (this.elements.finalSilence) this.elements.finalSilence.checked = settings.finalSilence;
        
        if (this.elements.normalizationEnable) this.elements.normalizationEnable.checked = settings.normalizationEnabled;
        if (this.elements.normalizationType) this.elements.normalizationType.value = settings.normalizationType;
        if (this.elements.normalizationValue) this.elements.normalizationValue.value = settings.normalizationValue || 0.5;
        if (this.elements.normalizationSlider) this.elements.normalizationSlider.value = settings.normalizationValue || 0.5;
        if (this.elements.processOrder) this.elements.processOrder.value = settings.processOrder;
        
        if (this.elements.fadeInEnable) this.elements.fadeInEnable.checked = settings.fadeInEnabled;
        if (this.elements.fadeInTime) {
            const fadeInTimeStr = this.msToTimeString(settings.fadeInDuration);
            this.elements.fadeInTime.value = fadeInTimeStr;
        }
        if (this.elements.fadeInSlider) {
            this.elements.fadeInSlider.value = settings.fadeInDuration / 1000; // convert to seconds for slider
        }
        if (this.elements.fadeOutEnable) this.elements.fadeOutEnable.checked = settings.fadeOutEnabled;
        if (this.elements.fadeOutTime) {
            const fadeOutTimeStr = this.msToTimeString(settings.fadeOutDuration);
            this.elements.fadeOutTime.value = fadeOutTimeStr;
        }
        if (this.elements.fadeOutSlider) {
            this.elements.fadeOutSlider.value = settings.fadeOutDuration / 1000; // convert to seconds for slider
        }
        
        if (this.elements.wavEnable) this.elements.wavEnable.checked = settings.wavEnabled;
        if (this.elements.cppEnable) this.elements.cppEnable.checked = settings.cppEnabled;
    }
    
    updateControlStates() {
        this.updateSilenceControls();
        this.updateNormalizationControls();
        this.updateFadeControls();
        this.updateFormatControls();
        this.updateClipsControls();
    }
    
    updateSilenceControls() {
        const enabled = this.elements.silenceEnable?.checked || false;
        
        if (this.elements.silenceTime) {
            this.elements.silenceTime.disabled = !enabled;
        }
        if (this.elements.silenceSlider) {
            this.elements.silenceSlider.disabled = !enabled;
        }
        if (this.elements.finalSilence) {
            this.elements.finalSilence.disabled = !enabled;
        }
    }
    
    updateNormalizationControls() {
        const enabled = this.elements.normalizationEnable?.checked || false;
        const clips = parseInt(this.elements.clipsInput?.value || '1');
        
        if (this.elements.normalizationType) {
            this.elements.normalizationType.disabled = !enabled || clips === 1;
        }
        if (this.elements.normalizationValue) {
            this.elements.normalizationValue.disabled = !enabled;
        }
        if (this.elements.normalizationSlider) {
            this.elements.normalizationSlider.disabled = !enabled;
        }
    }
    
    updateFadeControls() {
        const fadeInEnabled = this.elements.fadeInEnable?.checked || false;
        const fadeOutEnabled = this.elements.fadeOutEnable?.checked || false;
        
        if (this.elements.fadeInTime) this.elements.fadeInTime.disabled = !fadeInEnabled;
        if (this.elements.fadeInSlider) this.elements.fadeInSlider.disabled = !fadeInEnabled;
        if (this.elements.fadeOutTime) this.elements.fadeOutTime.disabled = !fadeOutEnabled;
        if (this.elements.fadeOutSlider) this.elements.fadeOutSlider.disabled = !fadeOutEnabled;
    }
    
    updateFormatControls() {
        // Update export button state
        this.validateForm();
    }
    
    updateClipsControls() {
        this.updateNormalizationControls();
    }
    
    // Helper method to convert milliseconds to 00H 00M 00S 001ms format
    msToTimeString(ms) {
        const totalSeconds = ms / 1000;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const remainingSeconds = totalSeconds % 60;
        const seconds = Math.floor(remainingSeconds);
        const milliseconds = Math.round((remainingSeconds - seconds) * 1000);
        
        // Format: "00H 00M 00S 001ms"
        return `${hours.toString().padStart(2, '0')}H ${minutes.toString().padStart(2, '0')}M ${seconds.toString().padStart(2, '0')}S ${milliseconds.toString().padStart(3, '0')}ms`;
    }
    
    // Helper method to convert 00H 00M 00S 001ms to milliseconds
    timeStringToMs(timeStr) {
        // Handle custom format: "00H 00M 00S 001ms"
        // Remove unit labels and split by spaces
        const cleanStr = timeStr.replace(/H|M|S|ms/g, '');
        const parts = cleanStr.trim().split(/\s+/);
        
        if (parts.length !== 4) return 1; // default fallback to 1ms
        
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseInt(parts[2]) || 0;
        const milliseconds = parseInt(parts[3]) || 0;
        
        // Validate ranges
        const validHours = Math.min(Math.max(hours, 0), 10); // 0-10 hours
        const validMinutes = Math.min(Math.max(minutes, 0), 59); // 0-59 minutes
        const validSeconds = Math.min(Math.max(seconds, 0), 59); // 0-59 seconds
        const validMs = Math.min(Math.max(milliseconds, 1), 999); // 1-999 ms
        
        return (validHours * 3600 + validMinutes * 60 + validSeconds) * 1000 + validMs;
    }
    
    // Slider synchronization methods
    syncTimeToSlider() {
        const timeStr = this.elements.durationTime?.value || '00H 00M 00S 001ms';
        const ms = this.timeStringToMs(timeStr);
        const seconds = ms / 1000;
        
        if (this.elements.durationSlider) {
            this.elements.durationSlider.value = Math.min(seconds, parseFloat(this.elements.durationSlider.max));
        }
        this.validateDuration();
    }
    
    syncSliderToTime() {
        const seconds = parseFloat(this.elements.durationSlider?.value || '0.001');
        const ms = seconds * 1000;
        const timeStr = this.msToTimeString(ms);
        
        if (this.elements.durationTime) {
            this.elements.durationTime.value = timeStr;
        }
        this.validateDuration();
    }
    
    syncClipsInputToSlider() {
        const value = parseInt(this.elements.clipsInput?.value || '1');
        if (this.elements.clipsSlider) {
            this.elements.clipsSlider.value = value;
        }
    }
    
    syncClipsSliderToInput() {
        const value = parseInt(this.elements.clipsSlider?.value || '1');
        if (this.elements.clipsInput) {
            this.elements.clipsInput.value = value;
        }
        this.updateClipsControls();
    }
    
    syncSilenceTimeToSlider() {
        const timeStr = this.elements.silenceTime?.value || '00H 00M 00S 190ms';
        const ms = this.timeStringToMs(timeStr);
        const seconds = ms / 1000;
        
        if (this.elements.silenceSlider) {
            this.elements.silenceSlider.value = Math.min(seconds, parseFloat(this.elements.silenceSlider.max));
        }
    }
    
    syncSilenceSliderToTime() {
        const seconds = parseFloat(this.elements.silenceSlider?.value || '0.19');
        const ms = seconds * 1000;
        const timeStr = this.msToTimeString(ms);
        
        if (this.elements.silenceTime) {
            this.elements.silenceTime.value = timeStr;
        }
    }
    
    syncFadeInTimeToSlider() {
        const timeStr = this.elements.fadeInTime?.value || '00H 00M 00S 001ms';
        const ms = this.timeStringToMs(timeStr);
        const seconds = ms / 1000;
        
        if (this.elements.fadeInSlider) {
            this.elements.fadeInSlider.value = Math.min(seconds, parseFloat(this.elements.fadeInSlider.max));
        }
        this.validateFadeTimes();
    }
    
    syncFadeInSliderToTime() {
        const seconds = parseFloat(this.elements.fadeInSlider?.value || '0.001');
        const ms = seconds * 1000;
        const timeStr = this.msToTimeString(ms);
        
        if (this.elements.fadeInTime) {
            this.elements.fadeInTime.value = timeStr;
        }
        this.validateFadeTimes();
    }
    
    syncFadeOutTimeToSlider() {
        const timeStr = this.elements.fadeOutTime?.value || '00H 00M 00S 001ms';
        const ms = this.timeStringToMs(timeStr);
        const seconds = ms / 1000;
        
        if (this.elements.fadeOutSlider) {
            this.elements.fadeOutSlider.value = Math.min(seconds, parseFloat(this.elements.fadeOutSlider.max));
        }
        this.validateFadeTimes();
    }
    
    syncFadeOutSliderToTime() {
        const seconds = parseFloat(this.elements.fadeOutSlider?.value || '0.001');
        const ms = seconds * 1000;
        const timeStr = this.msToTimeString(ms);
        
        if (this.elements.fadeOutTime) {
            this.elements.fadeOutTime.value = timeStr;
        }
        this.validateFadeTimes();
    }
    
    syncNormalizationValueToSlider() {
        const value = parseFloat(this.elements.normalizationValue?.value || '0.5');
        if (this.elements.normalizationSlider) {
            this.elements.normalizationSlider.value = value;
        }
    }
    
    syncNormalizationSliderToValue() {
        const value = parseFloat(this.elements.normalizationSlider?.value || '0.5');
        if (this.elements.normalizationValue) {
            this.elements.normalizationValue.value = value;
        }
    }
    
    validateDuration() {
        // Convert current duration from time string to milliseconds
        const timeStr = this.elements.durationTime?.value || '00H 00M 00S 001ms';
        const durationMs = this.timeStringToMs(timeStr);
        
        // Convert fade durations from time strings to milliseconds
        const fadeInTimeStr = this.elements.fadeInTime?.value || '00H 00M 00S 001ms';
        const fadeInMs = this.timeStringToMs(fadeInTimeStr);
        const fadeOutTimeStr = this.elements.fadeOutTime?.value || '00H 00M 00S 001ms';
        const fadeOutMs = this.timeStringToMs(fadeOutTimeStr);
        
        const fadeInEnabled = this.elements.fadeInEnable?.checked || false;
        const fadeOutEnabled = this.elements.fadeOutEnable?.checked || false;
        
        const totalFadeMs = (fadeInEnabled ? fadeInMs : 0) + (fadeOutEnabled ? fadeOutMs : 0);
        
        if (totalFadeMs >= durationMs) {
            this.elements.durationTime?.setCustomValidity(
                `Duration must be longer than total fade time (${totalFadeMs.toFixed(1)}ms)`
            );
            return false;
        } else {
            this.elements.durationTime?.setCustomValidity('');
            return true;
        }
    }
    
    validateFadeTimes() {
        return this.validateDuration();
    }
    
    validateForm() {
        const durationValid = this.validateDuration();
        
        // Don't require any formats to be selected - user can export neither if they want
        const isValid = durationValid;
        
        if (this.elements.startBtn) {
            this.elements.startBtn.disabled = !isValid;
        }
        
        return isValid;
    }
    
    getCurrentSettings() {
        // Convert duration from time string to milliseconds
        const timeStr = this.elements.durationTime?.value || '00H 00M 00S 001ms';
        const durationMs = this.timeStringToMs(timeStr);
        
        // Convert silence time from time string to milliseconds
        const silenceTimeStr = this.elements.silenceTime?.value || '00H 00M 00S 190ms';
        const silenceMs = this.timeStringToMs(silenceTimeStr);
        
        // Convert fade times from time strings to milliseconds
        const fadeInTimeStr = this.elements.fadeInTime?.value || '00H 00M 00S 001ms';
        const fadeInMs = this.timeStringToMs(fadeInTimeStr);
        
        const fadeOutTimeStr = this.elements.fadeOutTime?.value || '00H 00M 00S 001ms';
        const fadeOutMs = this.timeStringToMs(fadeOutTimeStr);
        
        return {
            // Audio Generation
            duration: durationMs, // always store in milliseconds
            clips: parseInt(this.elements.clipsInput?.value || '40'),
            silenceEnabled: this.elements.silenceEnable?.checked || false,
            silenceDuration: silenceMs, // converted from time string
            finalSilence: this.elements.finalSilence?.checked || false,
            
            // Processing
            normalizationEnabled: this.elements.normalizationEnable?.checked || false,
            normalizationType: this.elements.normalizationType?.value || 'global',
            normalizationValue: parseFloat(this.elements.normalizationValue?.value || '0.5'),
            processOrder: this.elements.processOrder?.value || 'fade-then-normalize',
            fadeInEnabled: this.elements.fadeInEnable?.checked || false,
            fadeInDuration: fadeInMs, // converted from time string
            fadeInPower: 2.0, // hardcoded power value
            fadeOutEnabled: this.elements.fadeOutEnable?.checked || false,
            fadeOutDuration: fadeOutMs, // converted from time string
            fadeOutPower: 2.0, // hardcoded power value
            
            // Output
            exportSampleRate: parseInt(this.elements.sampleRate?.value || '44100'),
            wavEnabled: this.elements.wavEnable?.checked || false,
            cppEnabled: this.elements.cppEnable?.checked || false
        };
    }
    
    async startExport() {
        if (!this.validateForm()) {
            return;
        }
        
        const settings = this.getCurrentSettings();
        this.currentSettings = { ...settings };
        
        try {
            this.showProgress();
            await this.performExport(settings);
            this.hideProgress();
            this.hideExportProgress();
            this.hide();
        } catch (error) {
            console.error('Export failed:', error);
            this.hideProgress();
            this.hideExportProgress();
            this.showError(`Export failed: ${error.message}`);
        }
    }
    
    async performExport(settings) {
        console.log('Starting export with settings:', settings);
        
        // Update progress
        this.updateProgress(10, 'Preparing audio configuration...');
        
        // Convert duration from ms to seconds for audio processing
        const durationSeconds = settings.duration / 1000.0;
        
        // Generate each clip
        const clips = [];
        for (let i = 0; i < settings.clips; i++) {
            this.updateProgress(20 + (50 * i / settings.clips), `Generating clip ${i + 1}/${settings.clips}...`);
            
            // Generate raw audio for this clip using current track configuration
            const audioData = await this.generateClipAudio(durationSeconds, settings);
            clips.push(audioData);
        }
        
        this.updateProgress(70, 'Processing audio...');
        
        // Create final audio for WAV export (combined)
        let finalAudio;
        if (settings.clips === 1) {
            finalAudio = clips[0];
        } else {
            finalAudio = this.combineClips(clips, settings);
        }
        
        this.updateProgress(80, 'Preparing exports...');
        
        // Export files
        const promises = [];
        
        if (settings.wavEnabled) {
            promises.push(this.exportWav(finalAudio, settings));
        }
        
        if (settings.cppEnabled) {
            // Pass individual clips for separate buffer generation (like Python version)
            promises.push(this.exportCppSeparateClips(clips, settings));
        }
        
        await Promise.all(promises);
        
        this.updateProgress(100, 'Export complete!');
        
        // Show completion briefly
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    async generateClipAudio(durationSeconds, settings) {
        // Use the simple exporter (Python version approach)
        console.log('🎵 SIMPLE EXPORT: generateClipAudio called with:', { durationSeconds, settings });
        
        // Check if trackManager is available
        if (!this.trackManager) {
            console.error('🎵 SIMPLE EXPORT: trackManager is null in ExportManager');
            throw new Error('Track manager not available for export - please ensure tracks are initialized and try again');
        }
        
        // Get current track configuration
        const trackConfig = this.trackManager.getExportConfig();
        console.log('🎵 SIMPLE EXPORT: Track manager export config:', trackConfig);
        
        // Log each track's filter configuration
        trackConfig.tracks.forEach((track, index) => {
            console.log(`🎵 SIMPLE EXPORT: Track ${index} config:`, {
                enabled: track.enabled,
                gain: track.gain,
                filterCount: track.filters.length
            });
            
            track.filters.forEach((filter, filterIndex) => {
                console.log(`🎵 SIMPLE EXPORT: Track ${index} Filter ${filterIndex}:`, {
                    type: filter.type,
                    enabled: filter.enabled,
                    isAdvanced: filter.isAdvanced,
                    centerFreq: filter.centerFreq,
                    width: filter.width,
                    gain: filter.gain,
                    flatWidth: filter.flatWidth
                });
            });
        });
        
        // Prepare export-specific settings (independent of UI master gain)
        const exportSettings = {
            enableNormalization: settings.normalizationEnabled || true,  // Default ON like Python
            normalizeValue: settings.normalizationValue || 0.5,  // Use UI value, default 0.5
            exportAmplitude: 1.0,  // Export amplitude separate from UI master gain
            exportSampleRate: settings.exportSampleRate || 44100,  // Configurable sample rate
            enableFadeIn: settings.fadeInEnabled || false,
            enableFadeOut: settings.fadeOutEnabled || false,
            fadeInDuration: (settings.fadeInDuration || 1.0) / 1000.0,  // Convert ms to seconds
            fadeOutDuration: (settings.fadeOutDuration || 1.0) / 1000.0, // Convert ms to seconds
            fadeInPower: settings.fadeInPower || 2.0,
            fadeOutPower: settings.fadeOutPower || 2.0,
            fadeBeforeNorm: settings.processOrder === 'fade-then-normalize'
        };
        
        console.log('🎵 SIMPLE EXPORT: Export settings:', exportSettings);
        console.log('🎵 EXPORT MANAGER: Sample rate from UI:', settings.exportSampleRate);
        console.log('🎵 EXPORT MANAGER: Sample rate passed to exporter:', exportSettings.exportSampleRate);
        
        // Add progress callback and cancel support
        let exportCancelled = false;
        
        exportSettings.onProgress = (progressInfo) => {
            // Update progress UI
            this.updateExportProgress(progressInfo);
            
            // Return false to cancel export
            return !exportCancelled;
        };
        
        // Store cancel function for UI
        this.cancelExport = () => {
            exportCancelled = true;
        };
        
        // Use the simple exporter (Python version approach)
        const result = await this.simpleExporter.exportSimple(durationSeconds, trackConfig, exportSettings);
        
        console.log('🎵 SIMPLE EXPORT: generateClipAudio result:', {
            length: result.length,
            hasNonZero: result.some(sample => sample !== 0)
        });
        
        return result;
    }
    
    combineClips(clips, settings) {
        if (clips.length === 1) {
            return clips[0];
        }
        
        const sampleRate = settings.exportSampleRate || 44100;
        const silenceSamples = settings.silenceEnabled ? 
            Math.floor(settings.silenceDuration / 1000.0 * sampleRate) : 0;
        
        // Calculate total length
        let totalSamples = clips.reduce((sum, clip) => sum + clip.length, 0);
        
        // Add silence between clips
        if (settings.silenceEnabled) {
            totalSamples += silenceSamples * (clips.length - 1);
            // Add final silence if enabled
            if (settings.finalSilence) {
                totalSamples += silenceSamples;
            }
        }
        
        // Combine clips
        const combined = new Float32Array(totalSamples);
        let offset = 0;
        
        for (let i = 0; i < clips.length; i++) {
            // Add clip
            combined.set(clips[i], offset);
            offset += clips[i].length;
            
            // Add silence (except after last clip unless finalSilence is enabled)
            if (settings.silenceEnabled && (i < clips.length - 1 || settings.finalSilence)) {
                // Silence is already zeros in Float32Array
                offset += silenceSamples;
            }
        }
        
        return combined;
    }
    
    // Generate timestamp-based filename
    generateTimestampFilename(extension, settings) {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Remove milliseconds and colons
        const clips = settings.clips > 1 ? `_${settings.clips}clips` : '';
        return `noiseshaper_${timestamp}${clips}.${extension}`;
    }
    
    async exportWav(audioData, settings) {
        const filename = this.generateTimestampFilename('wav', settings);
        const sampleRate = settings.exportSampleRate || 44100;
        const wavBlob = this.simpleExporter.createWavBlob(audioData, sampleRate);
        this.downloadBlob(wavBlob, filename);
    }
    
    async exportCpp(audioData, settings) {
        const filename = this.generateTimestampFilename('h', settings);
        const cppCode = this.generateCppCode(audioData, filename);
        const blob = new Blob([cppCode], { type: 'text/plain' });
        this.downloadBlob(blob, filename);
    }

    async exportCppSeparateClips(clips, settings) {
        const filename = this.generateTimestampFilename('h', settings);
        const cppCode = this.generateCarouselCppCode(clips, settings, filename);
        const blob = new Blob([cppCode], { type: 'text/plain' });
        this.downloadBlob(blob, filename);
    }
    
    generateCppCode(audioData, filename) {
        const baseName = filename.replace(/\.[^/.]+$/, ""); // Remove extension
        const arrayName = baseName.replace(/[^a-zA-Z0-9_]/g, '_') + '_data';
        const lengthName = arrayName.toUpperCase() + '_LENGTH';
        
        // Convert to 16-bit integers
        const int16Data = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
            int16Data[i] = Math.round(audioData[i] * 32767);
        }
        
        // Generate C++ code
        let code = `// Auto-generated audio data header\n\n`;
        code += `#ifndef ${arrayName.toUpperCase()}_H\n`;
        code += `#define ${arrayName.toUpperCase()}_H\n\n`;
        code += `#define ${lengthName} ${int16Data.length}  // Array length\n\n`;
        code += `// Audio samples normalized to int16 (-32768 to 32767)\n`;
        code += `const int16_t ${arrayName}[${lengthName}] = {\n`;
        
        // Add data in rows of 8 values
        for (let i = 0; i < int16Data.length; i += 8) {
            const row = [];
            for (let j = 0; j < 8 && i + j < int16Data.length; j++) {
                row.push(int16Data[i + j].toString().padStart(6));
            }
            code += '    ' + row.join(',') + (i + 8 < int16Data.length ? ',' : '') + '\n';
        }
        
        code += `};\n\n`;
        code += `#endif // ${arrayName.toUpperCase()}_H\n`;
        
        return code;
    }

    generateCarouselCppCode(clips, settings, filename) {
        const baseName = filename.replace(/\.[^/.]+$/, ""); // Remove extension
        const guardName = baseName.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase() + '_H';
        
        console.log('🎵 CAROUSEL CPP: Generating separate clips for C++ header, clips:', clips.length);
        
        // Get sample rate first (before using it)
        const sampleRate = settings.exportSampleRate || 44100;
        
        // Generate C++ code matching Python carousel template format
        let code = `// Auto-generated carousel audio data header\n`;
        code += `// Generated with NoiseShaper Web\n\n`;
        code += `#ifndef ${guardName}\n`;
        code += `#define ${guardName}\n\n`;
        
        // Defines
        code += `#define SAMPLE_RATE ${sampleRate}\n`;
        code += `#define NUM_BUFFERS ${clips.length}\n`;
        code += `#define MONO_SAMPLES ${clips[0].length}  // Samples per buffer\n`;
        code += `#define STEREO_SAMPLES (MONO_SAMPLES * 2)\n`;
        
        // Calculate silence samples using export sample rate
        const silenceSamples = settings.silenceEnabled ? 
            Math.floor(settings.silenceDuration / 1000.0 * sampleRate) : 0;
        code += `#define SILENCE_SAMPLES ${silenceSamples * 2}  // Stereo silence samples\n\n`;
        
        code += `// Noise samples for carousel playback\n\n`;
        
        // Generate individual buffer arrays
        const bufferNames = [];
        for (let i = 0; i < clips.length; i++) {
            const bufferName = `buffer${i + 1}`;
            bufferNames.push(bufferName);
            
            // Convert to 16-bit integers
            const int16Data = new Int16Array(clips[i].length);
            for (let j = 0; j < clips[i].length; j++) {
                int16Data[j] = Math.round(clips[i][j] * 32767);
            }
            
            code += `int16_t ${bufferName}[${clips[i].length}] = {\n`;
            
            // Add data in rows of 8 values
            for (let j = 0; j < int16Data.length; j += 8) {
                const row = [];
                for (let k = 0; k < 8 && j + k < int16Data.length; k++) {
                    row.push(int16Data[j + k].toString().padStart(6));
                }
                code += '    ' + row.join(',') + (j + 8 < int16Data.length ? ',' : '') + '\n';
            }
            
            code += `};\n\n`;
        }
        
        // Generate silence buffer
        code += `int16_t silenceBuffer[SILENCE_SAMPLES] = {`;
        for (let i = 0; i < silenceSamples * 2; i++) {
            code += i === 0 ? '0' : ', 0';
            if (i > 0 && i % 16 === 15) code += '\n    '; // Line break every 16 values
        }
        code += `};\n\n`;
        
        // Generate array of buffer pointers
        code += `int16_t* noiseBuffers[NUM_BUFFERS] = {\n`;
        for (let i = 0; i < bufferNames.length; i++) {
            code += `    ${bufferNames[i]}${i < bufferNames.length - 1 ? ',' : ''}\n`;
        }
        code += `};\n\n`;
        
        code += `int currentBufferIndex = 0;\n\n`;
        code += `#endif // ${guardName}\n`;
        
        console.log('🎵 CAROUSEL CPP: Generated C++ header with', clips.length, 'separate buffers');
        return code;
    }
    
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    showProgress() {
        if (this.elements.progressContainer) {
            this.elements.progressContainer.style.display = 'block';
        }
        if (this.elements.modalActions) {
            this.elements.modalActions.style.display = 'none';
        }
    }
    
    hideProgress() {
        if (this.elements.progressContainer) {
            this.elements.progressContainer.style.display = 'none';
        }
        if (this.elements.modalActions) {
            this.elements.modalActions.style.display = 'flex';
        }
    }
    
    updateProgress(percentage, text) {
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${percentage}%`;
        }
        if (this.elements.progressText) {
            this.elements.progressText.textContent = text;
        }
    }
    
    showError(message) {
        // For now, use console and alert - could be enhanced with modal error display
        console.error('Export Error:', message);
        alert(`Export Error: ${message}`);
    }
    
    // Profile management removed from export dialog - will be implemented elsewhere
    
    // Event emitter helpers (matching pattern of other audio classes)
    on(eventName, callback) {
        this.addEventListener(eventName, (event) => {
            callback(event.detail);
        });
    }
    
    off(eventName, callback) {
        this.removeEventListener(eventName, callback);
    }
    
    emit(eventName, data = null) {
        this.dispatchEvent(new CustomEvent(eventName, { detail: data }));
    }

    /**
     * Update export progress UI during chunked processing
     * @param {Object} progressInfo - Progress information from exporter
     */
    updateExportProgress(progressInfo) {
        // Use existing progress elements from the HTML
        const progressContainer = document.getElementById('exportProgressContainer');
        const progressFill = document.getElementById('exportProgressFill');
        const progressText = document.getElementById('exportProgressText');
        const modalActions = document.getElementById('exportModalActions');
        
        if (!progressContainer || !progressFill || !progressText || !modalActions) return;
        
        // Find or create chunked progress elements
        let chunkProgressContainer = modalActions.querySelector('.chunk-progress-container');
        if (!chunkProgressContainer) {
            chunkProgressContainer = document.createElement('div');
            chunkProgressContainer.className = 'chunk-progress-container';
            chunkProgressContainer.style.cssText = `
                margin-bottom: 15px;
                padding: 12px;
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 6px;
                display: none;
            `;
            
            // Chunk progress bar
            const chunkProgressBar = document.createElement('div');
            chunkProgressBar.className = 'chunk-progress-bar';
            chunkProgressBar.style.cssText = `
                width: 100%;
                height: 16px;
                background: var(--bg-primary);
                border-radius: 8px;
                overflow: hidden;
                margin-bottom: 8px;
            `;
            
            const chunkProgressFill = document.createElement('div');
            chunkProgressFill.className = 'chunk-progress-fill';
            chunkProgressFill.style.cssText = `
                height: 100%;
                background: linear-gradient(90deg, #4CAF50, #45a049);
                width: 0%;
                transition: width 0.3s ease;
                border-radius: 8px;
            `;
            
            chunkProgressBar.appendChild(chunkProgressFill);
            chunkProgressContainer.appendChild(chunkProgressBar);
            
            // Chunk progress text
            const chunkProgressText = document.createElement('div');
            chunkProgressText.className = 'chunk-progress-text';
            chunkProgressText.style.cssText = `
                color: var(--text-primary);
                font-size: 14px;
                text-align: center;
                margin-bottom: 10px;
                font-weight: 500;
            `;
            chunkProgressContainer.appendChild(chunkProgressText);
            
            // Cancel button
            const cancelButton = document.createElement('button');
            cancelButton.className = 'chunk-cancel-btn';
            cancelButton.textContent = 'Cancel Export';
            cancelButton.style.cssText = `
                background: var(--accent-red, #f44336);
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                width: 100%;
                font-weight: 500;
                transition: all 0.2s ease;
            `;
            
            cancelButton.onmouseover = () => {
                if (!cancelButton.disabled) {
                    cancelButton.style.background = '#d32f2f';
                }
            };
            
            cancelButton.onmouseout = () => {
                if (!cancelButton.disabled) {
                    cancelButton.style.background = 'var(--accent-red, #f44336)';
                }
            };
            
            cancelButton.onclick = () => {
                if (this.cancelExport) {
                    this.cancelExport();
                    chunkProgressText.textContent = 'Cancelling export...';
                    cancelButton.disabled = true;
                    cancelButton.style.background = '#666';
                    cancelButton.style.cursor = 'not-allowed';
                }
            };
            
            chunkProgressContainer.appendChild(cancelButton);
            
            // Insert before the modal actions
            modalActions.parentNode.insertBefore(chunkProgressContainer, modalActions);
        }
        
        // Update display based on phase
        if (progressInfo.phase === 'starting') {
            // Show chunk progress
            chunkProgressContainer.style.display = 'block';
            progressContainer.style.display = 'block';
            
            const chunkProgressFill = chunkProgressContainer.querySelector('.chunk-progress-fill');
            const chunkProgressText = chunkProgressContainer.querySelector('.chunk-progress-text');
            const cancelButton = chunkProgressContainer.querySelector('.chunk-cancel-btn');
            
            chunkProgressText.textContent = `Starting export... (${progressInfo.chunksTotal} chunks)`;
            chunkProgressFill.style.width = '0%';
            cancelButton.disabled = false;
            cancelButton.style.background = 'var(--accent-red, #f44336)';
            cancelButton.style.cursor = 'pointer';
            
            // Update main progress
            progressText.textContent = 'Preparing chunked export...';
            progressFill.style.width = '0%';
            
        } else if (progressInfo.phase === 'processing') {
            const chunkProgressFill = chunkProgressContainer.querySelector('.chunk-progress-fill');
            const chunkProgressText = chunkProgressContainer.querySelector('.chunk-progress-text');
            
            // Handle both parallel and sequential progress reporting
            if (progressInfo.type === 'workerProgress') {
                // Parallel processing with Web Workers
                const activeWorkers = progressInfo.activeWorkers || 0;
                const completedJobs = progressInfo.completedJobs || 0;
                const totalJobs = progressInfo.totalJobs || 1;
                const avgTime = progressInfo.averageProcessingTime || 0;
                
                chunkProgressText.textContent = `🎯 Processing ${activeWorkers} chunks in parallel (${completedJobs}/${totalJobs} completed) - Avg: ${avgTime.toFixed(1)}ms`;
                chunkProgressFill.style.width = progressInfo.overallProgress + '%';
                
                // Update main progress
                progressText.textContent = `🎯 Parallel Export: ${progressInfo.overallProgress}% (${activeWorkers} workers active)`;
                progressFill.style.width = progressInfo.overallProgress + '%';
                
            } else {
                // Sequential processing (existing behavior)
                chunkProgressText.textContent = `🎵 Processing chunk ${progressInfo.currentChunk} of ${progressInfo.chunksTotal}`;
                chunkProgressFill.style.width = progressInfo.overallProgress + '%';
                
                // Update main progress
                progressText.textContent = `🎵 Sequential Export: ${progressInfo.overallProgress}%`;
                progressFill.style.width = progressInfo.overallProgress + '%';
            }
            
        } else if (progressInfo.phase === 'finalizing') {
            const chunkProgressText = chunkProgressContainer.querySelector('.chunk-progress-text');
            const chunkProgressFill = chunkProgressContainer.querySelector('.chunk-progress-fill');
            const cancelButton = chunkProgressContainer.querySelector('.chunk-cancel-btn');
            
            chunkProgressText.textContent = 'Finalizing export (normalization & fades)...';
            chunkProgressFill.style.width = '100%';
            cancelButton.disabled = true;
            cancelButton.style.background = '#666';
            cancelButton.style.cursor = 'not-allowed';
            
            // Update main progress
            progressText.textContent = 'Finalizing export...';
            progressFill.style.width = '100%';
        }
    }

    /**
     * Hide export progress UI
     */
    hideExportProgress() {
        const modalActions = document.getElementById('exportModalActions');
        if (!modalActions) return;
        
        const chunkProgressContainer = modalActions.parentNode.querySelector('.chunk-progress-container');
        if (chunkProgressContainer) {
            chunkProgressContainer.style.display = 'none';
        }
        
        // Clear cancel function
        this.cancelExport = null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExportManager;
} 