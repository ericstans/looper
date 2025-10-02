import { DelayChannel } from './DelayChannel.js';
import { createUI, updateTimeMode } from './DelayChannelUI.js';
import { GranularMarker } from './GranularMarker.js';
import { GranularScheduler } from './GranularScheduler.js';

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
        this.preGranularOutput = null; // Output before granular synthesis
        this.channels = [];
        this.channelCounter = 1;
        this.bpm = 120;
        this.timeMode = 'raw';
        this.inputMode = 'mono';
        this.isAudioStarted = false;
        this.animationId = null;
        
        // Granular synthesis
        this.granularMarkers = [];
        this.markerCounter = 1;
        this.recordingBuffer = null;
        this.bufferRecorder = null;
        this.recordingDuration = 10; // 10 seconds circular buffer
        this.granularScheduler = null;
        
        this.init();
    }
    
    init() {
        this.startButton = document.getElementById('start-audio');
        this.bpmInput = document.getElementById('bpm');
        this.timeModeSelect = document.getElementById('time-mode');
        this.inputModeSelect = document.getElementById('input-mode');
        this.dryVolumeSlider = document.getElementById('dry-volume');
        this.dryVolumeValue = document.getElementById('dry-volume-value');
        this.granularDryVolumeSlider = document.getElementById('granular-dry-volume');
        this.granularDryVolumeValue = document.getElementById('granular-dry-volume-value');
        this.channelsContainer = document.getElementById('channels-container');
        this.waveformCanvas = document.getElementById('waveform-canvas');
        this.canvasContext = this.waveformCanvas.getContext('2d');
        this.markerCanvas = document.getElementById('marker-canvas');
        this.markerContext = this.markerCanvas.getContext('2d');
        this.markersContainer = document.getElementById('granular-markers');
        
        this.startButton.addEventListener('click', () => this.toggleAudio());
        this.bpmInput.addEventListener('input', (e) => this.updateBpm(e.target.value));
        this.timeModeSelect.addEventListener('change', (e) => this.updateTimeMode(e.target.value));
        this.inputModeSelect.addEventListener('change', (e) => this.updateInputMode(e.target.value));
        this.dryVolumeSlider.addEventListener('input', (e) => this.updateDryVolume(e.target.value));
        this.granularDryVolumeSlider.addEventListener('input', (e) => this.updateGranularDryVolume(e.target.value));
        this.markerCanvas.addEventListener('dblclick', (e) => this.handleCanvasDoubleClick(e));
        
        this.setupCanvas();
        this.createAddChannelButton();
    }
    
    setupCanvas() {
        // Set canvas resolution to actual CSS size for both canvases
        const rect = this.waveformCanvas.getBoundingClientRect();
        
        // Waveform canvas (background)
        this.waveformCanvas.width = rect.width;
        this.waveformCanvas.height = rect.height;
        
        // Marker canvas (overlay)
        this.markerCanvas.width = rect.width;
        this.markerCanvas.height = rect.height;
        
        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
        
        // Initial clear of waveform canvas
        this.canvasContext.fillStyle = '#0a0a0a';
        this.canvasContext.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
    
    async setupBufferRecording() {
        try {
            // Load the AudioWorklet
            await this.audioContext.audioWorklet.addModule('./audio-worklets/buffer-recorder.js');
            
            // Create AudioWorkletNode for precise buffer recording
            this.bufferRecorder = new AudioWorkletNode(this.audioContext, 'buffer-recorder');
            
            // Handle messages from the worklet
            this.bufferRecorder.port.onmessage = (event) => {
                if (event.data.type === 'bufferData') {
                    // Create a new buffer from the worklet data
                    const workletBuffer = event.data.buffer;
                    const writeIndex = event.data.writeIndex;
                    const sampleRate = event.data.sampleRate;
                    
                    // Create a proper AudioBuffer from the worklet data
                    const bufferLength = workletBuffer.length;
                    this.recordingBuffer = this.audioContext.createBuffer(2, bufferLength, sampleRate);
                    
                    // Copy data from worklet buffer to AudioBuffer
                    const leftChannel = this.recordingBuffer.getChannelData(0);
                    const rightChannel = this.recordingBuffer.getChannelData(1);
                    
                    for (let i = 0; i < bufferLength; i++) {
                        leftChannel[i] = workletBuffer[i];
                        rightChannel[i] = workletBuffer[i]; // Mono for now
                    }
                }
            };
            
            // Connect to pre-granular output for recording (no feedback loop)
            this.preGranularOutput.connect(this.bufferRecorder);
            
        } catch (error) {
            console.error('Failed to setup AudioWorklet:', error);
            // Fallback to ScriptProcessorNode
            this.setupScriptProcessorFallback();
        }
    }
    
    setupScriptProcessorFallback() {
        // Fallback to ScriptProcessorNode if AudioWorklet fails
        const bufferSize = 4096;
        this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 2, 2);
        
        // Create circular buffer (10 seconds at sample rate)
        const bufferLength = this.audioContext.sampleRate * this.recordingDuration;
        this.recordingBuffer = this.audioContext.createBuffer(2, bufferLength, this.audioContext.sampleRate);
        this.bufferWritePosition = 0;
        
        this.scriptProcessor.onaudioprocess = (e) => {
            const inputBuffer = e.inputBuffer;
            const recordBuffer = this.recordingBuffer;
            
            for (let channel = 0; channel < Math.min(inputBuffer.numberOfChannels, 2); channel++) {
                const inputData = inputBuffer.getChannelData(channel);
                const recordData = recordBuffer.getChannelData(channel);
                
                let writePos = this.bufferWritePosition;
                for (let i = 0; i < inputBuffer.length; i++) {
                    recordData[writePos] = inputData[i];
                    writePos++;
                    
                    // Wrap around (circular buffer)
                    if (writePos >= recordBuffer.length) {
                        writePos = 0;
                    }
                }
            }
            
            // Update write position after all channels processed
            this.bufferWritePosition += inputBuffer.length;
            if (this.bufferWritePosition >= recordBuffer.length) {
                this.bufferWritePosition = this.bufferWritePosition % recordBuffer.length;
            }
        };
        
        // Connect to pre-granular output to record (passthrough - doesn't affect audio)
        this.preGranularOutput.connect(this.scriptProcessor);
        // Note: scriptProcessor is only used for recording, not playback
        // We don't connect it to destination to avoid doubling the audio
    }
    
    handleCanvasDoubleClick(e) {
        if (!this.isAudioStarted || !this.recordingBuffer) {
            alert('Please start audio first');
            return;
        }
        
        const rect = this.markerCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        // Calculate position in buffer (0-1)
        // Since waveform scrolls, we need to map X position to buffer position
        // The rightmost edge is the current write position
        const normalizedX = x / this.canvasWidth;
        
        // Create marker at this position
        this.createGranularMarker(normalizedX);
    }
    
    createGranularMarker(position) {
        const marker = new GranularMarker(
            this.audioContext,
            position,
            this.recordingBuffer,
            this.markerCounter++,
            this.granularScheduler
        );
        
        marker.onDestroy = (m) => {
            const index = this.granularMarkers.indexOf(m);
            if (index > -1) {
                this.granularMarkers.splice(index, 1);
            }
        };
        
        // Connect marker to master output
        marker.connectToDestination(this.masterOutput);
        
        // Start playing grains
        marker.start();
        
        this.granularMarkers.push(marker);
        this.markersContainer.appendChild(marker.element);
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
            
            // Create pre-granular output node (for recording and visualization)
            this.preGranularOutput = this.audioContext.createGain();
            this.preGranularOutput.gain.value = 1.0;
            
            // Create granular dry volume control (affects what we hear, not what gets recorded)
            this.granularDryGain = this.audioContext.createGain();
            this.granularDryGain.gain.value = 1.0; // Start at 100%
            
            // Create final master output node (includes granular synthesis)
            this.masterOutput = this.audioContext.createGain();
            this.masterOutput.gain.value = 1.0;
            
            // Create dry gain node for direct monitoring
            this.dryGain = this.audioContext.createGain();
            this.dryGain.gain.value = 0; // Start at 0 (muted)
            this.micSource.connect(this.dryGain);
            this.dryGain.connect(this.preGranularOutput);
            
            // Create analyser for waveform visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.3;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Connect pre-granular output to analyser (for waveform visualization)
            this.preGranularOutput.connect(this.analyser);
            
            // Connect pre-granular output to granular dry gain (for output volume control)
            this.preGranularOutput.connect(this.granularDryGain);
            
            // Connect granular dry gain to final master output
            this.granularDryGain.connect(this.masterOutput);
            
            // Connect final master output to destination
            this.masterOutput.connect(this.audioContext.destination);
            
            // Set up circular buffer recording for granular synthesis
            await this.setupBufferRecording();
            
            // Create granular scheduler for precise timing
            this.granularScheduler = new GranularScheduler(this.audioContext, this.masterOutput);
            
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
        
        // Stop and destroy granular scheduler
        if (this.granularScheduler) {
            this.granularScheduler.destroy();
            this.granularScheduler = null;
        }
        
        // Stop and destroy all granular markers
        [...this.granularMarkers].forEach(marker => marker.destroy());
        this.granularMarkers = [];
        this.markerCounter = 1;
        
        // Disconnect buffer recorder
        if (this.bufferRecorder) {
            this.bufferRecorder.disconnect();
            this.bufferRecorder = null;
        }
        
        // Disconnect granular dry gain
        if (this.granularDryGain) {
            this.granularDryGain.disconnect();
            this.granularDryGain = null;
        }
        
        // Disconnect script processor (fallback)
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor.onaudioprocess = null;
            this.scriptProcessor = null;
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
        
        // Clear canvases
        this.canvasContext.fillStyle = '#0a0a0a';
        this.canvasContext.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.markerContext.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
    
    addChannel() {
        const channel = new DelayChannel(
            this.audioContext,
            this.micSource,
            this.channelCounter++,
            this.bpm,
            this.timeMode
        );
        
        // Connect channel to pre-granular output (for recording and visualization)
        if (this.preGranularOutput) {
            channel.connectToDestination(this.preGranularOutput);
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
    
    updateGranularDryVolume(value) {
        const volume = value / 100;
        if (this.granularDryGain) {
            this.granularDryGain.gain.value = volume;
        }
        this.granularDryVolumeValue.textContent = `${value}%`;
    }
    
    drawWaveform() {
        if (!this.isAudioStarted) return;
        
        this.animationId = requestAnimationFrame(() => this.drawWaveform());
        
        // Get waveform data
        this.analyser.getByteTimeDomainData(this.dataArray);
        
        // Shift the waveform canvas to the left by 1 pixel
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
        
        // Draw markers on the separate overlay canvas
        this.drawGranularMarkers();
    }
    
    drawGranularMarkers() {
        // Clear the entire marker canvas each frame
        this.markerContext.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        
        const centerY = this.canvasHeight / 2;
        const now = Date.now();
        
        this.granularMarkers.forEach(marker => {
            const markerX = marker.position * this.canvasWidth;
            
            // Draw vertical marker line (semi-transparent)
            this.markerContext.strokeStyle = 'rgba(255, 107, 107, 0.6)';
            this.markerContext.lineWidth = 2;
            this.markerContext.setLineDash([5, 5]);
            this.markerContext.beginPath();
            this.markerContext.moveTo(markerX, 0);
            this.markerContext.lineTo(markerX, this.canvasHeight);
            this.markerContext.stroke();
            this.markerContext.setLineDash([]);
            
            // Draw marker circle at top
            this.markerContext.fillStyle = '#FF6B6B';
            this.markerContext.beginPath();
            this.markerContext.arc(markerX, 10, 6, 0, 2 * Math.PI);
            this.markerContext.fill();
            
            // Draw active grain particles
            marker.activeGrains.forEach(grain => {
                const age = now - grain.birthTime;
                const lifetime = grain.duration;
                const alpha = 1 - (age / lifetime); // Fade out over lifetime
                
                if (alpha > 0) {
                    const grainX = grain.position * this.canvasWidth;
                    const grainY = centerY + (Math.random() - 0.5) * 40; // Random Y around center
                    
                    // Draw grain particle
                    this.markerContext.fillStyle = `rgba(255, 107, 107, ${alpha * 0.8})`;
                    this.markerContext.beginPath();
                    this.markerContext.arc(grainX, grainY, 3, 0, 2 * Math.PI);
                    this.markerContext.fill();
                }
            });
        });
    }
}

