import { getAvailableImpulses } from './impulseLoader.js';

export function createUI(channel) {
    const channelDiv = document.createElement('div');
    channelDiv.className = 'channel';
    channelDiv.id = `channel-${channel.channelNumber}`;
    
    // Get available impulse responses
    const availableImpulses = getAvailableImpulses();
    let irOptions = '<option value="">Default</option>';
    availableImpulses.forEach(ir => {
        irOptions += `<option value="${ir.path}">${ir.name}</option>`;
    });
    
    channelDiv.innerHTML = `
        <div class="channel-header">Channel ${channel.channelNumber}</div>
        
        <div class="control-group">
            <div class="control-label">Input</div>
            <div class="control-value" id="input-value-${channel.channelNumber}">50%</div>
            <div class="slider-container">
                <input type="range" min="0" max="100" value="50" 
                       id="input-slider-${channel.channelNumber}" 
                       class="input-slider">
            </div>
        </div>
        
        <div class="control-group">
            <div class="control-label">Feedback</div>
            <div class="control-value" id="feedback-value-${channel.channelNumber}">30%</div>
            <div class="slider-container">
                <input type="range" min="0" max="100" value="30" 
                       id="feedback-slider-${channel.channelNumber}" 
                       class="feedback-slider">
            </div>
        </div>
        
        <div class="control-group">
            <div class="control-label">Time</div>
            <div class="control-value" id="time-value-${channel.channelNumber}">500ms</div>
            <div class="slider-container" id="time-slider-container-${channel.channelNumber}">
                <input type="range" min="10" max="10000" value="500" 
                       id="time-slider-${channel.channelNumber}" 
                       class="time-slider">
            </div>
            <select class="time-select" id="time-select-${channel.channelNumber}" style="display:none;">
                <option value="1/1">Whole Note</option>
                <option value="1/2">Half Note</option>
                <option value="1/4" selected>Quarter Note</option>
                <option value="1/8">8th Note</option>
                <option value="1/16">16th Note</option>
                <option value="1/4T">Quarter Triplet</option>
                <option value="1/8T">8th Triplet</option>
                <option value="1/4D">Quarter Dotted</option>
                <option value="1/8D">8th Dotted</option>
            </select>
        </div>
        
            <div class="reverb-section">
                <div class="reverb-toggle">
                    <input type="checkbox" id="reverb-toggle-${channel.channelNumber}">
                    <label for="reverb-toggle-${channel.channelNumber}">Reverb</label>
                </div>
                <div class="reverb-controls" id="reverb-controls-${channel.channelNumber}">
                    <div class="reverb-knob">
                        <div class="control-label">Dry/Wet</div>
                        <div class="control-value" id="reverb-mix-value-${channel.channelNumber}">50%</div>
                        <input type="range" min="0" max="100" value="50" 
                               id="reverb-mix-${channel.channelNumber}">
                    </div>
                    <div class="reverb-knob">
                        <div class="control-label">Decay</div>
                        <div class="control-value" id="reverb-decay-value-${channel.channelNumber}">50%</div>
                        <input type="range" min="0" max="100" value="50" 
                               id="reverb-decay-${channel.channelNumber}">
                    </div>
                    <div class="reverb-knob">
                        <div class="control-label">IR</div>
                        <select class="ir-select" id="ir-select-${channel.channelNumber}">
                            ${irOptions}
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="control-group">
                <div class="control-label">Volume</div>
                <div class="control-value" id="volume-value-${channel.channelNumber}">100%</div>
                <div class="slider-container">
                    <input type="range" min="0" max="100" value="100" 
                           id="volume-slider-${channel.channelNumber}" 
                           class="volume-slider">
                </div>
            </div>
            
            <button class="reset-channel" id="reset-channel-${channel.channelNumber}">RESET</button>
            <button class="remove-channel" id="remove-channel-${channel.channelNumber}">Remove</button>
        `;
        
        channel.element = channelDiv;
        attachEventListeners(channel);
    }

function attachEventListeners(channel) {
    const inputSlider = channel.element.querySelector(`#input-slider-${channel.channelNumber}`);
    const feedbackSlider = channel.element.querySelector(`#feedback-slider-${channel.channelNumber}`);
    const timeSlider = channel.element.querySelector(`#time-slider-${channel.channelNumber}`);
    const timeSelect = channel.element.querySelector(`#time-select-${channel.channelNumber}`);
    const reverbToggle = channel.element.querySelector(`#reverb-toggle-${channel.channelNumber}`);
    const reverbMixSlider = channel.element.querySelector(`#reverb-mix-${channel.channelNumber}`);
    const reverbDecaySlider = channel.element.querySelector(`#reverb-decay-${channel.channelNumber}`);
    const irSelect = channel.element.querySelector(`#ir-select-${channel.channelNumber}`);
    const volumeSlider = channel.element.querySelector(`#volume-slider-${channel.channelNumber}`);
    const resetButton = channel.element.querySelector(`#reset-channel-${channel.channelNumber}`);
    const removeButton = channel.element.querySelector(`#remove-channel-${channel.channelNumber}`);
    
    inputSlider.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        channel.inputGain.gain.value = value;
        channel.element.querySelector(`#input-value-${channel.channelNumber}`).textContent = `${e.target.value}%`;
    });
    
    feedbackSlider.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        channel.feedbackGain.gain.value = value;
        channel.element.querySelector(`#feedback-value-${channel.channelNumber}`).textContent = `${e.target.value}%`;
    });
    
    timeSlider.addEventListener('input', (e) => {
        const ms = parseFloat(e.target.value);
        channel.setDelayTime(ms);
        channel.element.querySelector(`#time-value-${channel.channelNumber}`).textContent = `${Math.round(ms)}ms`;
    });
    
    timeSelect.addEventListener('change', (e) => {
        channel.setBpmSyncedTime(e.target.value);
        channel.element.querySelector(`#time-value-${channel.channelNumber}`).textContent = e.target.value;
    });
    
    reverbToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        channel.enableReverb(enabled);
        const controls = channel.element.querySelector(`#reverb-controls-${channel.channelNumber}`);
        if (enabled) {
            controls.classList.add('active');
        } else {
            controls.classList.remove('active');
        }
    });
    
    reverbMixSlider.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        channel.updateReverbMix(value);
        channel.element.querySelector(`#reverb-mix-value-${channel.channelNumber}`).textContent = `${e.target.value}%`;
    });
    
    reverbDecaySlider.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        channel.updateReverbDecay(value);
        channel.element.querySelector(`#reverb-decay-value-${channel.channelNumber}`).textContent = `${e.target.value}%`;
    });
    
    irSelect.addEventListener('change', (e) => {
        channel.loadImpulseResponse(e.target.value);
    });
    
    volumeSlider.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        channel.outputGain.gain.value = value;
        channel.element.querySelector(`#volume-value-${channel.channelNumber}`).textContent = `${e.target.value}%`;
    });
    
    resetButton.addEventListener('click', () => {
        channel.reset();
    });
    
    removeButton.addEventListener('click', () => {
        channel.destroy();
    });
}

export function updateTimeMode(channel, mode) {
    channel.timeMode = mode;
    const timeSlider = channel.element.querySelector(`#time-slider-${channel.channelNumber}`);
    const timeSelect = channel.element.querySelector(`#time-select-${channel.channelNumber}`);
    
    if (mode === 'bpm') {
        timeSlider.style.display = 'none';
        timeSelect.style.display = 'block';
        channel.setBpmSyncedTime(channel.currentBpmDivision);
        channel.element.querySelector(`#time-value-${channel.channelNumber}`).textContent = channel.currentBpmDivision;
    } else {
        timeSlider.style.display = 'block';
        timeSelect.style.display = 'none';
        channel.setDelayTime(channel.currentDelayMs);
        channel.element.querySelector(`#time-value-${channel.channelNumber}`).textContent = `${Math.round(channel.currentDelayMs)}ms`;
    }
}

