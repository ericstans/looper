export class GranularScheduler {
    constructor(audioContext, masterOutput) {
        this.audioContext = audioContext;
        this.masterOutput = masterOutput;
        this.schedulerInterval = null;
        this.lookahead = 25.0; // How frequently to run the scheduling function (in milliseconds)
        this.scheduleAheadTime = 0.1; // How far ahead to schedule audio (in seconds)
        this.nextNoteTime = 0.0;
        this.markers = new Map(); // markerId -> marker data
        
        this.start();
    }
    
    start() {
        if (this.schedulerInterval) return;
        
        this.nextNoteTime = this.audioContext.currentTime;
        this.schedulerInterval = setInterval(() => {
            this.scheduler();
        }, this.lookahead);
    }
    
    stop() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
    }
    
    scheduler() {
        // While there are notes that will need to play before the next interval, schedule them
        while (this.nextNoteTime < this.audioContext.currentTime + this.scheduleAheadTime) {
            this.scheduleMarkers();
            this.nextNoteTime += 0.05; // Advance by 50ms
        }
    }
    
    scheduleMarkers() {
        this.markers.forEach((marker, markerId) => {
            if (!marker.isPlaying || !marker.buffer) return;
            
            const currentTime = this.audioContext.currentTime;
            const grainInterval = 1000 / marker.grainRate; // Convert Hz to ms
            const timeSinceLastGrain = currentTime - marker.lastGrainTime;
            
            // Check if it's time to emit a grain
            if (timeSinceLastGrain >= (grainInterval / 1000)) {
                this.scheduleGrain(marker, currentTime);
                marker.lastGrainTime = currentTime;
            }
        });
    }
    
    scheduleGrain(marker, scheduleTime) {
        // Create a buffer source for this grain
        const grain = this.audioContext.createBufferSource();
        grain.buffer = marker.buffer;
        
        // Apply pitch randomization
        const pitchVariation = 1 + (Math.random() * 2 - 1) * marker.pitchRandomization;
        grain.playbackRate.value = pitchVariation;
        
        // Create envelope for grain
        const envelope = this.audioContext.createGain();
        envelope.gain.value = 0;
        
        grain.connect(envelope);
        envelope.connect(marker.output);
        
        // Calculate position with randomization
        const positionVariation = (Math.random() * 2 - 1) * marker.positionRandomization;
        let playPosition = marker.position + positionVariation;
        playPosition = Math.max(0, Math.min(1, playPosition));
        
        const startTime = playPosition * marker.buffer.duration;
        const grainDuration = Math.max(marker.grainLength, 0.02); // Minimum 20ms for proper declicking
        
        // Envelope: quick fade in, sustain, quick fade out (max 10ms each)
        const maxFadeTime = 0.01; // 10ms maximum fade time
        const fadeTime = Math.min(maxFadeTime, grainDuration * 0.1, grainDuration * 0.5);
        
        // Ensure fade time doesn't exceed half the grain duration
        const actualFadeTime = Math.min(fadeTime, grainDuration * 0.5);
        
        envelope.gain.setValueAtTime(0, scheduleTime);
        envelope.gain.linearRampToValueAtTime(marker.volume, scheduleTime + actualFadeTime);
        
        // Only add sustain if grain is long enough for fade out
        if (grainDuration > actualFadeTime * 2) {
            envelope.gain.setValueAtTime(marker.volume, scheduleTime + grainDuration - actualFadeTime);
        }
        
        envelope.gain.linearRampToValueAtTime(0, scheduleTime + grainDuration);
        
        // Schedule the grain
        grain.start(scheduleTime, startTime, grainDuration);
        grain.stop(scheduleTime + grainDuration);
        
        // Track grain for visualization
        const grainData = {
            position: playPosition,
            birthTime: scheduleTime,
            duration: grainDuration
        };
        
        // Send grain data to main thread for visualization
        if (marker.onGrainEmitted) {
            marker.onGrainEmitted(grainData);
        }
    }
    
    addMarker(markerId, markerData) {
        this.markers.set(markerId, {
            ...markerData,
            lastGrainTime: 0,
            isPlaying: true
        });
    }
    
    removeMarker(markerId) {
        this.markers.delete(markerId);
    }
    
    updateMarker(markerId, updates) {
        const marker = this.markers.get(markerId);
        if (marker) {
            Object.assign(marker, updates);
        }
    }
    
    destroy() {
        this.stop();
        this.markers.clear();
    }
}
