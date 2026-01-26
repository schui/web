/**
 * NoiseShaper Web - Multi-Track Application Controller
 * Orchestrates the multi-track audio system with expandable track cards
 * 
 * Features:
 * - Multi-track management with TrackManager
 * - Expandable track cards UI
 * - Individual track controls (gain, mute, filters)
 * - Master spectrum analysis
 * - Multi-track audio export
 */

class NoiseShaperweb {
    constructor() {
        // GUARD: Prevent multiple initialization
        if (window.noiseShaper) {
            console.warn('NoiseShaper already initialized, cleaning up previous instance');
            window.noiseShaper.cleanup();
        }
        
        this.audioEngine = null;
        this.trackManager = null;
        this.spectrumVisualizer = null;
        this.analyzerControls = null;
        this.exportManager = null;
        this.isInitialized = false;
        this.eventListenersSetup = false;
        
        // UI elements
        this.elements = {};
        
        // Modal state
        this.pendingFilterTrackId = null;
        
        // Application state
        this.state = {
            isPlaying: false,
            userGestureCompleted: false,
            exportDuration: 5,
            isExporting: false,
            selectedTrackId: null // Track selected for filter editing
        };
        
        this.initializeApp();
    }
    
    /**
     * Initialize the application
     */
    async initializeApp() {
        try {
            this.bindUIElements();
            this.setupEventListeners();
            this.initializeAudioSystem();
            this.updateUI();
            
            console.log('NoiseShaper Multi-Track Web initialized successfully');
            
        } catch (error) {
            this.showError(`Failed to initialize application: ${error.message}`);
            console.error('Initialization error:', error);
        }
    }
    
    /**
     * Bind UI elements for easy access
     */
    bindUIElements() {
        this.elements = {
            startStopBtn: document.getElementById('startStopBtn'),
            statusText: document.getElementById('statusText'),
            statusDot: document.getElementById('statusDot'),
            errorDisplay: document.getElementById('errorDisplay'),
            errorMessage: document.getElementById('errorMessage'),
            dismissError: document.getElementById('dismissError'),
            spectrumCanvas: document.getElementById('spectrumCanvas'),
            // Multi-track elements
            addTrackBtn: document.getElementById('addTrackBtn'),
            trackList: document.getElementById('trackList'),
            // Filter editor elements
            filterEditor: document.getElementById('filterEditor'),
            filterEditorTitle: document.getElementById('filterEditorTitle'),
            // Master volume elements
            masterVolumeSlider: document.getElementById('masterVolumeSlider'),
            masterVolumeValue: document.getElementById('masterVolumeValue'),
            // Filter modal elements
            filterModal: document.getElementById('filterModal'),
            filterModalCancel: document.querySelector('#filterModal .filter-modal-cancel'),
            // Export controls
            exportBtn: document.getElementById('exportBtn')
        };
        
        // Verify essential elements exist
        const essentialElements = [
            'startStopBtn', 'statusText', 'statusDot', 'addTrackBtn', 
            'trackList', 'filterEditor', 'filterEditorTitle', 'spectrumCanvas', 'exportBtn'
        ];
        
        for (const elementName of essentialElements) {
            if (!this.elements[elementName]) {
                throw new Error(`Required UI element not found: ${elementName}`);
            }
        }
        
        // Initialize UI state
        this.elements.startStopBtn.disabled = true;
        this.elements.addTrackBtn.disabled = true;
        this.elements.exportBtn.disabled = true;
    }
    
    /**
     * Set up event listeners for UI interactions
     */
    setupEventListeners() {
        // GUARD: Prevent duplicate event listeners
        if (this.eventListenersSetup) {
            console.warn('Event listeners already setup, skipping');
            return;
        }
        
        console.log('Setting up event listeners');
        
        // Start/Stop button
        this.elements.startStopBtn.addEventListener('click', () => {
            this.handleStartStopClick();
        });
        
        // Add track button
        this.elements.addTrackBtn.addEventListener('click', () => {
            this.handleAddTrack();
        });
        
        // Master volume controls
        if (this.elements.masterVolumeSlider) {
            this.elements.masterVolumeSlider.addEventListener('input', (event) => {
                this.handleMasterVolumeChange(parseInt(event.target.value));
            });
        }
        
        // Filter modal controls
        if (this.elements.filterModalCancel) {
            this.elements.filterModalCancel.addEventListener('click', () => {
                this.hideFilterModal();
            });
        }
        
        // Modal overlay click to close
        if (this.elements.filterModal) {
            this.elements.filterModal.addEventListener('click', (event) => {
                if (event.target === this.elements.filterModal) {
                    this.hideFilterModal();
                }
            });
        }
        
        // Filter type selection buttons
        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('filter-type-btn')) {
                const filterType = event.target.getAttribute('data-filter-type');
                this.handleFilterTypeSelection(filterType).catch(error => {
                    console.error('Error handling filter type selection:', error);
                    this.showError(`Failed to add filter: ${error.message}`);
                });
            }
        });
        
        // Export controls handled by ExportManager modal
        
        this.elements.exportBtn.addEventListener('click', () => {
            this.handleExportClick();
        });
        
        // Error dismissal
        this.elements.dismissError.addEventListener('click', () => {
            this.hideError();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            this.handleKeyboardShortcuts(event);
        });
        
        // Window lifecycle
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        // Mark event listeners as setup
        this.eventListenersSetup = true;
        console.log('Event listeners setup complete');
    }
    
    /**
     * Initialize the audio system with multi-track manager
     */
    initializeAudioSystem() {
        try {
            // Create audio engine
            this.audioEngine = new AudioEngine();
            
            // Set up audio engine event listeners
            this.audioEngine.on('supportChecked', (data) => {
                console.log('AudioEngine supportChecked:', data);
                if (data.isSupported) {
                    this.updateStatus('Setting up tracks...', 'ready');
                    // Set up TrackManager without AudioContext (user gesture required for AudioContext)
                    this.setupTrackManagerWithoutAudio();
                } else {
                    this.updateStatus('Web Audio not supported', 'error');
                }
            });
            
            this.audioEngine.on('initialized', (data) => {
                console.log('AudioEngine initialized event fired:', data);
                this.updateStatus('Setting up tracks...', 'ready');
                this.updateSystemInfo(data.systemInfo);
                // setupTrackManager() will be called from handleStartStopClick()
            });
            
            this.audioEngine.on('error', (error) => {
                this.showError(`Audio Engine: ${error}`);
                this.updateStatus('Audio error', 'error');
            });
            
            // Browser info display removed - no longer showing system information
            
            // Initialize audio exporter
            // Audio exporter setup removed - ExportManager now handles exports directly
            
            // DON'T initialize export manager here - wait for trackManager to be ready
            
        } catch (error) {
            this.showError(`Failed to initialize audio system: ${error.message}`);
            this.updateStatus('Initialization failed', 'error');
        }
    }
    
    /**
     * Set up the track system without audio (user gesture required for AudioContext)
     */
    setupTrackManagerWithoutAudio() {
        try {
            console.log('Setting up track manager without audio initialization');
            
            // Enable Start button, but keep Add Track disabled until audio initialized
            this.elements.startStopBtn.disabled = false;
            this.elements.addTrackBtn.disabled = true;
            this.updateStatus('Ready - Click Start to initialize audio', 'ready');
            
            // Mark as ready for track management UI (but not audio)
            this.isInitialized = false; // Audio not initialized yet
            
            console.log('UI ready - waiting for user gesture to initialize audio');
            
        } catch (error) {
            this.showError(`Failed to setup track system: ${error.message}`);
            this.updateStatus('Setup failed', 'error');
        }
    }
    
    /**
     * Set up the multi-track manager (called after AudioContext is initialized)
     */
    async setupTrackManager() {
        try {
            console.log('Setting up track manager with initialized audio');
            console.log('AudioEngine state:', this.audioEngine.getState());
            
            console.log('Creating TrackManager instance...');
            this.trackManager = new TrackManager(this.audioEngine);
            
            // Set up track manager event listeners FIRST
            this.trackManager.on('masterChainReady', (data) => {
                            console.log('TrackManager ready - setting up UI');
            this.isInitialized = true;
            this.setupSpectrumVisualizer();
            
            // Add initial track (always have at least one track)
            this.addInitialTrack();
                
                // Initialize export manager now that both audio exporter and track manager are ready
                if (!this.exportManager && this.trackManager) {
                    console.log('Creating ExportManager with trackManager ready');
                    this.setupExportManager();
                }
                
                // Enable all buttons now that system is fully ready
                this.elements.startStopBtn.disabled = false;
                this.elements.addTrackBtn.disabled = false;
                this.updateStatus('Ready - Click Start to begin', 'ready');
                console.log('Multi-track system ready');
            });
            
            this.trackManager.on('trackAdded', (data) => {
                this.handleTrackAdded(data);
            });
            
            this.trackManager.on('trackRemoved', (data) => {
                this.handleTrackRemoved(data);
            });
            
            this.trackManager.on('allStarted', () => {
                this.state.isPlaying = true;
                this.updateUI();
                this.updateStatus('Playing', 'active');
            });
            
            this.trackManager.on('allStopped', () => {
                this.state.isPlaying = false;
                this.updateUI();
                this.updateStatus('Stopped', 'ready');
            });
            
            this.trackManager.on('trackStateChanged', (data) => {
                this.updateTrackUI(data.trackId);
            });
            
            this.trackManager.on('trackGainChanged', (data) => {
                this.updateTrackGainDisplay(data.trackId, data.dbGain);
            });
            
            this.trackManager.on('trackMuteChanged', (data) => {
                this.updateTrackMuteDisplay(data.trackId, data.isMuted);
            });
            
            this.trackManager.on('trackFilterChanged', (data) => {
                console.log('trackFilterChanged event:', data.action, 'for track', data.trackId);
                // Only update UI for structural changes
                if (data.action === 'added' || data.action === 'removed') {
                    this.updateTrackFilterDisplay(data.trackId, data);
                }
                // Skip updating for parameter changes to avoid re-rendering sliders
            });
            
            this.trackManager.on('masterGainChanged', (data) => {
                // Update master volume display when changed programmatically
                const percentage = Math.round(data.linearGain * 100);
                if (this.elements.masterVolumeSlider) {
                    this.elements.masterVolumeSlider.value = percentage;
                }
                this.updateMasterVolumeDisplay(percentage);
            });
            
            this.trackManager.on('error', (error) => {
                this.showError(`Track Manager: ${error}`);
                this.updateStatus('Track error', 'error');
            });
            
            // Now initialize the track manager (this will emit masterChainReady)
            console.log('Initializing TrackManager...');
            await this.trackManager.initialize();
            
        } catch (error) {
            this.showError(`Failed to setup track manager: ${error.message}`);
            this.updateStatus('Setup failed', 'error');
        }
    }
    
    /**
     * Set up the spectrum visualizer for master output
     */
    setupSpectrumVisualizer() {
        try {
            console.log('Setting up spectrum visualizer');
            
            // Create spectrum visualizer
            this.spectrumVisualizer = new SpectrumVisualizer(this.elements.spectrumCanvas);
            
            // Create analyzer controls manager
            this.analyzerControls = new AnalyzerControlsManager();
            
            // Get the master analyzer from track manager
            const masterAnalyzer = this.trackManager.getMasterAnalyzer();
            
            if (masterAnalyzer) {
                // Connect the visualizer to the master analyzer
                this.spectrumVisualizer.connectAnalyzer(masterAnalyzer);
                
                // Connect the analyzer controls to the master analyzer
                this.analyzerControls.connectAnalyzer(masterAnalyzer);
                this.analyzerControls.connectVisualizer(this.spectrumVisualizer);
                
                console.log('Spectrum visualizer and analyzer controls connected to master analyzer');
            } else {
                console.warn('No master analyzer available for spectrum visualization');
            }
            
        } catch (error) {
            console.error('Failed to setup spectrum visualizer:', error);
            this.showError(`Failed to setup spectrum visualizer: ${error.message}`);
        }
    }
    
    /**
     * Add the initial track when application starts (ensures at least one track always exists)
     */
    addInitialTrack() {
        try {
            if (!this.trackManager) {
                throw new Error('TrackManager not initialized');
            }
            
            console.log('Adding initial track');
            const track = this.trackManager.addTrack();
            
            // Start collapsed by default for space efficiency
            // User can expand manually if needed
            
            console.log(`Initial track ${track.id} added (collapsed by default)`);
            
        } catch (error) {
            console.error('CRITICAL: Failed to add initial track:', error);
            this.showError(`Critical error: Failed to add initial track. ${error.message}`);
            this.updateStatus('Initialization failed', 'error');
        }
    }
    
    /**
     * Handle adding a new track
     */
    handleAddTrack() {
        try {
            if (!this.trackManager) {
                this.showError('Audio system not initialized yet. Please click Start first.');
                return;
            }
            
            console.log('Adding new track');
            const track = this.trackManager.addTrack();
            
            // Start collapsed by default for space efficiency
            // User can expand manually if needed
            
        } catch (error) {
            console.error('Failed to add track:', error);
            this.showError(`Failed to add track: ${error.message}`);
        }
    }
    
    /**
     * Handle track added event
     */
    handleTrackAdded(data) {
        console.log('Track added:', data.trackId);
        this.createTrackUI(data.track);
        this.updateStatus(`Track ${data.trackId + 1} added`, 'ready');
    }
    
    /**
     * Handle track removed event
     */
    handleTrackRemoved(data) {
        console.log('Track removed:', data.trackId);
        this.removeTrackUI(data.trackId);
        this.state.expandedTracks.delete(data.trackId);
        this.updateStatus(`Track removed`, 'ready');
    }
    
    /**
     * Create UI for a new track
     */
    createTrackUI(track) {
        const trackId = track.id;
        const trackState = track.getState();
        
        // Create track list item element
        const trackItem = document.createElement('div');
        trackItem.className = 'track-list-item';
        trackItem.setAttribute('data-track-id', trackId);
        
        // Auto-select first track
        if (this.state.selectedTrackId === null) {
            this.state.selectedTrackId = trackId;
            trackItem.classList.add('selected');
        }
        
        trackItem.innerHTML = `
            <div class="track-name">
                Track ${trackId + 1}
                <span class="track-filter-count" data-track-id="${trackId}">
                    ${this.getFilterCountText(trackState.filters)}
                </span>
            </div>
            
            <button class="track-mute" data-track-id="${trackId}" title="Mute Track">
                🔇
            </button>
            
            <div class="track-gain-container">
                <input type="range" 
                       class="track-gain" 
                       data-track-id="${trackId}"
                       min="0" 
                       max="100" 
                       value="${trackState.gainPercentage}"
                       step="1">
                <span class="gain-display" data-track-id="${trackId}">
                    ${this.formatDbValue(trackState.gainDb)}
                </span>
            </div>
            
            <button class="track-remove" data-track-id="${trackId}" title="Remove Track">
                ✕
            </button>
        `;
        
        // Add to track list
        this.elements.trackList.appendChild(trackItem);
        
        // Set up track-specific event listeners
        this.setupTrackEventListeners(trackId);
        
        // Initialize filter count display
        this.updateTrackFilterCount(trackId);
        
        // Update filter editor if this track is selected
        if (this.state.selectedTrackId === trackId) {
            this.updateFilterEditor(trackId);
        }
    }
    
    /**
     * Set up event listeners for a specific track
     */
    setupTrackEventListeners(trackId) {
        const trackItem = this.elements.trackList.querySelector(`[data-track-id="${trackId}"]`);
        
        // Track item click for selection
        trackItem.addEventListener('click', (event) => {
            // Don't select if clicking on buttons or sliders
            if (!event.target.closest('button, input')) {
                this.selectTrack(trackId);
            }
        });
        
        // Mute button
        const muteBtn = trackItem.querySelector('.track-mute');
        muteBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.handleTrackMute(trackId);
        });
        
        // Gain slider
        const gainSlider = trackItem.querySelector('.track-gain');
        let gainDragging = false;
        
        gainSlider.addEventListener('mousedown', () => {
            gainDragging = true;
        });
        
        gainSlider.addEventListener('mouseup', () => {
            gainDragging = false;
        });
        
        gainSlider.addEventListener('input', (event) => {
            event.stopPropagation();
            const percentage = parseInt(event.target.value);
            
            // Update display immediately
            const gainDisplay = trackItem.querySelector('.gain-display');
            if (gainDisplay) {
                const dbValue = this.linearToDb(percentage / 100);
                gainDisplay.textContent = this.formatDbValue(dbValue);
            }
            
            // Throttle audio updates during drag for smoother performance
            if (gainDragging) {
                if (!gainSlider.updateTimeout) {
                    gainSlider.updateTimeout = setTimeout(() => {
                        this.handleTrackGainChange(trackId, percentage);
                        gainSlider.updateTimeout = null;
                    }, 16); // ~60fps throttling
                }
            } else {
                // Immediate update when not dragging
                this.handleTrackGainChange(trackId, percentage);
            }
        });
        
        gainSlider.addEventListener('change', (event) => {
            event.stopPropagation();
            const percentage = parseInt(event.target.value);
            
            // Clear any pending throttled update
            if (gainSlider.updateTimeout) {
                clearTimeout(gainSlider.updateTimeout);
                gainSlider.updateTimeout = null;
            }
            
            // Apply final value
            this.handleTrackGainChange(trackId, percentage);
        });
        
        // Remove button
        const removeBtn = trackItem.querySelector('.track-remove');
        removeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            this.handleTrackRemove(trackId);
        });
    }
    
    /**
     * Select a track for editing
     */
    selectTrack(trackId) {
        console.log(`Selecting track ${trackId} for editing`);
        
        // Update selected track ID
        const previousTrackId = this.state.selectedTrackId;
        this.state.selectedTrackId = trackId;
        
        // Update track list visual selection
        const trackItems = this.elements.trackList.querySelectorAll('.track-list-item');
        trackItems.forEach(item => {
            const itemTrackId = parseInt(item.getAttribute('data-track-id'));
            if (itemTrackId === trackId) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
        
        // Update filter editor
        this.updateFilterEditor(trackId);
        
        console.log(`Track ${trackId} selected (previously: ${previousTrackId})`);
    }
    
    /**
     * Update the filter editor panel for the selected track
     */
    updateFilterEditor(trackId) {
        if (trackId === null) {
            // No track selected - show placeholder
            this.elements.filterEditorTitle.textContent = 'Select a Track';
            this.elements.filterEditor.innerHTML = `
                <div class="filter-editor-placeholder">
                    <div class="placeholder-icon">🎛️</div>
                    <div class="placeholder-text">Select a track to edit its filters</div>
                </div>
            `;
            return;
        }
        
        try {
            // Update title
            this.elements.filterEditorTitle.textContent = `Track ${trackId + 1} Filters`;
            
            // Create filter editor controls
            this.renderFilterEditor(trackId);
            
        } catch (error) {
            console.error(`Failed to update filter editor for track ${trackId}:`, error);
            this.showError(`Failed to update filter editor: ${error.message}`);
        }
    }
    
    /**
     * Render the filter editor for a specific track
     */
    renderFilterEditor(trackId) {
        try {
            const track = this.trackManager.getTrack(trackId);
            const filters = track.getFilterChain().getAllFilters();
            
            // Create filter editor content
            let editorHTML = `
                <div class="filter-editor-controls">
                    <div class="filter-editor-actions">
                        <button class="add-filter-btn" data-track-id="${trackId}">
                            <span class="btn-icon">+</span>
                            <span class="btn-text">Add Filter</span>
                        </button>
                    </div>
                    <div class="filter-chain-editor">
            `;
            
            // Add each filter
            filters.forEach((filterData, index) => {
                editorHTML += this.createFilterEditorHTML(trackId, index, filterData);
            });
            
            if (filters.length === 0) {
                editorHTML += `
                    <div class="filter-editor-placeholder">
                        <div class="placeholder-icon">📊</div>
                        <div class="placeholder-text">No filters added yet</div>
                    </div>
                `;
            }
            
            editorHTML += `
                    </div>
                </div>
            `;
            
            // Update filter editor content
            this.elements.filterEditor.innerHTML = editorHTML;
            
            // Set up event listeners for the filter editor
            this.setupFilterEditorEventListeners(trackId);
            
        } catch (error) {
            console.error(`Failed to render filter editor for track ${trackId}:`, error);
            this.elements.filterEditor.innerHTML = `
                <div class="filter-editor-placeholder">
                    <div class="placeholder-icon">⚠️</div>
                    <div class="placeholder-text">Error loading filters</div>
                </div>
            `;
        }
    }
    
    /**
     * Handle track mute toggle
     */
    handleTrackMute(trackId) {
        try {
            if (!this.trackManager) {
                this.showError('Track system not ready');
                return;
            }
            
            const track = this.trackManager.getTrack(trackId);
            const newMuteState = !track.isMuted;
            track.setMuted(newMuteState);
            
        } catch (error) {
            console.error(`Failed to toggle mute for track ${trackId}:`, error);
            this.showError(`Failed to toggle mute: ${error.message}`);
        }
    }
    
    /**
     * Handle track gain change
     */
    handleTrackGainChange(trackId, percentage) {
        try {
            if (!this.trackManager) {
                this.showError('Track system not ready');
                return;
            }
            
            const track = this.trackManager.getTrack(trackId);
            track.setGainPercentage(percentage);
            
        } catch (error) {
            console.error(`Failed to change gain for track ${trackId}:`, error);
            this.showError(`Failed to change gain: ${error.message}`);
        }
    }
    
    /**
     * Handle track removal
     */
    handleTrackRemove(trackId) {
        try {
            if (!this.trackManager) {
                this.showError('Track system not ready');
                return;
            }
            
            if (this.trackManager.getAllTracks().length <= 1) {
                this.showError('Cannot remove the last track. At least one track is required.');
                return;
            }
            
            this.trackManager.removeTrack(trackId);
            
        } catch (error) {
            console.error(`Failed to remove track ${trackId}:`, error);
            this.showError(`Failed to remove track: ${error.message}`);
        }
    }
    
    /**
     * Create filter editor HTML for a specific filter
     */
    createFilterEditorHTML(trackId, filterIndex, filterData) {
        // Get parameter definitions for this filter type
        const parameters = this.getFilterParameterDefinitions(filterData);
        
        // Generate parameter sliders HTML
        const parametersHTML = parameters.map(param => {
            // Use the actual config value, or the parameter's default, or 0 for gain
            let currentValue = filterData.config[param.name];
            if (currentValue === undefined) {
                if (param.name === 'gain') {
                    currentValue = 0;  // Default gain to 0dB, not param.min (-40dB)
                } else {
                    currentValue = param.default || param.min;
                }
            }
            return this.createParameterSliderHTML(param, currentValue);
        }).join('');

        return `
            <div class="filter-item-editor" data-filter-index="${filterIndex}">
                <div class="filter-header-editor">
                    <span class="filter-type-editor">${this.capitalizeFilterType(filterData.config.type)}</span>
                    <div class="filter-controls-editor">
                        <label class="toggle-switch filter-enabled-editor">
                            <input type="checkbox" ${filterData.enabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                        <button class="filter-remove" title="Remove Filter">×</button>
                    </div>
                </div>
                <div class="filter-params-editor">
                    ${parametersHTML}
                </div>
            </div>
        `;
    }
    
    /**
     * Set up event listeners for the filter editor
     */
    setupFilterEditorEventListeners(trackId) {
        // Add filter button
        const addFilterBtn = this.elements.filterEditor.querySelector('.add-filter-btn');
        if (addFilterBtn) {
            addFilterBtn.addEventListener('click', () => {
                this.handleAddFilter(trackId);
            });
        }
        
        // Filter controls (enabled toggles, remove buttons, parameter sliders)
        const filterItems = this.elements.filterEditor.querySelectorAll('.filter-item-editor');
        filterItems.forEach((filterItem, filterIndex) => {
            // Filter enabled toggle
            const enabledToggle = filterItem.querySelector('input[type="checkbox"]');
            if (enabledToggle) {
                enabledToggle.addEventListener('change', (event) => {
                    this.handleFilterEnabledChange(trackId, filterIndex, event.target.checked);
                });
            }
            
            // Filter remove button
            const removeBtn = filterItem.querySelector('.filter-remove');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    this.handleFilterRemove(trackId, filterIndex);
                });
            }
            
            // Parameter sliders
            const paramSliders = filterItem.querySelectorAll('.filter-param-slider-editor');
            paramSliders.forEach(slider => {
                const parameter = slider.getAttribute('data-param');
                const valueDisplay = slider.parentElement.querySelector('.filter-param-value-editor');
                
                slider.addEventListener('input', (event) => {
                    const value = parseFloat(event.target.value);
                    
                    // Update display immediately with proper formatting
                    if (valueDisplay) {
                        // Create a mock parameter definition for formatting
                        const paramDef = this.getParameterDefinition(parameter, slider);
                        valueDisplay.textContent = this.formatParameterValue(paramDef, value);
                    }
                    
                    // Update filter parameter
                    this.handleFilterParameterChange(trackId, filterIndex, parameter, value);
                });
            });
        });
    }
    
    /**
     * Handle adding filter to track - show filter type selection modal
     */
    handleAddFilter(trackId) {
        try {
            if (!this.trackManager) {
                this.showError('Track system not ready');
                return;
            }
            
            // Store the target track ID for when user selects filter type
            this.pendingFilterTrackId = trackId;
            
            // Show filter type selection modal
            this.showFilterModal();
            
        } catch (error) {
            console.error(`Failed to show filter selection for track ${trackId}:`, error);
            this.showError(`Failed to open filter selection: ${error.message}`);
        }
    }
    
    /**
     * Get filter count text for display
     */
    getFilterCountText(filters) {
        if (!filters || filters.length === 0) {
            return 'No filters';
        }
        
        const activeFilters = filters.filter(f => f.enabled);
        if (activeFilters.length === 0) {
            return `${filters.length} filter${filters.length !== 1 ? 's' : ''} (disabled)`;
        } else if (activeFilters.length === filters.length) {
            return `${filters.length} filter${filters.length !== 1 ? 's' : ''}`;
        } else {
            return `${activeFilters.length}/${filters.length} filter${filters.length !== 1 ? 's' : ''}`;
        }
    }
    
    /**
     * Remove track UI element
     */
    removeTrackUI(trackId) {
        const trackItem = this.elements.trackList.querySelector(`[data-track-id="${trackId}"]`);
        if (trackItem) {
            trackItem.remove();
        }
        
        // Update remaining track numbers and selection
        this.updateAllTrackNumbers();
        this.updateTrackSelection();
    }
    
    /**
     * Update track numbers in UI after removal
     */
    updateAllTrackNumbers() {
        const trackItems = this.elements.trackList.querySelectorAll('.track-list-item');
        trackItems.forEach((trackItem, index) => {
            const trackName = trackItem.querySelector('.track-name');
            if (trackName && trackName.firstChild) {
                trackName.firstChild.textContent = `Track ${index + 1}`;
            }
            trackItem.setAttribute('data-track-id', index);
        });
    }
    
    /**
     * Update track selection after track removal
     */
    updateTrackSelection() {
        const trackItems = this.elements.trackList.querySelectorAll('.track-list-item');
        
        if (trackItems.length === 0) {
            // No tracks left
            this.state.selectedTrackId = null;
            this.updateFilterEditor(null);
            return;
        }
        
        // Check if currently selected track still exists
        const selectedExists = Array.from(trackItems).some(item => 
            parseInt(item.getAttribute('data-track-id')) === this.state.selectedTrackId
        );
        
        if (!selectedExists) {
            // Select first available track
            const firstTrackId = parseInt(trackItems[0].getAttribute('data-track-id'));
            this.selectTrack(firstTrackId);
        }
    }
    
    /**
     * Update track UI state
     */
    updateTrackUI(trackId) {
        // Update track state in UI if needed
        console.log(`Updating UI for track ${trackId}`);
    }
    
    /**
     * Update track gain display
     */
    updateTrackGainDisplay(trackId, dbGain) {
        const gainDisplay = this.elements.trackList.querySelector(
            `[data-track-id="${trackId}"] .gain-display`
        );
        if (gainDisplay) {
            gainDisplay.textContent = this.formatDbValue(dbGain);
        }
    }
    
    /**
     * Update track mute display
     */
    updateTrackMuteDisplay(trackId, isMuted) {
        const muteBtn = this.elements.trackList.querySelector(
            `[data-track-id="${trackId}"] .track-mute`
        );
        if (muteBtn) {
            if (isMuted) {
                muteBtn.classList.add('muted');
                muteBtn.textContent = '🔇';
        } else {
                muteBtn.classList.remove('muted');
                muteBtn.textContent = '🔇';
            }
        }
    }
    
    /**
     * Update track filter display
     */
    updateTrackFilterDisplay(trackId, filterData) {
        try {
            // Update filter count in track list
            this.updateTrackFilterCount(trackId);
            
            // Update filter editor if this track is currently selected
            if (this.state.selectedTrackId === trackId) {
                this.updateFilterEditor(trackId);
            }
            
            console.log(`Filter display updated for track ${trackId}, action:`, filterData?.action || 'no action');
            
        } catch (error) {
            console.error(`Failed to update filter display for track ${trackId}:`, error);
        }
    }
    
    /**
     * Update track filter count display
     */
    updateTrackFilterCount(trackId) {
        const filterCountElement = this.elements.trackList.querySelector(
            `[data-track-id="${trackId}"] .track-filter-count`
        );
        
        if (!filterCountElement) return;
        
        try {
            const track = this.trackManager.getTrack(trackId);
            const trackState = track.getState();
            
            filterCountElement.textContent = this.getFilterCountText(trackState.filters);
            
        } catch (error) {
            console.error(`Failed to update filter count for track ${trackId}:`, error);
            filterCountElement.textContent = 'Error';
        }
    }
    
    /**
     * Handle filter enabled change
     */
    handleFilterEnabledChange(trackId, filterIndex, enabled) {
        try {
            const track = this.trackManager.getTrack(trackId);
            track.getFilterChain().setFilterEnabled(filterIndex, enabled);
            
        } catch (error) {
            console.error(`Failed to change filter enabled state:`, error);
            this.showError(`Failed to change filter state: ${error.message}`);
        }
    }
    
    /**
     * Handle filter parameter change
     */
    handleFilterParameterChange(trackId, filterIndex, parameter, value) {
        try {
            const track = this.trackManager.getTrack(trackId);
            track.getFilterChain().setFilterParameter(filterIndex, parameter, value);
            
        } catch (error) {
            console.error(`Failed to change filter parameter:`, error);
            this.showError(`Failed to change filter parameter: ${error.message}`);
        }
    }
    
    /**
     * Handle filter removal
     */
    handleFilterRemove(trackId, filterIndex) {
        try {
            const track = this.trackManager.getTrack(trackId);
            track.getFilterChain().removeFilter(filterIndex);
            
            // Update filter displays
            this.updateTrackFilterCount(trackId);
            if (this.state.selectedTrackId === trackId) {
                this.updateFilterEditor(trackId);
            }
            
        } catch (error) {
            console.error(`Failed to remove filter:`, error);
            this.showError(`Failed to remove filter: ${error.message}`);
        }
    }
    
    /**
     * Show filter type selection modal
     */
    showFilterModal() {
        if (this.elements.filterModal) {
            this.elements.filterModal.classList.add('show');
            
            // Focus first filter type button for keyboard navigation
            const firstBtn = this.elements.filterModal.querySelector('.filter-type-btn');
            if (firstBtn) {
                firstBtn.focus();
            }
        }
    }
    
    /**
     * Hide filter type selection modal
     */
    hideFilterModal() {
        if (this.elements.filterModal) {
            this.elements.filterModal.classList.remove('show');
            this.pendingFilterTrackId = null;
        }
    }
    
    /**
     * Handle filter type selection from modal
     */
    async handleFilterTypeSelection(filterType) {
        try {
            if (!this.trackManager || this.pendingFilterTrackId === null) {
                this.hideFilterModal();
                return;
            }
            
            console.log(`DEBUG: Attempting to add ${filterType} filter to track ${this.pendingFilterTrackId}`);
            console.log(`DEBUG: TrackManager has ${this.trackManager.getAllTracks().length} tracks`);
            console.log(`DEBUG: TrackManager tracks:`, this.trackManager.getAllTracks().map(t => ({ id: t.id, isPlaying: t.isPlaying })));
            
            const track = this.trackManager.getTrack(this.pendingFilterTrackId);
            console.log(`DEBUG: Got track:`, { id: track.id, isPlaying: track.isPlaying });
            
            // Show loading state while adding advanced filter
            if (['gaussian', 'parabolic', 'plateau'].includes(filterType)) {
                this.updateStatus(`Adding ${filterType} filter...`, 'loading');
            }
            
            const filterIndex = await track.addFilter(filterType);
            
            console.log(`Added ${filterType} filter ${filterIndex} to track ${this.pendingFilterTrackId}`);
            this.updateTrackFilterDisplay(this.pendingFilterTrackId, { 
                action: 'added', 
                filterIndex 
            });
            
            this.updateStatus('Ready', 'ready');
            
            // Hide modal
            this.hideFilterModal();
            
        } catch (error) {
            console.error(`Failed to add ${filterType} filter:`, error);
            this.showError(`Failed to add filter: ${error.message}`);
            this.updateStatus('Error adding filter', 'error');
            this.hideFilterModal();
        }
    }
    
    /**
     * Handle master volume change
     */
    handleMasterVolumeChange(percentage) {
        try {
            if (!this.trackManager) {
                return;
            }
            
            // Convert percentage to linear gain (0-1)
            const linearGain = percentage / 100;
            
            // Update track manager master gain
            this.trackManager.setMasterGain(linearGain);
            
            // Update display
            this.updateMasterVolumeDisplay(percentage);
            
        } catch (error) {
            console.error('Failed to change master volume:', error);
            this.showError(`Failed to change master volume: ${error.message}`);
        }
    }
    
    /**
     * Update master volume display
     */
    updateMasterVolumeDisplay(percentage) {
        if (this.elements.masterVolumeValue) {
            const dbValue = this.linearToDb(percentage / 100);
            this.elements.masterVolumeValue.textContent = `${percentage}% (${this.formatDbValue(dbValue)})`;
        }
    }
    
    /**
     * Convert linear gain (0-1) to dB
     */
    linearToDb(linearGain) {
        if (linearGain === 0) {
            return -Infinity;
        }
        return 20 * Math.log10(linearGain);
    }
    
    // Audio exporter setup removed - ExportManager now handles exports directly with SimpleAudioExporter
    
    /**
     * Set up the export manager with modal dialog
     */
    setupExportManager() {
        try {
            // Create export manager (it will handle its own initialization)
            this.exportManager = new ExportManager(null, this.trackManager);
            
            // Set up export manager event listeners
            this.exportManager.on('shown', () => {
                console.log('Export modal shown');
            });
            
            this.exportManager.on('hidden', () => {
                console.log('Export modal hidden');
            });
            
            console.log('Export manager initialized');
            
        } catch (error) {
            console.error('Failed to setup export manager:', error);
            this.showError(`Failed to setup export manager: ${error.message}`);
        }
    }
    
    /**
     * Legacy export duration function - now handled by ExportManager
     */
    handleExportDurationChange(duration) {
        // This method is now handled by the ExportManager modal
        console.warn('handleExportDurationChange called but export is now handled by ExportManager');
    }
    
    /**
     * Handle export button click
     */
    async handleExportClick() {
        if (!this.exportManager) {
            this.showError('Export system not initialized');
            return;
        }
        
        // 🔇 STOP REALTIME PLAYBACK: Stop all tracks when entering export mode
        if (this.state.isPlaying) {
            console.log('🔇 EXPORT: Stopping realtime playback before export');
            try {
                await this.trackManager.stopAll();
                console.log('🔇 EXPORT: Realtime playback stopped successfully');
            } catch (error) {
                console.error('Error stopping playback for export:', error);
                // Continue with export even if stopping fails
            }
        }
        
        // Show the export modal instead of direct export
        this.exportManager.show();
    }
    
    /**
     * Get current multi-track audio configuration for export
     * NOTE: Export uses pre-master-volume signal (pure track mix)
     */
    getCurrentAudioConfig() {
        const trackConfig = this.trackManager ? this.trackManager.getExportConfig() : { tracks: [] };
        
        return {
            type: 'multitrack',
            duration: this.state.exportDuration,
            sampleRate: this.audioEngine.audioContext.sampleRate,
            tracks: trackConfig.tracks,
            masterGain: 1.0 // Export always uses unity gain (bypasses master volume control)
        };
    }
    
    /**
     * Handle start/stop button click
     */
    async handleStartStopClick() {
        try {
            // First click - initialize audio system (user gesture required)
            if (!this.isInitialized || !this.trackManager) {
                console.log('First start click - initializing audio system');
                this.updateStatus('Initializing audio system...', 'ready');
                this.elements.startStopBtn.disabled = true;
                
                try {
                    // Initialize the audio engine (user gesture allows AudioContext creation)
                    await this.audioEngine.initialize();
                    console.log('AudioEngine initialization completed');
                    
                    // Now set up the track manager
                    await this.setupTrackManager();
                    
                    // Wait a moment for track manager to be ready, then start
                    setTimeout(async () => {
                        if (this.isInitialized && this.trackManager) {
                            await this.trackManager.startAll();
                        }
                    }, 100);
                    
                } catch (error) {
                    console.error('AudioEngine initialization failed:', error);
                    this.showError(`Failed to initialize audio: ${error.message}`);
                    this.updateStatus('Initialization failed', 'error');
                    this.elements.startStopBtn.disabled = false;
                }
                return;
            }
            
            // Subsequent clicks - normal start/stop
            if (this.state.isPlaying) {
                await this.trackManager.stopAll();
        } else {
                await this.trackManager.startAll();
            }
            
        } catch (error) {
            console.error('Failed to start/stop audio:', error);
            this.showError(`Failed to start/stop audio: ${error.message}`);
        }
    }
    
    /**
     * Handle keyboard shortcuts
     */
    handleKeyboardShortcuts(event) {
        if (event.target.tagName === 'INPUT') {
            return; // Don't trigger shortcuts when typing in inputs
        }
        
        switch (event.code) {
            case 'Space':
                event.preventDefault();
                this.handleStartStopClick();
                break;
            case 'KeyT':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    this.handleAddTrack();
                }
                break;
            case 'Escape':
                // Close filter modal if open
                if (this.elements.filterModal && this.elements.filterModal.classList.contains('show')) {
                    event.preventDefault();
                    this.hideFilterModal();
                }
                break;
        }
    }
    
    /**
     * Update UI state
     */
    updateUI() {
        // Update start/stop button
        if (this.state.isPlaying) {
            this.elements.startStopBtn.classList.add('active');
            this.elements.startStopBtn.querySelector('.btn-text').textContent = 'Stop Audio';
        } else {
            this.elements.startStopBtn.classList.remove('active');
            this.elements.startStopBtn.querySelector('.btn-text').textContent = 'Start Audio';
        }
        
        // Update export button
        this.updateExportUI();
    }
    
    /**
     * Update export UI state
     */
    updateExportUI() {
        const trackCount = this.trackManager ? this.trackManager.getAllTracks().length : 0;
        
        // Export button is now always enabled if we have tracks (modal handles validation)
        this.elements.exportBtn.disabled = trackCount === 0 || !this.exportManager;
        
        // Update button text to reflect new modal functionality
        if (this.elements.exportBtn.querySelector('.btn-text')) {
            this.elements.exportBtn.querySelector('.btn-text').textContent = 'Export...';
        }
    }
    
    /**
     * Update export duration display
     */
    updateExportDurationDisplay(duration) {
        if (this.elements.exportDurationValue) {
            const text = duration === 1 ? '1 second' : `${duration} seconds`;
            this.elements.exportDurationValue.textContent = text;
        }
    }
    
    /**
     * Show export progress
     */
    showExportProgress() {
        if (this.elements.exportProgress) {
            this.elements.exportProgress.style.display = 'block';
        }
    }
    
    /**
     * Hide export progress
     */
    hideExportProgress() {
        if (this.elements.exportProgress) {
            this.elements.exportProgress.style.display = 'none';
        }
    }
    
    /**
     * Update progress bar
     */
    updateProgress(percentage, text) {
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${percentage}%`;
        }
        if (this.elements.progressText) {
            this.elements.progressText.textContent = text;
        }
    }
    
    /**
     * Update status indicator
     */
    updateStatus(text, state) {
        this.elements.statusText.textContent = text;
        
        // Remove all status classes
        this.elements.statusDot.className = 'status-dot';
        
        // Add new status class
        if (state) {
            this.elements.statusDot.classList.add(state);
        }
    }
    
    /**
     * Update system information display (removed - no longer showing system info)
     */
    updateSystemInfo(systemInfo) {
        // System information display removed from UI
        // Information is still available programmatically via systemInfo parameter
        console.log('System info:', systemInfo);
    }
    
    /**
     * Show error message
     */
    showError(message) {
        console.error('Application error:', message);
        
        this.elements.errorMessage.textContent = message;
        this.elements.errorDisplay.style.display = 'block';
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            this.hideError();
        }, 10000);
    }
    
    /**
     * Hide error message
     */
    hideError() {
        this.elements.errorDisplay.style.display = 'none';
    }
    
    /**
     * Format dB value for display
     */
    formatDbValue(dbValue) {
        if (dbValue === -Infinity) {
            return '-∞ dB';
        }
        return `${dbValue.toFixed(1)} dB`;
    }
    
    /**
     * Format frequency for display
     */
    formatFrequency(frequency) {
        if (frequency >= 1000) {
            return `${(frequency / 1000).toFixed(1)}k Hz`;
        }
        return `${frequency.toFixed(0)} Hz`;
    }
    
    /**
     * Capitalize filter type for display
     */
    capitalizeFilterType(type) {
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    /**
     * Clean shutdown
     */
    cleanup() {
        if (this.trackManager) {
            this.trackManager.destroy();
            this.trackManager = null;
        }
        
        if (this.spectrumVisualizer) {
            this.spectrumVisualizer.destroy();
            this.spectrumVisualizer = null;
        }
        
        if (this.analyzerControls) {
            this.analyzerControls.destroy();
            this.analyzerControls = null;
        }
        
        // Audio exporter removed - ExportManager handles its own cleanup
        
        if (this.exportManager) {
            this.exportManager = null;
        }
        
        this.eventListenersSetup = false;
        console.log('NoiseShaper multi-track application cleaned up');
    }

    /**
     * Get parameter definitions for a filter type
     */
    getFilterParameterDefinitions(filterData) {
        console.log(`DEBUG: Getting parameters for filter:`, {
            type: filterData.config.type,
            isAdvanced: filterData.isAdvanced,
            config: filterData.config
        });
        
        if (filterData.isAdvanced) {
            const params = this.getAdvancedFilterParameters(filterData.config.type);
            console.log(`DEBUG: Advanced filter parameters:`, params);
            return params;
        } else {
            const params = this.getStandardFilterParameters(filterData.config.type);
            console.log(`DEBUG: Standard filter parameters:`, params);
            return params;
        }
    }

    /**
     * Get standard filter parameters based on type
     */
    getStandardFilterParameters(filterType) {
        const baseParams = [
            {
                name: 'frequency',
                label: 'Frequency',
                min: 20,
                max: 20000,
                step: 1,
                scale: 'logarithmic',
                unit: 'Hz'
            },
            {
                name: 'Q',
                label: 'Q Factor',
                min: 0.1,
                max: 30,
                step: 0.1,
                scale: 'linear',
                unit: ''
            }
        ];

        // Add gain parameter for peaking filters
        if (filterType === 'peaking') {
            baseParams.push({
                name: 'gain',
                label: 'Gain',
                min: -40,
                max: 40,
                step: 0.1,
                scale: 'linear',
                unit: 'dB'
            });
        }

        return baseParams;
    }

    /**
     * Get advanced filter parameters based on type
     */
    getAdvancedFilterParameters(filterType) {
        const baseParams = [
            {
                name: 'centerFreq',
                label: 'Center Freq',
                min: 20,
                max: 20000,
                step: 1,
                scale: 'logarithmic',
                unit: 'Hz'
            },
            {
                name: 'width',
                label: 'Width',
                min: 50,
                max: 10000,
                step: 1,
                scale: 'logarithmic',
                unit: 'Hz'
            },
            {
                name: 'gain',
                label: 'Gain',
                min: -40,
                max: 40,
                step: 0.1,
                scale: 'linear',
                unit: 'dB'
            }
        ];

        // Add type-specific parameters
        switch (filterType) {
            case 'gaussian':
                baseParams.push(
                    {
                        name: 'skew',
                        label: 'Skew',
                        min: -5,
                        max: 5,
                        step: 0.1,
                        scale: 'linear',
                        unit: ''
                    },
                    {
                        name: 'kurtosis',
                        label: 'Kurtosis',
                        min: 0.2,
                        max: 5,
                        step: 0.1,
                        scale: 'linear',
                        unit: ''
                    }
                );
                break;
                
            case 'parabolic':
                baseParams.push(
                    {
                        name: 'skew',
                        label: 'Skew',
                        min: -5,
                        max: 5,
                        step: 0.1,
                        scale: 'linear',
                        unit: ''
                    },
                    {
                        name: 'flatness',
                        label: 'Flatness',
                        min: 0.5,
                        max: 3,
                        step: 0.1,
                        scale: 'linear',
                        unit: ''
                    }
                );
                break;
                
            case 'plateau':
                baseParams.push({
                    name: 'flatWidth',
                    label: 'Flat Width',
                    min: 10,
                    max: 2000,
                    step: 1,
                    scale: 'logarithmic',
                    unit: 'Hz'
                });
                break;
        }

        return baseParams;
    }

    /**
     * Create HTML for a single parameter slider
     */
    createParameterSliderHTML(param, currentValue) {
        return `
            <div class="filter-param-editor">
                <span class="filter-param-label-editor">${param.label}</span>
                <input type="range" 
                       class="filter-param-slider-editor" 
                       data-param="${param.name}"
                       min="${param.min}" 
                       max="${param.max}" 
                       value="${currentValue}"
                       step="${param.step}">
                <span class="filter-param-value-editor">${this.formatParameterValue(param, currentValue)}</span>
            </div>
        `;
    }

    /**
     * Get parameter definition from slider element
     */
    getParameterDefinition(paramName, sliderElement) {
        // Determine unit based on parameter name and slider attributes
        let unit = '';
        if (paramName.includes('freq') || paramName.includes('frequency') || paramName.includes('Width')) {
            unit = 'Hz';
        } else if (paramName === 'gain') {
            unit = 'dB';
        }

        return {
            name: paramName,
            min: parseFloat(sliderElement.min),
            max: parseFloat(sliderElement.max),
            step: parseFloat(sliderElement.step),
            unit: unit
        };
    }

    /**
     * Format parameter value for display
     */
    formatParameterValue(param, value) {
        switch (param.unit) {
            case 'Hz':
                return this.formatFrequency(value);
            case 'dB':
                return this.formatDbValue(value);
            case '':
                if (param.name === 'Q' || param.name === 'kurtosis' || param.name === 'flatness') {
                    return value.toFixed(1);
                } else {
                    return value.toFixed(1);
                }
            default:
                return value.toString();
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.noiseShaper = new NoiseShaperweb();
}); 