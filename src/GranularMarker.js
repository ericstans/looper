export class GranularMarker {
    constructor(audioContext, position, buffer, markerId, scheduler) {
        this.audioContext = audioContext;
        this.position = position; // 0-1, position in the buffer
        this.buffer = buffer;
        this.markerId = markerId;
        this.scheduler = scheduler;
        
        // Granular parameters
        this.volume = 0.5;
        // Initialize with logarithmic value (37% slider = 10% position randomization)
        this.positionRandomization = 0.1; // ±10% of position
        this.pitchRandomization = 0.1; // ±10% pitch variation
        this.grainLength = 0.05; // 50ms default grain length
        this.grainRate = 20; // Grains per second (grain density)
        
        // Audio nodes
        this.output = audioContext.createGain();
        this.output.gain.value = this.volume;
        
        // Grain scheduling
        this.isPlaying = false;
        
        // Active grains for visualization
        this.activeGrains = [];
        
        // Callback for grain visualization
        this.onGrainEmitted = (grainData) => {
            this.activeGrains.push({
                ...grainData,
                birthTime: Date.now(), // For visualization timing
                duration: grainData.duration * 1000 // Convert to ms
            });
            
            // Clean up old grains
            setTimeout(() => {
                const index = this.activeGrains.findIndex(g => g === grainData);
                if (index > -1) {
                    this.activeGrains.splice(index, 1);
                }
            }, grainData.duration * 1000);
        };
        
        // Create UI
        this.createUI();
    }
    
    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        
        // Register with scheduler
        this.scheduler.addMarker(this.markerId, {
            buffer: this.buffer,
            position: this.position,
            volume: this.volume,
            positionRandomization: this.positionRandomization,
            pitchRandomization: this.pitchRandomization,
            grainLength: this.grainLength,
            grainRate: this.grainRate,
            output: this.output,
            onGrainEmitted: this.onGrainEmitted
        });
    }
    
    stop() {
        this.isPlaying = false;
        this.scheduler.removeMarker(this.markerId);
    }
    
    // emitGrain() is now handled by the scheduler
    
    updateVolume(value) {
        this.volume = value;
        this.output.gain.value = value;
        
        // Update scheduler with new parameters
        if (this.isPlaying) {
            this.scheduler.updateMarker(this.markerId, { volume: value });
        }
    }
    
    updatePositionRandomization(value) {
        this.positionRandomization = value;
        
        if (this.isPlaying) {
            this.scheduler.updateMarker(this.markerId, { positionRandomization: value });
        }
    }
    
    updatePitchRandomization(value) {
        this.pitchRandomization = value;
        
        if (this.isPlaying) {
            this.scheduler.updateMarker(this.markerId, { pitchRandomization: value });
        }
    }
    
    updateGrainLength(value) {
        this.grainLength = value;
        
        if (this.isPlaying) {
            this.scheduler.updateMarker(this.markerId, { grainLength: value });
        }
    }
    
    updateGrainDensity(value) {
        // Convert slider value (0-100) to grain rate (1-100 grains per second)
        // Use logarithmic scaling for better musical control
        const logValue = Math.pow(10, (value / 100) * 2); // Maps 0-100 to 1-100
        this.grainRate = Math.max(1, logValue);
        
        if (this.isPlaying) {
            this.scheduler.updateMarker(this.markerId, { grainRate: this.grainRate });
        }
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
                    <input type="range" min="0" max="100" value="37" 
                           id="marker-position-${this.markerId}">
                    <span id="marker-position-value-${this.markerId}">10.0%</span>
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
                <div class="marker-control">
                    <label>Grain Density</label>
                    <input type="range" min="0" max="100" value="30" 
                           id="marker-density-${this.markerId}">
                    <span id="marker-density-value-${this.markerId}">20/s</span>
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
        const densitySlider = this.element.querySelector(`#marker-density-${this.markerId}`);
        const closeButton = this.element.querySelector(`#close-marker-${this.markerId}`);
        
        volumeSlider.addEventListener('input', (e) => {
            this.updateVolume(e.target.value / 100);
            this.element.querySelector(`#marker-volume-value-${this.markerId}`).textContent = `${e.target.value}%`;
        });
        
        positionSlider.addEventListener('input', (e) => {
            // Convert linear slider value (0-100) to logarithmic position randomization (0.001-0.5)
            const linearValue = e.target.value / 100;
            const logValue = Math.pow(10, linearValue * 2.7 - 3); // Maps 0-1 to 0.001-0.5
            this.updatePositionRandomization(logValue);
            
            // Display as percentage with more precision for small values
            const displayValue = logValue < 0.01 ? (logValue * 1000).toFixed(1) + '‰' : (logValue * 100).toFixed(1) + '%';
            this.element.querySelector(`#marker-position-value-${this.markerId}`).textContent = displayValue;
        });
        
        pitchSlider.addEventListener('input', (e) => {
            this.updatePitchRandomization(e.target.value / 100);
            this.element.querySelector(`#marker-pitch-value-${this.markerId}`).textContent = `${e.target.value}%`;
        });
        
        grainSlider.addEventListener('input', (e) => {
            this.updateGrainLength(e.target.value / 1000);
            this.element.querySelector(`#marker-grain-value-${this.markerId}`).textContent = `${e.target.value}ms`;
        });
        
        densitySlider.addEventListener('input', (e) => {
            this.updateGrainDensity(e.target.value);
            const displayValue = this.grainRate < 10 ? 
                this.grainRate.toFixed(1) + '/s' : 
                Math.round(this.grainRate) + '/s';
            this.element.querySelector(`#marker-density-value-${this.markerId}`).textContent = displayValue;
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

