document.addEventListener('DOMContentLoaded', async () => {
    const audioEngine = new AudioEngine();
    const visualizer = new Visualizer('reel-canvas');
    const storage = new TapeLibrary();
    
    // UI Elements
    const statusText = document.getElementById('status-text');
    const timeDisplay = document.getElementById('time-display');
    const wheelModeDisplay = document.getElementById('wheel-mode'); // Added
    const appContainer = document.getElementById('app');
    const libraryPanel = document.getElementById('library-panel');
    const tapeListContainer = document.getElementById('tape-list-container');
    
    const recBtn = document.getElementById('rec-btn');
    const libBtn = document.getElementById('lib-btn');
    const closeLibBtn = document.getElementById('close-lib');
    const newTapeBtn = document.getElementById('new-tape-btn');
    const deleteTapeBtn = document.getElementById('delete-tape-btn');

    // State
    // Modes: 'DECK' | 'LIBRARY'
    let currentMode = 'DECK';
    // Wheel Modes: 'SCRUB' | 'SPEED'
    let wheelMode = 'SCRUB';
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
                refreshLibrary();
            } else {
                statusText.innerText = "ERR: MIC";
            }
        }
    }

    // --- Audio Engine Events ---
    audioEngine.onStateChange = (state) => {
        appContainer.className = `state-${state}`;
        statusText.innerText = state.toUpperCase();
        
        // REC Button Visual update
        if (state === 'recording') {
            recBtn.style.background = '#f00';
            recBtn.style.color = '#fff';
            recBtn.innerText = '■ STOP';
        } else {
            recBtn.style.background = '';
            recBtn.style.color = '#f00';
            recBtn.innerText = '● REC';
        }
    };

    audioEngine.onTimeUpdate = (current, duration) => {
        timeDisplay.innerText = formatTime(current);
    };

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 10);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
    }

    // --- Library Management ---
    async function refreshLibrary() {
        const tapes = await storage.getAllRecordings();
        tapeListContainer.innerHTML = '';
        tapes.forEach((tape, index) => {
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
        // Highlight in UI
        Array.from(tapeListContainer.children).forEach(child => child.classList.remove('selected'));
        // Find component index... simple UI refresh for now
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
            toggleLibrary(false); // Close library -> Go to Deck
            statusText.innerText = "LOADED";
        }
    }

    async function saveCurrentRecording() {
        if (audioEngine.audioBuffer) {
            // Need to convert AudioBuffer back to Wav for storage? 
            // Actually Engine has chunks. But simpler: 
            // In a real app we'd keep the blob reference. 
            // Let's modify engine to expose last blob or simple hack:
            // For now, let's assume we can save only immediately after recording?
            // Engine exposes nothing currently. Let's rely on standard flow.
            // Wait, we need the Blob. 
            // Let's attach a listener to 'onstop' in Engine to auto-save to "Current Tape" slot?
            // Or just prompt user.
            // Simplified: We assume current buffer is transient.
        }
    }

    // Override Engine to support saving
    const originalStop = audioEngine.mediaRecorder ? audioEngine.mediaRecorder.onstop : null;
    // We need to hook into the onstop inside the class. 
    // Easier: modify AudioEngine to return blob on stop.
    // For now, let's just use the existing buffer.

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

    // --- Hardware Inputs (Rabbit r1) ---

    // SIDE BUTTON
    window.addEventListener('sideClick', async () => {
        await ensureInit();

        // Safety: If Recording, always STOP
        if (audioEngine.isRecording) {
            audioEngine.stopRecording();
            return;
        }

        if (currentMode === 'DECK') {
            // DECK MODE: Toggle Wheel Mode
            wheelMode = (wheelMode === 'SCRUB') ? 'SPEED' : 'SCRUB';
            wheelModeDisplay.innerText = `MODE: ${wheelMode}`;
            
            // Visual Flash
            const originalColor = wheelModeDisplay.style.color;
            wheelModeDisplay.style.color = '#fff';
            setTimeout(() => wheelModeDisplay.style.color = originalColor, 200);

            statusText.innerText = `${wheelMode} MODE`;
        } else if (currentMode === 'LIBRARY') {
            // LIBRARY MODE: Load Tape
            loadSelectedTape();
        }
    });

    // WHEEL
    window.addEventListener('scrollUp', () => handleScroll(1));
    window.addEventListener('scrollDown', () => handleScroll(-1));

    function handleScroll(delta) {
        if (!initialized) return;

        if (currentMode === 'DECK') {
            // Updated to use manipulate (scrub/speed) based on mode
             if (audioEngine.isRecording || audioEngine.isPlaying || audioEngine.pausedAt > 0 || audioEngine.audioBuffer) {
                audioEngine.manipulate(delta, wheelMode); 
                updateStatusForScrub();
            }
        } else if (currentMode === 'LIBRARY') {
            // Navigate List
            tapeListContainer.scrollTop += (delta * -20);
        }
    }

    function updateStatusForScrub() {
        if (audioEngine.isPlaying) {
             // Only show speed if we manipulated speed
             if (wheelMode === 'SPEED') {
                 statusText.innerText = `SPEED x${audioEngine.playbackRate.toFixed(1)}`;
             }
        } else {
            statusText.innerText = wheelMode === 'SPEED' ? "SET SPEED" : "SCRUB";
            if(window.scrubTimeout) clearTimeout(window.scrubTimeout);
            window.scrubTimeout = setTimeout(() => { 
                if(!audioEngine.isPlaying) statusText.innerText = "PAUSED"; 
            }, 500);
        }
    }

    // --- Touch / UI Inputs ---

    // Record Button
    recBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await ensureInit();
        if (audioEngine.isRecording) {
            audioEngine.stopRecording();
            // Auto-Save logic
            // We need to wait for the blob to be ready.
            // The engine sets audioBuffer asynchronously. 
            // We'll hook into onStateChange 'idle' to save.
        } else {
            if (audioEngine.isPlaying) audioEngine.stop();
            audioEngine.startRecording();
        }
    });

    // Auto-save hook
    const originalStateChange = audioEngine.onStateChange;
    audioEngine.onStateChange = async (state) => {
        if (originalStateChange) originalStateChange(state);
        
        if (state === 'idle' && audioEngine.audioChunks.length > 0) {
            // Save newly recorded tape
            const blob = new Blob(audioEngine.audioChunks, { type: 'audio/wav' });
            await storage.saveRecording(blob, audioEngine.duration);
            console.log("Auto-saved tape");
        }
    };

    // Library Trigger
    libBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLibrary(true);
    });

    closeLibBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLibrary(false);
    });

    // New Tape (Clear Deck)
    newTapeBtn.addEventListener('click', () => {
        audioEngine.stop(); // Stop any playback
        audioEngine.audioBuffer = null; // Clear buffer
        audioEngine.duration = 0;
        audioEngine.playStartTime = 0;
        statusText.innerText = "NEW TAPE";
    });

    // Delete Tape
    deleteTapeBtn.addEventListener('click', async () => {
        if (selectedTapeId) {
            if (confirm("Delete this tape?")) {
                await storage.deleteRecording(selectedTapeId);
                selectedTapeId = null;
                await refreshLibrary();
                statusText.innerText = "DELETED";
            }
        }
    });

    // Touch Scrubbing (Canvas only)
    const canvas = document.getElementById('reel-canvas');
    let isDragging = false;
    let startX = 0;
    
    canvas.addEventListener('touchstart', async (e) => {
        if(currentMode !== 'DECK') return;
        await ensureInit();
        isDragging = true;
        startX = e.touches[0].clientX;
        if (audioEngine.isPlaying) audioEngine.pause();
    });

    canvas.addEventListener('touchmove', (e) => {
        if (!isDragging || currentMode !== 'DECK') return;
        e.preventDefault();
        const currentX = e.touches[0].clientX;
        const delta = currentX - startX;
        startX = currentX;
        audioEngine.scrub(delta > 0 ? 1 : -1); 
    });

    canvas.addEventListener('touchend', () => {
        isDragging = false;
    });

});
