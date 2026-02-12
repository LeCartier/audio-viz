class Visualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.rotation = 0;
        this.animationId = null;
        
        // Reel constants
        this.reelRadius = 40;
        this.spokeCount = 3;
        this.reelCenterY = 100;
        this.leftReelX = 60;
        this.rightReelX = 180;
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
        this.ctx.fillStyle = '#111'; // Match CSS
        this.ctx.fillRect(0, 0, this.width, this.height);

        const currentTime = this.audioEngine.getCurrentTime();
        
        // Use fixed Max tape duration for visual consistency or current duration if playing back?
        // Let's use a virtual max capacity logic so it looks like a real reel
        const maxCapacity = this.audioEngine.maxTapeDuration || 300; 
        const progress = Math.min(1, Math.max(0, currentTime / maxCapacity));
        
        // Calculate Tape Amount (Visual Radius)
        const minTape = 15;
        const maxTape = 38;
        const leftRadius = maxTape - (progress * (maxTape - minTape));
        const rightRadius = minTape + (progress * (maxTape - minTape));

        // Calculate Rotation
        // Use currentTime (which works for Rec & Play)
        // Angle = Time * SpeedConstant
        const rotationAngle = currentTime * 5; 

        // Draw Left Reel (Supply)
        this.drawReel(this.leftReelX, this.reelCenterY, this.reelRadius, leftRadius, -rotationAngle);

        // Draw Right Reel (Takeup)
        this.drawReel(this.rightReelX, this.reelCenterY, this.reelRadius, rightRadius, -rotationAngle);

        // Draw Tape connecting them
        this.drawTapePoints(this.leftReelX, this.rightReelX, this.reelCenterY, leftRadius, rightRadius);

        // Draw VU Meter or Overlay
        this.drawVUMeter();
    }

    drawReel(x, y, hubRadius, tapeRadius, angle) {
        const ctx = this.ctx;
        
        // Draw Tape Pack
        ctx.beginPath();
        ctx.arc(x, y, tapeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#3a2a2a'; // Brown tape color
        ctx.fill();
        ctx.strokeStyle = '#220';
        ctx.stroke();

        // Draw Hub (Metal)
        ctx.beginPath();
        ctx.arc(x, y, hubRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#888'; // Metal gray
        ctx.fill();
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Spokes (Rotating)
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        
        ctx.beginPath();
        for (let i = 0; i < this.spokeCount; i++) {
            const rad = (i * 2 * Math.PI) / this.spokeCount;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(rad) * hubRadius * 0.9, Math.sin(rad) * hubRadius * 0.9);
        }
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Screw in middle
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ccc';
        ctx.fill();

        ctx.restore();
    }

    drawTapePoints(x1, x2, y, r1, r2) {
        const ctx = this.ctx;
        
        // Simple straight line tape path for now, maybe sag later
        // Tangent points roughly at bottom for "heads"
        ctx.beginPath();
        ctx.moveTo(x1, y + r1);
        ctx.lineTo(70, y + 80); // Guide
        ctx.lineTo(170, y + 80); // Guide
        ctx.lineTo(x2, y + r2);
        
        ctx.strokeStyle = '#3a2a2a';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Tape Head block
        ctx.fillStyle = '#bbb'; 
        ctx.fillRect(90, y + 60, 60, 30);
    }

    drawVUMeter() {
        const data = this.audioEngine.getAnalyserData();
        // Simple bar based on average volume
        let sum = 0;
        for(let i = 0; i < data.length; i++) {
            sum += data[i];
        }
        const average = sum / data.length;
        
        // Draw needle or bar
        const width = 100;
        const height = 5;
        const x = (this.width - width) / 2;
        const y = 170;

        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(x, y, width, height);

        const fillWidth = (average / 128) * width; // 128 is approx half
        this.ctx.fillStyle = this.audioEngine.isRecording ? '#f33' : '#3f3';
        this.ctx.fillRect(x, y, Math.min(width, fillWidth), height);
    }
}