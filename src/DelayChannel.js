import { loadImpulseResponse } from './impulseLoader.js';

export class DelayChannel {
    constructor(audioContext, inputNode, channelNumber, bpm, timeMode) {
        this.audioContext = audioContext;
        this.inputNode = inputNode;
        this.channelNumber = channelNumber;
        this.bpm = bpm;
        this.timeMode = timeMode;
        this.destination = null;
        
        // Create audio nodes
        this.inputGain = audioContext.createGain();
        this.delayNode = audioContext.createDelay(10);
        this.feedbackGain = audioContext.createGain();
        this.outputGain = audioContext.createGain();
        this.wetGain = audioContext.createGain();
        this.dryGain = audioContext.createGain();
        
        // Reverb nodes
        this.convolver = null;
        this.reverbWetGain = audioContext.createGain();
        this.reverbDryGain = audioContext.createGain();
        this.reverbMix = audioContext.createGain();
        this.reverbEnabled = false;
        
        this.createImpulseResponse();
        
        // Set initial values
        this.inputGain.gain.value = 0.5;
        this.feedbackGain.gain.value = 0.3;
        this.delayNode.delayTime.value = 0.5;
        this.wetGain.gain.value = 1.0;
        this.dryGain.gain.value = 0.0;
        this.outputGain.gain.value = 1.0; // 100% volume
        this.reverbWetGain.gain.value = 0.5; // 50% wet
        this.reverbDryGain.gain.value = 0.5; // 50% dry
        this.reverbMix.gain.value = 1.0;
        
        this.currentDelayMs = 500;
        this.currentBpmDivision = '1/4';
        
        this.connectAudioNodes();
        this.createUI();
    }
    
    createImpulseResponse() {
        const rate = this.audioContext.sampleRate;
        const length = rate * 2;
        const impulse = this.audioContext.createBuffer(2, length, rate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }
        
        this.convolver = this.audioContext.createConvolver();
        this.convolver.buffer = impulse;
    }
    
    connectAudioNodes() {
        this.inputNode.connect(this.inputGain);
        this.inputGain.connect(this.delayNode);
        this.delayNode.connect(this.feedbackGain);
        this.feedbackGain.connect(this.delayNode);
        this.delayNode.connect(this.wetGain);
        this.inputGain.connect(this.dryGain);
        this.wetGain.connect(this.outputGain);
        this.dryGain.connect(this.outputGain);
        // Don't connect to destination here - will be connected by parent
    }
    
    connectToDestination(destination) {
        this.destination = destination;
        this.outputGain.connect(destination);
    }
    
    enableReverb(enabled) {
        this.reverbEnabled = enabled;
        
        if (enabled) {
            this.wetGain.disconnect();
            this.dryGain.disconnect();
            
            // Dry path: wetGain -> reverbDryGain -> reverbMix
            this.wetGain.connect(this.reverbDryGain);
            this.reverbDryGain.connect(this.reverbMix);
            
            // Wet path: wetGain -> convolver -> reverbWetGain -> reverbMix
            this.wetGain.connect(this.convolver);
            this.convolver.connect(this.reverbWetGain);
            this.reverbWetGain.connect(this.reverbMix);
            
            this.reverbMix.connect(this.outputGain);
            this.dryGain.connect(this.outputGain);
        } else {
            try {
                this.wetGain.disconnect();
                this.dryGain.disconnect();
                this.convolver.disconnect();
                this.reverbWetGain.disconnect();
                this.reverbDryGain.disconnect();
                this.reverbMix.disconnect();
            } catch (e) {}
            this.wetGain.connect(this.outputGain);
            this.dryGain.connect(this.outputGain);
        }
    }
    
    updateReverbDecay(value) {
        const rate = this.audioContext.sampleRate;
        const length = rate * (1 + value * 3);
        const impulse = this.audioContext.createBuffer(2, length, rate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }
        
        this.convolver.buffer = impulse;
    }
    
    updateReverbMix(value) {
        // Value is 0-1, where 0 is all dry and 1 is all wet
        this.reverbWetGain.gain.value = value;
        this.reverbDryGain.gain.value = 1 - value;
    }
    
    setDelayTime(ms) {
        this.currentDelayMs = ms;
        this.delayNode.delayTime.value = ms / 1000;
    }
    
    setBpmSyncedTime(division) {
        this.currentBpmDivision = division;
        const quarterNoteMs = (60 / this.bpm) * 1000;
        let multiplier = 1;
        
        switch(division) {
            case '1/1': multiplier = 4; break;
            case '1/2': multiplier = 2; break;
            case '1/4': multiplier = 1; break;
            case '1/8': multiplier = 0.5; break;
            case '1/16': multiplier = 0.25; break;
            case '1/4T': multiplier = 2/3; break;
            case '1/8T': multiplier = 1/3; break;
            case '1/4D': multiplier = 1.5; break;
            case '1/8D': multiplier = 0.75; break;
        }
        
        const delayMs = quarterNoteMs * multiplier;
        this.delayNode.delayTime.value = delayMs / 1000;
    }
    
    updateBpm(newBpm) {
        this.bpm = newBpm;
        if (this.timeMode === 'bpm') {
            this.setBpmSyncedTime(this.currentBpmDivision);
        }
    }
    
    async loadImpulseResponse(path) {
        if (!path) {
            // Load default impulse response
            this.createImpulseResponse();
            return;
        }
        
        const buffer = await loadImpulseResponse(this.audioContext, path);
        if (buffer) {
            this.convolver.buffer = buffer;
        }
    }
    
    reset() {
        // Save current settings and connections
        const currentDelayTime = this.delayNode.delayTime.value;
        const outputConnections = [];
        
        // Store where outputGain is connected
        try {
            // We'll reconnect after reset
            this.outputGain.disconnect();
        } catch (e) {
            // Already disconnected
        }
        
        // Disconnect the old delay node
        this.inputGain.disconnect();
        this.delayNode.disconnect();
        this.feedbackGain.disconnect();
        this.wetGain.disconnect();
        this.dryGain.disconnect();
        
        // Create a new delay node (clears the buffer)
        this.delayNode = this.audioContext.createDelay(10);
        this.delayNode.delayTime.value = currentDelayTime;
        
        // Reconnect everything
        this.inputNode.connect(this.inputGain);
        this.inputGain.connect(this.delayNode);
        this.delayNode.connect(this.feedbackGain);
        this.feedbackGain.connect(this.delayNode);
        this.delayNode.connect(this.wetGain);
        this.inputGain.connect(this.dryGain);
        
        // Reconnect to output (with or without reverb)
        if (this.reverbEnabled) {
            // Dry path
            this.wetGain.connect(this.reverbDryGain);
            this.reverbDryGain.connect(this.reverbMix);
            
            // Wet path
            this.wetGain.connect(this.convolver);
            this.convolver.connect(this.reverbWetGain);
            this.reverbWetGain.connect(this.reverbMix);
            
            this.reverbMix.connect(this.outputGain);
            this.dryGain.connect(this.outputGain);
        } else {
            this.wetGain.connect(this.outputGain);
            this.dryGain.connect(this.outputGain);
        }
        
        // Reconnect output to destination
        if (this.destination) {
            this.outputGain.connect(this.destination);
        }
    }
    
    destroy() {
        this.inputGain.disconnect();
        this.delayNode.disconnect();
        this.feedbackGain.disconnect();
        this.wetGain.disconnect();
        this.dryGain.disconnect();
        this.outputGain.disconnect();
        
        if (this.reverbEnabled) {
            this.convolver.disconnect();
            this.reverbGain.disconnect();
            this.reverbMix.disconnect();
        }
        
        this.element.remove();
        
        if (this.onDestroy) {
            this.onDestroy(this);
        }
    }
}

