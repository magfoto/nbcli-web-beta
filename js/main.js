/**
 * nbcli web - Main Application Entry Point
 * THREE.js background with Orca Web overlay
 * Transparent Orca grid over nbcli THREE.js scene
 */

// Global application state
const APP_STATE = {
    isInitialized: false,
    threeReady: false,
    currentWrld: null,
    modules: {},
    entities: {},
    commandHistory: [],
    historyIndex: -1,
    lastGeo: null,
    defaultWorldCreated: false
};

// DOM elements
const elements = {
    loading: document.getElementById('loading'),
    threeCanvas: document.getElementById('three-canvas')
};

// Initialize the application
// We need to be careful about timing with Orca
// Orca initializes via its own script, then we initialize THREE.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('nbcli web - Initializing application...');
    
    // Wait longer to ensure Orca has initialized first
    // Orca's client.start() needs to run before we touch the DOM heavily
    setTimeout(() => {
        initializeThreeJSScene();
    }, 1000);
    
    // Setup event listeners
    setupEventListeners();
});

function initializeThreeJSScene() {
    console.log('nbcli web - Initializing THREE.js...');
    
    // Check if THREE is available
    if (typeof THREE === 'undefined') {
        console.error('THREE.js is not loaded! Make sure you are using a web server, not file:// protocol');
        return;
    }
    
    // Check if canvas exists
    if (!elements.threeCanvas) {
        console.error('THREE.js canvas element not found!');
        return;
    }
    
    // Initialize THREE.js scene from three-manager.js
    if (window.initThreeJS && typeof window.initThreeJS === 'function') {
        try {
            window.initThreeJS();
            APP_STATE.threeReady = true;
            
            // Now check if exports are available and create default world
            checkAndCreateDefaultWorld();
        } catch (e) {
            console.error('Error initializing THREE.js:', e);
        }
    } else {
        console.error('initThreeJS function not found in three-manager.js');
    }
}

function checkAndCreateDefaultWorld() {
    // Check if the required objects are available
    if (window.ThreeCommands && window.scene && window.camera) {
        console.log('Prerequisites available - scene:', !!window.scene, 'camera:', !!window.camera, 'ThreeCommands:', !!window.ThreeCommands);
        createDefaultWorld();
    } else {
        console.log('Waiting for prerequisites... scene:', !!window.scene, 'camera:', !!window.camera, 'ThreeCommands:', !!window.ThreeCommands);
        // Try again after a short delay
        setTimeout(checkAndCreateDefaultWorld, 200);
    }
}

function setupEventListeners() {
    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.onWindowResize && typeof window.onWindowResize === 'function') {
            window.onWindowResize();
        }
    });
}

function createDefaultWorld() {
    // Only create default world once
    if (APP_STATE.defaultWorldCreated) {
        return;
    }
    
    console.log('Creating default nbcli world with geo...');
    
    // Create a default world
    APP_STATE.currentWrld = {
        id: 'default',
        size: { width: 800, height: 600 },
        dim: { x: 800, y: 600, z: 800 },
        border: 1,
        entities: []
    };
    
    // Create a default geo object to showcase nbcli
    if (window.ThreeCommands && window.scene && window.camera) {
        console.log('Creating default geo object...');
        console.log('Camera exists:', !!window.camera);
        console.log('Scene exists:', !!window.scene);
        
        const geoName = 'nbcli_default';
        
        // Create geo at center using ThreeCommands.new
        // Note: GeoObject defaults to sphere shape for gs1
        // Format: new <name> <x> <y> <type>
        const result = window.ThreeCommands.new(['new', geoName, '0', '0', 'geo']);
        console.log('New geo result:', result);
        
        if (result && result.output) {
            // Check if geo was created
            const geo = window.geoObjects ? window.geoObjects[geoName] : null;
            console.log('Geo object:', geo);
            
            if (geo && geo.mesh) {
                console.log('Geo mesh exists, position:', geo.mesh.position);
                console.log('Geo mesh visible:', geo.mesh.visible);
                console.log('Geo mesh geometry:', geo.mesh.geometry);
            }
            
            // Position camera to view it (closer for larger sphere)
            if (window.camera) {
                window.camera.position.set(0, 0, 8);
                window.camera.lookAt(0, 0, 0);
                console.log('Camera position set');
            }
            
            APP_STATE.currentWrld.entities.push({ name: geoName, type: 'geo' });
            console.log(`Created default geo: ${geoName}`);
            APP_STATE.defaultWorldCreated = true;
        } else {
            console.error('Failed to create geo:', result ? result.error : 'no result');
        }
    } else {
        console.error('Prerequisites not available - scene:', !!window.scene, 'camera:', !!window.camera, 'ThreeCommands:', !!window.ThreeCommands);
    }
}

// Make APP_STATE available globally
window.APP_STATE = APP_STATE;
