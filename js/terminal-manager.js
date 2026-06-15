/**
 * nbcli web - Terminal Manager
 * Handles command input field and output display
 * Uses traditional HTML input instead of Xterm.js for simplicity
 */

// Initialize terminal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const commandInput = document.getElementById('command-input');
    const commandOutput = document.getElementById('command-output');
    const commandPrompt = document.getElementById('command-prompt');
    
    if (!commandInput || !commandOutput) {
        console.error('nbcli web - Command input or output elements not found');
        return;
    }
    
    // Focus the input field
    commandInput.focus();
    
    // Setup command history tracking on window for global access
    if (!window.TERMINAL_STATE) {
        window.TERMINAL_STATE = {
            history: [],
            historyIndex: -1,
            historyBuffer: ''
        };
    }
    
    // Setup input event handlers
    setupInputHandlers(commandInput, commandOutput, commandPrompt);
    
    // Dispatch terminal ready event
    window.dispatchEvent(new CustomEvent('terminal-ready'));
    
    console.log('nbcli web - Terminal input initialized successfully');
});

function setupInputHandlers(inputElement, outputElement, promptElement) {
    // Handle key presses
    inputElement.addEventListener('keydown', (e) => {
        const terminalState = window.TERMINAL_STATE;
        
        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                // Check if this command came from Orca commander to prevent double-execution
                if (!window.lastCommandFromOrca) {
                  executeCommandFromInput(inputElement, outputElement);
                }
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                navigateHistory(inputElement, terminalState, -1);
                break;
                
            case 'ArrowDown':
                e.preventDefault();
                navigateHistory(inputElement, terminalState, 1);
                break;
                
            case 'Escape':
                e.preventDefault();
                inputElement.value = '';
                if (terminalState) {
                    terminalState.historyIndex = -1;
                    terminalState.historyBuffer = '';
                }
                break;
        }
    });
    
    // Handle focus
    inputElement.addEventListener('focus', () => {
        // Scroll output to bottom when focused
        outputElement.scrollTop = outputElement.scrollHeight;
    });
}

function navigateHistory(inputElement, terminalState, direction) {
    if (!terminalState) return;
    
    const commandHistory = terminalState.history || [];
    if (commandHistory.length === 0) return;
    
    // Save current input as buffer if we're at the "present" state
    if (terminalState.historyIndex === -1 && direction === -1) {
        terminalState.historyBuffer = inputElement.value;
    }
    
    if (direction === -1) {
        // Up arrow - go back in history
        if (terminalState.historyIndex < commandHistory.length - 1) {
            terminalState.historyIndex++;
            inputElement.value = commandHistory[commandHistory.length - 1 - terminalState.historyIndex];
        }
    } else if (direction === 1) {
        // Down arrow - go forward in history
        if (terminalState.historyIndex > 0) {
            terminalState.historyIndex--;
            inputElement.value = commandHistory[commandHistory.length - 1 - terminalState.historyIndex];
        } else if (terminalState.historyIndex === 0) {
            // Restore the buffer when coming back to "present"
            inputElement.value = terminalState.historyBuffer;
            terminalState.historyIndex = -1;
        }
    }
    
    // Move cursor to end
    inputElement.selectionStart = inputElement.selectionEnd = inputElement.value.length;
}

function executeCommandFromInput(inputElement, outputElement) {
    const command = inputElement.value.trim();
    
    if (command === '') {
        return;
    }
    
    // Always apply per-word styling
    const prompt = document.getElementById('command-prompt');
    const promptText = prompt ? prompt.textContent : 'nbcli: ';
    // Pass a dummy category to trigger per-word styling
    printToOutput(outputElement, `${promptText}${command}`, 'per-word');
    
    // Clear input
    inputElement.value = '';
    
    // Add to history in both TERMINAL_STATE and APP_STATE for compatibility
    const terminalState = window.TERMINAL_STATE;
    if (terminalState) {
        terminalState.history.push(command);
        terminalState.historyIndex = -1;
        terminalState.historyBuffer = '';
    }
    if (window.APP_STATE) {
        window.APP_STATE.commandHistory.push(command);
    }
    
    // Execute command
    try {
        const result = window.executeCommand(command);
        
        // Display result
        if (result && result.output) {
            printToOutput(outputElement, result.output);
        } else if (result && result.error) {
            printToOutput(outputElement, `Error: ${result.error}`, true);
        }
    } catch (error) {
        printToOutput(outputElement, `Error: ${error.message}`, true);
        console.error('Command execution error:', error);
    }
    
    // Scroll to bottom
    setTimeout(() => {
        outputElement.scrollTop = outputElement.scrollHeight;
    }, 10);
}

function printToOutput(outputElement, message, isErrorOrCategory = false) {
    if (!outputElement) return;
    
    // Create a new line
    const line = document.createElement('div');
    
    // Handle different types of second parameter
    let category = null;
    let isError = false;
    
    if (typeof isErrorOrCategory === 'string') {
        // It's a category
        category = isErrorOrCategory;
    } else if (isErrorOrCategory === true) {
        // It's an error flag
        isError = true;
    }
    
    // Set message content
    if (category) {
        // Wrap each word in the command part in its own span
        // Split message to separate prompt from command
        const parts = message.split(/\s+/);
        if (parts.length > 1) {
            // First part is prompt, rest is command
            const promptPart = parts[0] + ' ';
            const commandWords = parts.slice(1);
            
            // Map each word to its class based on the word itself
            const wordClasses = commandWords.map(word => getWordClass(word));
            const highlightedWords = commandWords.map((word, i) => 
                `<span class="cmd-word ${wordClasses[i]}">${word}</span>`
            ).join(' ');
            
            line.innerHTML = `${promptPart}${highlightedWords}`;
        } else {
            line.innerHTML = `<span class="cmd-word cmd-${category}">${message}</span>`;
        }
        line.style.color = 'var(--font-color)';
    } else if (isError) {
        line.textContent = message;
        line.style.color = '#FF6B6B'; // Error color
    } else {
        line.textContent = message;
        line.style.color = 'var(--font-color)';
    }
    
    // Use monospace font
    line.style.fontFamily = '"Courier New", Courier, monospace';
    line.style.whiteSpace = 'pre-wrap';
    line.style.wordBreak = 'break-all';
    
    outputElement.appendChild(line);
}

function clearOutput(outputElement) {
    if (outputElement) {
        outputElement.innerHTML = '';
    }
}

// Utility functions for terminal output
function printToTerminal(message, color) {
    const outputElement = document.getElementById('command-output');
    if (outputElement) {
        printToOutput(outputElement, message);
    }
}

function clearTerminal() {
    const outputElement = document.getElementById('command-output');
    if (outputElement) {
        clearOutput(outputElement);
    }
}

// Map words to their CSS classes for per-word highlighting
// Using magfoto CSS color scheme
function getWordClass(word) {
    // Check if it's a number
    if (!isNaN(word) && !isNaN(parseFloat(word))) {
        return 'cmd-num';
    }
    
    // Map specific words to their classes using magfoto colors
    const wordToClass = {
        // Yellow (hsla(40,90%,75%,0.75) / black at 75%)
        'new': 'cmd-new',
        
        // Blue (hsla(215,100%,80%,0.25) / hsla(190,100%,40%,0.75))
        'geo': 'cmd-geo',
        'wrld': 'cmd-blue',
        'morph': 'cmd-blue',
        'lz': 'cmd-blue',
        'sketch': 'cmd-blue',
        'graph': 'cmd-blue',
        
        // Cyan (hsla(191,100%,60%,0.25) / hsla(192,100%,60%,0.75))
        'plato': 'cmd-cyan',
        'proc': 'cmd-cyan',
        'model': 'cmd-cyan',
        'nurbs': 'cmd-cyan',
        'typo': 'cmd-cyan',
        'bfg': 'cmd-cyan',
        'biomes': 'cmd-cyan',
        'shady': 'cmd-cyan',
        'frag': 'cmd-cyan',
        'movie': 'cmd-cyan',
        'rossler': 'cmd-cyan',
        'particles': 'cmd-cyan',
        'eca': 'cmd-cyan',
        'terra': 'cmd-cyan',
        
        // Magenta (hsla(331,100%,60%,0.25) / hsla(325,100%,70%,0.75))
        'aio': 'cmd-sonic',
        'lttp': 'cmd-sonic',
        'nature': 'cmd-sonic',
        'midi': 'cmd-sonic',
        'wave': 'cmd-sonic',
        'grain': 'cmd-sonic',
        'spk': 'cmd-sonic',
        'synth': 'cmd-sonic',
        
        // Green (hsla(160,100%,80%,0.25) / hsla(100,100%,40%,0.75))
        'help': 'cmd-utility',
        'clear': 'cmd-utility',
        'echo': 'cmd-utility',
        'ls': 'cmd-utility',
        'pwd': 'cmd-utility',
        's': 'cmd-utility',
        'o': 'cmd-utility',
        'q': 'cmd-utility',
        'qs': 'cmd-utility',
        'camera': 'cmd-utility',
        'sky': 'cmd-utility',
        'fpic': 'cmd-utility',
        'zap': 'cmd-utility',
        'timer': 'cmd-utility',
        
        // Red (hsla(0,100%,60%,0.25) / hsla(25,100%,60%,0.75))
        'cv': 'cmd-red',
        'lfo': 'cmd-red'
    };
    
    return wordToClass[word.toLowerCase()] || 'cmd-default';
}

// Make functions available globally
window.printToTerminal = printToTerminal;
window.clearTerminal = clearTerminal;
window.getWordClass = getWordClass;
