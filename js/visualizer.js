class Visualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.rotation = 0;
        this.animationId = null;
        
        // Single Reel Configuration
        this.centerX = this.width / 2;
        this.centerY = this.height / 2; // Centered
        this.maxRadius = Math.min(this.width, this.height) * 0.45; // Almost full screen
    }

    start(audioEngine) {
        this.audioEngine = audioEngine;
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

        // 1. Outer Rim
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#222';
        ctx.fill();
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 4;
        ctx.stroke();

        // 2. Tape Mass (Visual representation of "Fullness" could vary, 
        // but user asked for "Visual dot that indicates spinning")
        // Let's draw the "Tape" texture
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = '#3a2a2a'; // Tape color
        ctx.fill();

        // 3. Metal Spokes (The Reel)
        // Draw 3 large aesthetic cutouts
        const spokeCount = 3;
        ctx.fillStyle = '#666'; // Metal
        ctx.beginPath();
        for (let i = 0; i < spokeCount; i++) {
            const rad = (i * 2 * Math.PI) / spokeCount;
            // Draw a wedge shape or circle for spoke hole?
            // Let's do huge circular cutouts like a classic reel
            const cutoutX = Math.cos(rad) * (radius * 0.5);
            const cutoutY = Math.sin(rad) * (radius * 0.5);
            ctx.moveTo(cutoutX, cutoutY);
            ctx.arc(cutoutX, cutoutY, radius * 0.25, 0, Math.PI * 2);
        }
        // Use blending to punch out holes? Or just draw the Hub on top.
        // Let's just draw the Hub structure itself.
        
        // Reset and draw Hub structure
        ctx.fillStyle = '#888'; // Hub Color
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2); // Center Hub
        ctx.fill();

        // Spokes connecting Hub to Rim
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 15;
        ctx.beginPath();
        for (let i = 0; i < spokeCount; i++) {
            const rad = (i * 2 * Math.PI) / spokeCount;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(rad) * radius, Math.sin(rad) * radius);
        }
        ctx.stroke();

        // 4. Visual Dot for Spinning (Requested specifically)
        // A bright dot on the rim or near it
        ctx.beginPath();
        const dotDistance = radius * 0.8;
        ctx.arc(dotDistance, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ff0000'; // Red Dot
        ctx.fill();

        // Center Screw
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ccc';
        ctx.fill();

        ctx.restore();
        
        // Optional: Simple VU Meter arc around the wheel?
        // Or overlay outside
    }
}