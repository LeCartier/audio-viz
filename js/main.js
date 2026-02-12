document.addEventListener('DOMContentLoaded', async () => {
    const audioEngine = new AudioEngine();
    const visualizer = new Visualizer('reel-canvas');
    
    // UI Elements
    const statusText = document.getElementById('status-text');
    const timeDisplay = document.getElementById('time-display');
    const appContainer = document.getElementById('app');

    // Initialize Audio Context on first interaction to unlock browser restrictions
    let initialized = false;

    async function ensureInit() {
        if (!initialized) {
            const success = await audioEngine.init();
            if (success) {
                initialized = true;
                visualizer.start(audioEngine);
                statusText.innerText = "IDLE";
            } else {
                statusText.innerText = "ERR: MIC";
            }
        }
    }

    // State Updates
    audioEngine.onStateChange = (state) => {
        appContainer.className = `state-${state}`;
        statusText.innerText = state.toUpperCase();
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

    // --- Input Handling ---

    // 1. Hardware Events (Rabbit r1)
    
    window.addEventListener('sideClick', async () => {
        await ensureInit();
        if (audioEngine.isRecording) {
            audioEngine.stopRecording();
        } else {
            // If playing, stop first?
            if (audioEngine.isPlaying) audioEngine.stop();
            audioEngine.startRecording();
        }
    });

    window.addEventListener('scrollUp', () => {
        if (!initialized) return;
        audioEngine.scrub(1); // Forward / Speed Up
        updateStatusForScrub();
    });

    window.addEventListener('scrollDown', () => {
        if (!initialized) return;
        audioEngine.scrub(-1); // Backward / Slow Down
        updateStatusForScrub();
    });

    function updateStatusForScrub() {
        if (audioEngine.isPlaying) {
            statusText.innerText = `SPEED x${audioEngine.playbackRate.toFixed(1)}`;
        } else if (!audioEngine.isRecording) {
            statusText.innerText = "SCRUB";
            setTimeout(() => { 
                if(!audioEngine.isPlaying) statusText.innerText = "PAUSED"; 
            }, 500);
        }
    }

    // 2. Touch / Mouse Interactions
    
    // Tap anywhere on screen to Play/Pause
    let isDragging = false;
    let startX = 0;
    let lastX = 0;

    // Touch Start
    appContainer.addEventListener('touchstart', async (e) => {
        await ensureInit();
        isDragging = true;
        startX = e.touches[0].clientX;
        lastX = startX;

        // If playing or recording, we should probably pause/stop to allow scrub
        if (audioEngine.isRecording) {
            audioEngine.stopRecording();
            statusText.innerText = "SCRUB";
        } else if (audioEngine.isPlaying) {
            audioEngine.pause();
            statusText.innerText = "SCRUB";
        }
    });

    // Touch Move (Scrub)
    appContainer.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        e.preventDefault(); // Prevent page scroll
        
        const currentX = e.touches[0].clientX;
        const deltaX = currentX - lastX;
        lastX = currentX;

        // Sensitivity: 1px = 0.05 seconds
        const seekTime = deltaX * 0.05;
        audioEngine.scrub(seekTime > 0 ? 1 : -1); 
        // Note: Engine.scrub handles logic, but it's step based for wheel (integers usually). 
        // We might want finer control. The current scrub() uses fixed step. 
        // Let's modify engine or just call it multiple times? 
        // Actually engine.scrub() changes Playback Rate if playing, or seeks if paused. 
        // Since we paused above, we are seeking.
        // Let's manually access pausedAt for smoothness if needed, 
        // but let's stick to public API. audioengine.scrub expects +1/-1 usually for wheel steps.
        // Let's change this to direct seeking for smooth touch:
        
        audioEngine.pausedAt += seekTime;
        audioEngine.pausedAt = Math.max(0, Math.min(audioEngine.duration, audioEngine.pausedAt));
        audioEngine.onTimeUpdate(audioEngine.pausedAt, audioEngine.duration);
    });

    // Touch End
    appContainer.addEventListener('touchend', () => {
        isDragging = false;
        // Stay paused? Yes.
    });

    // Click fallback (only if not dragged)
    appContainer.addEventListener('click', async (e) => {
        // Simple click detection (if drag was small)
        if (Math.abs(e.clientX - startX) > 10) return; 

        await ensureInit();
        
        if (audioEngine.isRecording) return; // Don't toggle play if recording

        if (audioEngine.isPlaying) {
            audioEngine.pause();
        } else {
            // Check if we have audio
            if (audioEngine.audioBuffer) {
                audioEngine.play();
            } else {
                statusText.innerText = "NO TAPE";
                setTimeout(() => statusText.innerText = "IDLE", 1000);
            }
        }
    });

    // Keyboard controls for testing on PC
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') { 
            // Mock Side Click
            window.dispatchEvent(new Event('sideClick')); 
        }
        if (e.code === 'ArrowUp') {
            window.dispatchEvent(new Event('scrollUp'));
        }
        if (e.code === 'ArrowDown') {
            window.dispatchEvent(new Event('scrollDown'));
        }
        if (e.code === 'Enter') {
            appContainer.click();
        }
    });
});
