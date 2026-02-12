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
        this.maxRadius = Math.min(this.width, this.height) * 0.45;
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
        // Clear background
        this.ctx.fillStyle = '#111'; 
        this.ctx.fillRect(0, 0, this.width, this.height);

        const currentTime = this.audioEngine.getCurrentTime();
        
        // Rotation Logic
        // Angle = Time * Speed. 
        // Note: PlaybackRate might be negative if scrubbing backwards? 
        // getCurrentTime() is absolute position. We need continuous rotation for visual flux?
        // Actually, for a tape reel, the position determines the angle.
        // Angle = (Time / MaxTime) * TotalRotations * 2PI ?
        // Or simpler: Angle = Time * Constant.
        const rotationAngle = currentTime * 2; 

        this.drawSingleReel(this.centerX, this.centerY, this.maxRadius, rotationAngle);
    }

    drawSingleReel(x, y, radius, angle) {
        const ctx = this.ctx;
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // 1. Flat Rotating Disk
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#222'; // Dark gray disk
        ctx.fill();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 2. Tape Texture (Simple Ring)
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = '#1c1c1c'; // Slightly darker
        ctx.fill();

        // 3. Visual Dot for Spinning (Red)
        // A single dot on the rim
        ctx.beginPath();
        const dotDistance = radius * 0.85;
        ctx.arc(dotDistance, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ff0000'; // Red Dot
        ctx.fill();
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ff0000';

        // Center Cap
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#555';
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
    }
}