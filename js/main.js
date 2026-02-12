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
    const canvas = document.getElementById('reel-canvas');

    // State
    let currentMode = 'DECK'; // 'DECK' | 'LIBRARY'
    let wheelMode = 'SCRUB';  // 'SCRUB' | 'SPEED'
    let initialized = false;
    let selectedTapeId = null;

    // --- Init ---
    async function ensureInit() {
        if (!initialized) {
            const success = await audioEngine.init();
            if (success) {
                initialized = true;
                visualizer.start(audioEngine);
                statusText.innerText = "IDLE";
                appContainer.className = 'state-idle';
                refreshLibrary();
            } else {
                statusText.innerText = "ERR: MIC";
            }
        }
    }

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
    audioEngine.onStateChange = async (state) => {
        appContainer.className = `state-${state}`;
        statusText.innerText = state.toUpperCase();

        if (state === 'idle' && audioEngine.audioChunks.length > 0) {
            const blob = new Blob(audioEngine.audioChunks, { type: 'audio/wav' });
            await storage.saveRecording(blob, audioEngine.duration);
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
        } else {
            currentMode = 'DECK';
            libraryPanel.classList.remove('open');
        }
    }

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
    // INTERACTION: TAP reel = Record start/stop
    // SWIPE LEFT on reel = Open library
    // ============================================
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;

    canvas.addEventListener('touchstart', async (e) => {
        if (currentMode !== 'DECK') return;
        await ensureInit();
        touchStartTime = Date.now();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchMoved = false;
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
        if (currentMode !== 'DECK') return;
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.abs(dx) > 15 || Math.abs(dy) > 15) {
            touchMoved = true;
        }
    }, { passive: true });

    canvas.addEventListener('touchend', (e) => {
        if (currentMode !== 'DECK') return;
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

    // ============================================
    // SIDE BUTTON = Play / Pause
    // ============================================
    window.addEventListener('sideClick', async () => {
        if (!initialized) await ensureInit();

        // If recording, stop first
        if (audioEngine.isRecording) {
            audioEngine.stopRecording();
            wheelMode = 'SCRUB';
            wheelModeDisplay.innerText = `MODE: ${wheelMode}`;
            return;
        }

        if (currentMode === 'LIBRARY') {
            loadSelectedTape();
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

    // Long press side button → toggle wheel mode
    window.addEventListener('longPressStart', () => {
        if (currentMode === 'DECK' && !audioEngine.isRecording) {
            wheelMode = (wheelMode === 'SCRUB') ? 'SPEED' : 'SCRUB';
            wheelModeDisplay.innerText = `MODE: ${wheelMode}`;
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

    function handleScroll(delta) {
        if (!initialized) return;

        if (audioEngine.isRecording) {
            audioEngine.stopRecording();
            wheelMode = 'SCRUB';
            wheelModeDisplay.innerText = `MODE: ${wheelMode}`;
            statusText.innerText = "BUFFERING...";
            return;
        }

        if (currentMode === 'DECK') {
            if (audioEngine.isPlaying || audioEngine.pausedAt > 0 || audioEngine.audioBuffer) {
                audioEngine.manipulate(delta, wheelMode);
                updateStatusForScrub();
            }
        } else if (currentMode === 'LIBRARY') {
            tapeListContainer.scrollTop += (delta * -30);
        }
    }

    function updateStatusForScrub() {
        if (audioEngine.isPlaying && wheelMode === 'SPEED') {
            statusText.innerText = `SPEED x${audioEngine.playbackRate.toFixed(1)}`;
        } else if (!audioEngine.isPlaying) {
            statusText.innerText = wheelMode === 'SPEED' ? "SET SPEED" : "SCRUB";
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
