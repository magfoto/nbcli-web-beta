/**
 * nbcli-web - RNBO Manager
 * 
 * Manages audio synthesis using Cycling 74's RNBO (Run Node for Browser Objects)
 * RNBO allows Max patches to be exported as JSON and run in browsers
 * 
 * For more information: https://rnbo.cycling74.com/
 */

const RNBOManager = {
    // State
    audioContext: null,
    devices: {},
    isReady: false,
    patches: {},
    midiAccess: null,
    midiInputs: [],
    midiOutputs: [],
    
    // RNBO patch folder path
    patchFolder: 'patches/',
    
    // Base URL for external files (WAV samples, etc.)
    externalFileBaseUrl: '',
    
    // Web Audio is not used - RNBO handles audio, or external MIDI instruments
    // MIDI notes are only sent to RNBO devices, not to Web Audio API
    useWebAudioFallback: false,
    
    // Channel to instrument mapping (configurable)
    channelInstruments: [
        'kick', 'snare', 'tom', 'sine', 'triangle', 'sawtooth',
        'noise', 'bass', 'lead', 'arp', 'pad', 'fx',
        'drum1', 'drum2', 'drum3', 'drum4'
    ],
    
    // Initialize RNBO
    // Note: AudioContext must be created after a user gesture
    init: async function() {
        try {
            // Wait for RNBO library to load
            let attempts = 0;
            let rnboReady = false;
            while (!rnboReady && attempts < 10) {
                console.log('Waiting for RNBO library to load...');
                // Check if RNBO global exists and has createDevice
                rnboReady = (typeof RNBO !== 'undefined' && typeof RNBO.createDevice === 'function');
                if (!rnboReady) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    attempts++;
                }
            }
            
            if (!rnboReady) {
                console.warn('RNBO library not found after waiting. Check that the CDN URL is accessible. Falling back to basic Web Audio API.');
                this.isReady = true;
                return false;
            }
            
            console.log('RNBO library found, initializing...');
            console.log('RNBO:', typeof RNBO);
            console.log('RNBO.createDevice:', typeof RNBO.createDevice);
            
            this.isReady = true;
            console.log('RNBO Manager: Initialized successfully');
            
            // Try to get MIDI access
            this.setupMidi().catch(e => {
                console.warn('MIDI setup failed (continuing with audio only):', e);
            });
            
            return true;
            
        } catch (e) {
            console.error('Failed to initialize RNBO:', e);
            this.isReady = true;
            return false;
        }
    },
    
    // Ensure AudioContext is available (create if needed after user gesture)
    ensureAudioContext: async function() {
        if (this.audioContext && this.audioContext.state !== 'closed') {
            // Handle suspended state
            if (this.audioContext.state === 'suspended') {
                try {
                    await this.audioContext.resume();
                    console.log('AudioContext resumed');
                } catch (e) {
                    console.warn('Cannot resume AudioContext:', e);
                }
            }
            return this.audioContext;
        }
        
        // AudioContext was blocked, create it now with user gesture
        try {
            const WAContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new WAContext();
            console.log('AudioContext created');
            
            // Handle suspended state
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                console.log('AudioContext resumed');
            }
            
            return this.audioContext;
        } catch (e) {
            console.error('Cannot create AudioContext:', e);
            throw new Error('Cannot create AudioContext. Please click on the page first.');
        }
    },
    
    // Setup Web MIDI API
    setupMidi: async function() {
        if (!navigator.requestMIDIAccess) {
            console.warn('Web MIDI API not supported in this browser');
            return;
        }
        
        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            console.log('MIDI access granted');
            
            // List available MIDI devices
            const inputs = Array.from(this.midiAccess.inputs.values());
            const outputs = Array.from(this.midiAccess.outputs.values());
            
            this.midiInputs = inputs;
            this.midiOutputs = outputs;
            
            console.log(`Found ${inputs.length} MIDI inputs, ${outputs.length} MIDI outputs`);
            
            // Set up MIDI input listeners
            inputs.forEach(input => {
                this.setupMidiInput(input);
            });
            
            // Listen for device changes
            this.midiAccess.onstatechange = (event) => {
                console.log('MIDI device state change:', event);
                this.setupMidi();
            };
            
        } catch (error) {
            console.warn('MIDI access denied:', error);
        }
    },
    
    // Set up a MIDI input device
    setupMidiInput: function(input) {
        input.onmidimessage = (message) => {
            const [command, note, velocity] = message.data;
            const status = command >> 4;
            const channel = command & 0x0F;
            
            console.log(`MIDI: status=${status} channel=${channel} note=${note} velocity=${velocity}`);
            
            // Handle note on/off
            if (status === 9) { // Note on
                if (velocity > 0) {
                    this.playMidiNote(note, velocity, channel);
                } else {
                    this.stopMidiNote(note, channel);
                }
            } else if (status === 8) { // Note off
                this.stopMidiNote(note, channel);
            }
        };
        
        console.log(`MIDI input ready: ${input.name}`);
    },
    
    // Play a MIDI note
    playMidiNote: async function(note, velocity, channel = 0) {
        if (!this.isReady) {
            console.warn('RNBO not ready');
            return { error: 'RNBO not ready' };
        }
        
        const freq = 440 * Math.pow(2, (note - 69) / 12); // MIDI note 69 = A440
        const gain = velocity / 127;
        
        // Map channel to instrument
        const instrument = this.channelInstruments[channel % this.channelInstruments.length];
        
        console.log(`RNBO MIDI note on: ch=${channel} (${instrument}) note=${note} (${freq.toFixed(1)}Hz) vel=${velocity}`);
        
        try {
            // Ensure audio context is available (needed for RNBO even if not connected to output)
            await this.ensureAudioContext();
            
            // Send MIDI to RNBO devices
            // CRITICAL INSIGHT: In RNBO.js, devices created with createDevice DO have a send() method
            // but it needs to be called with the correct inlet index.
            // From spk.json: inlets[0] = event ("in1"), inlets[1] = midi
            // So MIDI inlet index is 1, not 0!
            
            if (Object.keys(this.devices).length > 0) {
                Object.values(this.devices).forEach(device => {
                    if (!device) return;
                    
                    const midiMessage = [0x90 + channel, note, velocity];
                    const midiMessageStr = JSON.stringify(midiMessage);
                    
                    // CRITICAL: Find the correct MIDI inlet index from the patch
                    const patchName = Object.keys(this.devices).find(k => this.devices[k] === device);
                    const patchDesc = this.patches[patchName]?.desc;
                    const midiInletIndex = patchDesc?.inlets?.findIndex(inlet => inlet.type === 'midi');
                    
                    console.log(`[MIDI] Attempting to send to device ${patchName}, MIDI inlet index: ${midiInletIndex}, has send: ${typeof device.send === 'function'}`);
                    
                    // METHOD 1: Try device.send() with correct inlet index
                    if (typeof device.send === 'function') {
                        const inletIndex = midiInletIndex !== undefined ? midiInletIndex : 1; // Default to 1 for spk
                        try {
                            device.send(inletIndex, midiMessage);
                            console.log(`[MIDI] Successfully sent to inlet ${inletIndex}`);
                            return;
                        } catch (e) {
                            console.warn(`[MIDI] device.send(${inletIndex}, ...) failed:`, e.message);
                            
                            // Try all possible inlet indices
                            for (let i = 0; i < 4; i++) {
                                try {
                                    device.send(i, midiMessage);
                                    console.log(`[MIDI] Successfully sent to inlet ${i} after fallback`);
                                    return;
                                } catch (e2) {
                                    // Continue trying
                                }
                            }
                            
                            // Try without inlet index
                            try {
                                device.send(midiMessage);
                                console.log(`[MIDI] Successfully sent without inlet index`);
                                return;
                            } catch (e3) {
                                console.warn(`[MIDI] device.send() all attempts failed`);
                            }
                        }
                    }
                    
                    // METHOD 2: If device has no send method, this is a critical API issue
                    // In this case, RNBO devices might only receive from Web MIDI automatically
                    if (typeof device.send !== 'function') {
                        // This is unexpected - device should have send() method
                        if (!device._noSendMethodLogged) {
                            device._noSendMethodLogged = true;
                            console.error('[MIDI] CRITICAL: RNBO device has no send() method!', {
                                hasSend: typeof device.send === 'function',
                                hasSendInternal: typeof device._send === 'function',
                                keys: Object.keys(device).filter(k => k.startsWith('send') || k.startsWith('midi'))
                            });
                            console.error('[MIDI] RNBO devices receive MIDI from Web MIDI automatically. Orca must send to Web MIDI.');
                            console.error('[MIDI] Make sure Orca has a MIDI output device selected in its MIDI settings.');
                        }
                    }
                });
            } else if (this.useWebAudioFallback) {
                // Fallback to Web Audio API only if enabled
                this.playWebAudioNote(freq, gain, channel);
            } else {
                console.log('No RNBO devices and Web Audio fallback disabled - MIDI note not played');
            }
            
            return { output: `Note on: ch=${channel} ${instrument} ${note} (${freq.toFixed(1)}Hz)` };
        } catch (error) {
            console.error('Error playing MIDI note:', error);
            return { error: `Audio error: ${error.message}. Try clicking on the page first.` };
        }
    },
    
    // Stop a MIDI note
    stopMidiNote: function(note, channel = 0) {
        if (!this.isReady) {
            return { error: 'RNBO not ready' };
        }
        
        console.log(`RNBO MIDI note off: ch=${channel} note=${note}`);
        
        // Send MIDI note off to RNBO devices
        if (Object.keys(this.devices).length > 0) {
            const noteOffMessage = [0x80 + channel, note, 0];
            Object.values(this.devices).forEach(device => {
                if (!device) return;
                
                // Find the MIDI inlet index from the patch description
                const patchName = Object.keys(this.devices).find(k => this.devices[k] === device);
                const patchDesc = this.patches[patchName]?.desc;
                const midiInletIndex = patchDesc?.inlets?.findIndex(inlet => inlet.type === 'midi') || 1;
                
                // Try device.send() with the correct MIDI inlet index
                if (typeof device.send === 'function') {
                    try {
                        device.send(midiInletIndex, noteOffMessage);
                        return;
                    } catch (e) {
                        // Try all possible inlet indices as fallback
                        for (let i = 0; i < 4; i++) {
                            try {
                                device.send(i, noteOffMessage);
                                return;
                            } catch (e2) {
                                // Continue
                            }
                        }
                        // Try without inlet index
                        try {
                            device.send(noteOffMessage);
                            return;
                        } catch (e3) {
                            // Final fallback - ignore
                        }
                    }
                }
            });
        }
        
        return { output: `Note off: ch=${channel} note=${note}` };
    },
    
    // Play note using Web Audio API (fallback)
    playWebAudioNote: function(freq, gain, channel = 0) {
        // Ensure we have an audio context
        if (!this.audioContext || this.audioContext.state === 'closed') {
            try {
                const WAContext = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new WAContext();
            } catch (e) {
                console.error('Cannot create AudioContext:', e);
                return { error: 'Cannot create audio context. Try clicking on the page.' };
            }
        }
        
        // Handle suspended state
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        // Map channel to oscillator type
        const types = ['sine', 'square', 'sawtooth', 'triangle'];
        oscillator.type = types[channel % types.length];
        oscillator.frequency.value = freq;
        
        gainNode.gain.value = gain * 0.3;
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        oscillator.start();
        
        // Auto-stop after 1 second
        setTimeout(() => {
            gainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
            gainNode.gain.setValueAtTime(gainNode.gain.value, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
            
            setTimeout(() => {
                oscillator.stop();
                gainNode.disconnect();
            }, 100);
        }, 1000);
        
        return { output: `Playing ${freq.toFixed(1)}Hz with ${oscillator.type} wave` };
    },
    
    // Extract external file dependencies from patch JSON
    getExternalFileDependencies: function(patchJson) {
        const dependencies = [];
        
        if (!patchJson) {
            return dependencies;
        }
        
        // Check for RNBO export format (externalDataRefs in desc)
        if (patchJson.desc && patchJson.desc.externalDataRefs) {
            patchJson.desc.externalDataRefs.forEach(ref => {
                if (ref.file) {
                    dependencies.push(ref.file);
                }
            });
            return dependencies;
        }
        
        // Check for legacy format (objects array)
        if (patchJson.objects) {
            patchJson.objects.forEach(obj => {
                if (obj.type === 'buffer~') {
                    if (obj.args && obj.args.length > 0) {
                        dependencies.push(obj.args[0]);
                    }
                }
            });
        }
        
        return dependencies;
    },
    
    // Preload external files (WAV, etc.)
    preloadExternalFiles: async function(filePaths, baseUrl) {
        const promises = filePaths.map(filePath => {
            // Properly encode the file path for URLs (handle spaces, etc.)
            const encodedFilePath = encodeURI(filePath);
            const url = baseUrl + encodedFilePath;
            return fetch(url, { method: 'HEAD' })
                .then(response => {
                    if (!response.ok) {
                        console.warn(`External file not found: ${url} (status: ${response.status})`);
                        throw new Error(`File not found: ${filePath}`);
                    }
                    console.log(`External file available: ${url}`);
                    return url;
                })
                .catch(error => {
                    console.error(`Error checking external file ${filePath}:`, error);
                    // Try without encoding (for servers that don't handle encoded URLs well)
                    const urlWithoutEncoding = baseUrl + filePath;
                    return fetch(urlWithoutEncoding, { method: 'HEAD' })
                        .then(response2 => {
                            if (response2.ok) {
                                console.log(`External file available (no encoding): ${urlWithoutEncoding}`);
                                return urlWithoutEncoding;
                            }
                            throw new Error(`File not found: ${filePath}`);
                        })
                        .catch(error2 => {
                            console.error(`Error checking external file ${filePath} (no encoding):`, error2);
                            return null;
                        });
                });
        });
        
        return Promise.all(promises);
    },
    
    // Load an RNBO patch (JSON format)
    loadPatch: async function(patchName) {
        if (!this.isReady) {
            return { error: 'RNBO Manager not ready. Please wait for initialization.' };
        }
        
        // Check if RNBO library is available
        if (typeof RNBO === 'undefined' || typeof RNBO.createDevice !== 'function') {
            return { 
                error: 'RNBO library not loaded. Add <script src="https://cdn.cycling74.com/rnbo/1.4.4/rnbo.min.js"></script> to your HTML. Restart your server after adding.' 
            };
        }
        
        const url = this.patchFolder + patchName;
        
        return fetch(url)
            .then(async response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(async (patchJson) => {
                console.log(`Loaded RNBO patch: ${patchName}`);
                
                // Note: RNBO handles loading its own external files automatically
                // We don't need to preload them manually
                const externalFiles = this.getExternalFileDependencies(patchJson);
                if (externalFiles.length > 0) {
                    console.log(`Patch has ${externalFiles.length} external file dependencies:`, externalFiles);
                    console.log('RNBO will load these files automatically when the device is created.');
                }
                
                // Create device from patch
                return this.createDevice(patchJson, patchName);
            })
            .catch(error => {
                console.error(`Error loading RNBO patch ${patchName}:`, error);
                return { error: `Failed to load ${patchName}: ${error.message}` };
            });
    },
    
    // Create an RNBO device from patch JSON
    createDevice: async function(patchJson, name) {
        // Check if RNBO library is available
        if (typeof RNBO === 'undefined' || typeof RNBO.createDevice !== 'function') {
            return { error: 'RNBO.createDevice function not available. Make sure RNBO library is loaded from https://cdn.cycling74.com/rnbo/1.4.4/rnbo.min.js' };
        }
        
        try {
            // Ensure audio context is available (needed for RNBO)
            await this.ensureAudioContext();
            
            // Check if device already exists
            if (this.devices[name]) {
                this.destroyDevice(name);
            }
            
            // Create the device using RNBO.createDevice function
            // RNBO.js API: RNBO.createDevice({ context, patcher, options })
            // Set baseUrl to allow RNBO to find external files
            // The patch references files as "../media/..." so we need to resolve from the patches directory
            const device = await RNBO.createDevice({
                context: this.audioContext,
                patcher: patchJson,
                options: {
                    // Set baseUrl to the patches directory so "../media/..." resolves correctly
                    baseUrl: this.patchFolder,
                    // Explicitly request MIDI input/output ports based on patch requirements
                    numMidiInputPorts: patchJson.desc?.numMidiInputPorts || 0,
                    numMidiOutputPorts: patchJson.desc?.numMidiOutputPorts || 0
                }
            });
            
            // Connect to audio context via silent gain node to prevent blocking other instruments
            // RNBO needs a complete audio graph to process MIDI properly
            if (device.node) {
                // Create a silent gain node to absorb RNBO's audio output
                const silentGain = this.audioContext.createGain();
                silentGain.gain.value = 0;
                device.node.connect(silentGain);
                silentGain.connect(this.audioContext.destination);
                console.log('RNBO device connected to silent output');
            }
            
            // Log device MIDI capabilities
            console.log(`Device MIDI input ports: ${device.numMidiInputPorts || 0}`);
            console.log(`Device MIDI output ports: ${device.numMidiOutputPorts || 0}`);
            console.log(`Device has midiInput: ${!!device.midiInput}`);
            console.log(`Device has midiOutput: ${!!device.midiOutput}`);
            if (device.midiInput) {
                console.log(`Device midiInput type: ${typeof device.midiInput}`);
                console.log(`Device midiInput has send: ${typeof device.midiInput.send === 'function'}`);
            }
            
            // Store device
            this.devices[name] = device;
            this.patches[name] = patchJson;
            
            console.log(`Created RNBO device: ${name}`);
            console.log('Device object:', device);
            return { output: `Created RNBO device: ${name}` };
            
        } catch (error) {
            console.error(`Error creating RNBO device ${name}:`, error);
            return { error: `Failed to create device: ${error.message}` };
        }
    },
    
    // Destroy an RNBO device
    destroyDevice: function(name) {
        if (!this.devices[name]) {
            return { error: `Device ${name} not found` };
        }
        
        const device = this.devices[name];
        if (device.node) {
            device.node.disconnect();
        }
        if (device.destroy) {
            device.destroy();
        }
        
        delete this.devices[name];
        delete this.patches[name];
        
        console.log(`Destroyed RNBO device: ${name}`);
        return { output: `Destroyed RNBO device: ${name}` };
    },
    
    // Play a specific patch
    play: async function(patchName, args = []) {
        if (!this.devices[patchName]) {
            // Try to load the patch first
            const result = await this.loadPatch(patchName);
            if (result && result.error) {
                return result;
            }
            // Wait a bit for device creation
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const device = this.devices[patchName];
        if (!device) {
            return { error: `Device ${patchName} not found` };
        }
        
        // Send arguments as messages if device has input
        if (device && device.inputs) {
            args.forEach((arg, index) => {
                if (device.inputs[index]) {
                    device.setInputValue(index, parseFloat(arg));
                }
            });
        }
        
        console.log(`Playing RNBO patch: ${patchName} with args: [${args.join(', ')}]`);
        return { output: `Playing ${patchName} with args: [${args.join(', ')}]` };
    },
    
    // Stop all sounds
    stop: function() {
        // Stop all RNBO devices
        Object.keys(this.devices).forEach(name => {
            const device = this.devices[name];
            if (device.node) {
                device.node.disconnect();
            }
            if (device.destroy) {
                device.destroy();
            }
        });
        
        this.devices = {};
        this.patches = {};
        
        console.log('Stopped all RNBO devices');
        return { output: 'Stopped all RNBO devices' };
    },
    
    // List loaded patches
    list: function() {
        const deviceNames = Object.keys(this.devices);
        const patchNames = Object.keys(this.patches);
        
        return {
            output: `RNBO Manager: ${this.isReady ? 'Ready' : 'Not ready'}. ` +
                   `RNBO available: ${(typeof RNBO !== 'undefined' && typeof RNBO.createDevice === 'function')}. ` +
                   `Devices: [${deviceNames.join(', ')}]. ` +
                   `Patches: [${patchNames.join(', ')}]. ` +
                   `Patch folder: ${this.patchFolder}`
        };
    },
    
    // Evaluate raw RNBO code (if supported)
    eval: function(code) {
        if (!this.isReady) {
            return { error: 'RNBO not ready' };
        }
        
        console.log(`RNBO eval: ${code}`);
        
        return { output: `Evaluated: ${code} (RNBO code evaluation not yet implemented)` };
    },
    
    // Connect to RNBO server (for advanced use cases)
    connect: function(host, port) {
        console.log(`RNBO connect: ${host}:${port}`);
        return { output: `RNBO connection placeholder - implement for server connection` };
    },
    
    // Check if RNBO is ready and loaded
    checkReady: function() {
        return {
            ready: this.isReady,
            rnboLoaded: (typeof RNBO !== 'undefined' && typeof RNBO.createDevice === 'function'),
            audioContext: !!this.audioContext,
            audioContextState: this.audioContext ? this.audioContext.state : 'null',
            devices: Object.keys(this.devices),
            patches: Object.keys(this.patches)
        };
    },

    // Enable or disable Web Audio fallback
    // When disabled, MIDI notes will only be sent to RNBO devices
    // Useful when using external MIDI instruments instead of browser audio
    setUseWebAudioFallback: function(enable) {
        this.useWebAudioFallback = enable;
        console.log(`Web Audio fallback ${enable ? 'enabled' : 'disabled'}`);
        return { output: `Web Audio fallback ${enable ? 'enabled' : 'disabled'}` };
    },

    // Get current Web Audio fallback setting
    getUseWebAudioFallback: function() {
        return {
            output: `Web Audio fallback is ${this.useWebAudioFallback ? 'enabled' : 'disabled'}`
        };
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        RNBOManager.init();
    });
} else {
    RNBOManager.init();
}

// Export to window for access from other scripts
window.RNBOManager = RNBOManager;
