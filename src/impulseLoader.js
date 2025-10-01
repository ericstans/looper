// Impulse Response Loader
// This module loads impulse responses from the /public/impulses/ folder

// Try to dynamically load all mp3 and wav files from the impulses folder using webpack's require.context
let impulseResponses = [];

try {
    // Use webpack's require.context to load all mp3 and wav files
    const context = require.context('../public/impulses', false, /\.(mp3|wav)$/);
    impulseResponses = context.keys().map(key => {
        const fileName = key.replace('./', '');
        const nameWithoutExt = fileName.replace(/\.(mp3|wav)$/, '');
        return {
            name: nameWithoutExt,
            path: `/impulses/${fileName}`
        };
    });
} catch (e) {
    // If require.context fails, use an empty array
    // Users can manually add IRs here if needed
    console.log('No impulse responses found in /public/impulses/');
}

export function getAvailableImpulses() {
    return impulseResponses;
}

export async function loadImpulseResponse(audioContext, path) {
    try {
        const response = await fetch(path);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return audioBuffer;
    } catch (error) {
        console.error('Error loading impulse response:', error);
        return null;
    }
}

