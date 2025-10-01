export class GranularMarker {
    constructor(audioContext, position, buffer, markerId) {
        this.audioContext = audioContext;
        this.position = position; // 0-1, position in the buffer
        this.buffer = buffer;
        this.markerId = markerId;
        
        // Granular parameters
        this.volume = 0.5;
        this.positionRandomization = 0.1; // ±10% of position
        this.pitchRandomization = 0.1; // ±10% pitch variation
        this.grainLength = 0.05; // 50ms default grain length
        
        // Audio nodes
        this.output = audioContext.createGain();
        this.output.gain.value = this.volume;
        
        // Grain scheduling
        this.isPlaying = false;
        this.grainInterval = null;
        this.grainRate = 20; // Grains per second
        
        // Active grains for visualization
        this.activeGrains = [];
        
        // Create UI
        this.createUI();
    }
    
    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        
        // Schedule grain emission
        const scheduleNextGrain = () => {
            if (!this.isPlaying) return;
            
            this.emitGrain();
            
            // Schedule next grain with slight randomization
            const interval = (1000 / this.grainRate) * (0.9 + Math.random() * 0.2);
            this.grainInterval = setTimeout(scheduleNextGrain, interval);
        };
        
        scheduleNextGrain();
    }
    
    stop() {
        this.isPlaying = false;
        if (this.grainInterval) {
            clearTimeout(this.grainInterval);
            this.grainInterval = null;
        }
    }
    
    emitGrain() {
        if (!this.buffer) return;
        
        // Create a buffer source for this grain
        const grain = this.audioContext.createBufferSource();
        grain.buffer = this.buffer;
        
        // Apply pitch randomization
        const pitchVariation = 1 + (Math.random() * 2 - 1) * this.pitchRandomization;
        grain.playbackRate.value = pitchVariation;
        
        // Create envelope for grain (fade in/out to avoid clicks)
        const envelope = this.audioContext.createGain();
        envelope.gain.value = 0;
        
        grain.connect(envelope);
        envelope.connect(this.output);
        
        // Calculate position with randomization
        const positionVariation = (Math.random() * 2 - 1) * this.positionRandomization;
        let playPosition = this.position + positionVariation;
        playPosition = Math.max(0, Math.min(1, playPosition)); // Clamp 0-1
        
        const startTime = playPosition * this.buffer.duration;
        const currentTime = this.audioContext.currentTime;
        const grainDuration = this.grainLength;
        
        // Envelope: quick fade in, sustain, quick fade out
        const fadeTime = Math.min(0.005, grainDuration * 0.1);
        envelope.gain.setValueAtTime(0, currentTime);
        envelope.gain.linearRampToValueAtTime(1, currentTime + fadeTime);
        envelope.gain.setValueAtTime(1, currentTime + grainDuration - fadeTime);
        envelope.gain.linearRampToValueAtTime(0, currentTime + grainDuration);
        
        // Play the grain
        grain.start(currentTime, startTime, grainDuration);
        grain.stop(currentTime + grainDuration);
        
        // Track grain for visualization
        const grainData = {
            position: playPosition,
            birthTime: Date.now(),
            duration: grainDuration * 1000 // Convert to ms
        };
        this.activeGrains.push(grainData);
        
        // Clean up old grains
        setTimeout(() => {
            const index = this.activeGrains.indexOf(grainData);
            if (index > -1) {
                this.activeGrains.splice(index, 1);
            }
        }, grainDuration * 1000);
    }
    
    updateVolume(value) {
        this.volume = value;
        this.output.gain.value = value;
    }
    
    updatePositionRandomization(value) {
        this.positionRandomization = value;
    }
    
    updatePitchRandomization(value) {
        this.pitchRandomization = value;
    }
    
    updateGrainLength(value) {
        this.grainLength = value;
    }
    
    connectToDestination(destination) {
        this.output.connect(destination);
    }
    
    createUI() {
        const markerUI = document.createElement('div');
        markerUI.className = 'granular-marker-ui';
        markerUI.id = `marker-${this.markerId}`;
        
        markerUI.innerHTML = `
            <div class="marker-header">
                <span>Marker ${this.markerId}</span>
                <button class="marker-close" id="close-marker-${this.markerId}">×</button>
            </div>
            <div class="marker-controls">
                <div class="marker-control">
                    <label>Volume</label>
                    <input type="range" min="0" max="100" value="50" 
                           id="marker-volume-${this.markerId}">
                    <span id="marker-volume-value-${this.markerId}">50%</span>
                </div>
                <div class="marker-control">
                    <label>Position Random</label>
                    <input type="range" min="0" max="100" value="10" 
                           id="marker-position-${this.markerId}">
                    <span id="marker-position-value-${this.markerId}">10%</span>
                </div>
                <div class="marker-control">
                    <label>Pitch Random</label>
                    <input type="range" min="0" max="100" value="10" 
                           id="marker-pitch-${this.markerId}">
                    <span id="marker-pitch-value-${this.markerId}">10%</span>
                </div>
                <div class="marker-control">
                    <label>Grain Length</label>
                    <input type="range" min="10" max="500" value="50" 
                           id="marker-grain-${this.markerId}">
                    <span id="marker-grain-value-${this.markerId}">50ms</span>
                </div>
            </div>
        `;
        
        this.element = markerUI;
        this.attachEventListeners();
    }
    
    attachEventListeners() {
        const volumeSlider = this.element.querySelector(`#marker-volume-${this.markerId}`);
        const positionSlider = this.element.querySelector(`#marker-position-${this.markerId}`);
        const pitchSlider = this.element.querySelector(`#marker-pitch-${this.markerId}`);
        const grainSlider = this.element.querySelector(`#marker-grain-${this.markerId}`);
        const closeButton = this.element.querySelector(`#close-marker-${this.markerId}`);
        
        volumeSlider.addEventListener('input', (e) => {
            this.updateVolume(e.target.value / 100);
            this.element.querySelector(`#marker-volume-value-${this.markerId}`).textContent = `${e.target.value}%`;
        });
        
        positionSlider.addEventListener('input', (e) => {
            this.updatePositionRandomization(e.target.value / 100);
            this.element.querySelector(`#marker-position-value-${this.markerId}`).textContent = `${e.target.value}%`;
        });
        
        pitchSlider.addEventListener('input', (e) => {
            this.updatePitchRandomization(e.target.value / 100);
            this.element.querySelector(`#marker-pitch-value-${this.markerId}`).textContent = `${e.target.value}%`;
        });
        
        grainSlider.addEventListener('input', (e) => {
            this.updateGrainLength(e.target.value / 1000);
            this.element.querySelector(`#marker-grain-value-${this.markerId}`).textContent = `${e.target.value}ms`;
        });
        
        closeButton.addEventListener('click', () => {
            this.destroy();
        });
    }
    
    destroy() {
        this.stop();
        this.output.disconnect();
        this.element.remove();
        
        if (this.onDestroy) {
            this.onDestroy(this);
        }
    }
}

