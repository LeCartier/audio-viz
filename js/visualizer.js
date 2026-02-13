class Visualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.animationId = null;
        this.resizeCanvas();
    }

    resizeCanvas() {
        const parent = this.canvas.parentElement;
        this.canvas.width = parent.clientWidth;
        this.canvas.height = parent.clientHeight;
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // Single Reel Configuration
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        this.maxRadius = Math.min(this.width, this.height) * 0.42;
    }

    start(audioEngine) {
        this.audioEngine = audioEngine;
        this.resizeCanvas();
        this.animate();
    }

    animate() {
        this.draw();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    draw() {
        const ctx = this.ctx;

        // Clear background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, this.width, this.height);

        const currentTime = this.audioEngine.getCurrentTime();
        const duration = this.audioEngine.duration || 0;

        // Rotation: more rotations per second so scrub movement is obvious
        const rotationAngle = currentTime * 4;

        this.drawReel(this.centerX, this.centerY, this.maxRadius, rotationAngle);

        // Draw progress arc around the reel (only when not recording and there's audio)
        if (duration > 0 && !this.audioEngine.isRecording) {
            this.drawProgressArc(this.centerX, this.centerY, this.maxRadius + 6, currentTime, duration);
            // Draw cue markers on the arc
            if (this.audioEngine.markers && this.audioEngine.markers.length > 0) {
                this.drawMarkers(this.centerX, this.centerY, this.maxRadius + 6, this.audioEngine.markers, duration);
            }
        }

        // Time position text at the bottom
        if (duration > 0) {
            const pct = Math.min(100, (currentTime / duration) * 100);
            ctx.fillStyle = '#666';
            ctx.font = '9px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.fmtTime(currentTime)} / ${this.fmtTime(duration)}  (${pct.toFixed(0)}%)`, this.centerX, this.height - 20);
        }
    }

    drawReel(x, y, radius, angle) {
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Outer disk
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#222';
        ctx.fill();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner ring
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.78, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();

        // Spoke lines for rotation visibility
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const a = (i * Math.PI * 2) / 3;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
            ctx.lineTo(Math.cos(a) * radius * 0.75, Math.sin(a) * radius * 0.75);
            ctx.stroke();
        }

        // Red dot on rim
        ctx.beginPath();
        const dotDist = radius * 0.85;
        ctx.arc(dotDist, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff0000';
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#ff0000';
        ctx.fill();
        ctx.shadowBlur = 0;

        // Center cap
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#555';
        ctx.fill();

        ctx.restore();
    }

    drawProgressArc(x, y, radius, currentTime, duration) {
        const ctx = this.ctx;
        const startAngle = -Math.PI / 2; // 12 o'clock
        const fullAngle = Math.PI * 2;
        const progress = Math.min(1, currentTime / duration);

        // Background track
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, fullAngle);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Progress fill
        if (progress > 0) {
            ctx.beginPath();
            ctx.arc(x, y, radius, startAngle, startAngle + fullAngle * progress);
            ctx.strokeStyle = this.audioEngine.isRecording ? '#f00' : '#FE5000';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        // Playhead dot
        const headAngle = startAngle + fullAngle * progress;
        ctx.beginPath();
        ctx.arc(x + Math.cos(headAngle) * radius, y + Math.sin(headAngle) * radius, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
    }

    drawMarkers(x, y, radius, markers, duration) {
        if (!markers || markers.length === 0 || duration <= 0) return;
        const ctx = this.ctx;
        const startAngle = -Math.PI / 2;
        const fullAngle = Math.PI * 2;

        markers.forEach(marker => {
            const progress = Math.min(1, marker.time / duration);
            const angle = startAngle + fullAngle * progress;

            // Tick line radiating outward
            const innerR = radius - 5;
            const outerR = radius + 5;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(angle) * innerR, y + Math.sin(angle) * innerR);
            ctx.lineTo(x + Math.cos(angle) * outerR, y + Math.sin(angle) * outerR);
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Small dot at the tick
            ctx.beginPath();
            ctx.arc(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffcc00';
            ctx.shadowBlur = 3;
            ctx.shadowColor = '#ffcc00';
            ctx.fill();
            ctx.shadowBlur = 0;
        });
    }

    fmtTime(s) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }
}