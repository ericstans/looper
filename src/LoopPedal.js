import { DelayChannel } from './DelayChannel.js';
import { createUI, updateTimeMode } from './DelayChannelUI.js';

// Extend DelayChannel with UI methods
DelayChannel.prototype.createUI = function() {
    createUI(this);
};

DelayChannel.prototype.updateTimeMode = function(mode) {
    updateTimeMode(this, mode);
};

export class LoopPedal {
    constructor() {
        this.audioContext = null;
        this.micStream = null;
        this.micSource = null;
        this.dryGain = null;
        this.analyser = null;
        this.channels = [];
        this.channelCounter = 1;
        this.bpm = 120;
        this.timeMode = 'raw';
        this.inputMode = 'mono';
        this.isAudioStarted = false;
        this.animationId = null;
        
        this.init();
    }
    
    init() {
        this.startButton = document.getElementById('start-audio');
        this.bpmInput = document.getElementById('bpm');
        this.timeModeSelect = document.getElementById('time-mode');
        this.inputModeSelect = document.getElementById('input-mode');
        this.dryVolumeSlider = document.getElementById('dry-volume');
        this.dryVolumeValue = document.getElementById('dry-volume-value');
        this.channelsContainer = document.getElementById('channels-container');
        this.waveformCanvas = document.getElementById('waveform-canvas');
        this.canvasContext = this.waveformCanvas.getContext('2d');
        
        this.startButton.addEventListener('click', () => this.toggleAudio());
        this.bpmInput.addEventListener('input', (e) => this.updateBpm(e.target.value));
        this.timeModeSelect.addEventListener('change', (e) => this.updateTimeMode(e.target.value));
        this.inputModeSelect.addEventListener('change', (e) => this.updateInputMode(e.target.value));
        this.dryVolumeSlider.addEventListener('input', (e) => this.updateDryVolume(e.target.value));
        
        this.setupCanvas();
        this.createAddChannelButton();
    }
    
    setupCanvas() {
        // Set canvas resolution to actual CSS size
        const rect = this.waveformCanvas.getBoundingClientRect();
        this.waveformCanvas.width = rect.width;
        this.waveformCanvas.height = rect.height;
        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
        
        // Initial clear
        this.canvasContext.fillStyle = '#0a0a0a';
        this.canvasContext.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
    
    async toggleAudio() {
        if (!this.isAudioStarted) {
            await this.startAudio();
        } else {
            this.stopAudio();
        }
    }
    
    async startAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Configure audio constraints based on input mode
            const audioConstraints = {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            };
            
            if (this.inputMode === 'mono') {
                audioConstraints.channelCount = 1;
            } else {
                audioConstraints.channelCount = 2;
            }
            
            this.micStream = await navigator.mediaDevices.getUserMedia({ 
                audio: audioConstraints
            });
            
            const rawMicSource = this.audioContext.createMediaStreamSource(this.micStream);
            
            // Create proper routing based on input mode
            if (this.inputMode === 'mono') {
                // For mono, create a splitter and merger to pan to center
                const splitter = this.audioContext.createChannelSplitter(1);
                const merger = this.audioContext.createChannelMerger(2);
                
                rawMicSource.connect(splitter);
                splitter.connect(merger, 0, 0); // Connect mono to left
                splitter.connect(merger, 0, 1); // Connect mono to right (center pan)
                
                this.micSource = merger;
            } else {
                // For stereo, use directly
                this.micSource = rawMicSource;
            }
            
            // Create master output node for all audio
            this.masterOutput = this.audioContext.createGain();
            this.masterOutput.gain.value = 1.0;
            
            // Create dry gain node for direct monitoring
            this.dryGain = this.audioContext.createGain();
            this.dryGain.gain.value = 0; // Start at 0 (muted)
            this.micSource.connect(this.dryGain);
            this.dryGain.connect(this.masterOutput);
            
            // Create analyser for waveform visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.3;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Connect master output to analyser and destination
            this.masterOutput.connect(this.analyser);
            this.masterOutput.connect(this.audioContext.destination);
            
            for (let i = 0; i < 4; i++) {
                this.addChannel();
            }
            
            // Set audio started BEFORE starting waveform drawing
            this.isAudioStarted = true;
            this.startButton.textContent = 'Stop Audio';
            this.startButton.classList.add('active');
            
            // Start waveform drawing
            this.drawWaveform();
            
        } catch (error) {
            console.error('Error starting audio:', error);
            alert('Could not access microphone. Please grant permission and try again.');
        }
    }
    
    stopAudio() {
        // Stop animation
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
        }
        
        [...this.channels].forEach(channel => channel.destroy());
        this.channels = [];
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        this.isAudioStarted = false;
        this.startButton.textContent = 'Start Audio / Enable Microphone';
        this.startButton.classList.remove('active');
        this.channelCounter = 1;
        
        this.channelsContainer.innerHTML = '';
        this.createAddChannelButton();
        
        // Clear canvas
        this.canvasContext.fillStyle = '#0a0a0a';
        this.canvasContext.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
    
    addChannel() {
        const channel = new DelayChannel(
            this.audioContext,
            this.micSource,
            this.channelCounter++,
            this.bpm,
            this.timeMode
        );
        
        // Connect channel to master output
        if (this.masterOutput) {
            channel.connectToDestination(this.masterOutput);
        }
        
        channel.onDestroy = (ch) => {
            const index = this.channels.indexOf(ch);
            if (index > -1) {
                this.channels.splice(index, 1);
            }
        };
        
        this.channels.push(channel);
        
        const addButton = this.channelsContainer.querySelector('.add-channel');
        if (addButton) {
            this.channelsContainer.insertBefore(channel.element, addButton);
        } else {
            this.channelsContainer.appendChild(channel.element);
        }
    }
    
    createAddChannelButton() {
        const addButton = document.createElement('div');
        addButton.className = 'add-channel';
        addButton.innerHTML = `
            <div class="add-channel-icon">+</div>
            <div class="add-channel-text">Add Channel</div>
        `;
        
        addButton.addEventListener('click', () => {
            if (this.isAudioStarted) {
                this.addChannel();
            } else {
                alert('Please start audio first');
            }
        });
        
        this.channelsContainer.appendChild(addButton);
    }
    
    updateBpm(newBpm) {
        this.bpm = parseInt(newBpm);
        this.channels.forEach(channel => channel.updateBpm(this.bpm));
    }
    
    updateTimeMode(mode) {
        this.timeMode = mode;
        this.channels.forEach(channel => channel.updateTimeMode(mode));
    }
    
    async updateInputMode(mode) {
        this.inputMode = mode;
        
        // If audio is already started, restart it with the new input mode
        if (this.isAudioStarted) {
            this.stopAudio();
            await this.startAudio();
        }
    }
    
    updateDryVolume(value) {
        const volume = value / 100;
        if (this.dryGain) {
            this.dryGain.gain.value = volume;
        }
        this.dryVolumeValue.textContent = `${value}%`;
    }
    
    drawWaveform() {
        if (!this.isAudioStarted) return;
        
        this.animationId = requestAnimationFrame(() => this.drawWaveform());
        
        // Get waveform data
        this.analyser.getByteTimeDomainData(this.dataArray);
        
        // Shift the canvas to the left by 1 pixel
        const imageData = this.canvasContext.getImageData(1, 0, this.canvasWidth - 1, this.canvasHeight);
        this.canvasContext.putImageData(imageData, 0, 0);
        
        // Clear the rightmost column
        this.canvasContext.fillStyle = '#0a0a0a';
        this.canvasContext.fillRect(this.canvasWidth - 1, 0, 1, this.canvasHeight);
        
        // Calculate waveform for the rightmost column
        // Sample the waveform at regular intervals and find min/max
        let min = 255;
        let max = 0;
        const sampleCount = 32;
        
        for (let i = 0; i < sampleCount; i++) {
            const index = Math.floor((this.dataArray.length / sampleCount) * i);
            const value = this.dataArray[index];
            if (value < min) min = value;
            if (value > max) max = value;
        }
        
        // Convert to canvas coordinates (flip Y axis, 128 is center)
        const centerY = this.canvasHeight / 2;
        const minY = ((255 - max) / 255.0) * this.canvasHeight;
        const maxY = ((255 - min) / 255.0) * this.canvasHeight;
        
        // Draw the waveform column
        this.canvasContext.strokeStyle = '#4CAF50';
        this.canvasContext.lineWidth = 2;
        this.canvasContext.beginPath();
        this.canvasContext.moveTo(this.canvasWidth - 1, minY);
        this.canvasContext.lineTo(this.canvasWidth - 1, maxY);
        this.canvasContext.stroke();
        
        // Draw center reference line every frame (after shifting)
        this.canvasContext.strokeStyle = 'rgba(51, 51, 51, 0.3)';
        this.canvasContext.lineWidth = 1;
        this.canvasContext.beginPath();
        this.canvasContext.moveTo(0, centerY);
        this.canvasContext.lineTo(this.canvasWidth, centerY);
        this.canvasContext.stroke();
    }
}

