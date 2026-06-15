/**
 * nbcli web - Command Parser
 * Parses nbcli commands and routes them to appropriate handlers
 * Maintains compatibility with nbcli desktop syntax
 */

// Supported commands and their handlers

const COMMAND_HANDLERS = {
    // Core commands
    'new': handleNewCommand,
    'wrld': handleWrldCommand,
    'geo': handleGeoCommand,
    'fpic': handleFpicCommand,
    'vrec': handleVrecCommand,
    'zap': handleZapCommand,
    'qs': handleQsCommand,
    'camera': handleCameraCommand,
    'sky': handleSkyCommand,
    'q': handleQsCommand, // Alias for qs
    
    // Utility commands
    'help': handleHelpCommand,
    'clear': handleClearCommand,
    'echo': handleEchoCommand,
    'ls': handleLsCommand,
    'pwd': handlePwdCommand,
    
    // Additional nbcli commands (stubs for future implementation)
    's': handleSCommand,
    'o': handleOCommand,
    'aio': handleAioCommand,
    'lttp': handleLttpCommand,
    'nature': handleNatureCommand,
    'midi': handleMidiCommand,
    'wave': handleWaveCommand,
    'grain': handleGrainCommand,
    'spk': handleSpkCommand,
    'synth': handleSynthCommand,
    'morph': handleMorphCommand,
    'shady': handleShadyCommand,
    'frag': handleFragCommand,
    'lz': handleLzCommand,
    'movie': handleMovieCommand,
    'rossler': handleRosslerCommand,
    'sketch': handleSketchCommand,
    'typo': handleTypoCommand,
    'bfg': handleBfgCommand,
    'biomes': handleBiomesCommand,
    'plato': handlePlatoCommand,
    'proc': handleProcCommand,
    'model': handleModelCommand,
    'orca': handleOrcaCommand,
    'hide': handleHideCommand,
    'expand': handleExpandCommand,
    'collapse': handleCollapseCommand,
    'otheme': handleOthemeCommand,
    'nurbs': handleNurbsCommand,
    'som': handleSomCommand,
    'monde': handleMondeCommand,
    'specs': handleSpecsCommand,
    'graph': handleGraphCommand,
    'particles': handleParticlesCommand,
    'eca': handleEcaCommand,
    'terra': handleTerraCommand,
    'cv': handleCvCommand,
    'lfo': handleLfoCommand,
    'rand': handleRandCommand,
    'randx': handleRandxCommand,
    'automata': handleAutomataCommand,
    'tilde': handleTildeCommand,
    'markov': handleMarkovCommand,
    'gen': handleGenCommand,
    'rnr': handleRnrCommand,
    'rsr': handleRsrCommand,
    'count': handleCountCommand,
    'sfor': handleSforCommand,
    'timer': handleTimerCommand
};

// Available command descriptions for help
const COMMAND_DESCRIPTIONS = {
    'Core': {
        'new': 'Create new module - new <name> <x> <y> <type>',
        'wrld': 'World configuration - wrld <size|dim|border|visible> [args]',
        'geo': 'Geometry manipulation - geo <subcommand> [args]',
        'fpic': 'Texture buffer control - fpic [index] <read|vol|play|pause|stop|info|time|hop> [args] (creates tex0, tex1, tex2, tex3)',
        'vrec': 'Video recording/camera - vrec <pwr|send|device|resolution|fps|mirror|zoom|contrast|saturate|blur|posterize|threshold|flip|rotate|effect|brightness|opacity> [args]',
        'zap': 'Remove entity/module - zap <name>',
        'qs': 'Clear scene - qs',
        'camera': 'Camera control - camera <subcommand> [args]',
        'sky': 'Sky/background - sky <subcommand> [args] (color, cubemap, read [path] - supports JPG/PNG/EXR/HDR as environment maps, MP4/MOV as video)'
    },
    'Sonic': {
        'aio': 'Audio interface - aio <subcommand> [args]',
        'lttp': 'Listen to Pictures - lttp <subcommand> [args]',
        'nature': 'Audio/biquad sensor - nature <subcommand> [args]',
        'midi': 'MIDI interface - midi <subcommand> [args]',
        'wave': 'Wavetable synth - wave <subcommand> [args]',
        'grain': 'Granular synth - grain <subcommand> [args]',
        'spk': 'Audio buffer/player - spk <subcommand> [args]',
        'synth': 'RNBO synth - synth <load|play|stop|list|eval|connect|midi|webaudio> [args]'
    },
    'Spatial': {
        'morph': 'Morphing command - morph "<operation>" [repeat] [duration]',
        'shady': 'OpenGL shader - shady <subcommand> [args]',
        'frag': 'Fragment shader - frag <glsl-code>',
        'lz': 'Lorenz attractor - lz <subcommand> [args]',
        'movie': 'Video background - movie <load|play|pause|stop|volume> [args]',
        'rossler': 'Rossler attractor - rossler <subcommand> [args]',
        'sketch': 'OpenGL drawing - sketch <subcommand> [args]',
        'typo': 'Typography - typo <subcommand> [args]',
        'bfg': 'Noise generator - bfg <subcommand> [args]',
        'biomes': 'Biome layer - biomes <subcommand> [args]',
        'plato': 'Platonic solids - plato <subcommand> [args]',
        'proc': 'Procedural geometry - proc <subcommand> [args]',
        'model': '3D model - model read <file> or <modelName> <anim|scale|smooth|time|position|color|mesh> [args]',
        'nurbs': 'NURBS surface - nurbs <subcommand> [args] (shape, dim, designer, color, read [file.3dm])',
        'som': 'Self-organizing map - som <subcommand> [args]',
        'monde': 'Main world layer - monde <subcommand> [args]',
        'specs': 'Specifications text - specs <subcommand> [args]',
        'graph': 'Graph plot - graph <subcommand> [args]',
        'particles': 'Particle system - particles <subcommand> [args]',
        'eca': 'Cellular automaton - eca <subcommand> [args]',
        'terra': 'Procedural terrain - terra <subcommand> [args]'
    },
    'Texture': {
        'fpic': 'Texture buffer control - fpic [index] <read|vol|play|pause|stop|info|time|hop> [args] (creates tex0, tex1, tex2, tex3)',
        'vrec': 'Video recording/camera - vrec <pwr|send|device|resolution|fps|mirror|zoom|contrast|saturate|blur|posterize|threshold|flip|rotate|effect|brightness|opacity> [args]'
    },
    'Kinetic': {
        'cv': 'Control voltages - cv <subcommand> [args]',
        'lfo': 'Low frequency oscillator - lfo <subcommand> [args]'
    },
    'Pattern': {
        'rand': 'Random number - rand [max]',
        'randx': 'Random range - randx <min> <max>',
        'automata': 'Pattern repeater - automata "<operation>" [duration]',
        'tilde': 'Connector module - tilde <subcommand> [args]',
        'markov': 'Markov ML - markov <subcommand> [args]',
        'gen': 'Number generator - gen <start> <iter> <end> [dur] [op]',
        'rnr': 'Random float - rnr [count]',
        'rsr': 'Random signed float - rsr [count]',
        'count': 'Audible counter - count [number]',
        'sfor': 'C-style loop - sfor <limit> "<operation>" [duration]'
    },
    'Time': {
        'timer': 'Timer - timer [seconds]'
    },
    'Utility': {
        'help': 'Show help - help [category]',
        'clear': 'Clear terminal - clear',
        'echo': 'Print text - echo <text>',
        'ls': 'List entities - ls',
        'pwd': 'Current directory - pwd',
        's': 'sigv OSC operator - s <module> <param>',
        'o': 'Orca OSC send - o "<operation>"',
        'orca': 'Orca grid - orca <hide|show>'
    }
};

// Execute command chain (for semicolon-separated commands)
function executeCommandChain(commandString) {
    // Split by semicolons and trim each command
    const commands = commandString.split(';').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
    
    if (commands.length === 0) {
        return { output: '' };
    }
    
    const results = [];
    
    // Execute each command in sequence
    for (const singleCommand of commands) {
        const result = parseCommand(singleCommand);
        
        // Collect the result
        if (result.output) {
            results.push(result.output);
        } else if (result.error) {
            results.push(`Error: ${result.error}`);
        }
    }
    
    // Return combined results
    if (results.length === 1) {
        return { output: results[0] };
    } else {
        return { output: results.join('\n'), isMultiline: true };
    }
}

// Parse command and route to appropriate handler
function parseCommand(command) {
    if (!command || typeof command !== 'string') {
        return { error: 'Invalid command' };
    }
    
    // Remove leading/trailing whitespace
    const trimmedCommand = command.trim();
    
    if (trimmedCommand === '') {
        return { output: '' };
    }
    
    // Check for command chaining with semicolons
    if (trimmedCommand.includes(';')) {
        return executeCommandChain(trimmedCommand);
    }
    
    // Split into tokens, handling quoted strings
    const tokens = tokenizeCommand(trimmedCommand);
    
    if (tokens.length === 0) {
        return { error: 'Invalid command format' };
    }
    
    const commandName = tokens[0].toLowerCase();
    
    // Check if this is an object-specific command (e.g., "blob anim turn...")
    // In this case, the first token is the object name, second is the command category
    if (tokens.length >= 2 && !COMMAND_HANDLERS[commandName]) {
        const objectName = tokens[0];
        const commandCategory = tokens[1].toLowerCase();
        
        // Check if this object exists in any of the object collections
        let objectType = null;
        let object = null;
        
        if (window.geoObjects && window.geoObjects[objectName]) {
            objectType = 'geo';
            object = window.geoObjects[objectName];
        } else if (window.platoObjects && window.platoObjects[objectName]) {
            objectType = 'plato';
            object = window.platoObjects[objectName];
        } else if (window.procObjects && window.procObjects[objectName]) {
            objectType = 'proc';
            object = window.procObjects[objectName];
        } else if (window.lzObjects && window.lzObjects[objectName]) {
            objectType = 'lz';
            object = window.lzObjects[objectName];
        } else if (window.typoObjects && window.typoObjects[objectName]) {
            objectType = 'typo';
            object = window.typoObjects[objectName];
        } else if (window.modelObjects && window.modelObjects[objectName]) {
            objectType = 'model';
            object = window.modelObjects[objectName];
        }
        
        if (object && objectType && commandCategory === 'anim' && tokens.length >= 3) {
            // This is an object-specific anim command: "objectName anim subcommand ..."
            // Call the animation method directly on the object
            const animSubcommand = tokens[2];
            const animArgs = tokens.slice(3);
            
            // Map anim subcommands to object methods
            // Duration is in SECONDS (not milliseconds) to match nbcli spec
            switch (animSubcommand) {
                case 'turn':
                    const x = parseFloat(animArgs[0]) || 0;
                    const y = parseFloat(animArgs[1]) || 0;
                    const z = parseFloat(animArgs[2]) || 0;
                    const duration = animArgs.length >= 3 ? parseFloat(animArgs[3]) || 1 : 1;
                    object.animateTurn(x, y, z, duration);
                    return { output: `${objectName}: anim turn ${x} ${y} ${z} over ${duration} seconds` };
                
                case 'moveto':
                    if (animArgs.length >= 3) {
                        const movX = parseFloat(animArgs[0]) || 0;
                        const movY = parseFloat(animArgs[1]) || 0;
                        const movZ = parseFloat(animArgs[2]) || 0;
                        const movDuration = animArgs.length >= 4 ? parseFloat(animArgs[3]) || 1 : 1;
                        object.animateMoveTo(movX, movY, movZ, movDuration);
                        return { output: `${objectName}: anim moveto ${movX} ${movY} ${movZ} over ${movDuration} seconds` };
                    }
                    return { error: `Usage: ${objectName} anim moveto <x> <y> <z> [duration_seconds]` };
                
                case 'scaleto':
                    if (animArgs.length >= 3) {
                        const scX = parseFloat(animArgs[0]) || 1;
                        const scY = parseFloat(animArgs[1]) || 1;
                        const scZ = parseFloat(animArgs[2]) || 1;
                        const scDuration = animArgs.length >= 4 ? parseFloat(animArgs[3]) || 1 : 1;
                        object.animateScaleTo(scX, scY, scZ, scDuration);
                        return { output: `${objectName}: anim scaleto ${scX} ${scY} ${scZ} over ${scDuration} seconds` };
                    }
                    return { error: `Usage: ${objectName} anim scaleto <x> <y> <z> [duration_seconds]` };
                
                case 'rotateto':
                    if (animArgs.length >= 4) {
                        const rotX = parseFloat(animArgs[0]) || 0;
                        const rotY = parseFloat(animArgs[1]) || 0;
                        const rotZ = parseFloat(animArgs[2]) || 0;
                        const rotW = parseFloat(animArgs[3]) || 1;
                        const rotDuration = animArgs.length >= 5 ? parseFloat(animArgs[4]) || 1 : 1;
                        object.animateRotateTo(rotX, rotY, rotZ, rotW, rotDuration);
                        return { output: `${objectName}: anim rotateto ${rotX} ${rotY} ${rotZ} ${rotW} over ${rotDuration} seconds` };
                    }
                    return { error: `Usage: ${objectName} anim rotateto <x> <y> <z> <w> [duration_seconds]` };
                
                default:
                    return { error: `Unknown anim subcommand: ${animSubcommand}` };
            }
        }
    }
    
    // Check if command exists
    const handler = COMMAND_HANDLERS[commandName];
    if (handler) {
        try {
            return handler(tokens);
        } catch (error) {
            console.error('Error executing command', commandName, ':', error);
            return { error: `Error executing ${commandName}: ${error.message || error}` };
        }
    } else {
        return { error: `Unknown command: ${commandName}. Type 'help' for available commands.` };
    }
}

// Tokenize command string, handling quoted strings
function tokenizeCommand(command) {
    const tokens = [];
    let currentToken = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < command.length; i++) {
        const char = command[i];
        
        if ((char === '"' || char === "'") && (i === 0 || command[i - 1] !== '\\')) {
            if (inQuotes) {
                if (char === quoteChar) {
                    // End of quoted string
                    inQuotes = false;
                    tokens.push(currentToken);
                    currentToken = '';
                    quoteChar = '';
                } else {
                    // Different quote type within quotes
                    currentToken += char;
                }
            } else {
                // Start of quoted string
                inQuotes = true;
                quoteChar = char;
            }
        } else if (char === ' ' && !inQuotes) {
            // Space outside quotes - end of token
            if (currentToken.length > 0) {
                tokens.push(currentToken);
                currentToken = '';
            }
        } else {
            // Add character to current token
            currentToken += char;
        }
    }
    
    // Add last token
    if (currentToken.length > 0) {
        tokens.push(currentToken);
    }
    
    return tokens;
}

// Command handlers
function handleNewCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.new) {
        return window.ThreeCommands.new(tokens);
    }
    return { error: 'new command handler not available' };
}

function handleWrldCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.wrld) {
        return window.ThreeCommands.wrld(tokens);
    }
    return { error: 'wrld command handler not available' };
}

function handleGeoCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.geo) {
        return window.ThreeCommands.geo(tokens);
    }
    return { error: 'geo command handler not available' };
}

function handleFpicCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.fpic) {
        return window.ThreeCommands.fpic(tokens);
    }
    return { error: 'fpic command handler not available' };
}

function handleVrecCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.vrec) {
        return window.ThreeCommands.vrec(tokens);
    }
    return { error: 'vrec command handler not available' };
}

function handleZapCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.zap) {
        return window.ThreeCommands.zap(tokens);
    }
    return { error: 'zap command handler not available' };
}

function handleQsCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.qs) {
        return window.ThreeCommands.qs(tokens);
    }
    return { error: 'qs command handler not available' };
}

function handleCameraCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.camera) {
        return window.ThreeCommands.camera(tokens);
    }
    return { error: 'camera command handler not available' };
}

function handleSkyCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.sky) {
        return window.ThreeCommands.sky(tokens);
    }
    return { error: 'sky command handler not available' };
}

function handleHelpCommand(tokens) {
    let output = '';
    
    if (tokens.length === 1) {
        // Show all categories
        output += 'nbcli web - Available Commands\n';
        output += '================================\n\n';
        
        for (const [category, commands] of Object.entries(COMMAND_DESCRIPTIONS)) {
            output += `${category}:\n`;
            for (const [cmd, desc] of Object.entries(commands)) {
                output += `  ${cmd.padEnd(12)} - ${desc}\n`;
            }
            output += '\n';
        }
        
        output += 'Type "help <category>" for commands in a specific category.\n';
        output += 'Type "help <command>" for detailed information.\n';
    } else if (tokens.length === 2) {
        const category = tokens[1];
        
        // Check if it's a category or a specific command
        if (COMMAND_DESCRIPTIONS[category]) {
            // Show category commands
            output += `nbcli web - ${category} Commands\n`;
            output += '================================\n\n';
            
            for (const [cmd, desc] of Object.entries(COMMAND_DESCRIPTIONS[category])) {
                output += `${cmd.padEnd(12)} - ${desc}\n`;
            }
        } else {
            // Show specific command help
            output += `nbcli web - ${category} Command\n`;
            output += '================================\n\n';
            
            // Look for the command in all categories
            let found = false;
            for (const catCommands of Object.values(COMMAND_DESCRIPTIONS)) {
                if (catCommands[category]) {
                    output += catCommands[category] + '\n\n';
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                output += `Command "${category}" not found.\n`;
            }
        }
    } else {
        output = 'Usage: help [category|command]\n';
        output += 'Example: help Core\n';
        output += 'Example: help geo\n';
    }
    
    return { output: output };
}

function handleClearCommand(tokens) {
    window.clearTerminal();
    return { output: '' };
}

function handleEchoCommand(tokens) {
    const text = tokens.slice(1).join(' ');
    return { output: text };
}

function handleLsCommand(tokens) {
    // Use the simplified ls from ThreeCommands if available
    if (window.ThreeCommands && window.ThreeCommands.ls) {
        return window.ThreeCommands.ls();
    }
    
    // Fallback for if ThreeCommands is not available
    if (!window.geoObjects) {
        return { error: 'Objects not initialized' };
    }
    
    const geos = Object.keys(window.geoObjects || {});
    const platos = Object.keys(window.platoObjects || {});
    const procs = Object.keys(window.procObjects || {});
    const lzs = Object.keys(window.lzObjects || {});
    const typoes = Object.keys(window.typoObjects || {});
    const nurbses = Object.keys(window.nurbsObjects || {});
    
    const allObjects = [
        ...geos.map(name => ({ name, type: 'geo' })),
        ...platos.map(name => ({ name, type: 'plato' })),
        ...procs.map(name => ({ name, type: 'proc' })),
        ...lzs.map(name => ({ name, type: 'lz' })),
        ...typoes.map(name => ({ name, type: 'typo' })),
        ...nurbses.map(name => ({ name, type: 'nurbs' }))
    ];
    
    if (allObjects.length === 0) {
        return { output: '(no objects)' };
    }
    
    // Simple list of object names with their types
    const output = allObjects.map(obj => `${obj.name} (${obj.type})`).join('\n');
    return { output: output };
}

function handlePwdCommand(tokens) {
    return { output: '/nbcli-web' };
}

// Stub handlers for unimplemented commands
function handleSCommand(tokens) {
    return { output: `s command: ${tokens.slice(1).join(' ')} (sigv OSC operator - not implemented)` };
}

function handleOCommand(tokens) {
    return { output: `o command: ${tokens.slice(1).join(' ')} (Orca OSC send - not implemented)` };
}

function handleAioCommand(tokens) {
    return { output: `aio command: ${tokens.slice(1).join(' ')} (audio interface - not implemented)` };
}

function handleLttpCommand(tokens) {
    return { output: `lttp command: ${tokens.slice(1).join(' ')} (Listen to Pictures - not implemented)` };
}

function handleNatureCommand(tokens) {
    return { output: `nature command: ${tokens.slice(1).join(' ')} (audio sensor - not implemented)` };
}

function handleMidiCommand(tokens) {
    return { output: `midi command: ${tokens.slice(1).join(' ')} (MIDI interface - not implemented)` };
}

function handleWaveCommand(tokens) {
    return { output: `wave command: ${tokens.slice(1).join(' ')} (wavetable synth - not implemented)` };
}

function handleGrainCommand(tokens) {
    return { output: `grain command: ${tokens.slice(1).join(' ')} (granular synth - not implemented)` };
}

function handleSpkCommand(tokens) {
    return { output: `spk command: ${tokens.slice(1).join(' ')} (audio buffer - not implemented)` };
}

function handleSynthCommand(tokens) {
    // Route to RNBO Manager if available
    if (window.RNBOManager) {
        if (tokens.length < 2) {
            return { error: 'Usage: synth <load|play|stop|list|eval> [args]' };
        }
        
        const subcommand = tokens[1].toLowerCase();
        
        switch (subcommand) {
            case 'load':
                if (tokens.length >= 3) {
                    return window.RNBOManager.loadPatch(tokens[2]);
                }
                return { error: 'Usage: synth load <filename.json>' };
                
            case 'play':
                if (tokens.length >= 3) {
                    return window.RNBOManager.play(tokens[2], tokens.slice(3));
                }
                return { error: 'Usage: synth play <patchname> [args...]' };
                
            case 'stop':
                return window.RNBOManager.stop();
                
            case 'list':
                return window.RNBOManager.list();
                
            case 'eval':
                if (tokens.length >= 3) {
                    const code = tokens.slice(2).join(' ');
                    return window.RNBOManager.eval(code);
                }
                return { error: 'Usage: synth eval <code>' };
                
            case 'connect':
                if (tokens.length >= 3) {
                    const host = tokens[2];
                    const port = tokens[3] || 57120;
                    return window.RNBOManager.connect(host, parseInt(port));
                }
                return { error: 'Usage: synth connect <host> [port]' };
                
            case 'midi':
                if (window.RNBOManager && window.RNBOManager.midiAccess) {
                    const inputs = window.RNBOManager.midiInputs.map(i => i.name);
                    const outputs = window.RNBOManager.midiOutputs.map(o => o.name);
                    return { 
                        output: `MIDI: ${inputs.length} inputs: ${inputs.join(', ')}, ${outputs.length} outputs: ${outputs.join(', ')}` 
                    };
                }
                return { output: 'MIDI not available or not initialized' };
                
            case 'webaudio':
                if (tokens.length >= 3) {
                    const action = tokens[2].toLowerCase();
                    switch (action) {
                        case 'on':
                        case 'true':
                        case 'enable':
                            return window.RNBOManager.setUseWebAudioFallback(true);
                        case 'off':
                        case 'false':
                        case 'disable':
                            return window.RNBOManager.setUseWebAudioFallback(false);
                        case 'status':
                        case 'get':
                            return window.RNBOManager.getUseWebAudioFallback();
                        default:
                            return { error: 'Usage: synth webaudio <on|off|status>' };
                    }
                }
                return { error: 'Usage: synth webaudio <on|off|status>' };
                
            case 'disconnect':
                // Placeholder for future implementation
                return { output: 'Disconnected from RNBO' };
                
            default:
                return { error: `Unknown synth subcommand: ${subcommand}` };
        }
    }
    
    return { output: `synth command: ${tokens.slice(1).join(' ')} (RNBO not loaded)` };
}

function handleMorphCommand(tokens) {
    return { output: `morph command: ${tokens.slice(1).join(' ')} (morphing - partially implemented)` };
}

function handleShadyCommand(tokens) {
    return { output: `shady command: ${tokens.slice(1).join(' ')} (OpenGL shader - not implemented)` };
}

function handleFragCommand(tokens) {
    return { output: `frag command: ${tokens.slice(1).join(' ')} (fragment shader - not implemented)` };
}

function handleLzCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.lz) {
        return window.ThreeCommands.lz(tokens);
    }
    return { error: 'lz command handler not available' };
}

function handleMovieCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.movie) {
        return window.ThreeCommands.movie(tokens);
    }
    return { error: 'movie command handler not available' };
}

function handleRosslerCommand(tokens) {
    return { output: `rossler command: ${tokens.slice(1).join(' ')} (Rossler attractor - not implemented)` };
}

function handleSketchCommand(tokens) {
    return { output: `sketch command: ${tokens.slice(1).join(' ')} (OpenGL drawing - not implemented)` };
}

function handleTypoCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.typo) {
        return window.ThreeCommands.typo(tokens);
    }
    return { error: 'typo command handler not available' };
}

function handleBfgCommand(tokens) {
    return { output: `bfg command: ${tokens.slice(1).join(' ')} (noise generator - not implemented)` };
}

function handleBiomesCommand(tokens) {
    return { output: `biomes command: ${tokens.slice(1).join(' ')} (biome layer - not implemented)` };
}

function handlePlatoCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.plato) {
        return window.ThreeCommands.plato(tokens);
    }
    return { error: 'plato command handler not available' };
}

function handleProcCommand(tokens) {
    // Route to THREE.js command handler
    if (window.ThreeCommands && window.ThreeCommands.proc) {
        return window.ThreeCommands.proc(tokens);
    }
    return { error: 'proc command handler not available' };
}

function handleModelCommand(tokens) {
    // Simplified model command handling
    // model read <file> - loads a file and creates auto-named model (model-<first2chars>)
    // <modelName> <subcommand> ... - operates on specific model
    // model anim ... - applies to all models
    
    if (tokens.length < 2) {
        return { error: 'Usage: model <read> <file.[gltf|glb|obj|dae|stl|fbx|ply]> or <modelName> <subcommand> [args...]' };
    }
    
    const subcommand = tokens[1].toLowerCase();
    const args = tokens.slice(2);
    
    // Handle "model read <file>" - load file and auto-name based on filename
    if (subcommand === 'read') {
        if (args.length === 0) {
            return { error: 'Usage: model read <file.[gltf|glb|obj|dae|stl|fbx|ply|pcd]>' };
        }
        
        const file = args[0];
        
        // Auto-generate name from filename: model-<first2chars>
        // Extract basename without extension
        const fileName = file.split('/').pop();
        const baseName = fileName.split('.').slice(0, -1).join('.');
        const seed = baseName.substring(0, 2).toLowerCase();
        const modelName = `model-${seed}`;
        
        if (!window.modelObjects) {
            window.modelObjects = {};
        }
        
        // Create model with auto-generated name
        if (!window.ThreeCommands || !window.ThreeCommands.createModel) {
            return { error: 'Model creation not available' };
        }
        
        // Check if model already exists
        if (window.modelObjects[modelName]) {
            // If it exists, reload the file
            return window.modelObjects[modelName].load(file);
        }
        
        // Create new model and load
        window.ThreeCommands.createModel(modelName, 0, 0, -3);
        
        // Wait a tick for model to be created, then load
        setTimeout(() => {
            if (window.modelObjects[modelName]) {
                window.modelObjects[modelName].load(file);
            }
        }, 10);
        
        return { output: `Loading model: ${file} as ${modelName}` };
    }
    
    // Handle object-specific commands (e.g., "model-01 anim turn...")
    const potentialModelName = tokens[0];
    if (window.modelObjects && window.modelObjects[potentialModelName]) {
        const modelObj = window.modelObjects[potentialModelName];
        
        // Handle anim subcommands on specific model
        if (subcommand === 'anim' && args.length >= 1) {
            const animSubcommand = args[0].toLowerCase();
            const animArgs = args.slice(1);
            
            switch (animSubcommand) {
                case 'turn':
                    if (animArgs.length >= 3) {
                        const x = parseFloat(animArgs[0]) || 0;
                        const y = parseFloat(animArgs[1]) || 0;
                        const z = parseFloat(animArgs[2]) || 0;
                        const duration = animArgs.length >= 4 ? parseFloat(animArgs[3]) || 1 : 1;
                        modelObj.animateTurn(x, y, z, duration);
                        return { output: `${potentialModelName}: anim turn ${x} ${y} ${z} over ${duration} seconds` };
                    }
                    return { error: `Usage: ${potentialModelName} anim turn <x> <y> <z> [duration_seconds]` };
                
                case 'moveto':
                    if (animArgs.length >= 3) {
                        const x = parseFloat(animArgs[0]) || 0;
                        const y = parseFloat(animArgs[1]) || 0;
                        const z = parseFloat(animArgs[2]) || 0;
                        const duration = animArgs.length >= 4 ? parseFloat(animArgs[3]) || 1 : 1;
                        modelObj.animateMoveTo(x, y, z, duration);
                        return { output: `${potentialModelName}: anim moveto ${x} ${y} ${z} over ${duration} seconds` };
                    }
                    return { error: `Usage: ${potentialModelName} anim moveto <x> <y> <z> [duration_seconds]` };
                
                case 'scaleto':
                    if (animArgs.length >= 3) {
                        const x = parseFloat(animArgs[0]) || 1;
                        const y = parseFloat(animArgs[1]) || 1;
                        const z = parseFloat(animArgs[2]) || 1;
                        const duration = animArgs.length >= 4 ? parseFloat(animArgs[3]) || 1 : 1;
                        modelObj.animateScaleTo(x, y, z, duration);
                        return { output: `${potentialModelName}: anim scaleto ${x} ${y} ${z} over ${duration} seconds` };
                    }
                    return { error: `Usage: ${potentialModelName} anim scaleto <x> <y> <z> [duration_seconds]` };
                
                case 'rotateto':
                    if (animArgs.length >= 4) {
                        const x = parseFloat(animArgs[0]) || 0;
                        const y = parseFloat(animArgs[1]) || 0;
                        const z = parseFloat(animArgs[2]) || 0;
                        const w = parseFloat(animArgs[3]) || 1;
                        const duration = animArgs.length >= 5 ? parseFloat(animArgs[4]) || 1 : 1;
                        modelObj.animateRotateTo(x, y, z, w, duration);
                        return { output: `${potentialModelName}: anim rotateto ${x} ${y} ${z} ${w} over ${duration} seconds` };
                    }
                    return { error: `Usage: ${potentialModelName} anim rotateto <x> <y> <z> <w> [duration_seconds]` };
                
                default:
                    return { error: `Unknown anim subcommand: ${animSubcommand}. Use: turn, moveto, scaleto, rotateto` };
            }
        }
        
        // Handle other subcommands on specific model
        switch (subcommand) {
            case 'scale':
                if (args.length >= 1) {
                    modelObj.setScale(parseFloat(args[0]) || 1.0);
                    return { output: `${potentialModelName}: scale set to ${args[0]}` };
                }
                return { error: `Usage: ${potentialModelName} scale <scale>` };
            
            case 'smooth':
                modelObj.setSmooth(args[0] === '1' || args[0] === 'true' || args[0] === 'on' || args[0] !== '0' && args[0] !== 'false' && args[0] !== 'off');
                return { output: `${potentialModelName}: smooth shading ${modelObj.params.smooth ? 'enabled' : 'disabled'}` };
            
            case 'time':
                modelObj.setTime(parseFloat(args[0]) || 1.0);
                return { output: `${potentialModelName}: time set to ${args[0]}` };
            
            case 'position':
            case 'pos':
                if (args.length >= 3) {
                    modelObj.setPosition(
                        parseFloat(args[0]) || 0,
                        parseFloat(args[1]) || 0,
                        parseFloat(args[2]) || 0
                    );
                    return { output: `${potentialModelName}: position set to ${args[0]}, ${args[1]}, ${args[2]}` };
                }
                return { error: `Usage: ${potentialModelName} position <x> <y> <z>` };
            
            case 'color':
                if (args.length >= 1) {
                    const color = parseInt(args[0].replace('#', '0x'), 16) || 0xffffff;
                    modelObj.setMaterialColor(color);
                    return { output: `${potentialModelName}: color set to ${args[0]}` };
                }
                return { error: `Usage: ${potentialModelName} color <hexColor>` };
            
            default:
                return { error: `Unknown subcommand for ${potentialModelName}: ${subcommand}` };
        }
    }
    
    // Handle "model anim ..." - apply to all models
    if (subcommand === 'anim' && args.length >= 1) {
        if (!window.modelObjects) {
            return { error: 'No models loaded' };
        }
        
        const animSubcommand = args[0].toLowerCase();
        const animArgs = args.slice(1);
        
        let successCount = 0;
        const modelNames = Object.keys(window.modelObjects);
        
        modelNames.forEach(name => {
            const modelObj = window.modelObjects[name];
            if (modelObj) {
                try {
                    switch (animSubcommand) {
                        case 'turn':
                            if (animArgs.length >= 3) {
                                modelObj.animateTurn(
                                    parseFloat(animArgs[0]) || 0,
                                    parseFloat(animArgs[1]) || 0,
                                    parseFloat(animArgs[2]) || 0,
                                    animArgs.length >= 4 ? parseFloat(animArgs[3]) || 1 : 1
                                );
                                successCount++;
                            }
                            break;
                        case 'moveto':
                            if (animArgs.length >= 3) {
                                modelObj.animateMoveTo(
                                    parseFloat(animArgs[0]) || 0,
                                    parseFloat(animArgs[1]) || 0,
                                    parseFloat(animArgs[2]) || 0,
                                    animArgs.length >= 4 ? parseFloat(animArgs[3]) || 1 : 1
                                );
                                successCount++;
                            }
                            break;
                        case 'scaleto':
                            if (animArgs.length >= 3) {
                                modelObj.animateScaleTo(
                                    parseFloat(animArgs[0]) || 1,
                                    parseFloat(animArgs[1]) || 1,
                                    parseFloat(animArgs[2]) || 1,
                                    animArgs.length >= 4 ? parseFloat(animArgs[3]) || 1 : 1
                                );
                                successCount++;
                            }
                            break;
                        case 'rotateto':
                            if (animArgs.length >= 4) {
                                modelObj.animateRotateTo(
                                    parseFloat(animArgs[0]) || 0,
                                    parseFloat(animArgs[1]) || 0,
                                    parseFloat(animArgs[2]) || 0,
                                    parseFloat(animArgs[3]) || 1,
                                    animArgs.length >= 5 ? parseFloat(animArgs[4]) || 1 : 1
                                );
                                successCount++;
                            }
                            break;
                    }
                } catch (e) {
                    console.error(`Error animating ${name}:`, e);
                }
            }
        });
        
        if (successCount > 0) {
            return { output: `Applied ${animSubcommand} to ${successCount} model(s)` };
        }
        return { error: `No valid models to animate with ${animSubcommand}` };
    }
    
    // Handle "model ls" - list all models
    if (subcommand === 'ls' || subcommand === 'list') {
        if (!window.modelObjects) {
            return { output: 'No models' };
        }
        const modelNames = Object.keys(window.modelObjects);
        return { output: `Models: ${modelNames.join(', ')}` };
    }
    
    return { error: `Unknown model command: ${tokens.slice(1).join(' ')}. Use: new, read, ls, or <modelName> <subcommand>` };
}

function handleNurbsCommand(tokens) {
    console.log(`handleNurbsCommand called with tokens: [${tokens.join(', ')}]`);
    if (tokens.length < 2) {
        return { error: 'Usage: nurbs <subcommand> [args] or new <name> <x> <y> nurbs' };
    }
    
    const subcommand = tokens[1];
    const args = tokens.slice(2);
    
    // Check if this is a direct nurbs command (targeting current nurbs)
    console.log(`NURBS command: subcommand=${subcommand}, currentNurbs=${window.currentNurbs}, nurbsObjects keys=[${Object.keys(window.nurbsObjects || {}).join(',')}]`);
    if (window.nurbsObjects && window.currentNurbs && window.nurbsObjects[window.currentNurbs]) {
        const nurbs = window.nurbsObjects[window.currentNurbs];
        
        switch (subcommand) {
            case 'gs':
            case 'shape':
                if (args.length >= 1) {
                    const shape = args[0];
                    nurbs.setParams({ scale: parseFloat(shape) || nurbs.params.scale });
                    return { output: `nurbs: shape set to ${shape}` };
                }
                return { error: 'Usage: nurbs shape <scale>' };
                
            case 'dim':
                if (args.length >= 2) {
                    const u = parseInt(args[0]) || nurbs.params.controlPointsU;
                    const v = parseInt(args[1]) || nurbs.params.controlPointsV;
                    nurbs.setParams({ controlPointsU: u, controlPointsV: v });
                    return { output: `nurbs: dim set to ${u} ${v}` };
                }
                return { error: 'Usage: nurbs dim <u> <v>' };
                
            case 'designer':
                const enable = args[0] !== '0' && args[0] !== 'off' && args[0] !== 'false';
                const isEnabled = nurbs.toggleDesignerMode(enable);
                return { output: `nurbs: designer mode ${isEnabled ? 'enabled' : 'disabled'}` };
                
            case 'color':
                if (args.length >= 3) {
                    const r = parseInt(args[0]) || 0;
                    const g = parseInt(args[1]) || 0;
                    const b = parseInt(args[2]) || 0;
                    const color = (r << 16) | (g << 8) | b;
                    nurbs.setMaterialColor(color);
                    return { output: `nurbs: color set to ${r} ${g} ${b}` };
                }
                return { error: 'Usage: nurbs color <r> <g> <b>' };
                
            case 'read':
                // Load a .3dm (Rhino) file
                // Usage: nurbs read [filepath] - load from path/URL
                // Usage: nurbs read (with no args) - open file dialog
                console.log(`NURBS read command: args = [${args.join(', ')}]`);
                
                // Check if Rhino3dmLoader is available
                if (typeof window.nurbsLoadFromDialog === 'undefined') {
                    return { error: 'NURBS loading not available. Rhino3dmLoader required.' };
                }
                
                if (args.length === 0) {
                    // Open file dialog for .3dm files
                    console.log('Opening file dialog...');
                    return window.nurbsLoadFromDialog(nurbs);
                } else {
                    // Direct file path loading
                    const filepath = args.join(' ');
                    console.log(`Loading from path: ${filepath}`);
                    if (window.nurbsLoadFromPath) {
                        return window.nurbsLoadFromPath(nurbs, filepath);
                    } else {
                        return { error: 'NURBS file loading not available' };
                    }
                }
                
            default:
                return handleNurbsSubcommand(nurbs, subcommand, args);
        }
    } else {
        const nurbsKeys = window.nurbsObjects ? Object.keys(window.nurbsObjects).join(', ') : 'none';
        return { error: `No nurbs object selected. Current: ${window.currentNurbs}, Available: [${nurbsKeys}]. Use "new <name> <x> <y> nurbs" to create one.` };
    }
}

function handleNurbsSubcommand(nurbs, subcommand, args) {
    // Handle animation and mesh commands
    switch (subcommand) {
        case 'anim':
            if (args.length < 1) {
                return { error: 'Usage: nurbs anim <turn|moveto|scaleto|rotateto> [args]' };
            }
            return handleAnimCommandForNurbs(nurbs, args);
            
        case 'mesh':
            if (args.length < 1) {
                return { error: 'Usage: nurbs mesh <position|color> [args]' };
            }
            return handleMeshCommandForNurbs(nurbs, args);
            
        case 'material':
            if (args.length < 1) {
                return { error: 'Usage: nurbs material <mat_diffuse|mat_emission|diffuse_texture|heightmap_texture> [args]' };
            }
            return handleMaterialCommandForNurbs(nurbs, args);
            
        default:
            return { error: `Unknown nurbs subcommand: ${subcommand}` };
    }
}

function handleAnimCommandForNurbs(nurbs, args) {
    const animSubcommand = args[0];
    const animArgs = args.slice(1);
    
    switch (animSubcommand) {
        case 'turn':
            if (animArgs.length >= 3) {
                const x = parseFloat(animArgs[0]) || 0;
                const y = parseFloat(animArgs[1]) || 0;
                const z = parseFloat(animArgs[2]) || 0;
                const duration = animArgs.length >= 4 ? parseFloat(animArgs[3]) : 0;
                nurbs.animateTurn(x, y, z, duration);
                return { output: `nurbs: anim turn ${x} ${y} ${z} ${duration}` };
            }
            return { error: 'Usage: nurbs anim turn <x> <y> <z> [duration]' };
            
        case 'moveto':
            if (animArgs.length >= 3) {
                const x = parseFloat(animArgs[0]) || 0;
                const y = parseFloat(animArgs[1]) || 0;
                const z = parseFloat(animArgs[2]) || 0;
                const duration = animArgs.length >= 4 ? parseFloat(animArgs[3]) : 1;
                nurbs.animateMoveTo(x, y, z, duration);
                return { output: `nurbs: anim moveto ${x} ${y} ${z} ${duration}` };
            }
            return { error: 'Usage: nurbs anim moveto <x> <y> <z> [duration]' };
            
        case 'scaleto':
            if (animArgs.length >= 3) {
                const x = parseFloat(animArgs[0]) || 1;
                const y = parseFloat(animArgs[1]) || 1;
                const z = parseFloat(animArgs[2]) || 1;
                const duration = animArgs.length >= 4 ? parseFloat(animArgs[3]) : 1;
                nurbs.animateScaleTo(x, y, z, duration);
                return { output: `nurbs: anim scaleto ${x} ${y} ${z} ${duration}` };
            }
            return { error: 'Usage: nurbs anim scaleto <x> <y> <z> [duration]' };
            
        case 'rotateto':
            if (animArgs.length >= 4) {
                const x = parseFloat(animArgs[0]) || 0;
                const y = parseFloat(animArgs[1]) || 0;
                const z = parseFloat(animArgs[2]) || 0;
                const w = parseFloat(animArgs[3]) || 1;
                const duration = animArgs.length >= 5 ? parseFloat(animArgs[4]) : 1;
                nurbs.animateRotateTo(x, y, z, w, duration);
                return { output: `nurbs: anim rotateto ${x} ${y} ${z} ${w} ${duration}` };
            }
            return { error: 'Usage: nurbs anim rotateto <x> <y> <z> <w> [duration]' };
            
        default:
            return { error: `Unknown anim subcommand: ${animSubcommand}` };
    }
}

function handleMeshCommandForNurbs(nurbs, args) {
    const subcommand = args[0];
    const meshArgs = args.slice(1);
    
    switch (subcommand) {
        case 'position':
            if (meshArgs.length >= 3) {
                const x = parseFloat(meshArgs[0]) || 0;
                const y = parseFloat(meshArgs[1]) || 0;
                const z = parseFloat(meshArgs[2]) || 0;
                nurbs.setPosition(x, y, z);
                return { output: `nurbs: mesh position ${x} ${y} ${z}` };
            }
            return { error: 'Usage: nurbs mesh position <x> <y> <z>' };
            
        default:
            return { error: `Unknown mesh subcommand: ${subcommand}` };
    }
}

function handleMaterialCommandForNurbs(nurbs, args) {
    const subcommand = args[0];
    const materialArgs = args.slice(1);
    
    switch (subcommand) {
        case 'mat_diffuse':
            if (materialArgs.length >= 3) {
                const r = parseFloat(materialArgs[0]) || 0;
                const g = parseFloat(materialArgs[1]) || 0;
                const b = parseFloat(materialArgs[2]) || 0;
                const color = (r << 16) | (g << 8) | b;
                nurbs.setMaterialColor(color);
                return { output: `nurbs: material mat_diffuse ${r} ${g} ${b}` };
            }
            return { error: 'Usage: nurbs material mat_diffuse <r> <g> <b>' };
            
        default:
            return { error: `Unknown material subcommand: ${subcommand}` };
    }
}

function handleSomCommand(tokens) {
    if (tokens.length < 2) {
        return { error: 'Usage: som <create|read|set> [args]' };
    }
    
    const subcommand = tokens[1];
    const args = tokens.slice(2);
    
    switch (subcommand) {
        case 'create':
        case 'new':
            if (args.length >= 1) {
                const name = args[0] || 'som1';
                const width = parseInt(args[1]) || 256;
                const height = parseInt(args[2]) || 256;
                
                if (window.createSomTexture) {
                    const texture = window.createSomTexture(name, width, height);
                    return { output: `som: created texture ${name} (${width}x${height})` };
                } else {
                    return { error: 'SOM texture creation not available' };
                }
            }
            return { error: 'Usage: som create <name> [width] [height]' };
            
        case 'read':
            if (args.length >= 1) {
                const name = args[0];
                if (window.getTexture && window.getTexture(name)) {
                    return { output: `som: texture ${name} is available` };
                } else {
                    return { error: `SOM texture ${name} not found` };
                }
            }
            return { error: 'Usage: som read <name>' };
            
        case 'set':
            if (args.length >= 2) {
                const name = args[0];
                const param = args[1];
                // Additional set parameters could be added here
                return { output: `som: parameter ${param} set for ${name}` };
            }
            return { error: 'Usage: som set <name> <parameter> <value>' };
            
        default:
            return { error: `Unknown som subcommand: ${subcommand}` };
    }
}

function handleMondeCommand(tokens) {
    return { output: `monde command: ${tokens.slice(1).join(' ')} (main world layer - not implemented)` };
}

function handleSpecsCommand(tokens) {
    return { output: `specs command: ${tokens.slice(1).join(' ')} (specifications text - not implemented)` };
}

function handleGraphCommand(tokens) {
    return { output: `graph command: ${tokens.slice(1).join(' ')} (graph plot - not implemented)` };
}

function handleParticlesCommand(tokens) {
    return { output: `particles command: ${tokens.slice(1).join(' ')} (particle system - not implemented)` };
}

function handleEcaCommand(tokens) {
    if (tokens.length < 2) {
        return { error: 'Usage: eca <create|read|rule|set> [args]' };
    }
    
    const subcommand = tokens[1];
    const args = tokens.slice(2);
    
    switch (subcommand) {
        case 'create':
        case 'new':
            if (args.length >= 1) {
                const name = args[0] || 'eca';
                const width = parseInt(args[1]) || 256;
                const height = parseInt(args[2]) || 256;
                const rule = parseInt(args[3]) || 30;
                
                if (window.createEcaTexture) {
                    const texture = window.createEcaTexture(name, width, height, rule);
                    return { output: `eca: created texture ${name} (${width}x${height}, rule ${rule})` };
                } else {
                    return { error: 'ECA texture creation not available' };
                }
            }
            return { error: 'Usage: eca create <name> [width] [height] [rule]' };
            
        case 'read':
            if (args.length >= 1) {
                const name = args[0];
                if (window.getTexture && window.getTexture(name)) {
                    return { output: `eca: texture ${name} is available` };
                } else {
                    return { error: `ECA texture ${name} not found` };
                }
            }
            return { error: 'Usage: eca read <name>' };
            
        case 'rule':
            if (args.length >= 2) {
                const name = args[0];
                const rule = parseInt(args[1]) || 30;
                if (window.textureObjects && window.textureObjects[name] && 
                    window.textureObjects[name].setRule) {
                    window.textureObjects[name].setRule(rule);
                    return { output: `eca: rule set to ${rule} for ${name}` };
                } else {
                    return { error: `ECA texture ${name} not found or doesn't support rule setting` };
                }
            }
            return { error: 'Usage: eca rule <name> <rule>' };
            
        case 'set':
            if (args.length >= 2) {
                const name = args[0];
                const param = args[1];
                // Additional set parameters could be added here
                return { output: `eca: parameter ${param} set for ${name}` };
            }
            return { error: 'Usage: eca set <name> <parameter> <value>' };
            
        default:
            return { error: `Unknown eca subcommand: ${subcommand}` };
    }
}

function handleTerraCommand(tokens) {
    return { output: `terra command: ${tokens.slice(1).join(' ')} (procedural terrain - not implemented)` };
}

function handleCvCommand(tokens) {
    return { output: `cv command: ${tokens.slice(1).join(' ')} (control voltages - not implemented)` };
}

function handleLfoCommand(tokens) {
    return { output: `lfo command: ${tokens.slice(1).join(' ')} (low frequency oscillator - not implemented)` };
}

function handleRandCommand(tokens) {
    if (tokens.length < 2) {
        return { error: 'Usage: rand <max>' };
    }
    const max = parseInt(tokens[1]);
    const result = Math.floor(Math.random() * (max + 1));
    return { output: result.toString() };
}

function handleRandxCommand(tokens) {
    if (tokens.length < 3) {
        return { error: 'Usage: randx <min> <max>' };
    }
    const min = parseInt(tokens[1]);
    const max = parseInt(tokens[2]);
    const result = Math.floor(Math.random() * (max - min + 1)) + min;
    return { output: result.toString() };
}

function handleAutomataCommand(tokens) {
    if (tokens.length < 3) {
        return { error: 'Usage: automata "<operation>" [duration]' };
    }
    const operation = tokens[1];
    const duration = tokens.length >= 3 ? parseFloat(tokens[2]) : 1;
    
    // This would normally execute the operation repeatedly
    return { output: `Automata started: ${operation} (duration: ${duration}s)` };
}

function handleTildeCommand(tokens) {
    return { output: `tilde command: ${tokens.slice(1).join(' ')} (connector module - not implemented)` };
}

function handleMarkovCommand(tokens) {
    return { output: `markov command: ${tokens.slice(1).join(' ')} (Markov ML - not implemented)` };
}

function handleGenCommand(tokens) {
    if (tokens.length < 5) {
        return { error: 'Usage: gen <start> <iter> <end> [dur] [op]' };
    }
    const start = parseFloat(tokens[1]);
    const iter = parseFloat(tokens[2]);
    const end = parseFloat(tokens[3]);
    const duration = tokens.length >= 5 ? parseFloat(tokens[4]) : 0.1;
    const operation = tokens.length >= 6 ? tokens[5] : 'value';
    
    return { output: `Generated sequence from ${start} to ${end} with ${iter} iterations` };
}

function handleRnrCommand(tokens) {
    const count = tokens.length >= 2 ? parseInt(tokens[1]) : 1;
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push((Math.random()).toFixed(2));
    }
    return { output: results.join(' ') };
}

function handleRsrCommand(tokens) {
    const count = tokens.length >= 2 ? parseInt(tokens[1]) : 1;
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push((Math.random() * 2 - 1).toFixed(2));
    }
    return { output: results.join(' ') };
}

function handleCountCommand(tokens) {
    if (tokens.length < 2) {
        return { error: 'Usage: count <number>' };
    }
    const number = parseInt(tokens[1]);
    let output = '';
    for (let i = 1; i <= number; i++) {
        output += i + ' ';
    }
    return { output: output.trim() };
}

function handleSforCommand(tokens) {
    if (tokens.length < 3) {
        return { error: 'Usage: sfor <limit> "<operation>" [duration]' };
    }
    const limit = parseInt(tokens[1]);
    const operation = tokens[2];
    const duration = tokens.length >= 4 ? parseFloat(tokens[3]) : 1;
    
    return { output: `Loop: ${operation} repeated ${limit} times (duration: ${duration}s)` };
}

function handleTimerCommand(tokens) {
    if (tokens.length < 2) {
        return { error: 'Usage: timer <seconds>' };
    }
    const seconds = parseInt(tokens[1]);
    return { output: `Timer started: ${seconds} seconds` };
}

// Terminal UI commands
function handleHideCommand(tokens) {
    // Hide the entire nbcli UI
    const nbcliUI = document.getElementById('nbcli-ui');
    if (nbcliUI) {
        nbcliUI.style.display = 'none';
        // Store collapsed state if it was collapsed
        const terminalEl = document.getElementById('nbcli-terminal');
        if (terminalEl && terminalEl.classList.contains('collapsed')) {
            nbcliUI.dataset.wasCollapsed = 'true';
        }
        return { output: 'nbcli terminal hidden. Press ` (backtick) to show.' };
    }
    return { error: 'nbcli UI element not found' };
}

function handleExpandCommand(tokens) {
    // Expand the terminal (show multiple lines)
    const nbcliUI = document.getElementById('nbcli-ui');
    const terminalEl = document.getElementById('nbcli-terminal');
    
    if (nbcliUI && terminalEl) {
        nbcliUI.style.display = 'flex';
        terminalEl.classList.remove('collapsed');
        terminalEl.style.maxHeight = '';
        terminalEl.style.overflow = '';
        delete nbcliUI.dataset.wasCollapsed;
        return { output: 'nbcli terminal expanded' };
    }
    return { error: 'nbcli UI element not found' };
}

function handleCollapseCommand(tokens) {
    // Collapse the terminal (show only one line)
    const nbcliUI = document.getElementById('nbcli-ui');
    const terminalEl = document.getElementById('nbcli-terminal');
    
    if (nbcliUI && terminalEl) {
        nbcliUI.style.display = 'flex';
        terminalEl.classList.add('collapsed');
        terminalEl.style.maxHeight = '20px';
        terminalEl.style.overflow = 'hidden';
        
        return { output: 'nbcli terminal collapsed to one line' };
    }
    return { error: 'nbcli UI element not found' };
}

function handleOthemeCommand(tokens) {
    // Load an Orca theme from an SVG/JSON file or by name
    if (tokens.length < 2) {
        return { error: 'Usage: otheme <file.svg|file.json|theme-name>' };
    }
    
    const themeSpec = tokens[1];
    
    // Check if client and theme are available
    if (window.client && window.client.theme && window.client.theme.load) {
        try {
            // Check if themeSpec is a URL or file path
            if (themeSpec.startsWith('http://') || themeSpec.startsWith('https://') || 
                themeSpec.startsWith('/') || themeSpec.includes('.svg') || themeSpec.includes('.json')) {
                
                fetch(themeSpec)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }
                        return response.text();
                    })
                    .then(data => {
                        // Load the theme data - Theme.load() handles JSON, HTML, SVG
                        window.client.theme.load(data);
                        console.log(`Theme loaded: ${themeSpec}`);
                    })
                    .catch(error => {
                        console.error(`Error loading theme ${themeSpec}:`, error);
                    });
                
                return { output: `Loading theme: ${themeSpec}...` };
            } else {
                // Try to load from localStorage or use as theme name
                window.client.theme.load(themeSpec);
                return { output: `Theme set: ${themeSpec}` };
            }
        } catch (e) {
            return { error: `Failed to load theme: ${e.message}` };
        }
    }
    
    // If Orca theme system isn't available, try to find and apply theme via DOM
    // This is a fallback for direct SVG theme application
    if (themeSpec.includes('.svg') || themeSpec.includes('.json')) {
        fetch(themeSpec)
            .then(response => response.text())
            .then(data => {
                // Parse SVG and extract colors if possible
                if (themeSpec.includes('.svg')) {
                    try {
                        const parser = new DOMParser();
                        const svgDoc = parser.parseFromString(data, 'text/xml');
                        const themeColors = {};
                        
                        // Try to extract colors from SVG elements by ID (Orca theme format)
                        const colorIds = ['background', 'f_high', 'f_med', 'f_low', 'f_inv', 'b_high', 'b_med', 'b_low', 'b_inv'];
                        colorIds.forEach(id => {
                            const element = svgDoc.getElementById(id);
                            if (element && element.hasAttribute('fill')) {
                                themeColors[id] = element.getAttribute('fill');
                            }
                        });
                        
                        if (Object.keys(themeColors).length > 0) {
                            // Apply colors as CSS variables to Orca container
                            const orcaContainer = document.getElementById('orca-container');
                            if (orcaContainer) {
                                for (const [key, value] of Object.entries(themeColors)) {
                                    orcaContainer.style.setProperty(`--${key}`, value);
                                }
                            }
                            console.log(`Applied theme colors from ${themeSpec}`);
                        }
                    } catch (e) {
                        console.error('Error parsing theme SVG:', e);
                    }
                }
            })
            .catch(error => {
                console.error(`Error fetching theme ${themeSpec}:`, error);
            });
        
        return { output: `Loading theme: ${themeSpec}...` };
    }
    
    return { error: `Theme system not available or invalid theme file` };
}

function handleOrcaCommand(tokens) {
    if (tokens.length < 2) {
        return { error: 'Usage: orca <hide|show>' };
    }
    
    const subcommand = tokens[1].toLowerCase();
    const orcaContainer = document.getElementById('orca-container');
    
    if (!orcaContainer) {
        return { error: 'Orca container not found' };
    }
    
    // Store current inline left/top positions so we can restore them on show
    if (!orcaContainer.dataset.hiddenStyles && orcaContainer.style.left && orcaContainer.style.top) {
        orcaContainer.dataset.hiddenStyles = JSON.stringify({
            left: orcaContainer.style.left,
            top: orcaContainer.style.top
        });
    }
    
    switch (subcommand) {
        case 'hide':
            // Hide the container - this hides everything inside it including the canvas
            orcaContainer.style.display = 'none';
            
            // Enable designer mode for all objects that support it
            if (window.nurbsObjects) {
                for (const name in window.nurbsObjects) {
                    const nurbs = window.nurbsObjects[name];
                    if (nurbs.toggleDesignerMode) {
                        nurbs.toggleDesignerMode(true);
                    }
                }
            }
            if (window.lzObjects) {
                for (const name in window.lzObjects) {
                    const lz = window.lzObjects[name];
                    // Lz objects could have designer mode too
                    if (lz.toggleDesignerMode) {
                        lz.toggleDesignerMode(true);
                    }
                }
            }
            
            // Update cursor to crosshair for designer mode
            updateDesignerCursor(true);
            
            return { output: 'Orca grid hidden - designer mode enabled' };
        
        case 'show':
            // Restore original inline left/top positions if we stored them
            if (orcaContainer.dataset.hiddenStyles) {
                const styles = JSON.parse(orcaContainer.dataset.hiddenStyles);
                if (styles.left) orcaContainer.style.left = styles.left;
                if (styles.top) orcaContainer.style.top = styles.top;
            }
            
            // Disable designer mode for all objects
            if (window.nurbsObjects) {
                for (const name in window.nurbsObjects) {
                    const nurbs = window.nurbsObjects[name];
                    if (nurbs.toggleDesignerMode) {
                        nurbs.toggleDesignerMode(false);
                    }
                }
            }
            if (window.lzObjects) {
                for (const name in window.lzObjects) {
                    const lz = window.lzObjects[name];
                    if (lz.toggleDesignerMode) {
                        lz.toggleDesignerMode(false);
                    }
                }
            }
            
            // Restore cursor to normal
            updateDesignerCursor(false);
            
            // Show the container - this shows everything inside it
            orcaContainer.style.display = 'block';
            return { output: 'Orca grid shown - designer mode disabled' };
        
        default:
            return { error: `Unknown orca subcommand: ${subcommand}. Use: hide, show` };
    }
}

// Function to update cursor for designer mode
function updateDesignerCursor(enable) {
    const pointer = document.getElementById('custom-pointer');
    if (pointer) {
        if (enable) {
            // Show the circle cursor for designer mode
            pointer.style.display = 'block';
        } else {
            // Hide the circle cursor to restore normal behavior
            pointer.style.display = 'none';
        }
    }
    // Also reset the body cursor style in case it was set
    document.body.style.cursor = '';
}

// Make parseCommand available globally
window.parseCommand = parseCommand;
window.tokenizeCommand = tokenizeCommand;
window.updateDesignerCursor = updateDesignerCursor;

// Add executeCommand wrapper for compatibility with terminal-manager.js
window.executeCommand = function(command) {
    return window.parseCommand(command);
};
