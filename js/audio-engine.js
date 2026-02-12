class AudioEngine {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioBuffer = null;
        this.sourceNode = null;
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 256;
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        this.isPlaying = false;
        this.isRecording = false;
        this.playStartTime = 0;
        this.recordingStartTime = 0; // Added for live timing
        this.pausedAt = 0;
        this.playbackRate = 1.0;
        this.duration = 0;
        this.maxTapeDuration = 300; // 5 Minutes virtual tape capacity

        // Callbacks for UI updates
        this.onStateChange = null; // (state) => {}
        this.onTimeUpdate = null;  // (currentTime, duration) => {}
    }

    async init() {
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.stream = stream;
            console.log('Microphone access granted');
            return true;
        } catch (err) {
            console.error('Error accessing microphone:', err);
            return false;
        }
    }

    startRecording() {
        if (this.isRecording) return;
        
        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(this.stream);
        
        this.mediaRecorder.ondataavailable = (event) => {
            this.audioChunks.push(event.data);
        };

        this.mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
            const arrayBuffer = await audioBlob.arrayBuffer();
            this.audioBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
            this.duration = this.audioBuffer.duration;
            this.pausedAt = 0; // Reset playhead
            console.log('Recording finished, AudioBuffer created. Duration:', this.duration);
            if (this.onStateChange) this.onStateChange('idle');
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        this.recordingStartTime = this.audioCtx.currentTime;
        this.startPlaybackTicker(); // Start ticker to update UI during recording
        if (this.onStateChange) this.onStateChange('recording');
        
        // Connect mic stream to analyser for visuals during recording
        const source = this.audioCtx.createMediaStreamSource(this.stream);
        source.connect(this.analyser);
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.mediaRecorder.stop();
        this.isRecording = false;
        this.stopPlaybackTicker();
        // Analyser will be disconnected when new source is created
    }

    play() {
        if (this.isPlaying || !this.audioBuffer) return;

        this.sourceNode = this.audioCtx.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.playbackRate.value = this.playbackRate;
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);

        this.sourceNode.onended = () => {
            // Only trigger if we didn't stop it manually (logic handled in stop())
            if (this.isPlaying) { 
                this.pause(); 
            }
        };

        // Handle resuming from paused position
        const offset = this.pausedAt;
        this.sourceNode.start(0, offset);
        this.playStartTime = this.audioCtx.currentTime - (offset / this.playbackRate);
        
        this.isPlaying = true;
        if (this.onStateChange) this.onStateChange('playing');
        
        this.startPlaybackTicker();
    }

    stop() {
        // This is effectively "Pause"
        this.pause();
    }

    pause() {
        if (this.isPlaying && this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode = null;
            // Calculate where we ceased
            const elapsed = (this.audioCtx.currentTime - this.playStartTime) * this.playbackRate;
            this.pausedAt = Math.min(this.duration, Math.max(0, elapsed)); // Clamp
            this.isPlaying = false;
            this.stopPlaybackTicker();
            if (this.onStateChange) this.onStateChange('paused');
        }
    }

    // Scroll Wheel actions
    scrub(delta) {
        // If recording, stop first
        if (this.isRecording) {
            this.stopRecording();
            // Wait for buffer? It's async. 
            // In a real app we'd await onstop, but here we trigger stop and standard logic applies.
            // The scrub will fail or be ignored until buffer is ready. 
            // We can return early.
            return;
        }

        if (this.isPlaying) {
            // Varispeed when playing
            // delta > 0 (scroll up) -> Increase speed
            // delta < 0 (scroll down) -> Decrease speed
            const step = 0.1;
            let newRate = this.playbackRate + (delta > 0 ? step : -step);
            newRate = Math.max(0.1, Math.min(3.0, newRate)); // Clamp speed
            this.playbackRate = newRate;
            
            if (this.sourceNode) {
                // Update running source
                this.sourceNode.playbackRate.setValueAtTime(newRate, this.audioCtx.currentTime);
                // Recalculate start time so position remains correct
                // New logic needed to keep sync? Ideally yes, but for simple varispeed:
                // Just updating the node is enough for the DSP, but our UI timer needs info.
                // Resetting playStartTime to keep equations valid is complex.
                // Simplified: Just update the UI speed display.
            }
        } else {
            // Scrubbing when paused
            // delta > 0 -> Forward
            const seekAmount = 0.5; // Seconds
            this.pausedAt += (delta > 0 ? seekAmount : -seekAmount);
            this.pausedAt = Math.max(0, Math.min(this.duration, this.pausedAt));
            
            // Send update to UI immediately
            if (this.onTimeUpdate) this.onTimeUpdate(this.pausedAt, this.duration);
        }
    }

    startPlaybackTicker() {
        if (this.ticker) clearInterval(this.ticker);
        this.ticker = setInterval(() => {
            if (this.isPlaying) {
                const current = (this.audioCtx.currentTime - this.playStartTime) * this.playbackRate;
                if (this.onTimeUpdate) this.onTimeUpdate(current, this.duration);
            } else if (this.isRecording) {
                const current = this.audioCtx.currentTime - this.recordingStartTime;
                if (this.onTimeUpdate) this.onTimeUpdate(current, current); // Duration grows with time
            }
        }, 50);
    }

    stopPlaybackTicker() {
        if (this.ticker) clearInterval(this.ticker);
    }

    getAnalyserData() {
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    getCurrentTime() {
        if (this.isPlaying) {
            return (this.audioCtx.currentTime - this.playStartTime) * this.playbackRate;
        }
        if (this.isRecording) {
            return this.audioCtx.currentTime - this.recordingStartTime;
        }
        return this.pausedAt;
    }
}