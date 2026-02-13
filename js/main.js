document.addEventListener('DOMContentLoaded', async () => {
    const audioEngine = new AudioEngine();
    const visualizer = new Visualizer('reel-canvas');
    const storage = new TapeLibrary();
    
    // UI Elements
    const statusText = document.getElementById('status-text');
    const timeDisplay = document.getElementById('time-display');
    const wheelModeDisplay = document.getElementById('wheel-mode');
    const appContainer = document.getElementById('app');
    const libraryPanel = document.getElementById('library-panel');
    const tapeListContainer = document.getElementById('tape-list-container');
    const closeLibBtn = document.getElementById('close-lib');
    const newTapeBtn = document.getElementById('new-tape-btn');
    const deleteTapeBtn = document.getElementById('delete-tape-btn');
    const summarizeTapeBtn = document.getElementById('summarize-tape-btn');
    const canvas = document.getElementById('reel-canvas');

    // Settings panel elements
    const settingsBtn = document.getElementById('settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettingsBtn = document.getElementById('close-settings');
    const apiKeyInput = document.getElementById('api-key-input');
    const aiModelSelect = document.getElementById('ai-model-select');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const clearKeyBtn = document.getElementById('clear-key-btn');
    const aiStatusEl = document.getElementById('ai-status');

    // Summary panel elements
    const summaryPanel = document.getElementById('summary-panel');
    const closeSummaryBtn = document.getElementById('close-summary');
    const summaryContent = document.getElementById('summary-content');

    // State
    let currentMode = 'DECK'; // 'DECK' | 'LIBRARY'
    let wheelMode = 'SCRUB';  // 'SCRUB' | 'SPEED'
    let initialized = false;
    let selectedTapeId = null;

    // --- Wheel Mode Display ---
    function updateWheelModeDisplay() {
        if (wheelMode === 'SPEED') {
            wheelModeDisplay.innerText = `x${audioEngine.playbackRate.toFixed(1)}`;
        } else if (wheelMode === 'CUE') {
            wheelModeDisplay.innerText = `CUE(${audioEngine.markers.length})`;
        } else {
            wheelModeDisplay.innerText = 'SCRUB';
        }
    }

    // --- Init ---
    async function ensureInit() {
        if (!initialized) {
            const success = await audioEngine.init();
            if (success) {
                initialized = true;
                statusText.innerText = "IDLE";
                appContainer.className = 'state-idle';
                refreshLibrary();
            } else {
                statusText.innerText = "ERR: MIC";
            }
        }
    }

    // Start visualizer immediately (no mic needed for drawing)
    visualizer.start(audioEngine);

    // --- Audio Engine Events ---
    audioEngine.onTimeUpdate = (current, duration) => {
        timeDisplay.innerText = formatTime(current);
    };

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 10);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
    }

    // --- Auto-save hook ---
    audioEngine.onStateChange = (state) => {
        appContainer.className = `state-${state}`;
        statusText.innerText = state.toUpperCase();
    };

    // Auto-save after recording finishes (handles normal + punch-in)
    audioEngine.onRecordingFinished = async (blob, duration) => {
        if (blob) {
            await storage.saveRecording(blob, duration);
            statusText.innerText = "SAVED";
            console.log("Auto-saved tape");
        }
    };

    // --- Library Management ---
    async function refreshLibrary() {
        const tapes = await storage.getAllRecordings();
        tapeListContainer.innerHTML = '';
        tapes.forEach((tape) => {
            const div = document.createElement('div');
            div.className = `tape-item ${selectedTapeId === tape.id ? 'selected' : ''}`;
            div.innerHTML = `
                <div>${tape.name || 'Untitled Tape'}</div>
                <div class="tape-info">${new Date(tape.date).toLocaleDateString()} • ${formatTime(tape.duration)}</div>
            `;
            div.onclick = () => selectTape(tape.id);
            tapeListContainer.appendChild(div);
        });
    }

    async function selectTape(id) {
        selectedTapeId = id;
        refreshLibrary();
        updateSummarizeBtn();
    }

    async function loadSelectedTape() {
        if (!selectedTapeId) return;
        const tapes = await storage.getAllRecordings();
        const tape = tapes.find(t => t.id === selectedTapeId);
        if (tape && tape.blob) {
            const arrayBuffer = await tape.blob.arrayBuffer();
            audioEngine.audioBuffer = await audioEngine.audioCtx.decodeAudioData(arrayBuffer);
            audioEngine.duration = tape.duration;
            audioEngine.pausedAt = 0;
            // Load cue markers for this tape
            audioEngine.markers = loadMarkersForTape(selectedTapeId);
            toggleLibrary(false);
            statusText.innerText = "LOADED";
            appContainer.className = 'state-paused';
        }
    }

    // --- Mode Switching ---
    function toggleLibrary(show) {
        if (show) {
            currentMode = 'LIBRARY';
            libraryPanel.classList.add('open');
            refreshLibrary();
            updateSummarizeBtn();
        } else {
            currentMode = 'DECK';
            libraryPanel.classList.remove('open');
        }
    }

    function updateSummarizeBtn() {
        if (summarizeTapeBtn) {
            const hasKey = window.aiService && window.aiService.isConfigured();
            summarizeTapeBtn.disabled = !hasKey || !selectedTapeId;
            summarizeTapeBtn.title = hasKey ? '' : 'Set API key in ⚙';
        }
    }

    // ============================================
    // SETTINGS PANEL
    // ============================================
    function toggleSettings(show) {
        if (show) {
            settingsPanel.classList.add('open');
            // Populate current values
            if (window.aiService) {
                apiKeyInput.value = window.aiService.apiKey || '';
                aiModelSelect.value = window.aiService.model || 'gpt-4o-mini';
                aiStatusEl.innerText = window.aiService.getStatus();
            }
        } else {
            settingsPanel.classList.remove('open');
        }
    }

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSettings(true);
    });

    closeSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSettings(false);
    });

    saveSettingsBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            window.aiService.setAPIKey(key);
            window.aiService.model = aiModelSelect.value;
            try {
                localStorage.setItem('r1_ai_model', aiModelSelect.value);
            } catch (e) {}
            aiStatusEl.innerText = window.aiService.getStatus();
            statusText.innerText = 'KEY SAVED';
        } else {
            aiStatusEl.innerText = 'Please enter a key';
        }
    });

    clearKeyBtn.addEventListener('click', () => {
        window.aiService.clearAPIKey();
        apiKeyInput.value = '';
        aiStatusEl.innerText = window.aiService.getStatus();
        statusText.innerText = 'KEY CLEARED';
    });

    // Restore model preference
    try {
        const savedModel = localStorage.getItem('r1_ai_model');
        if (savedModel && window.aiService) window.aiService.model = savedModel;
    } catch (e) {}

    // ============================================
    // SUMMARY PANEL
    // ============================================
    function toggleSummary(show) {
        if (show) {
            summaryPanel.classList.add('open');
        } else {
            summaryPanel.classList.remove('open');
        }
    }

    closeSummaryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSummary(false);
    });

    // ============================================
    // SUMMARIZE action
    // ============================================
    async function summarizeSelectedTape() {
        if (!selectedTapeId) {
            statusText.innerText = 'SELECT TAPE';
            return;
        }
        if (!window.aiService || !window.aiService.isConfigured()) {
            statusText.innerText = 'SET API KEY';
            toggleSettings(true);
            return;
        }

        const tapes = await storage.getAllRecordings();
        const tape = tapes.find(t => t.id === selectedTapeId);
        if (!tape || !tape.blob) {
            statusText.innerText = 'NO AUDIO';
            return;
        }

        // Show processing state
        summaryContent.innerHTML = '<div class="ai-processing">Processing audio…</div>';
        toggleSummary(true);

        try {
            const result = await window.aiService.processRecording(tape.blob, (progress) => {
                summaryContent.innerHTML = `<div class="ai-processing">${progress}</div>`;
            });

            // Display result
            summaryContent.innerHTML = `
                <div class="summary-label">SUMMARY</div>
                <div class="summary-text">${escapeHtml(result.summary)}</div>
                <div class="summary-label">TRANSCRIPT</div>
                <div class="transcript-text">${escapeHtml(result.transcription)}</div>
            `;
            statusText.innerText = 'SUMMARIZED';

        } catch (err) {
            console.error('AI error:', err);
            summaryContent.innerHTML = `
                <div class="summary-label">ERROR</div>
                <div class="summary-text" style="color:#f44">${escapeHtml(err.message)}</div>
            `;
            statusText.innerText = 'AI ERROR';
        }
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    }

    summarizeTapeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        summarizeSelectedTape();
    });

    // --- SDK / Plugin ---
    if (typeof PluginMessageHandler !== 'undefined') {
        console.log('Running as R1 Creation');
    } else {
        console.log('Running in browser mode');
    }

    window.onPluginMessage = function(data) {
        console.log('Received plugin message:', data);
    };

    // ============================================
    // INTERACTION: Canvas touch — tap, swipe, spin
    //  - TAP = Record start/stop
    //  - SWIPE LEFT = Open library
    //  - CIRCULAR DRAG (spin reel) = Scrub/Speed
    //    (stops recording first, same as hw wheel)
    //  - Velocity-based: faster drag = bigger seek
    //  - Inertia on release for smooth coast
    // ============================================
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    let lastTouchY = 0;
    let lastTouchTime = 0;
    let touchVelocity = 0;        // px/ms vertical
    let isSpinning = false;
    let inertiaRAF = null;

    canvas.addEventListener('touchstart', async (e) => {
        if (currentMode !== 'DECK') return;
        await ensureInit();
        // Cancel any running inertia
        if (inertiaRAF) { cancelAnimationFrame(inertiaRAF); inertiaRAF = null; }

        touchStartTime = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        lastTouchY = touchStartY;
        lastTouchTime = touchStartTime;
        touchVelocity = 0;
        touchMoved = false;
        isSpinning = false;
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
        if (currentMode !== 'DECK') return;
        const x = e.touches[0].clientX;
        const y = e.touches[0].clientY;
        const dx = x - touchStartX;
        const dy = y - touchStartY;
        const now = Date.now();

        if (Math.abs(dx) > 15 || Math.abs(dy) > 15) {
            touchMoved = true;
        }

        // Detect vertical drag as reel spin (after small dead zone)
        if (touchMoved && !isSpinning && Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx)) {
            isSpinning = true;
        }

        if (isSpinning) {
            const moveDy = y - lastTouchY;
            const dt = Math.max(1, now - lastTouchTime);
            touchVelocity = moveDy / dt; // px/ms

            // Proportional scrub: map px directly to seconds
            // ~200px full drag ≈ full duration, scale by duration
            const duration = audioEngine.duration || 1;
            const pxToSec = duration / 300; // 300px = full tape
            const seekDelta = -moveDy * pxToSec;  // drag up = forward

            if (seekDelta !== 0) {
                // If recording, stop first (same as hw wheel)
                if (audioEngine.isRecording) {
                    audioEngine.stopRecording();
                    wheelMode = 'SCRUB';
                    updateWheelModeDisplay();
                    statusText.innerText = "BUFFERING...";
                } else if (audioEngine.audioBuffer) {
                    directSeek(seekDelta);
                }
            }
        }

        lastTouchY = y;
        lastTouchTime = now;
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
        if (currentMode !== 'DECK') return;

        // If this was a spin gesture, apply inertia then return
        if (isSpinning) {
            isSpinning = false;
            startInertia();
            return;
        }

        const elapsed = Date.now() - touchStartTime;
        const endX = e.changedTouches[0].clientX;
        const swipeDx = endX - touchStartX;

        // SWIPE LEFT → open library
        if (touchMoved && swipeDx < -50) {
            toggleLibrary(true);
            return;
        }

        // TAP (short, no movement) → toggle recording
        if (!touchMoved && elapsed < 300) {
            if (audioEngine.isRecording) {
                audioEngine.stopRecording();
            } else {
                if (audioEngine.isPlaying) audioEngine.stop();
                audioEngine.startRecording();
            }
        }
    });

    // ============================================
    // SWIPE RIGHT in library → close it
    // ============================================
    let libTouchStartX = 0;

    libraryPanel.addEventListener('touchstart', (e) => {
        libTouchStartX = e.touches[0].clientX;
    }, { passive: true });

    libraryPanel.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - libTouchStartX;
        if (dx > 50) {
            toggleLibrary(false);
        }
    });

    // Swipe right on summary → close
    let summaryTouchStartX = 0;
    summaryPanel.addEventListener('touchstart', (e) => {
        summaryTouchStartX = e.touches[0].clientX;
    }, { passive: true });
    summaryPanel.addEventListener('touchend', (e) => {
        if (e.changedTouches[0].clientX - summaryTouchStartX > 50) toggleSummary(false);
    });

    // Swipe right on settings → close
    let settingsTouchStartX = 0;
    settingsPanel.addEventListener('touchstart', (e) => {
        settingsTouchStartX = e.touches[0].clientX;
    }, { passive: true });
    settingsPanel.addEventListener('touchend', (e) => {
        if (e.changedTouches[0].clientX - settingsTouchStartX > 50) toggleSettings(false);
    });

    // ============================================
    // SIDE BUTTON = Play / Pause
    // ============================================
    window.addEventListener('sideClick', async () => {
        if (!initialized) await ensureInit();

        // If recording, stop first
        if (audioEngine.isRecording) {
            audioEngine.stopRecording();
            wheelMode = 'SCRUB';
            updateWheelModeDisplay();
            return;
        }

        if (currentMode === 'LIBRARY') {
            loadSelectedTape();
            return;
        }

        // DECK MODE: CUE mode — drop or remove marker
        if (wheelMode === 'CUE' && audioEngine.audioBuffer) {
            const current = audioEngine.getCurrentTime();
            if (audioEngine.addMarker(current)) {
                statusText.innerText = 'CUE SET';
            } else {
                // Marker already nearby — remove it
                audioEngine.removeNearestMarker(current);
                statusText.innerText = 'CUE DEL';
            }
            saveMarkersForTape(selectedTapeId, audioEngine.markers);
            updateWheelModeDisplay();
            return;
        }

        // DECK MODE: Play / Pause toggle
        if (audioEngine.audioBuffer) {
            if (audioEngine.isPlaying) {
                audioEngine.pause();
            } else {
                audioEngine.play();
            }
        }
    });

    // Long press side button → cycle wheel mode
    window.addEventListener('longPressStart', () => {
        if (currentMode === 'DECK' && !audioEngine.isRecording) {
            const modes = ['SCRUB', 'SPEED', 'CUE'];
            const idx = modes.indexOf(wheelMode);
            wheelMode = modes[(idx + 1) % modes.length];
            updateWheelModeDisplay();
            statusText.innerText = `${wheelMode} MODE`;
            const originalColor = wheelModeDisplay.style.color;
            wheelModeDisplay.style.color = '#fff';
            setTimeout(() => wheelModeDisplay.style.color = originalColor, 200);
        }
    });

    window.addEventListener('longPressEnd', () => {});

    // ============================================
    // SCROLL WHEEL = Scrub / Speed
    // ============================================
    window.addEventListener('scrollUp', () => handleScroll(1));
    window.addEventListener('scrollDown', () => handleScroll(-1));

    // Direct seek by seconds delta (used by touch spin)
    function directSeek(secondsDelta) {
        if (!audioEngine.audioBuffer) return;
        let target = audioEngine.getCurrentTime() + secondsDelta;
        target = Math.max(0, Math.min(audioEngine.duration, target));

        if (audioEngine.isPlaying) {
            if (audioEngine.sourceNode) {
                audioEngine.sourceNode.onended = null;
                audioEngine.sourceNode.stop();
                audioEngine.sourceNode.disconnect();
                audioEngine.sourceNode = null;
            }
            audioEngine.isPlaying = false;
            audioEngine.stopPlaybackTicker();
            audioEngine.pausedAt = target;
            audioEngine.play();
        } else {
            audioEngine.pausedAt = target;
            if (audioEngine.onTimeUpdate) audioEngine.onTimeUpdate(target, audioEngine.duration);
        }
        updateStatusForScrub();
    }

    // Inertia: coast after finger release
    function startInertia() {
        const friction = 0.92;
        const minVelocity = 0.002; // px/ms cutoff
        let vel = touchVelocity;

        function step() {
            vel *= friction;
            if (Math.abs(vel) < minVelocity) { inertiaRAF = null; return; }

            const duration = audioEngine.duration || 1;
            const pxToSec = duration / 300;
            const dt = 16; // ~60fps
            const seekDelta = -vel * dt * pxToSec;

            if (audioEngine.audioBuffer && !audioEngine.isRecording) {
                directSeek(seekDelta);
            }
            inertiaRAF = requestAnimationFrame(step);
        }
        inertiaRAF = requestAnimationFrame(step);
    }

    function handleScroll(delta) {
        if (!initialized) return;

        if (audioEngine.isRecording) {
            audioEngine.stopRecording();
            wheelMode = 'SCRUB';
            updateWheelModeDisplay();
            statusText.innerText = "BUFFERING...";
            return;
        }

        if (currentMode === 'DECK') {
            if (audioEngine.audioBuffer) {
                if (wheelMode === 'SCRUB') {
                    handleScrubWheel(delta);
                } else if (wheelMode === 'CUE') {
                    handleCueWheel(delta);
                } else {
                    audioEngine.manipulate(delta, 'SPEED');
                    updateStatusForScrub();
                }
            }
        } else if (currentMode === 'LIBRARY') {
            tapeListContainer.scrollTop += (delta * -30);
        }
    }

    // --- Jog-wheel audio scrub (smooth momentum, matches touch feel) ---
    let wheelMomentum = 0;
    let wheelMomentumRAF = null;
    let lastWheelTime = 0;
    let scrubTimeoutId = null;
    let lastScrubSnippetTime = 0;

    function handleScrubWheel(delta) {
        if (!audioEngine.audioBuffer) return;

        const now = Date.now();
        const dt = now - lastWheelTime;
        lastWheelTime = now;

        // Rapid clicks build momentum; slow clicks reset
        if (dt < 150) {
            wheelMomentum += delta * 0.06; // accelerate
            wheelMomentum = Math.max(-0.8, Math.min(0.8, wheelMomentum)); // cap
        } else {
            wheelMomentum = delta * 0.03; // single notch base
        }

        // Apply immediate seek
        directSeek(wheelMomentum);

        // Play audio snippet (throttled so they don't pile up)
        if (now - lastScrubSnippetTime > 120) {
            const pos = audioEngine.getCurrentTime();
            audioEngine.scrubPlay(pos, 0.12);
            lastScrubSnippetTime = now;
        }

        statusText.innerText = 'SCRUB';
        if (scrubTimeoutId) clearTimeout(scrubTimeoutId);
        scrubTimeoutId = setTimeout(() => {
            if (!audioEngine.isPlaying && !audioEngine.isRecording) {
                statusText.innerText = 'PAUSED';
            }
        }, 800);

        // Start coasting if not already
        if (!wheelMomentumRAF) {
            wheelCoast();
        }
    }

    function wheelCoast() {
        wheelMomentum *= 0.88; // friction
        if (Math.abs(wheelMomentum) < 0.002) {
            wheelMomentumRAF = null;
            wheelMomentum = 0;
            return;
        }
        if (audioEngine.audioBuffer && !audioEngine.isRecording) {
            directSeek(wheelMomentum);
        }
        wheelMomentumRAF = requestAnimationFrame(wheelCoast);
    }

    // --- CUE wheel: jump between markers ---
    function handleCueWheel(delta) {
        if (!audioEngine.audioBuffer) return;

        const current = audioEngine.getCurrentTime();
        let target;

        if (delta > 0) {
            target = audioEngine.nextMarker(current);
        } else {
            target = audioEngine.prevMarker(current);
        }

        if (target !== null) {
            audioEngine.scrubPlay(target, 0.3);
            statusText.innerText = `CUE ${formatTime(target)}`;
        } else {
            statusText.innerText = delta > 0 ? 'END' : 'START';
        }
        updateWheelModeDisplay();
    }

    // --- Marker persistence (localStorage keyed by tape ID) ---
    function saveMarkersForTape(tapeId, markers) {
        if (!tapeId) return;
        try {
            localStorage.setItem(`r1_markers_${tapeId}`, JSON.stringify(markers));
        } catch(e) {}
    }

    function loadMarkersForTape(tapeId) {
        if (!tapeId) return [];
        try {
            const data = localStorage.getItem(`r1_markers_${tapeId}`);
            return data ? JSON.parse(data) : [];
        } catch(e) { return []; }
    }

    function updateStatusForScrub() {
        updateWheelModeDisplay(); // Keep rate display in sync
        if (audioEngine.isPlaying && wheelMode === 'SPEED') {
            statusText.innerText = `x${audioEngine.playbackRate.toFixed(1)}`;
        } else if (!audioEngine.isPlaying) {
            statusText.innerText = wheelMode === 'SPEED'
                ? `x${audioEngine.playbackRate.toFixed(1)}`
                : "SCRUB";
            if (window.scrubTimeout) clearTimeout(window.scrubTimeout);
            window.scrubTimeout = setTimeout(() => {
                if (!audioEngine.isPlaying) statusText.innerText = "PAUSED";
            }, 500);
        }
    }

    // ============================================
    // Library panel buttons
    // ============================================
    closeLibBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLibrary(false);
    });

    newTapeBtn.addEventListener('click', () => {
        audioEngine.stop();
        audioEngine.audioBuffer = null;
        audioEngine.duration = 0;
        audioEngine.playStartTime = 0;
        audioEngine.clearMarkers();
        toggleLibrary(false);
        statusText.innerText = "NEW TAPE";
        appContainer.className = 'state-idle';
    });

    deleteTapeBtn.addEventListener('click', async () => {
        if (selectedTapeId) {
            await storage.deleteRecording(selectedTapeId);
            selectedTapeId = null;
            await refreshLibrary();
            statusText.innerText = "DELETED";
        }
    });

    // ============================================
    // Service Worker (PWA)
    // ============================================
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registered:', reg))
                .catch(err => console.log('SW failed:', err));
        });
    }

});
