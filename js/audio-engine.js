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

        // Punch-in recording support
        this.punchInOffset = -1;  // -1 = no punch-in
        this.preBuffer = null;

        // Scrub playback (jog wheel)
        this.scrubSource = null;

        // Cue markers
        this.markers = [];

        // Callbacks for UI updates
        this.onStateChange = null; // (state) => {}
        this.onTimeUpdate = null;  // (currentTime, duration) => {}
        this.onRecordingFinished = null; // (blob, duration) => {}
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

    // Ensure AudioContext is alive (browsers suspend it)
    async ensureCtxRunning() {
        if (this.audioCtx.state === 'suspended') {
            try { await this.audioCtx.resume(); } catch(e) {}
        }
    }

    startRecording() {
        if (this.isRecording) return;
        this.ensureCtxRunning();

        // Detect punch-in: existing audio — record from current playhead
        if (this.audioBuffer) {
            this.punchInOffset = this.pausedAt;
            this.preBuffer = this.audioBuffer;
        } else {
            this.punchInOffset = -1;
            this.preBuffer = null;
        }

        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(this.stream);

        this.mediaRecorder.ondataavailable = (event) => {
            this.audioChunks.push(event.data);
        };

        this.mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
            const arrayBuffer = await audioBlob.arrayBuffer();
            const newBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);

            // Merge with pre-existing audio if punch-in
            if (this.punchInOffset >= 0 && this.preBuffer) {
                this.audioBuffer = this._mergeBuffers(this.preBuffer, this.punchInOffset, newBuffer);
                console.log('Punch-in merge at', this.punchInOffset.toFixed(2) + 's');
            } else {
                this.audioBuffer = newBuffer;
            }

            this.duration = this.audioBuffer.duration;
            this.pausedAt = this.duration; // Stay at the end of what was recorded
            this.punchInOffset = -1;
            this.preBuffer = null;

            console.log('Recording finished. Duration:', this.duration.toFixed(2));
            if (this.onStateChange) this.onStateChange('paused');

            // Export and notify for auto-save
            if (this.onRecordingFinished) {
                const blob = this.exportBufferAsWav();
                this.onRecordingFinished(blob, this.duration);
            }
        };

        this.mediaRecorder.start();
        this.isRecording = true;
        this.recordingStartTime = this.audioCtx.currentTime;
        this.startPlaybackTicker();
        if (this.onStateChange) this.onStateChange('recording');

        // Connect mic stream to analyser for visuals during recording
        this.micSourceNode = this.audioCtx.createMediaStreamSource(this.stream);
        this.micSourceNode.connect(this.analyser);
    }

    stopRecording() {
        if (!this.isRecording) return;

        // Disconnect mic from analyser to prevent feedback
        if (this.micSourceNode) {
            this.micSourceNode.disconnect();
            this.micSourceNode = null;
        }
        // Don't disconnect analyser entirely — play() needs the analyser→destination chain.
        // Just remove the mic source input (already done above).

        this.mediaRecorder.stop();
        this.isRecording = false;
        this.stopPlaybackTicker();
    }

    play() {
        if (this.isPlaying || !this.audioBuffer) return;
        this.ensureCtxRunning();

        // Ensure analyser is cleanly disconnected before rewiring
        try { this.analyser.disconnect(); } catch(e) {}

        this.sourceNode = this.audioCtx.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.playbackRate.value = this.playbackRate;
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);

        // Handle resuming from paused position
        const bufDuration = this.audioBuffer.duration;
        const offset = this.pausedAt;
        // If at the very end, do nothing — user must scrub back or record
        if (offset >= bufDuration - 0.05) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
            return;
        }

        // Sync duration to buffer truth
        this.duration = bufDuration;

        // Tag this source so onended knows if it's still the active one
        const src = this.sourceNode;
        this.sourceNode.onended = () => {
            if (this.sourceNode === src && this.isPlaying) {
                // Natural end of playback — freeze at true buffer end
                this.sourceNode = null;
                this.pausedAt = bufDuration;
                this.duration = bufDuration;
                this.isPlaying = false;
                this.stopPlaybackTicker();
                if (this.onTimeUpdate) this.onTimeUpdate(this.duration, this.duration);
                if (this.onStateChange) this.onStateChange('paused');
            }
        };

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
            this.sourceNode.onended = null; // prevent async onended from firing
            try {
                this.sourceNode.stop();
                this.sourceNode.disconnect();
            } catch(e) {}
            this.sourceNode = null;
            // Calculate where we stopped — clamp to actual buffer duration
            const bufDur = this.audioBuffer ? this.audioBuffer.duration : this.duration;
            const elapsed = (this.audioCtx.currentTime - this.playStartTime) * this.playbackRate;
            this.pausedAt = Math.min(bufDur, Math.max(0, elapsed));
            this.isPlaying = false;
            this.stopPlaybackTicker();
            if (this.onStateChange) this.onStateChange('paused');
        }
    }

    // Scroll Wheel actions
    // mode: 'SCRUB' | 'SPEED'
    // delta: +1 or -1 (or magnitude)
    manipulate(delta, mode) {
        // Handle Recording Interruption
        if (this.isRecording) {
            this.stopRecording();
            // If just stopped, we might not have the buffer ready instantly in this simplified engine.
            // But we can try to proceed. Ideally we'd await.
            // For now, let's assume standard stop flow handles it and subsequent clicks work.
            // But user wants "buffers back immediately".
            // Since stop is async (MediaRecorder), we might miss this first click action visually.
            // Let's force a pause state logic assumption.
            return; 
        }

        if (mode === 'SPEED') {
            // SPEED MODE: Varispeed (Only makes sense if Playing? Or set rate for next play?)
            const step = 0.1;
            let newRate = this.playbackRate + (delta > 0 ? step : -step);
            newRate = Math.max(0.1, Math.min(3.0, newRate)); // Clamp speed
            this.playbackRate = newRate;
            
            if (this.isPlaying && this.sourceNode) {
                this.sourceNode.playbackRate.setValueAtTime(newRate, this.audioCtx.currentTime);
                // Note: Changing rate mid-stream drifts the currentTime sync calculation.
                // We accept this drift for this simple demo or reset anchor:
                // this.resetSyncAnchor(); // Complex to implement perfectly without drift
            }
        } else {
            // SCRUB MODE: Seek (Works Playing or Paused)
            const seekAmount = 0.02; // ~20ms per notch for fine-grained scrub
            
            let targetTime = this.getCurrentTime();
            targetTime += (delta > 0 ? seekAmount : -seekAmount);
            targetTime = Math.max(0, Math.min(this.duration, targetTime));
            
            if (this.isPlaying) {
                // Kill the current source without triggering onended feedback
                if (this.sourceNode) {
                    this.sourceNode.onended = null; // prevent race condition
                    this.sourceNode.stop();
                    this.sourceNode.disconnect();
                    this.sourceNode = null;
                }
                this.isPlaying = false;
                this.stopPlaybackTicker();
                this.pausedAt = targetTime;
                // Restart cleanly
                this.play();
            } else {
                 this.pausedAt = targetTime;
                 if (this.onTimeUpdate) this.onTimeUpdate(this.pausedAt, this.duration);
            }
        }
    }

    startPlaybackTicker() {
        if (this.ticker) clearInterval(this.ticker);
        this.ticker = setInterval(() => {
            if (this.isPlaying) {
                const current = (this.audioCtx.currentTime - this.playStartTime) * this.playbackRate;
                if (this.onTimeUpdate) this.onTimeUpdate(current, this.duration);
            } else if (this.isRecording) {
                const current = this.getCurrentTime();
                const liveDur = this.getLiveDuration();
                if (this.onTimeUpdate) this.onTimeUpdate(current, liveDur);
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
            const elapsed = this.audioCtx.currentTime - this.recordingStartTime;
            return this.punchInOffset >= 0 ? this.punchInOffset + elapsed : elapsed;
        }
        return this.pausedAt;
    }

    // Live duration during recording (arc grows as recording extends past old end)
    getLiveDuration() {
        if (this.isRecording) {
            const currentPos = this.getCurrentTime();
            const oldDuration = (this.preBuffer ? this.preBuffer.duration : 0);
            return Math.max(oldDuration, currentPos);
        }
        return this.duration;
    }

    // --- Jog-wheel scrub: play short audio snippet at position ---
    // Does NOT interfere with isPlaying state — it's an overlay preview
    scrubPlay(position, snippetDuration = 0.15) {
        if (!this.audioBuffer) return;
        this.ensureCtxRunning();

        // Stop any existing scrub source
        if (this.scrubSource) {
            try {
                this.scrubSource.onended = null;
                this.scrubSource.stop();
                this.scrubSource.disconnect();
            } catch(e) {}
            this.scrubSource = null;
        }

        // Clamp position
        const bufDur = this.audioBuffer.duration;
        position = Math.max(0, Math.min(bufDur - 0.02, position));

        // Create a short playback snippet on a separate source
        this.scrubSource = this.audioCtx.createBufferSource();
        this.scrubSource.buffer = this.audioBuffer;
        // Connect scrub source directly to destination (bypass analyser to avoid conflicts)
        this.scrubSource.connect(this.audioCtx.destination);

        const self = this;
        const src = this.scrubSource;
        this.scrubSource.onended = function() {
            if (self.scrubSource === src) {
                try { self.scrubSource.disconnect(); } catch(e) {}
                self.scrubSource = null;
            }
        };

        // Play a short snippet from position
        const remaining = bufDur - position;
        const dur = Math.min(snippetDuration, Math.max(0, remaining));
        if (dur > 0.01) {
            this.scrubSource.start(0, position, dur);
        }

        // Update position
        this.pausedAt = position;
        if (this.onTimeUpdate) this.onTimeUpdate(position, this.duration);
    }

    // --- Cue marker management ---
    addMarker(time) {
        const THRESHOLD = 0.5;
        if (this.markers.some(m => Math.abs(m.time - time) < THRESHOLD)) return false;
        this.markers.push({ time: time, id: Date.now() });
        this.markers.sort((a, b) => a.time - b.time);
        return true;
    }

    removeNearestMarker(time) {
        if (this.markers.length === 0) return false;
        const THRESHOLD = 1.0;
        let closest = -1;
        let closestDist = Infinity;
        this.markers.forEach((m, i) => {
            const dist = Math.abs(m.time - time);
            if (dist < closestDist) {
                closestDist = dist;
                closest = i;
            }
        });
        if (closest >= 0 && closestDist < THRESHOLD) {
            this.markers.splice(closest, 1);
            return true;
        }
        return false;
    }

    nextMarker(fromTime) {
        for (const m of this.markers) {
            if (m.time > fromTime + 0.2) return m.time;
        }
        return null;
    }

    prevMarker(fromTime) {
        for (let i = this.markers.length - 1; i >= 0; i--) {
            if (this.markers[i].time < fromTime - 0.2) return this.markers[i].time;
        }
        return null;
    }

    clearMarkers() {
        this.markers = [];
    }

    // --- Punch-in buffer merging ---
    _mergeBuffers(preBuffer, punchInOffset, newBuffer) {
        const sampleRate = this.audioCtx.sampleRate;
        const preFrames = Math.min(
            Math.floor(punchInOffset * sampleRate),
            preBuffer.length
        );
        const newFrames = newBuffer.length;
        const totalFrames = preFrames + newFrames;
        const channels = Math.max(preBuffer.numberOfChannels, newBuffer.numberOfChannels);

        const merged = this.audioCtx.createBuffer(channels, totalFrames, sampleRate);

        for (let ch = 0; ch < channels; ch++) {
            const mergedData = merged.getChannelData(ch);
            const preCh = Math.min(ch, preBuffer.numberOfChannels - 1);
            const newCh = Math.min(ch, newBuffer.numberOfChannels - 1);
            const preData = preBuffer.getChannelData(preCh);
            const newData = newBuffer.getChannelData(newCh);

            // Copy pre-existing audio up to punch point
            for (let i = 0; i < preFrames; i++) {
                mergedData[i] = preData[i];
            }
            // Append new recording after punch point
            for (let i = 0; i < newFrames; i++) {
                mergedData[preFrames + i] = newData[i];
            }
        }

        return merged;
    }

    // --- WAV export (proper encoding for save/reload) ---
    exportBufferAsWav() {
        if (!this.audioBuffer) return null;
        const buffer = this.audioBuffer;
        const numCh = buffer.numberOfChannels;
        const rate = buffer.sampleRate;
        const len = buffer.length;
        const bps = 2; // 16-bit
        const blockAlign = numCh * bps;
        const dataSize = len * blockAlign;
        const ab = new ArrayBuffer(44 + dataSize);
        const v = new DataView(ab);

        this._writeStr(v, 0, 'RIFF');
        v.setUint32(4, 36 + dataSize, true);
        this._writeStr(v, 8, 'WAVE');
        this._writeStr(v, 12, 'fmt ');
        v.setUint32(16, 16, true);
        v.setUint16(20, 1, true);  // PCM
        v.setUint16(22, numCh, true);
        v.setUint32(24, rate, true);
        v.setUint32(28, rate * blockAlign, true);
        v.setUint16(32, blockAlign, true);
        v.setUint16(34, 16, true); // bits per sample
        this._writeStr(v, 36, 'data');
        v.setUint32(40, dataSize, true);

        let off = 44;
        for (let i = 0; i < len; i++) {
            for (let ch = 0; ch < numCh; ch++) {
                const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
                v.setInt16(off, s * 0x7FFF, true);
                off += 2;
            }
        }

        return new Blob([ab], { type: 'audio/wav' });
    }

    _writeStr(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }
}