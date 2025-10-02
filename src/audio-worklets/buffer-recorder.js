class BufferRecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 44100 * 10; // 10 seconds at 44.1kHz
        this.buffer = new Float32Array(this.bufferSize);
        this.writeIndex = 0;
        this.isRecording = true;
        
        // Message handler for control
        this.port.onmessage = (event) => {
            if (event.data.type === 'stop') {
                this.isRecording = false;
            }
        };
    }
    
    process(inputs, outputs, parameters) {
        if (!this.isRecording) {
            return false; // Stop the processor
        }
        
        const input = inputs[0];
        if (input.length > 0) {
            const inputChannel = input[0];
            
            // Write to circular buffer
            for (let i = 0; i < inputChannel.length; i++) {
                this.buffer[this.writeIndex] = inputChannel[i];
                this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
            }
            
            // Send current buffer state to main thread
            this.port.postMessage({
                type: 'bufferData',
                buffer: this.buffer,
                writeIndex: this.writeIndex,
                sampleRate: sampleRate
            });
        }
        
        // Pass audio through unchanged
        outputs[0] = inputs[0];
        return true;
    }
}

registerProcessor('buffer-recorder', BufferRecorderProcessor);
