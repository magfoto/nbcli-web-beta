/**
 * nbcli web - THREE.js Manager
 * Implements sigv-style geo module with jit.gl.gridshape behavior
 * Uses anime.js for smooth interpolations
 * 
 * In the original sigv/nbcli desktop, geo uses Max/MSP's jit.gl.gridshape object.
 * The geo object itself is ONE 3D object that integrates two gridshapes:
 *   gs1[matrix] * gs2[matrix] = xfade[matrix]
 *   xfade[matrix] * xfactor = geo[mesh]
 * 
 * Where:
 * - gs1 and gs2 are two jit.gl.gridshape instances (gs = gridshape)
 * - Each can be set to any primitive type: sphere, cube/box, torus, cylinder, cone, plane
 * - xfactor is the floating point value from the ^ operator (0.0-1.0)
 * - The * operator represents matrix combination/blending
 * - The final geo is a SINGLE mesh with geometrically transformed vertices
 * 
 * This THREE.js implementation models that behavior:
 * - Each geo object has ONE mesh (not two separate meshes)
 * - gs1 and gs2 are gridshape parameter states
 * - anime.js animates the xfactor (morphFactor) for smooth transitions
 * - Geometry parameters are interpolated: sphere radius, box dimensions, etc.
 * - For same-type primitives: parameter interpolation (efficient)
 * - For different types: **TRUE vertex-level linear interpolation** (like Max's line 0.)
 */

// Global THREE.js variables
let scene, camera, renderer, canvas;
let geoObjects = {};  // Track all geo objects by name
let currentGeo = null;  // Currently selected geo for commands

// Track active animations to allow cancellation
let activeAnimations = {};

// Shape configurations for jit.gl.gridshape primitives
// These map to the primitive types supported by Max/MSP's jit.gl.gridshape
const SHAPE_CONFIG = {
    'sphere': {
        create: (dim) => new THREE.SphereGeometry(2, dim, dim),
        defaultDim: 32
    },
    'box': {
        // In jit.gl.gridshape this would be 'cube', but 'box' is used in nbcli
        create: (dim) => new THREE.BoxGeometry(1, 1, 1, dim, dim, dim),
        defaultDim: 32
    },
    'torus': {
        create: (dim) => {
            const geometry = new THREE.TorusGeometry(1, 0.2, dim, Math.round(dim / 2));
            return geometry;
        },
        defaultDim: 32
    },
    'cylinder': {
        create: (dim) => new THREE.CylinderGeometry(1, 1, 1, dim, dim),
        defaultDim: 32
    },
    'cone': {
        create: (dim) => new THREE.ConeGeometry(1, 1, dim),
        defaultDim: 32
    },
    'plane': {
        create: (dim) => new THREE.PlaneGeometry(1, 1, dim, dim),
        defaultDim: 32
    }
};

// Helper function to get a random shape name from SHAPE_CONFIG
function getRandomShape() {
    const shapeNames = Object.keys(SHAPE_CONFIG);
    return shapeNames[Math.floor(Math.random() * shapeNames.length)];
}

// Platonic solid configurations for jit.gl.plato in Max/MSP
// jit.gl.plato creates: tetrahedron, cube, octahedron, dodecahedron, icosahedron
const PLATO_CONFIG = {
    'tetrahedron': {
        create: (dim) => new THREE.TetrahedronGeometry(1),
        defaultDim: 32
    },
    'cube': {
        create: (dim) => new THREE.BoxGeometry(1, 1, 1),
        defaultDim: 32
    },
    'octahedron': {
        create: (dim) => new THREE.OctahedronGeometry(1, dim),
        defaultDim: 32
    },
    'dodecahedron': {
        create: (dim) => new THREE.DodecahedronGeometry(1, dim),
        defaultDim: 32
    },
    'icosahedron': {
        create: (dim) => new THREE.IcosahedronGeometry(1, dim),
        defaultDim: 32
    }
};

// Color scheme from magfoto.dev
const COLORS = {
    background: 0x1D1E23,
    text: 0x8699A9,
    accent: 0x00BFFF,
    default: 0x00BFFF,  // nbcli blue
    nurbs: 0x00ff00   // green for nurbs objects
};

// Initialize THREE.js scene
function initThreeJS() {
    // Get canvas element
    canvas = document.getElementById('three-canvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return false;
    }

    // CRITICAL: Allow pointer events to pass through to Orca
    // This must be set on the canvas element itself
    canvas.style.pointerEvents = 'none';
    
    // Ensure canvas is visible and properly sized
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.opacity = '1';
    canvas.style.background = 'transparent';
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.background); // nbcli gray background
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);
    
    // Create renderer with transparent background
    renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: true,
        alpha: true,
        transparent: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(COLORS.background, 1); // nbcli gray clear color
    
    // Export to window immediately after creation
    window.scene = scene;
    window.camera = camera;
    window.renderer = renderer;
    console.log('THREE.js exported to window: scene, camera, renderer');
    

    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0x444444, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 2, 3);
    scene.add(directionalLight);
    
    // Start animation loop
    animate();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
    
    // Export onWindowResize to window for external access
    window.onWindowResize = onWindowResize;
    
    console.log('THREE.js scene initialized');
    return true;
}

// Export to window immediately so it's available before DOMContentLoaded
window.initThreeJS = initThreeJS;

// Animation loop
function animate() {
    try {
        requestAnimationFrame(animate);
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
            // Debug: log that we're rendering
            if (frameCount % 60 === 0) {
                console.log('THREE.js rendering...');
            }
            frameCount++;
        } else {
            console.error('THREE.js animate: renderer, scene, or camera not ready');
        }
    } catch (e) {
        console.error('THREE.js animate error:', e);
    }
}

let frameCount = 0;

// Handle window resize
function onWindowResize() {
    if (!camera || !renderer) {
        console.warn('onWindowResize: camera or renderer not initialized yet');
        return;
    }
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Geo object class (matches sigv/nbcli desktop design)
// In sigv, geo uses jit.gl.gridshape from Max/MSP Jitter
// The formula: gs1[matrix] * gs2[matrix] = xfade[matrix], then xfade[matrix] * xfactor = geo[mesh]
// This means:
// - geo is ONE object conceptually (ONE mesh)
// - gs1 and gs2 are two gridshape instances that each produce a geometry matrix (vertex data)
// - These vertex matrices are COMBINED into xfade[matrix] via interpolation
// - xfactor scales this combination to produce the final geo mesh
// - When gs1 or gs2 geometry changes, the xfade matrix updates, thus updating geo
// - The (^) operator is a GEOMETRICAL TRANSFORMATION, not a material/lighting operation
class GeoObject {
    constructor(name, x = 0, y = 0, z = 0) {
        this.name = name;
        this.position = new THREE.Vector3(x, y, z);
        // Default: gs1 is random shape, gs2 is box (matching sigv defaults but randomized)
        this.gs1 = { shape: getRandomShape(), dim: 32 };
        this.gs2 = { shape: 'box', dim: 32 };
        // xfactor/morphFactor: 0.0 = 100% gs1, 1.0 = 100% gs2
        this.morphFactor = 0;
        this.currentShape = 'gs1';
        // Single mesh for this geo (ONE object, not two)
        this.mesh = null;
        // Color for the geo
        this.color = COLORS.default;
        // Track active animation for this geo
        this.animation = null;
        // Cache for the interpolated geometry
        this.interpolatedGeometry = null;
        
        this.createMesh();
    }
    
    createMesh() {
        // Create a single mesh for this geo
        // Initially use gs1's geometry
        const geometry = this.createGeometry(this.gs1.shape, this.gs1.dim);
        const material = new THREE.MeshBasicMaterial({ 
            color: this.color,
            transparent: false
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        scene.add(this.mesh);
    }
    
    createGeometry(shape, dim) {
        const shapeConfig = SHAPE_CONFIG[shape];
        if (!shapeConfig) {
            console.warn(`Unknown shape: ${shape}, using sphere`);
            return SHAPE_CONFIG['sphere'].create(SHAPE_CONFIG['sphere'].defaultDim);
        }
        return shapeConfig.create(dim || shapeConfig.defaultDim);
    }
    
    // Interpolate between two geometries at the vertex level
    // This implements the sigv formula: xfade[matrix] * xfactor = geo[mesh]
    // We combine the vertex matrices from gs1 and gs2 using LINEAR interpolation (like Max's line 0.)
    // For same-type primitives: interpolate parameters (faster)
    // For different types: interpolate actual vertex positions (true geometric morph)
    interpolateGeometries(geom1, geom2, factor) {
        // Clamp factor
        factor = Math.max(0, Math.min(1, factor));
        
        // If same shape, try parameter interpolation (more efficient)
        if (geom1.type === geom2.type) {
            return this.interpolateSameType(geom1, geom2, factor);
        }
        
        // For different shapes: do VERTEX-LEVEL linear interpolation
        // This is the true geometric transformation like Max's line 0.
        return this.interpolateVertexLevel(geom1, geom2, factor);
    }
    
    // Interpolate parameters for same geometry type
    interpolateSameType(geom1, geom2, factor) {
        // For spheres, interpolate radius
        if (geom1.type === 'SphereGeometry') {
            const r1 = geom1.parameters.radius || 1;
            const r2 = geom2.parameters.radius || 1;
            const newRadius = r1 + (r2 - r1) * factor;
            const segments = Math.round(geom1.parameters.widthSegments || 32);
            return new THREE.SphereGeometry(newRadius, segments, segments);
        }
        
        // For boxes, interpolate width, height, depth
        if (geom1.type === 'BoxGeometry') {
            const w1 = geom1.parameters.width || 1;
            const h1 = geom1.parameters.height || 1;
            const d1 = geom1.parameters.depth || 1;
            const w2 = geom2.parameters.width || 1;
            const h2 = geom2.parameters.height || 1;
            const d2 = geom2.parameters.depth || 1;
            
            const newWidth = w1 + (w2 - w1) * factor;
            const newHeight = h1 + (h2 - h1) * factor;
            const newDepth = d1 + (d2 - d1) * factor;
            
            const segments = Math.round(geom1.parameters.widthSegments || 1);
            return new THREE.BoxGeometry(newWidth, newHeight, newDepth, segments, segments, segments);
        }
        
        // For other same types, return based on threshold
        return factor < 0.5 ? geom1 : geom2;
    }
    
    // Vertex-level linear interpolation between two geometries
    // This is the TRUE geometric transformation (like Max's line 0.)
    // Extracts vertex positions from both geometries and interpolates between them
    interpolateVertexLevel(geom1, geom2, factor) {
        // Get position attributes from both geometries
        const pos1 = geom1.attributes.position;
        const pos2 = geom2.attributes.position;
        
        // Use the smaller vertex count to avoid out-of-bounds
        const vertexCount = Math.min(pos1.count, pos2.count);
        
        // Create new geometry with interpolated vertices
        const newGeometry = new THREE.BufferGeometry();
        
        // Create position array for interpolated vertices
        const positions = new Float32Array(vertexCount * 3);
        
        // Linearly interpolate each vertex (line 0. in Max)
        for (let i = 0; i < vertexCount; i++) {
            const idx = i * 3;
            
            // Get vertex from geom1
            const x1 = pos1.array[idx];
            const y1 = pos1.array[idx + 1];
            const z1 = pos1.array[idx + 2];
            
            // Get vertex from geom2
            const x2 = pos2.array[idx];
            const y2 = pos2.array[idx + 1];
            const z2 = pos2.array[idx + 2];
            
            // Linear interpolation (line 0. in Max)
            positions[idx] = x1 + (x2 - x1) * factor;
            positions[idx + 1] = y1 + (y2 - y1) * factor;
            positions[idx + 2] = z1 + (z2 - z1) * factor;
        }
        
        newGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        // For normals, we can compute them from the interpolated positions
        newGeometry.computeVertexNormals();
        
        return newGeometry;
    }
    
    // Update the single mesh geometry based on gs1, gs2, and morphFactor
    // This implements the sigv formula: xfade[matrix] * xfactor = geo[mesh]
    // We combine the vertex matrices (geometry data) from both gridshapes via linear interpolation
    // For same-type primitives: interpolate parameters (faster)
    // For different types: interpolate vertex positions (TRUE geometric morph, like Max's line 0.)
    updateMorph() {
        // Clamp morph factor
        this.morphFactor = Math.max(0, Math.min(1, this.morphFactor));
        
        // Get geometries for both gridshapes
        const geom1 = this.createGeometry(this.gs1.shape, this.gs1.dim);
        const geom2 = this.createGeometry(this.gs2.shape, this.gs2.dim);
        
        // Interpolate between the two geometries
        const newGeometry = this.interpolateGeometries(geom1, geom2, this.morphFactor);
        
        // Update the mesh geometry
        this.mesh.geometry.dispose();
        this.mesh.geometry = newGeometry;
        
        // Update current shape reference
        this.currentShape = this.morphFactor < 0.5 ? 'gs1' : 'gs2';
        
        // Clean up old geometries
        geom1.dispose();
        geom2.dispose();
    }
    
    updateShape(gs, shape, dim) {
        if (gs === 'gs1') {
            this.gs1.shape = shape;
            this.gs1.dim = dim || this.gs1.dim;
        } else if (gs === 'gs2') {
            this.gs2.shape = shape;
            this.gs2.dim = dim || this.gs2.dim;
        }
        
        // Update the mesh to reflect the change
        this.updateMorph();
    }
    
    // ANIMATION commands (based on jit.anim.drive in Max/MSP)
    // These animate the geo's transformation properties over time
    // Duration is in SECONDS (not milliseconds)
    animateTurn(x, y, z, duration = 1) {
        // Cancel any existing animation
        if (this.animation) {
            this.animation.pause();
        }
        
        const geoObj = this;
        
        if (duration === 0) {
            // Infinite rotation: continuously add to rotation
            // x, y, z are rotation speeds in turns per second
            const rotationPerFrame = {
                x: (x * Math.PI * 2) / 60,  // Convert turns to radians per frame (assuming 60fps)
                y: (y * Math.PI * 2) / 60,
                z: (z * Math.PI * 2) / 60
            };
            
            let animationFrameId;
            const animate = function() {
                geoObj.mesh.rotation.x += rotationPerFrame.x;
                geoObj.mesh.rotation.y += rotationPerFrame.y;
                geoObj.mesh.rotation.z += rotationPerFrame.z;
                animationFrameId = requestAnimationFrame(animate);
            };
            
            // Store animation reference for cancellation
            this.animation = {
                pause: function() {
                    cancelAnimationFrame(animationFrameId);
                }
            };
            
            requestAnimationFrame(animate);
        } else {
            // Finite rotation: animate to target (add x, y, z turns to current rotation)
            const startRot = { x: this.mesh.rotation.x, y: this.mesh.rotation.y, z: this.mesh.rotation.z };
            const targetRot = {
                x: startRot.x + x * Math.PI * 2,
                y: startRot.y + y * Math.PI * 2,
                z: startRot.z + z * Math.PI * 2
            };
            
            this.animation = anime({
                targets: startRot,
                x: targetRot.x,
                y: targetRot.y,
                z: targetRot.z,
                duration: duration * 1000,  // Convert seconds to milliseconds for anime.js
                easing: 'easeInOutQuad',
                update: function() {
                    geoObj.mesh.rotation.set(startRot.x, startRot.y, startRot.z);
                },
                complete: function() {
                    geoObj.animation = null;
                }
            });
        }
    }
    
    animateMoveTo(x, y, z, duration = 1) {
        // Duration is in SECONDS (not milliseconds)
        if (this.animation) {
            this.animation.pause();
        }
        
        const geoObj = this;
        // Store starting position
        const startX = this.mesh.position.x;
        const startY = this.mesh.position.y;
        const startZ = this.mesh.position.z;
        const startTime = Date.now();
        const endTime = startTime + duration * 1000;  // Convert seconds to milliseconds
        
        // Use requestAnimationFrame for more direct control
        let animationFrameId;
        
        const animate = function() {
            const currentTime = Date.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / (duration * 1000), 1);  // Convert seconds to milliseconds
            
            // Ease in out quad
            const easedProgress = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
            
            // Update position
            geoObj.mesh.position.x = startX + (x - startX) * easedProgress;
            geoObj.mesh.position.y = startY + (y - startY) * easedProgress;
            geoObj.mesh.position.z = startZ + (z - startZ) * easedProgress;
            geoObj.position.copy(geoObj.mesh.position);
            
            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            } else {
                geoObj.animation = null;
            }
        };
        
        // Store animation reference for cancellation
        this.animation = {
            pause: function() {
                cancelAnimationFrame(animationFrameId);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    animateScaleTo(x, y, z, duration = 1) {
        // Duration is in SECONDS (not milliseconds)
        if (this.animation) {
            this.animation.pause();
        }
        
        const geoObj = this;
        const startScale = { x: this.mesh.scale.x, y: this.mesh.scale.y, z: this.mesh.scale.z };
        
        this.animation = anime({
            targets: startScale,
            x: x,
            y: y,
            z: z,
            duration: duration * 1000,  // Convert seconds to milliseconds for anime.js
            easing: 'easeInOutQuad',
            update: function() {
                geoObj.mesh.scale.set(startScale.x, startScale.y, startScale.z);
            },
            complete: function() {
                geoObj.animation = null;
            }
        });
    }
    
    animateRotateTo(x, y, z, w, duration = 1) {
        // Quaternion rotation (w, x, y, z)
        // Duration is in SECONDS (not milliseconds)
        if (this.animation) {
            this.animation.pause();
        }
        
        const geoObj = this;
        const startQuat = this.mesh.quaternion.clone();
        const targetQuat = new THREE.Quaternion(x, y, z, w);
        
        this.animation = anime({
            targets: { progress: 0 },
            progress: 1,
            duration: duration * 1000,  // Convert seconds to milliseconds for anime.js
            easing: 'easeInOutQuad',
            update: function() {
                THREE.Quaternion.slerp(startQuat, targetQuat, this.progress, geoObj.mesh.quaternion);
            },
            complete: function() {
                geoObj.animation = null;
            }
        });
    }
    
    // MESH commands (based on jit.gl.mesh in Max/MSP)
    setPolyMode(mode1, mode2) {
        // Poly mode affects how polygons are rendered
        // mode1: front face (0=solid, 1=wireframe)
        // mode2: back face (0=solid, 1=wireframe)
        const wireframe = mode1 === 1 || mode2 === 1;
        this.mesh.material.wireframe = wireframe;
    }
    
    setDrawMode(mode) {
        // Draw mode: points, lines, line_loop, line_strip, triangles, triangle_strip, triangle_fan
        // For now, we'll map common modes to THREE.js equivalents
        switch (mode.toLowerCase()) {
            case 'points':
                // Would need to change geometry to PointGeometry
                this.mesh.material.wireframe = false;
                break;
            case 'lines':
            case 'line_loop':
            case 'line_strip':
                this.mesh.material.wireframe = true;
                break;
            case 'triangles':
            case 'triangle_strip':
            case 'triangle_fan':
                this.mesh.material.wireframe = false;
                break;
            default:
                this.mesh.material.wireframe = false;
        }
    }
    
    setPointSize(size) {
        // Point size (for point rendering)
        this.mesh.material.size = size;
        // Note: For MeshBasicMaterial, this requires Points geometry
    }
    
    setLineWidth(width) {
        // Line width (for wireframe rendering)
        this.mesh.material.wireframeLinewidth = width;
    }
    
    rotateXYZ(x, y, z) {
        // Set rotation in degrees (convert to radians for THREE.js)
        this.mesh.rotation.set(
            x * Math.PI / 180,
            y * Math.PI / 180,
            z * Math.PI / 180
        );
        this.position.copy(this.mesh.position);
    }
    
    // MATERIAL commands (based on jit.gl.material in Max/MSP)
    setMatDiffuse(r, g, b) {
        // Diffuse color (RGB 0-1)
        this.mesh.material.color.setRGB(r, g, b);
    }
    
    setMatEmission(r, g, b) {
        // Emission color (RGB 0-1)
        // For MeshBasicMaterial, we can use emissive property
        if (this.mesh.material.emissive) {
            this.mesh.material.emissive.setRGB(r, g, b);
            this.mesh.material.emissiveIntensity = 1;
        }
    }
    
    setDiffuseTexture(textureName) {
        if (!this.mesh || !this.mesh.material) {
            console.warn(`No mesh or material available for ${this.name}`);
            return;
        }
        
        // Check if this is a texture buffer (tex0, tex1, tex2, tex3)
        if (textureName.startsWith('tex') && textureBuffers[textureName]) {
            const buffer = textureBuffers[textureName];
            if (buffer.texture) {
                // Apply the texture to the material
                this.mesh.material.map = buffer.texture;
                this.mesh.material.needsUpdate = true;
                
                // Register this geometry as a user of this texture buffer
                if (!textureBufferUsers[textureName]) {
                    textureBufferUsers[textureName] = [];
                }
                if (!textureBufferUsers[textureName].includes(this)) {
                    textureBufferUsers[textureName].push(this);
                }
                
                console.log(`Applied texture buffer ${textureName} to ${this.name}`);
                return;
            }
        }
        
        // Fallback: try to load the texture by name/path
        console.log(`Attempting to load texture: ${textureName}`);
        
        // Check if it's a direct texture object reference
        if (window[textureName] && window[textureName].texture) {
            this.mesh.material.map = window[textureName].texture;
            this.mesh.material.needsUpdate = true;
            console.log(`Applied texture ${textureName} to ${this.name}`);
            return;
        }
        
        // For regular texture paths
        const loader = new THREE.TextureLoader();
        loader.load(
            textureName,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                this.mesh.material.map = texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Loaded and applied texture ${textureName} to ${this.name}`);
            },
            undefined,
            (error) => {
                console.error(`Error loading texture ${textureName}:`, error);
            }
        );
    }
    
    setHeightmapTexture(textureName) {
        if (!this.mesh || !this.mesh.material) {
            console.warn(`No mesh or material available for ${this.name}`);
            return;
        }
        
        // Check if this is a texture buffer (tex0, tex1, tex2, tex3)
        if (textureName.startsWith('tex') && textureBuffers[textureName]) {
            const buffer = textureBuffers[textureName];
            if (buffer.texture) {
                // Apply the texture as heightmap
                this.mesh.material.displacementMap = buffer.texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Applied heightmap texture buffer ${textureName} to ${this.name}`);
                return;
            }
        }
        
        // Fallback: try to load the texture by name/path
        console.log(`Attempting to load heightmap texture: ${textureName}`);
        
        // Check if it's a direct texture object reference
        if (window[textureName] && window[textureName].texture) {
            this.mesh.material.displacementMap = window[textureName].texture;
            this.mesh.material.needsUpdate = true;
            console.log(`Applied heightmap texture ${textureName} to ${this.name}`);
            return;
        }
        
        // For regular texture paths
        const loader = new THREE.TextureLoader();
        loader.load(
            textureName,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                this.mesh.material.displacementMap = texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Loaded and applied heightmap texture ${textureName} to ${this.name}`);
            },
            undefined,
            (error) => {
                console.error(`Error loading heightmap texture ${textureName}:`, error);
            }
        );
    }
    
    // Morph between gs1 and gs2 using anime.js for smooth animation
    // xfactor is the floating point value from the ^ operator
    // This implements the sigv formula: xfade[matrix] * xfactor = geo[mesh]
    // Usage: geo ^ <factor> [duration]
    //   - factor: target xfactor (0.0-1.0)
    //   - duration: optional animation time in SECONDS (default: 0.5s)
    morph(factor, duration = 0.5) {
        const targetFactor = Math.max(0, Math.min(1, parseFloat(factor)));
        const animDuration = parseFloat(duration) * 1000 || 500;  // Convert seconds to milliseconds
        
        // If we have an active animation, cancel it
        if (this.animation) {
            this.animation.pause();
        }
        
        // Store reference to this GeoObject for callback
        const geoObj = this;
        
        // Animate the morphFactor to the target
        this.animation = anime({
            targets: this,
            morphFactor: targetFactor,
            duration: animDuration,
            easing: 'easeInOutQuad',
            update: function() {
                geoObj.updateMorph();
            },
            complete: function() {
                geoObj.animation = null;
            }
        });
    }
    
    setPosition(x, y, z) {
        this.position.set(x, y, z);
        this.mesh.position.copy(this.position);
    }
    
    setMaterialColor(color) {
        this.color = color;
        this.mesh.material.color.setHex(color);
    }
    
    remove() {
        // Cancel any active animation
        if (this.animation) {
            this.animation.pause();
        }
        scene.remove(this.mesh);
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh.material) this.mesh.material.dispose();
        delete geoObjects[this.name];
    }
}

// Plato object class (based on jit.gl.plato from Max/MSP Jitter)
// jit.gl.plato creates platonic solids: tetrahedron, cube, octahedron, dodecahedron, icosahedron
// Similar to geo, plato has gs1 and gs2 states with ^ morphing
class PlatoObject {
    constructor(name, x = 0, y = 0, z = -3) {
        this.name = name;
        this.position = new THREE.Vector3(x, y, z);
        // Default: gs1 is tetrahedron, gs2 is cube
        this.gs1 = { shape: 'tetrahedron', dim: 32 };
        this.gs2 = { shape: 'cube', dim: 32 };
        // xfactor/morphFactor: 0.0 = 100% gs1, 1.0 = 100% gs2
        this.morphFactor = 0;
        this.currentShape = 'gs1';
        // Single mesh for this plato object
        this.mesh = null;
        // Color for the mesh
        this.color = COLORS.default;
        // Track active animation for this plato
        this.animation = null;
        
        this.createMesh();
    }
    
    createMesh() {
        // Create a single mesh for this plato
        const geometry = this.createGeometry(this.gs1.shape, this.gs1.dim);
        const material = new THREE.MeshBasicMaterial({ 
            color: this.color,
            transparent: false
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        scene.add(this.mesh);
    }
    
    createGeometry(shape, dim) {
        const shapeConfig = PLATO_CONFIG[shape];
        if (!shapeConfig) {
            console.warn(`Unknown plato shape: ${shape}, using tetrahedron`);
            return PLATO_CONFIG['tetrahedron'].create(PLATO_CONFIG['tetrahedron'].defaultDim);
        }
        return shapeConfig.create(dim || shapeConfig.defaultDim);
    }
    
    // Interpolate between two geometries at the vertex level
    // For platonic solids, uses the same vertex interpolation as geo
    interpolateGeometries(geom1, geom2, factor) {
        factor = Math.max(0, Math.min(1, factor));
        
        // If same shape, try parameter interpolation
        if (geom1.type === geom2.type) {
            return this.interpolateSameType(geom1, geom2, factor);
        }
        
        // For different shapes: vertex-level linear interpolation
        return this.interpolateVertexLevel(geom1, geom2, factor);
    }
    
    // Interpolate parameters for same geometry type
    interpolateSameType(geom1, geom2, factor) {
        // Platonic solids don't have many parameters to interpolate
        // For now, just return based on factor
        return factor < 0.5 ? geom1 : geom2;
    }
    
    // Vertex-level linear interpolation between two geometries
    interpolateVertexLevel(geom1, geom2, factor) {
        const pos1 = geom1.attributes.position;
        const pos2 = geom2.attributes.position;
        
        const vertexCount = Math.min(pos1.count, pos2.count);
        const newGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(vertexCount * 3);
        
        for (let i = 0; i < vertexCount; i++) {
            const idx = i * 3;
            const x1 = pos1.array[idx];
            const y1 = pos1.array[idx + 1];
            const z1 = pos1.array[idx + 2];
            const x2 = pos2.array[idx];
            const y2 = pos2.array[idx + 1];
            const z2 = pos2.array[idx + 2];
            
            positions[idx] = x1 + (x2 - x1) * factor;
            positions[idx + 1] = y1 + (y2 - y1) * factor;
            positions[idx + 2] = z1 + (z2 - z1) * factor;
        }
        
        newGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        newGeometry.computeVertexNormals();
        return newGeometry;
    }
    
    // Update the single mesh geometry based on gs1, gs2, and morphFactor
    updateMorph() {
        this.morphFactor = Math.max(0, Math.min(1, this.morphFactor));
        
        const geom1 = this.createGeometry(this.gs1.shape, this.gs1.dim);
        const geom2 = this.createGeometry(this.gs2.shape, this.gs2.dim);
        const newGeometry = this.interpolateGeometries(geom1, geom2, this.morphFactor);
        
        this.mesh.geometry.dispose();
        this.mesh.geometry = newGeometry;
        
        this.currentShape = this.morphFactor < 0.5 ? 'gs1' : 'gs2';
        
        geom1.dispose();
        geom2.dispose();
    }
    
    updateShape(gs, shape, dim) {
        if (gs === 'gs1') {
            this.gs1.shape = shape;
            this.gs1.dim = dim || this.gs1.dim;
        } else if (gs === 'gs2') {
            this.gs2.shape = shape;
            this.gs2.dim = dim || this.gs2.dim;
        }
        this.updateMorph();
    }
    
    // Morph between gs1 and gs2 using anime.js for smooth animation
    // Duration is in SECONDS (not milliseconds)
    morph(factor, duration = 0.5) {
        const targetFactor = Math.max(0, Math.min(1, parseFloat(factor)));
        const animDuration = parseFloat(duration) * 1000 || 500;  // Convert seconds to milliseconds
        
        if (this.animation) {
            this.animation.pause();
        }
        
        const platoObj = this;
        
        this.animation = anime({
            targets: this,
            morphFactor: targetFactor,
            duration: animDuration,
            easing: 'easeInOutQuad',
            update: function() {
                platoObj.updateMorph();
            },
            complete: function() {
                platoObj.animation = null;
            }
        });
    }
    
    setPosition(x, y, z) {
        this.position.set(x, y, z);
        this.mesh.position.copy(this.position);
    }
    
    setMaterialColor(color) {
        this.color = color;
        this.mesh.material.color.setHex(color);
    }
    
    // ANIMATION commands (based on jit.anim.drive in Max/MSP)
    animateTurn(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const platoObj = this;
        
        if (duration === 0) {
            // Infinite rotation: continuously add to rotation
            const rotationPerFrame = {
                x: (x * Math.PI * 2) / 60,
                y: (y * Math.PI * 2) / 60,
                z: (z * Math.PI * 2) / 60
            };
            
            let animationFrameId;
            const animate = function() {
                platoObj.mesh.rotation.x += rotationPerFrame.x;
                platoObj.mesh.rotation.y += rotationPerFrame.y;
                platoObj.mesh.rotation.z += rotationPerFrame.z;
                animationFrameId = requestAnimationFrame(animate);
            };
            
            this.animation = {
                pause: function() {
                    cancelAnimationFrame(animationFrameId);
                }
            };
            
            requestAnimationFrame(animate);
        } else {
            // Finite rotation: add x, y, z turns to current rotation
            const startRot = { x: this.mesh.rotation.x, y: this.mesh.rotation.y, z: this.mesh.rotation.z };
            const targetRot = {
                x: startRot.x + x * Math.PI * 2,
                y: startRot.y + y * Math.PI * 2,
                z: startRot.z + z * Math.PI * 2
            };
            
            this.animation = anime({
                targets: startRot,
                x: targetRot.x,
                y: targetRot.y,
                z: targetRot.z,
                duration: duration * 1000,
                easing: 'easeInOutQuad',
                update: function() {
                    platoObj.mesh.rotation.set(startRot.x, startRot.y, startRot.z);
                },
                complete: function() {
                    platoObj.animation = null;
                }
            });
        }
    }
    
    animateMoveTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const platoObj = this;
        // Store starting position
        const startX = this.mesh.position.x;
        const startY = this.mesh.position.y;
        const startZ = this.mesh.position.z;
        const startTime = Date.now();
        const endTime = startTime + duration * 1000;  // Convert seconds to milliseconds
        
        // Use requestAnimationFrame for more direct control
        let animationFrameId;
        
        const animate = function() {
            const currentTime = Date.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / (duration * 1000), 1);
            
            // Ease in out quad
            const easedProgress = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
            
            // Update position
            platoObj.mesh.position.x = startX + (x - startX) * easedProgress;
            platoObj.mesh.position.y = startY + (y - startY) * easedProgress;
            platoObj.mesh.position.z = startZ + (z - startZ) * easedProgress;
            platoObj.position.copy(platoObj.mesh.position);
            
            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            } else {
                platoObj.animation = null;
            }
        };
        
        // Store animation reference for cancellation
        this.animation = {
            pause: function() {
                cancelAnimationFrame(animationFrameId);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    animateScaleTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const platoObj = this;
        const startScale = { x: this.mesh.scale.x, y: this.mesh.scale.y, z: this.mesh.scale.z };
        
        this.animation = anime({
            targets: startScale,
            x: x,
            y: y,
            z: z,
            duration: duration * 1000,
            easing: 'easeInOutQuad',
            update: function() {
                platoObj.mesh.scale.set(startScale.x, startScale.y, startScale.z);
            },
            complete: function() {
                platoObj.animation = null;
            }
        });
    }
    
    animateRotateTo(x, y, z, w, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const platoObj = this;
        const startQuat = this.mesh.quaternion.clone();
        const targetQuat = new THREE.Quaternion(x, y, z, w);
        
        this.animation = anime({
            targets: { progress: 0 },
            progress: 1,
            duration: duration * 1000,
            easing: 'easeInOutQuad',
            update: function() {
                THREE.Quaternion.slerp(startQuat, targetQuat, this.progress, platoObj.mesh.quaternion);
            },
            complete: function() {
                platoObj.animation = null;
            }
        });
    }
    
    // MESH commands (based on jit.gl.mesh in Max/MSP)
    setPolyMode(mode1, mode2) {
        const wireframe = mode1 === 1 || mode2 === 1;
        this.mesh.material.wireframe = wireframe;
    }
    
    setDrawMode(mode) {
        switch (mode.toLowerCase()) {
            case 'points':
                this.mesh.material.wireframe = false;
                break;
            case 'lines':
            case 'line_loop':
            case 'line_strip':
                this.mesh.material.wireframe = true;
                break;
            case 'triangles':
            case 'triangle_strip':
            case 'triangle_fan':
                this.mesh.material.wireframe = false;
                break;
            default:
                this.mesh.material.wireframe = false;
        }
    }
    
    setPointSize(size) {
        this.mesh.material.size = size;
    }
    
    setLineWidth(width) {
        this.mesh.material.wireframeLinewidth = width;
    }
    
    rotateXYZ(x, y, z) {
        this.mesh.rotation.set(
            x * Math.PI / 180,
            y * Math.PI / 180,
            z * Math.PI / 180
        );
        this.position.copy(this.mesh.position);
    }
    
    // MATERIAL commands (based on jit.gl.material in Max/MSP)
    setMatDiffuse(r, g, b) {
        this.mesh.material.color.setRGB(r, g, b);
    }
    
    setMatEmission(r, g, b) {
        if (this.mesh.material.emissive) {
            this.mesh.material.emissive.setRGB(r, g, b);
            this.mesh.material.emissiveIntensity = 1;
        }
    }
    
    setDiffuseTexture(textureName) {
        if (!this.mesh || !this.mesh.material) {
            console.warn(`No mesh or material available for ${this.name}`);
            return;
        }
        
        // Check if this is a texture buffer (tex0, tex1, tex2, tex3)
        if (textureName.startsWith('tex') && textureBuffers[textureName]) {
            const buffer = textureBuffers[textureName];
            if (buffer.texture) {
                this.mesh.material.map = buffer.texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Applied texture buffer ${textureName} to ${this.name}`);
                return;
            }
        }
        
        // Check if it's a direct texture object reference
        if (window[textureName] && window[textureName].texture) {
            this.mesh.material.map = window[textureName].texture;
            this.mesh.material.needsUpdate = true;
            console.log(`Applied texture ${textureName} to ${this.name}`);
            return;
        }
        
        // For regular texture paths
        const loader = new THREE.TextureLoader();
        loader.load(
            textureName,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                this.mesh.material.map = texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Loaded and applied texture ${textureName} to ${this.name}`);
            },
            undefined,
            (error) => {
                console.error(`Error loading texture ${textureName}:`, error);
            }
        );
    }
    
    setHeightmapTexture(textureName) {
        if (!this.mesh || !this.mesh.material) {
            console.warn(`No mesh or material available for ${this.name}`);
            return;
        }
        
        // Check if this is a texture buffer (tex0, tex1, tex2, tex3)
        if (textureName.startsWith('tex') && textureBuffers[textureName]) {
            const buffer = textureBuffers[textureName];
            if (buffer.texture) {
                this.mesh.material.displacementMap = buffer.texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Applied heightmap texture buffer ${textureName} to ${this.name}`);
                return;
            }
        }
        
        // Check if it's a direct texture object reference
        if (window[textureName] && window[textureName].texture) {
            this.mesh.material.displacementMap = window[textureName].texture;
            this.mesh.material.needsUpdate = true;
            console.log(`Applied heightmap texture ${textureName} to ${this.name}`);
            return;
        }
        
        // For regular texture paths
        const loader = new THREE.TextureLoader();
        loader.load(
            textureName,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                this.mesh.material.displacementMap = texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Loaded and applied heightmap texture ${textureName} to ${this.name}`);
            },
            undefined,
            (error) => {
                console.error(`Error loading heightmap texture ${textureName}:`, error);
            }
        );
    }
    
    remove() {
        if (this.animation) {
            this.animation.pause();
        }
        scene.remove(this.mesh);
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh.material) this.mesh.material.dispose();
        delete platoObjects[this.name];
    }
}

// Track plato objects
let platoObjects = {};
let currentPlato = null;

// Lorenz Attractor configurations for jit.gl.lorenz in Max/MSP Jitter
// lz creates a Lorenz attractor - a chaotic 3D system
// Classic parameters: sigma=10, rho=28, beta=8/3
// The attractor creates beautiful organic 3D patterns
const LZ_CONFIG = {
    // Default Lorenz parameters (classic values)
    sigma: 10,
    rho: 28,
    beta: 8 / 3,
    // Integration parameters
    dt: 0.01,      // Time step
    steps: 1000,   // Number of steps to compute
    scale: 0.1     // Scale of the attractor
};

// Procedural shape configurations for jit.gl.proc in Max/MSP Jitter
// Based on the Max patch at https://magfoto.any.org/proc
// proc starts with a gridshape (gs) - default is cone with dim 100x100
// Processed through noise.simplex algorithm and normalized
// Outputs to jit.slide then to mesh
// Controlled by clocker, slide, and time params
// "period time 0." stops animation, freezing proc at current form
const PROC_SHAPE_CONFIG = {
    'cone': {
        create: (dim) => new THREE.ConeGeometry(1, 2, dim, dim),
        defaultDim: 100
    },
    'sphere': {
        create: (dim) => new THREE.SphereGeometry(1, dim, dim),
        defaultDim: 100
    },
    'plane': {
        create: (dim) => new THREE.PlaneGeometry(2, 2, dim, dim),
        defaultDim: 100
    },
    'cylinder': {
        create: (dim) => new THREE.CylinderGeometry(1, 1, 2, dim, dim),
        defaultDim: 100
    },
    'torus': {
        create: (dim) => new THREE.TorusGeometry(1, 0.3, dim, dim / 2),
        defaultDim: 100
    }
};

// Linear interpolation helper
function lerp(a, b, t) {
    return a + t * (b - a);
}

// Proc object class (based on jit.gl.proc from Max/MSP Jitter)
// Based on the Max patch at https://magfoto.any.org/proc
// proc starts with a gridshape (gs) - default is cone with dim 100x100
// Processed through noise.simplex algorithm and normalized
// Outputs to jit.slide then to mesh
// Controlled by clocker, slide, and time params
// "period time 0." stops animation, freezing proc at current form
class ProcObject {
    constructor(name, x = 0, y = 0, z = -3) {
        this.name = name;
        this.position = new THREE.Vector3(x, y, z);
        // Gridshape (gs) parameter - default is cone (matching Max patch)
        this.gs = { shape: 'cone', dim: 100 };
        // Noise parameters
        this.noise = {
            scale: 0.5,    // Noise scale/frequency
            strength: 0.3, // Noise strength/intensity
            speed: 0.01,   // Animation speed
            time: 0        // Current time offset
        };
        // Time parameter - controls animation
        // Setting time to 0 stops animation (freezes form)
        this.time = 1.0;  // 1.0 = animating, 0.0 = frozen
        // Single mesh for this proc object
        this.mesh = null;
        // Color for the mesh
        this.color = COLORS.default;
        // Track active animations
        this.animation = null;
        this.noiseAnimation = null;
        // Store original positions for noise deformation
        this.originalPositions = null;
        
        this.createMesh();
    }
    
    createMesh() {
        // Create geometry based on gridshape (gs) parameter
        const geometry = this.createGeometry(this.gs.shape, this.gs.dim);
        const material = new THREE.MeshStandardMaterial({ 
            color: this.color,
            transparent: false
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        scene.add(this.mesh);
        
        // Store original vertex positions for noise deformation
        this.originalPositions = new Float32Array(geometry.attributes.position.array);
        
        // Start noise animation
        this.startNoiseAnimation();
    }
    
    createGeometry(shape, dim) {
        const shapeConfig = PROC_SHAPE_CONFIG[shape];
        if (!shapeConfig) {
            console.warn(`Unknown proc shape: ${shape}, using cone`);
            return PROC_SHAPE_CONFIG['cone'].create(PROC_SHAPE_CONFIG['cone'].defaultDim);
        }
        return shapeConfig.create(dim || shapeConfig.defaultDim);
    }
    
    // Fast noise function for real-time animation
    // Value noise implementation for organic deformations
    fastNoise(x, y, z, timeOffset) {
        // Combine coordinates with time for animation
        const nx = x + timeOffset * 0.01;
        const ny = y + timeOffset * 0.01;
        const nz = z + timeOffset * 0.01;
        
        // Get integer coordinates
        const xi = Math.floor(nx) & 255;
        const yi = Math.floor(ny) & 255;
        const zi = Math.floor(nz) & 255;
        
        // Get fractional coordinates
        const xf = nx - Math.floor(nx);
        const yf = ny - Math.floor(ny);
        const zf = nz - Math.floor(nz);
        
        // Simple pseudo-random hash for grid points
        // Using a basic permutation to get consistent random values
        const perm = (x, y, z) => {
            let n = x + y * 57 + z * 113;
            n = (n << 13) ^ n;
            return (1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0) * 2 - 1;
        };
        
        // Get random values at the 8 corners of the cube
        const c000 = perm(xi, yi, zi);
        const c100 = perm(xi + 1, yi, zi);
        const c010 = perm(xi, yi + 1, zi);
        const c110 = perm(xi + 1, yi + 1, zi);
        const c001 = perm(xi, yi, zi + 1);
        const c101 = perm(xi + 1, yi, zi + 1);
        const c011 = perm(xi, yi + 1, zi + 1);
        const c111 = perm(xi + 1, yi + 1, zi + 1);
        
        // Smooth interpolation (5x^4 - 8x^3 + 3x^2)
        const smooth = (t) => t * t * t * (t * (t * 5 - 8) + 3);
        const sx = smooth(xf);
        const sy = smooth(yf);
        const sz = smooth(zf);
        
        // Trilinear interpolation
        const x0 = c000 + sx * (c100 - c000);
        const x1 = c010 + sx * (c110 - c010);
        const y0 = x0 + sy * (x1 - x0);
        
        const x2 = c001 + sx * (c101 - c001);
        const x3 = c011 + sx * (c111 - c011);
        const y1 = x2 + sy * (x3 - x2);
        
        return y0 + sz * (y1 - y0);
    }
    
    // Apply noise deformation to the mesh vertices
    applyNoiseDeformation() {
        if (!this.mesh || !this.mesh.geometry || !this.originalPositions) return;
        
        const geometry = this.mesh.geometry;
        const position = geometry.attributes.position;
        const noiseParams = this.noise;
        const timeScale = this.time; // Scale animation by time parameter
        
        // Apply noise to each vertex
        for (let i = 0; i < position.count; i++) {
            const idx = i * 3;
            const x = this.originalPositions[idx];
            const y = this.originalPositions[idx + 1];
            const z = this.originalPositions[idx + 2];
            
            // Calculate separate noise values for each axis for organic deformation
            const noiseX = this.fastNoise(
                x * noiseParams.scale,
                y * noiseParams.scale,
                z * noiseParams.scale,
                noiseParams.time
            );
            const noiseY = this.fastNoise(
                x * noiseParams.scale + 1000,
                y * noiseParams.scale + 1000,
                z * noiseParams.scale + 1000,
                noiseParams.time
            );
            const noiseZ = this.fastNoise(
                x * noiseParams.scale + 2000,
                y * noiseParams.scale + 2000,
                z * noiseParams.scale + 2000,
                noiseParams.time
            );
            
            // Apply noise displacement to each axis independently
            position.array[idx] = x + noiseX * noiseParams.strength * timeScale;
            position.array[idx + 1] = y + noiseY * noiseParams.strength * timeScale;
            position.array[idx + 2] = z + noiseZ * noiseParams.strength * timeScale;
        }
        
        position.needsUpdate = true;
        geometry.computeVertexNormals();
    }
    
    // Start the noise animation
    startNoiseAnimation() {
        // Stop any existing animation
        if (this.noiseAnimation) {
            this.noiseAnimation.pause();
        }
        
        const procObj = this;
        
        // Animate the noise time parameter
        this.noiseAnimation = anime({
            targets: this.noise,
            time: 1000, // Arbitrary large number for continuous animation
            duration: 10000, // 10 second cycle
            easing: 'linear',
            loop: true,
            update: function() {
                if (procObj.time > 0) {
                    // Only animate if time > 0
                    procObj.applyNoiseDeformation();
                }
            }
        });
    }
    
    // Set gridshape (gs) - the base geometry shape
    setGridshape(shape, dim) {
        this.gs.shape = shape;
        this.gs.dim = dim || this.gs.dim;
        
        // Recreate mesh with new geometry
        const oldMesh = this.mesh;
        this.createMesh();
        
        // Dispose old mesh
        if (oldMesh) {
            scene.remove(oldMesh);
            if (oldMesh.geometry) oldMesh.geometry.dispose();
            if (oldMesh.material) oldMesh.material.dispose();
        }
        
        return `Gridshape set to ${shape}`;
    }
    
    // Set noise parameters
    setNoiseScale(scale) {
        this.noise.scale = parseFloat(scale);
    }
    
    setNoiseStrength(strength) {
        this.noise.strength = parseFloat(strength);
    }
    
    // Set time parameter - controls animation
    // time 0. stops animation (freezes), time 1. enables animation
    setTime(time) {
        this.time = Math.max(0, Math.min(1, parseFloat(time)));
    }
    
    // Set position
    setPosition(x, y, z) {
        this.position.set(x, y, z);
        this.mesh.position.copy(this.position);
    }
    
    // Set material color
    setMaterialColor(color) {
        this.color = color;
        this.mesh.material.color.setHex(color);
    }
    
    // ANIMATION commands (based on jit.anim.drive in Max/MSP)
    animateTurn(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const procObj = this;
        
        if (duration === 0) {
            // Infinite rotation: continuously add to rotation
            const rotationPerFrame = {
                x: (x * Math.PI * 2) / 60,
                y: (y * Math.PI * 2) / 60,
                z: (z * Math.PI * 2) / 60
            };
            
            let animationFrameId;
            const animate = function() {
                procObj.mesh.rotation.x += rotationPerFrame.x;
                procObj.mesh.rotation.y += rotationPerFrame.y;
                procObj.mesh.rotation.z += rotationPerFrame.z;
                animationFrameId = requestAnimationFrame(animate);
            };
            
            this.animation = {
                pause: function() {
                    cancelAnimationFrame(animationFrameId);
                }
            };
            
            requestAnimationFrame(animate);
        } else {
            // Finite rotation: add x, y, z turns to current rotation
            const startRot = { x: this.mesh.rotation.x, y: this.mesh.rotation.y, z: this.mesh.rotation.z };
            const targetRot = {
                x: startRot.x + x * Math.PI * 2,
                y: startRot.y + y * Math.PI * 2,
                z: startRot.z + z * Math.PI * 2
            };
            
            this.animation = anime({
                targets: startRot,
                x: targetRot.x,
                y: targetRot.y,
                z: targetRot.z,
                duration: duration * 1000,
                easing: 'easeInOutQuad',
                update: function() {
                    procObj.mesh.rotation.set(startRot.x, startRot.y, startRot.z);
                },
                complete: function() {
                    procObj.animation = null;
                }
            });
        }
    }
    
    animateMoveTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const procObj = this;
        // Store starting position
        const startX = this.mesh.position.x;
        const startY = this.mesh.position.y;
        const startZ = this.mesh.position.z;
        const startTime = Date.now();
        const endTime = startTime + duration * 1000;  // Convert seconds to milliseconds
        
        // Use requestAnimationFrame for more direct control
        let animationFrameId;
        
        const animate = function() {
            const currentTime = Date.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / (duration * 1000), 1);
            
            // Ease in out quad
            const easedProgress = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
            
            // Update position
            procObj.mesh.position.x = startX + (x - startX) * easedProgress;
            procObj.mesh.position.y = startY + (y - startY) * easedProgress;
            procObj.mesh.position.z = startZ + (z - startZ) * easedProgress;
            procObj.position.copy(procObj.mesh.position);
            
            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            } else {
                procObj.animation = null;
            }
        };
        
        // Store animation reference for cancellation
        this.animation = {
            pause: function() {
                cancelAnimationFrame(animationFrameId);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    animateScaleTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const procObj = this;
        const startScale = { x: this.mesh.scale.x, y: this.mesh.scale.y, z: this.mesh.scale.z };
        
        this.animation = anime({
            targets: startScale,
            x: x,
            y: y,
            z: z,
            duration: duration * 1000,
            easing: 'easeInOutQuad',
            update: function() {
                procObj.mesh.scale.set(startScale.x, startScale.y, startScale.z);
            },
            complete: function() {
                procObj.animation = null;
            }
        });
    }
    
    animateRotateTo(x, y, z, w, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const procObj = this;
        const startQuat = this.mesh.quaternion.clone();
        const targetQuat = new THREE.Quaternion(x, y, z, w);
        
        this.animation = anime({
            targets: { progress: 0 },
            progress: 1,
            duration: duration * 1000,
            easing: 'easeInOutQuad',
            update: function() {
                THREE.Quaternion.slerp(startQuat, targetQuat, this.progress, procObj.mesh.quaternion);
            },
            complete: function() {
                procObj.animation = null;
            }
        });
    }
    
    // MESH commands (based on jit.gl.mesh in Max/MSP)
    setPolyMode(mode1, mode2) {
        const wireframe = mode1 === 1 || mode2 === 1;
        this.mesh.material.wireframe = wireframe;
    }
    
    setDrawMode(mode) {
        switch (mode.toLowerCase()) {
            case 'points':
                this.mesh.material.wireframe = false;
                break;
            case 'lines':
            case 'line_loop':
            case 'line_strip':
                this.mesh.material.wireframe = true;
                break;
            case 'triangles':
            case 'triangle_strip':
            case 'triangle_fan':
                this.mesh.material.wireframe = false;
                break;
            default:
                this.mesh.material.wireframe = false;
        }
    }
    
    setPointSize(size) {
        this.mesh.material.size = size;
    }
    
    setLineWidth(width) {
        this.mesh.material.wireframeLinewidth = width;
    }
    
    rotateXYZ(x, y, z) {
        this.mesh.rotation.set(
            x * Math.PI / 180,
            y * Math.PI / 180,
            z * Math.PI / 180
        );
        this.position.copy(this.mesh.position);
    }
    
    // MATERIAL commands (based on jit.gl.material in Max/MSP)
    setMatDiffuse(r, g, b) {
        this.mesh.material.color.setRGB(r, g, b);
    }
    
    setMatEmission(r, g, b) {
        if (this.mesh.material.emissive) {
            this.mesh.material.emissive.setRGB(r, g, b);
            this.mesh.material.emissiveIntensity = 1;
        }
    }
    
    setDiffuseTexture(textureName) {
        if (!this.mesh || !this.mesh.material) {
            console.warn(`No mesh or material available for ${this.name}`);
            return;
        }
        
        // Check if this is a texture buffer (tex0, tex1, tex2, tex3)
        if (textureName.startsWith('tex') && textureBuffers[textureName]) {
            const buffer = textureBuffers[textureName];
            if (buffer.texture) {
                this.mesh.material.map = buffer.texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Applied texture buffer ${textureName} to ${this.name}`);
                return;
            }
        }
        
        // Check if it's a direct texture object reference
        if (window[textureName] && window[textureName].texture) {
            this.mesh.material.map = window[textureName].texture;
            this.mesh.material.needsUpdate = true;
            console.log(`Applied texture ${textureName} to ${this.name}`);
            return;
        }
        
        // For regular texture paths
        const loader = new THREE.TextureLoader();
        loader.load(
            textureName,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                this.mesh.material.map = texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Loaded and applied texture ${textureName} to ${this.name}`);
            },
            undefined,
            (error) => {
                console.error(`Error loading texture ${textureName}:`, error);
            }
        );
    }
    
    setHeightmapTexture(textureName) {
        if (!this.mesh || !this.mesh.material) {
            console.warn(`No mesh or material available for ${this.name}`);
            return;
        }
        
        // Check if this is a texture buffer (tex0, tex1, tex2, tex3)
        if (textureName.startsWith('tex') && textureBuffers[textureName]) {
            const buffer = textureBuffers[textureName];
            if (buffer.texture) {
                this.mesh.material.displacementMap = buffer.texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Applied heightmap texture buffer ${textureName} to ${this.name}`);
                return;
            }
        }
        
        // Check if it's a direct texture object reference
        if (window[textureName] && window[textureName].texture) {
            this.mesh.material.displacementMap = window[textureName].texture;
            this.mesh.material.needsUpdate = true;
            console.log(`Applied heightmap texture ${textureName} to ${this.name}`);
            return;
        }
        
        // For regular texture paths
        const loader = new THREE.TextureLoader();
        loader.load(
            textureName,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                this.mesh.material.displacementMap = texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Loaded and applied heightmap texture ${textureName} to ${this.name}`);
            },
            undefined,
            (error) => {
                console.error(`Error loading heightmap texture ${textureName}:`, error);
            }
        );
    }
    
    remove() {
        if (this.animation) {
            this.animation.pause();
        }
        if (this.noiseAnimation) {
            this.noiseAnimation.pause();
        }
        scene.remove(this.mesh);
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh.material) this.mesh.material.dispose();
        delete procObjects[this.name];
    }
}

// Track proc objects
let procObjects = {};
let currentProc = null;

// Track lz objects
let lzObjects = {};
let currentLz = null;

// Typo configurations for jit.gl.text in Max/MSP Jitter
// typo creates 3D text geometry
const TYPO_CONFIG = {
    font: 'helvetiker',
    size: 0.5,
    height: 0.1,
    curveSegments: 12,
    bevelEnabled: false
};

// Load default font for text geometry
let typoFont = null;

// Only use FontLoader if it exists in THREE.js
if (THREE.FontLoader) {
    const fontLoader = new THREE.FontLoader();
    // Try to load helvetiker font (default in THREE.js examples)
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_regular.typeface.json', function(font) {
        typoFont = font;
    });
} else {
    console.log('THREE.FontLoader not available - typo will use placeholder geometry');
}

// TypoObject class (based on jit.gl.text from Max/MSP Jitter)
// Creates 3D text geometry using TextGeometry for proper 3D rotation support
class TypoObject {
    constructor(name, x = 0, y = 0, z = -3) {
        this.name = name;
        this.position = new THREE.Vector3(x, y, z);
        // Text content - default to 'A' as requested
        this.text = 'A';
        // Text parameters
        this.params = {
            font: TYPO_CONFIG.font,
            size: TYPO_CONFIG.size,
            height: TYPO_CONFIG.height,
            curveSegments: TYPO_CONFIG.curveSegments,
            bevelEnabled: TYPO_CONFIG.bevelEnabled
        };
        // Time control (similar to proc)
        this.time = 1.0;
        // Mesh for 3D text display (not sprite)
        this.mesh = null;
        // Color for the text - default to blue (0x00BFFF)
        this.color = 0x00BFFF;
        // Track active animations
        this.animation = null;
        // Group to hold the mesh (for better positioning)
        this.group = null;
        
        this.createMesh();
    }
    
    createMesh() {
        // Remove old mesh if it exists
        if (this.mesh) {
            this.removeMesh();
        }
        
        // Create a group for the text
        this.group = new THREE.Group();
        this.group.position.copy(this.position);
        
        // Create the 3D text geometry
        // If font is not loaded yet, create a placeholder
        if (!typoFont) {
            // Create a simple placeholder box
            const geometry = new THREE.BoxGeometry(0.3, 0.3, 0.1);
            const material = new THREE.MeshBasicMaterial({ 
                color: this.color,
                transparent: false
            });
            this.mesh = new THREE.Mesh(geometry, material);
            this.group.add(this.mesh);
        } else if (THREE.TextGeometry) {
            // Create text geometry
            const textGeometry = new THREE.TextGeometry(this.text, {
                font: typoFont,
                size: this.params.size,
                height: this.params.height,
                curveSegments: this.params.curveSegments,
                bevelEnabled: this.params.bevelEnabled
            });
            
            // Center the text geometry
            textGeometry.computeBoundingBox();
            const centerOffset = new THREE.Vector3();
            if (textGeometry.boundingBox) {
                centerOffset.x = - (textGeometry.boundingBox.max.x + textGeometry.boundingBox.min.x) / 2;
                centerOffset.y = - (textGeometry.boundingBox.max.y + textGeometry.boundingBox.min.y) / 2;
            }
            
            const material = new THREE.MeshBasicMaterial({ 
                color: this.color,
                transparent: false
            });
            
            this.mesh = new THREE.Mesh(textGeometry, material);
            this.mesh.position.copy(centerOffset);
            this.group.add(this.mesh);
        }
        
        scene.add(this.group);
    }
    
    removeMesh() {
        if (this.mesh && this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh && this.mesh.material) this.mesh.material.dispose();
        if (this.group) scene.remove(this.group);
    }
    
    // Update the text displayed
    setText(text) {
        this.text = text;
        this.createMesh(); // Recreate mesh with new text
    }
    
    // Set font parameters
    setFont(font) {
        this.params.font = font || this.params.font;
        // Font changes require mesh recreation
        this.createMesh();
    }
    
    setSize(size) {
        this.params.size = parseFloat(size) || this.params.size;
        this.createMesh();
    }
    
    setHeight(height) {
        this.params.height = parseFloat(height) || this.params.height;
        this.createMesh();
    }
    
    // Set time parameter - controls animation
    setTime(time) {
        this.time = Math.max(0, Math.min(1, parseFloat(time)));
    }
    
    // Set position
    setPosition(x, y, z) {
        this.position.set(x, y, z);
        if (this.group) {
            this.group.position.copy(this.position);
        }
    }
    
    // Set material color
    setMaterialColor(color) {
        this.color = color;
        if (this.mesh && this.mesh.material) {
            this.mesh.material.color.setHex(color);
        }
    }
    
    // ANIMATION commands (based on jit.anim.drive in Max/MSP)
    animateTurn(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const typoObj = this;
        
        if (duration === 0) {
            // Infinite rotation: continuously add to rotation
            const rotationPerFrame = {
                x: (x * Math.PI * 2) / 60,
                y: (y * Math.PI * 2) / 60,
                z: (z * Math.PI * 2) / 60
            };
            
            let animationFrameId;
            const animate = function() {
                typoObj.group.rotation.x += rotationPerFrame.x;
                typoObj.group.rotation.y += rotationPerFrame.y;
                typoObj.group.rotation.z += rotationPerFrame.z;
                animationFrameId = requestAnimationFrame(animate);
            };
            
            this.animation = {
                pause: function() {
                    cancelAnimationFrame(animationFrameId);
                }
            };
            
            requestAnimationFrame(animate);
        } else {
            // Finite rotation: add x, y, z turns to current rotation
            const startRot = { x: this.group.rotation.x, y: this.group.rotation.y, z: this.group.rotation.z };
            const targetRot = {
                x: startRot.x + x * Math.PI * 2,
                y: startRot.y + y * Math.PI * 2,
                z: startRot.z + z * Math.PI * 2
            };
            
            this.animation = anime({
                targets: startRot,
                x: targetRot.x,
                y: targetRot.y,
                z: targetRot.z,
                duration: duration * 1000,
                easing: 'easeInOutQuad',
                update: function() {
                    typoObj.group.rotation.set(startRot.x, startRot.y, startRot.z);
                },
                complete: function() {
                    typoObj.animation = null;
                }
            });
        }
    }
    
    animateMoveTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const typoObj = this;
        // Store starting position
        const startX = this.group.position.x;
        const startY = this.group.position.y;
        const startZ = this.group.position.z;
        const startTime = Date.now();
        const endTime = startTime + duration * 1000;  // Convert seconds to milliseconds
        
        // Use requestAnimationFrame for more direct control
        let animationFrameId;
        
        const animate = function() {
            const currentTime = Date.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / (duration * 1000), 1);
            
            // Ease in out quad
            const easedProgress = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
            
            // Update position
            typoObj.group.position.x = startX + (x - startX) * easedProgress;
            typoObj.group.position.y = startY + (y - startY) * easedProgress;
            typoObj.group.position.z = startZ + (z - startZ) * easedProgress;
            typoObj.position.copy(typoObj.group.position);
            
            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            } else {
                typoObj.animation = null;
            }
        };
        
        // Store animation reference for cancellation
        this.animation = {
            pause: function() {
                cancelAnimationFrame(animationFrameId);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    animateScaleTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const typoObj = this;
        const startScale = { x: this.group.scale.x, y: this.group.scale.y, z: this.group.scale.z };
        
        this.animation = anime({
            targets: startScale,
            x: x,
            y: y,
            z: z,
            duration: duration * 1000,
            easing: 'easeInOutQuad',
            update: function() {
                typoObj.group.scale.set(startScale.x, startScale.y, startScale.z);
            },
            complete: function() {
                typoObj.animation = null;
            }
        });
    }
    
    animateRotateTo(x, y, z, w, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const typoObj = this;
        const startQuat = this.group.quaternion.clone();
        const targetQuat = new THREE.Quaternion(x, y, z, w);
        
        this.animation = anime({
            targets: { progress: 0 },
            progress: 1,
            duration: duration * 1000,
            easing: 'easeInOutQuad',
            update: function() {
                THREE.Quaternion.slerp(startQuat, targetQuat, this.progress, typoObj.group.quaternion);
            },
            complete: function() {
                typoObj.animation = null;
            }
        });
    }
    
    // MESH commands (based on jit.gl.mesh in Max/MSP)
    setPolyMode(mode1, mode2) {
        // For 3D text mesh, toggle wireframe based on polygon mode
        if (this.mesh && this.mesh.material) {
            this.mesh.material.wireframe = (mode1 === 0 || mode2 === 0);
        }
    }
    
    setDrawMode(mode) {
        // For 3D text, draw mode affects visibility
        if (!this.group) return;
        
        switch (mode.toLowerCase()) {
            case 'points':
            case 'lines':
            case 'line_loop':
            case 'line_strip':
                this.group.visible = false;
                break;
            case 'triangles':
            case 'triangle_strip':
            case 'triangle_fan':
            default:
                this.group.visible = true;
                break;
        }
    }
    
    setPointSize(size) {
        // For 3D text, scale the group
        if (this.group) {
            const scale = parseFloat(size) / 10 || 1;
            this.group.scale.set(scale, scale, scale);
        }
    }
    
    setLineWidth(width) {
        // For 3D text mesh, set wireframe line width
        if (this.mesh && this.mesh.material) {
            this.mesh.material.wireframeLinewidth = width;
        }
    }
    
    rotateXYZ(x, y, z) {
        if (this.group) {
            this.group.rotation.set(
                x * Math.PI / 180,
                y * Math.PI / 180,
                z * Math.PI / 180
            );
            this.position.copy(this.group.position);
        }
    }
    
    // MATERIAL commands (based on jit.gl.material in Max/MSP)
    setMatDiffuse(r, g, b) {
        // For 3D mesh, update material color
        if (this.mesh && this.mesh.material) {
            this.mesh.material.color.setRGB(r, g, b);
        }
    }
    
    setMatEmission(r, g, b) {
        // For 3D mesh with emissive material
        if (this.mesh && this.mesh.material && this.mesh.material.emissive) {
            this.mesh.material.emissive.setRGB(r, g, b);
            this.mesh.material.emissiveIntensity = 1;
        }
    }
    
    setDiffuseTexture(textureName) {
        console.log(`Typo: diffuse_texture ${textureName} (not implemented for 3D text)`);
    }
    
    setHeightmapTexture(textureName) {
        console.log(`Typo: heightmap_texture ${textureName} (not implemented for 3D text)`);
    }
    
    remove() {
        if (this.animation) {
            this.animation.pause();
        }
        this.removeMesh();
        delete typoObjects[this.name];
    }
}

// Track typo objects
let typoObjects = {};
let currentTypo = null;

// Model configurations for jit.gl.model in Max/MSP Jitter
// model loads 3D model files
const MODEL_CONFIG = {
    autoLoad: true,
    scale: 1.0,
    smooth: true
};

// ModelObject class (based on jit.gl.model from Max/MSP Jitter)
// Loads 3D model files (OBJ, glTF, etc.)
class ModelObject {
    constructor(name, x = 0, y = 0, z = -3) {
        this.name = name;
        this.position = new THREE.Vector3(x, y, z);
        // Model file path/URL
        this.file = '';
        // Model parameters
        this.params = {
            scale: MODEL_CONFIG.scale,
            smooth: MODEL_CONFIG.smooth
        };
        // Time control
        this.time = 1.0;
        // Single mesh/group for this model
        this.mesh = null;
        this.group = null;
        // Color for the mesh
        this.color = COLORS.default;
        // Track active animations
        this.animation = null;
        // Track if model is loaded
        this.loaded = false;
        
        this.createMesh();
    }
    
    createMesh() {
        // Create a placeholder mesh until model is loaded
        const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const material = new THREE.MeshBasicMaterial({ 
            color: this.color,
            transparent: false
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        
        this.group = new THREE.Group();
        this.group.add(this.mesh);
        scene.add(this.group);
    }
    
    // Load a 3D model file
    // Supports: .gltf, .glb, .obj, .dae (collada), .stl, .fbx, .ply, .pcd (point cloud)
    // Note: Some loaders require additional scripts to be loaded in index.html
    load(file, callback) {
        this.file = file;
        const modelObj = this;
        
        // Extract file extension
        const extension = file.toLowerCase().split('.').pop();
        
        console.log(`Model: Loading ${file} (format: .${extension})`);
        
        // Clear existing mesh (placeholder)
        if (this.group && this.mesh) {
            this.group.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) {
                if (Array.isArray(this.mesh.material)) {
                    this.mesh.material.forEach(mat => mat.dispose());
                } else {
                    this.mesh.material.dispose();
                }
            }
            this.mesh = null;
        }
        
        // Detect format and use appropriate loader
        switch (extension) {
            case 'gltf':
                return this.loadGLTF(file, callback);
            case 'glb':
                return this.loadGLTF(file, callback);
            case 'obj':
                return this.loadOBJ(file, callback);
            case 'dae':
                return this.loadCollada(file, callback);
            case 'stl':
                return this.loadSTL(file, callback);
            case 'fbx':
                return this.loadFBX(file, callback);
            case 'ply':
                return this.loadPLY(file, callback);
            case 'pcd':
            case 'xyz':
            case 'pts':
                return this.loadPointCloud(file, callback);
            default:
                console.warn(`Model: Unsupported format .${extension}. Trying GLTF/GLB loader as fallback...`);
                return this.loadGLTF(file, callback);
        }
    }
    
    // Load GLTF/GLB format (native THREE.js support in r147+)
    loadGLTF(file, callback) {
        const modelObj = this;
        
        // Check if GLTFLoader is available
        if (!THREE.GLTFLoader) {
            console.error('Model: GLTFLoader not available. Add <script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js"></script> to index.html');
            return { error: 'GLTFLoader not loaded. Add THREE.js GLTFLoader to index.html.' };
        }
        
        const loader = new THREE.GLTFLoader();
        const manager = new THREE.LoadingManager();
        
        // Track loading progress
        manager.onStart = function(url, itemsLoaded, itemsTotal) {
            console.log(`Model: Started loading ${url} (${itemsLoaded}/${itemsTotal} items)`);
        };
        
        manager.onProgress = function(url, itemsLoaded, itemsTotal) {
            console.log(`Model: Loading ${url} - ${itemsLoaded}/${itemsTotal} items loaded`);
        };
        
        manager.onError = function(url) {
            console.error(`Model: Error loading ${url}`);
        };
        
        loader.load(file, function (gltf) {
            console.log(`Model: GLTF loaded successfully from ${file}`);
            
            // Remove placeholder mesh
            if (modelObj.group && modelObj.mesh) {
                modelObj.group.remove(modelObj.mesh);
                modelObj.mesh.geometry.dispose();
                modelObj.mesh = null;
            }
            
            // Add loaded model to group
            modelObj.group.add(gltf.scene);
            modelObj.mesh = gltf.scene; // Store reference to the loaded scene
            
            // Scale to match our coordinate system
            modelObj.mesh.scale.set(modelObj.params.scale, modelObj.params.scale, modelObj.params.scale);
            
            // Set position
            modelObj.mesh.position.copy(modelObj.position);
            
            // Update group position
            modelObj.group.position.copy(modelObj.position);
            
            // Apply smooth shading if enabled
            if (modelObj.params.smooth) {
                gltf.scene.traverse(function(child) {
                    if (child.isMesh) {
                        child.geometry.computeVertexNormals();
                        if (child.material) {
                            child.material.flatShading = false;
                        }
                    }
                });
            }
            
            modelObj.loaded = true;
            modelObj.file = file;
            
            console.log(`Model: GLTF ${file} loaded and added to scene`);
            if (callback) callback({ output: `Loaded GLTF model: ${file}` });
            
        }, undefined, function (error) {
            console.error(`Model: Error loading GLTF ${file}:`, error);
            if (callback) callback({ error: `Failed to load GLTF ${file}: ${error.message}` });
        });
        
        return { output: `Loading GLTF model: ${file}...` };
    }
    
    // Load OBJ format (with optional MTL)
    loadOBJ(file, callback) {
        const modelObj = this;
        
        if (!THREE.OBJLoader) {
            console.error('Model: OBJLoader not available. Add <script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/OBJLoader.js"></script> to index.html');
            return { error: 'OBJLoader not loaded. Add THREE.js OBJLoader to index.html.' };
        }
        
        const loader = new THREE.OBJLoader();
        
        loader.load(file, function (object) {
            console.log(`Model: OBJ loaded successfully from ${file}`);
            
            // Remove placeholder mesh
            if (modelObj.group && modelObj.mesh) {
                modelObj.group.remove(modelObj.mesh);
                modelObj.mesh.geometry.dispose();
                modelObj.mesh = null;
            }
            
            // Add loaded model to group
            modelObj.group.add(object);
            modelObj.mesh = object;
            
            // Scale and position
            modelObj.mesh.scale.set(modelObj.params.scale, modelObj.params.scale, modelObj.params.scale);
            modelObj.mesh.position.copy(modelObj.position);
            modelObj.group.position.copy(modelObj.position);
            
            // Apply smooth shading
            if (modelObj.params.smooth) {
                object.traverse(function(child) {
                    if (child.isMesh && child.geometry) {
                        child.geometry.computeVertexNormals();
                        if (child.material) {
                            child.material.flatShading = false;
                        }
                    }
                });
            }
            
            modelObj.loaded = true;
            modelObj.file = file;
            
            console.log(`Model: OBJ ${file} loaded and added to scene`);
            if (callback) callback({ output: `Loaded OBJ model: ${file}` });
            
        }, undefined, function (error) {
            console.error(`Model: Error loading OBJ ${file}:`, error);
            if (callback) callback({ error: `Failed to load OBJ ${file}: ${error.message}` });
        });
        
        return { output: `Loading OBJ model: ${file}...` };
    }
    
    // Load Collada (DAE) format
    loadCollada(file, callback) {
        const modelObj = this;
        
        if (!THREE.ColladaLoader) {
            console.error('Model: ColladaLoader not available. Add <script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/ColladaLoader.js"></script> to index.html');
            return { error: 'ColladaLoader not loaded. Add THREE.js ColladaLoader to index.html.' };
        }
        
        const loader = new THREE.ColladaLoader();
        
        loader.load(file, function (collada) {
            console.log(`Model: Collada (DAE) loaded successfully from ${file}`);
            
            const object = collada.scene;
            
            // Remove placeholder mesh
            if (modelObj.group && modelObj.mesh) {
                modelObj.group.remove(modelObj.mesh);
                modelObj.mesh.geometry.dispose();
                modelObj.mesh = null;
            }
            
            // Add loaded model to group
            modelObj.group.add(object);
            modelObj.mesh = object;
            
            // Scale and position
            modelObj.mesh.scale.set(modelObj.params.scale, modelObj.params.scale, modelObj.params.scale);
            modelObj.mesh.position.copy(modelObj.position);
            modelObj.group.position.copy(modelObj.position);
            
            // Apply smooth shading
            if (modelObj.params.smooth) {
                object.traverse(function(child) {
                    if (child.isMesh && child.geometry) {
                        child.geometry.computeVertexNormals();
                        if (child.material) {
                            child.material.flatShading = false;
                        }
                    }
                });
            }
            
            modelObj.loaded = true;
            modelObj.file = file;
            
            console.log(`Model: Collada ${file} loaded and added to scene`);
            if (callback) callback({ output: `Loaded Collada model: ${file}` });
            
        }, undefined, function (error) {
            console.error(`Model: Error loading Collada ${file}:`, error);
            if (callback) callback({ error: `Failed to load Collada ${file}: ${error.message}` });
        });
        
        return { output: `Loading Collada (DAE) model: ${file}...` };
    }
    
    // Load STL format
    loadSTL(file, callback) {
        const modelObj = this;
        
        if (!THREE.STLLoader) {
            console.error('Model: STLLoader not available. Add <script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/STLLoader.js"></script> to index.html');
            return { error: 'STLLoader not loaded. Add THREE.js STLLoader to index.html.' };
        }
        
        const loader = new THREE.STLLoader();
        
        loader.load(file, function (geometry) {
            console.log(`Model: STL loaded successfully from ${file}`);
            
            // Create mesh from geometry
            const material = new THREE.MeshStandardMaterial({
                color: modelObj.color,
                roughness: 0.5,
                metalness: 0.5
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            
            // Remove placeholder mesh
            if (modelObj.group && modelObj.mesh) {
                modelObj.group.remove(modelObj.mesh);
                modelObj.mesh.geometry.dispose();
                modelObj.mesh = null;
            }
            
            // Add loaded model to group
            modelObj.group.add(mesh);
            modelObj.mesh = mesh;
            
            // Scale and position
            modelObj.mesh.scale.set(modelObj.params.scale, modelObj.params.scale, modelObj.params.scale);
            modelObj.mesh.position.copy(modelObj.position);
            modelObj.group.position.copy(modelObj.position);
            
            // Apply smooth shading
            if (modelObj.params.smooth && geometry) {
                geometry.computeVertexNormals();
                material.flatShading = false;
            }
            
            modelObj.loaded = true;
            modelObj.file = file;
            
            console.log(`Model: STL ${file} loaded and added to scene`);
            if (callback) callback({ output: `Loaded STL model: ${file}` });
            
        }, undefined, function (error) {
            console.error(`Model: Error loading STL ${file}:`, error);
            if (callback) callback({ error: `Failed to load STL ${file}: ${error.message}` });
        });
        
        return { output: `Loading STL model: ${file}...` };
    }
    
    // Load FBX format (OPTIONAL - loader not included by default)
    loadFBX(file, callback) {
        const modelObj = this;
        
        if (!THREE.FBXLoader) {
            console.error('Model: FBXLoader not available. To enable FBX support, add to index.html:');
            console.error('  <script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/FBXLoader.min.js"></script>');
            console.error('  <script src="https://unpkg.com/fflate@0.7.4/umd/fflate.min.js"></script>');
            return { error: 'FBXLoader not loaded. FBX support is optional. Use OBJ, GLTF, or other supported formats.' };
        }
        
        const loader = new THREE.FBXLoader();
        
        // Add progress tracking
        const manager = new THREE.LoadingManager();
        manager.onStart = function(url, itemsLoaded, itemsTotal) {
            console.log(`Model: FBX started loading ${url}`);
        };
        manager.onProgress = function(url, itemsLoaded, itemsTotal) {
            console.log(`Model: FBX loading progress: ${itemsLoaded}/${itemsTotal} items`);
        };
        manager.onError = function(url) {
            console.error(`Model: FBX error loading ${url}`);
        };
        
        loader.setLoadingManager(manager);
        
        loader.load(file, function (object) {
            console.log(`Model: FBX loaded successfully from ${file}`);
            console.log('Model: FBX object:', object);
            
            // Remove placeholder mesh
            if (modelObj.group && modelObj.mesh) {
                modelObj.group.remove(modelObj.mesh);
                if (modelObj.mesh.geometry) modelObj.mesh.geometry.dispose();
                if (modelObj.mesh.material) {
                    if (Array.isArray(modelObj.mesh.material)) {
                        modelObj.mesh.material.forEach(mat => mat.dispose());
                    } else {
                        modelObj.mesh.material.dispose();
                    }
                }
                modelObj.mesh = null;
            }
            
            // Add loaded model to group
            modelObj.group.add(object);
            modelObj.mesh = object;
            
            // Scale and position
            modelObj.mesh.scale.set(modelObj.params.scale, modelObj.params.scale, modelObj.params.scale);
            modelObj.mesh.position.copy(modelObj.position);
            modelObj.group.position.copy(modelObj.position);
            
            // Apply smooth shading
            if (modelObj.params.smooth) {
                object.traverse(function(child) {
                    if (child.isMesh && child.geometry) {
                        child.geometry.computeVertexNormals();
                        if (child.material) {
                            child.material.flatShading = false;
                        }
                    }
                });
            }
            
            modelObj.loaded = true;
            modelObj.file = file;
            
            console.log(`Model: FBX ${file} loaded and added to scene`);
            console.log('Model: Scene children after FBX load:', modelObj.group.children);
            if (callback) callback({ output: `Loaded FBX model: ${file}` });
            
        }, function (progressEvent) {
            // Progress callback
            console.log(`Model: FBX loading progress: ${Math.round(progressEvent.loaded / progressEvent.total * 100)}%`);
        }, function (error) {
            console.error(`Model: Error loading FBX ${file}:`, error);
            console.error('Model: Error details:', error.message, error.stack);
            if (callback) callback({ error: `Failed to load FBX ${file}: ${error.message || String(error)}` });
        });
        
        return { output: `Loading FBX model: ${file}...` };
    }
    
    // Load PLY format (Polygon File Format)
    loadPLY(file, callback) {
        const modelObj = this;
        
        if (!THREE.PLYLoader) {
            console.error('Model: PLYLoader not available. Add <script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/PLYLoader.js"></script> to index.html');
            return { error: 'PLYLoader not loaded. Add THREE.js PLYLoader to index.html.' };
        }
        
        const loader = new THREE.PLYLoader();
        
        loader.load(file, function (geometry) {
            console.log(`Model: PLY loaded successfully from ${file}`);
            
            // Create mesh from geometry
            const material = new THREE.MeshStandardMaterial({
                color: modelObj.color,
                roughness: 0.5,
                metalness: 0.5,
                vertexColors: geometry.hasAttribute('color') ? THREE.VertexColors : false
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            
            // Remove placeholder mesh
            if (modelObj.group && modelObj.mesh) {
                modelObj.group.remove(modelObj.mesh);
                modelObj.mesh.geometry.dispose();
                modelObj.mesh = null;
            }
            
            // Add loaded model to group
            modelObj.group.add(mesh);
            modelObj.mesh = mesh;
            
            // Scale and position
            modelObj.mesh.scale.set(modelObj.params.scale, modelObj.params.scale, modelObj.params.scale);
            modelObj.mesh.position.copy(modelObj.position);
            modelObj.group.position.copy(modelObj.position);
            
            // Apply smooth shading
            if (modelObj.params.smooth && geometry) {
                geometry.computeVertexNormals();
                material.flatShading = false;
            }
            
            modelObj.loaded = true;
            modelObj.file = file;
            
            console.log(`Model: PLY ${file} loaded and added to scene`);
            if (callback) callback({ output: `Loaded PLY model: ${file}` });
            
        }, undefined, function (error) {
            console.error(`Model: Error loading PLY ${file}:`, error);
            if (callback) callback({ error: `Failed to load PLY ${file}: ${error.message}` });
        });
        
        return { output: `Loading PLY model: ${file}...` };
    }
    
    // Load point cloud data (PCD, XYZ, PTS formats)
    loadPointCloud(file, callback) {
        const modelObj = this;
        
        // For point clouds, we'll use a simplified approach
        // In a full implementation, you'd parse the file and create PointCloud
        console.log(`Model: Loading point cloud from ${file} (format: .${file.split('.').pop()})`);
        
        // For now, create a placeholder point cloud
        // Real implementation would parse the file
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        
        // Create a simple point cloud (100 random points in a sphere)
        for (let i = 0; i < 100; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const r = Math.random() * 2;
            
            vertices.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(theta)
            );
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        const material = new THREE.PointsMaterial({
            color: modelObj.color,
            size: 0.1,
            transparent: true,
            opacity: 0.8
        });
        
        const points = new THREE.Points(geometry, material);
        
        // Remove placeholder mesh
        if (modelObj.group && modelObj.mesh) {
            modelObj.group.remove(modelObj.mesh);
            modelObj.mesh.geometry.dispose();
            modelObj.mesh = null;
        }
        
        // Add point cloud to group
        modelObj.group.add(points);
        modelObj.mesh = points;
        
        // Scale and position
        modelObj.mesh.scale.set(modelObj.params.scale, modelObj.params.scale, modelObj.params.scale);
        modelObj.mesh.position.copy(modelObj.position);
        modelObj.group.position.copy(modelObj.position);
        
        modelObj.loaded = true;
        modelObj.file = file;
        
        console.log(`Model: Point cloud ${file} loaded (placeholder) - full parsing not yet implemented`);
        if (callback) callback({ output: `Loaded point cloud: ${file} (placeholder - full parsing not implemented)` });
        
        return { output: `Loaded point cloud: ${file} (placeholder - full parsing not implemented)` };
    }
    
    // Set scale
    setScale(scale) {
        this.params.scale = parseFloat(scale) || this.params.scale;
        if (this.group) {
            this.group.scale.setScalar(this.params.scale);
        }
    }
    
    // Set smooth shading
    setSmooth(smooth) {
        this.params.smooth = smooth === '1' || smooth === 'true' || smooth === true;
    }
    
    // Set time parameter - controls animation
    setTime(time) {
        this.time = Math.max(0, Math.min(1, parseFloat(time)));
    }
    
    // Set position
    setPosition(x, y, z) {
        this.position.set(x, y, z);
        if (this.group) {
            this.group.position.copy(this.position);
        }
    }
    
    // Set material color
    setMaterialColor(color) {
        this.color = color;
        if (this.mesh && this.mesh.material) {
            this.mesh.material.color.setHex(color);
        }
    }
    
    // ANIMATION commands (based on jit.anim.drive in Max/MSP)
    animateTurn(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const modelObj = this;
        const startRot = { x: this.group.rotation.x, y: this.group.rotation.y, z: this.group.rotation.z };
        
        // Convert duration from seconds to milliseconds for anime.js
        const durationMs = duration * 1000;
        
        this.animation = anime({
            targets: startRot,
            x: x * Math.PI * 2,
            y: y * Math.PI * 2,
            z: z * Math.PI * 2,
            duration: durationMs,
            easing: 'easeInOutQuad',
            update: function() {
                modelObj.group.rotation.set(startRot.x, startRot.y, startRot.z);
            },
            complete: function() {
                modelObj.animation = null;
            }
        });
    }
    
    animateMoveTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const modelObj = this;
        // Store starting position
        const startX = this.group.position.x;
        const startY = this.group.position.y;
        const startZ = this.group.position.z;
        
        // Convert duration from seconds to milliseconds for anime.js
        const durationMs = duration * 1000;
        
        // Use anime.js for consistency with other animations
        const startPos = { x: startX, y: startY, z: startZ };
        
        this.animation = anime({
            targets: startPos,
            x: x,
            y: y,
            z: z,
            duration: durationMs,
            easing: 'easeInOutQuad',
            update: function() {
                modelObj.group.position.x = startPos.x;
                modelObj.group.position.y = startPos.y;
                modelObj.group.position.z = startPos.z;
                modelObj.position.copy(modelObj.group.position);
            },
            complete: function() {
                modelObj.animation = null;
            }
        });
    }
    
    animateScaleTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const modelObj = this;
        const startScale = { x: this.group.scale.x, y: this.group.scale.y, z: this.group.scale.z };
        
        // Convert duration from seconds to milliseconds for anime.js
        const durationMs = duration * 1000;
        
        this.animation = anime({
            targets: startScale,
            x: x,
            y: y,
            z: z,
            duration: durationMs,
            easing: 'easeInOutQuad',
            update: function() {
                modelObj.group.scale.set(startScale.x, startScale.y, startScale.z);
            },
            complete: function() {
                modelObj.animation = null;
            }
        });
    }
    
    animateRotateTo(x, y, z, w, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const modelObj = this;
        const startQuat = this.group.quaternion.clone();
        const targetQuat = new THREE.Quaternion(x, y, z, w);
        
        // Convert duration from seconds to milliseconds for anime.js
        const durationMs = duration * 1000;
        
        this.animation = anime({
            targets: { progress: 0 },
            progress: 1,
            duration: durationMs,
            easing: 'easeInOutQuad',
            update: function() {
                THREE.Quaternion.slerp(startQuat, targetQuat, this.progress, modelObj.group.quaternion);
            },
            complete: function() {
                modelObj.animation = null;
            }
        });
    }
    
    // MESH commands (based on jit.gl.mesh in Max/MSP)
    setPolyMode(mode1, mode2) {
        const wireframe = mode1 === 1 || mode2 === 1;
        if (this.mesh && this.mesh.material) {
            this.mesh.material.wireframe = wireframe;
        }
    }
    
    setDrawMode(mode) {
        switch (mode.toLowerCase()) {
            case 'points':
            case 'lines':
            case 'line_loop':
            case 'line_strip':
                if (this.mesh && this.mesh.material) {
                    this.mesh.material.wireframe = true;
                }
                break;
            default:
                if (this.mesh && this.mesh.material) {
                    this.mesh.material.wireframe = false;
                }
        }
    }
    
    setPointSize(size) {
        console.log(`Model: point_size ${size} (not applicable)`);
    }
    
    setLineWidth(width) {
        if (this.mesh && this.mesh.material) {
            this.mesh.material.wireframeLinewidth = width;
        }
    }
    
    rotateXYZ(x, y, z) {
        this.group.rotation.set(
            x * Math.PI / 180,
            y * Math.PI / 180,
            z * Math.PI / 180
        );
        this.position.copy(this.group.position);
    }
    
    // MATERIAL commands (based on jit.gl.material in Max/MSP)
    setMatDiffuse(r, g, b) {
        if (this.mesh && this.mesh.material) {
            this.mesh.material.color.setRGB(r, g, b);
        }
    }
    
    setMatEmission(r, g, b) {
        if (this.mesh && this.mesh.material && this.mesh.material.emissive) {
            this.mesh.material.emissive.setRGB(r, g, b);
            this.mesh.material.emissiveIntensity = 1;
        }
    }
    
    setDiffuseTexture(textureName) {
        if (!this.mesh || !this.mesh.material) {
            console.warn(`No mesh or material available for ${this.name}`);
            return;
        }
        
        // Check if this is a texture buffer (tex0, tex1, tex2, tex3)
        if (textureName.startsWith('tex') && textureBuffers[textureName]) {
            const buffer = textureBuffers[textureName];
            if (buffer.texture) {
                this.mesh.material.map = buffer.texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Applied texture buffer ${textureName} to ${this.name}`);
                return;
            }
        }
        
        // Check if it's a direct texture object reference
        if (window[textureName] && window[textureName].texture) {
            this.mesh.material.map = window[textureName].texture;
            this.mesh.material.needsUpdate = true;
            console.log(`Applied texture ${textureName} to ${this.name}`);
            return;
        }
        
        // For regular texture paths
        const loader = new THREE.TextureLoader();
        loader.load(
            textureName,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                this.mesh.material.map = texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Loaded and applied texture ${textureName} to ${this.name}`);
            },
            undefined,
            (error) => {
                console.error(`Error loading texture ${textureName}:`, error);
            }
        );
    }
    
    setHeightmapTexture(textureName) {
        if (!this.mesh || !this.mesh.material) {
            console.warn(`No mesh or material available for ${this.name}`);
            return;
        }
        
        // Check if this is a texture buffer (tex0, tex1, tex2, tex3)
        if (textureName.startsWith('tex') && textureBuffers[textureName]) {
            const buffer = textureBuffers[textureName];
            if (buffer.texture) {
                this.mesh.material.displacementMap = buffer.texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Applied heightmap texture buffer ${textureName} to ${this.name}`);
                return;
            }
        }
        
        // Check if it's a direct texture object reference
        if (window[textureName] && window[textureName].texture) {
            this.mesh.material.displacementMap = window[textureName].texture;
            this.mesh.material.needsUpdate = true;
            console.log(`Applied heightmap texture ${textureName} to ${this.name}`);
            return;
        }
        
        // For regular texture paths
        const loader = new THREE.TextureLoader();
        loader.load(
            textureName,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                this.mesh.material.displacementMap = texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Loaded and applied heightmap texture ${textureName} to ${this.name}`);
            },
            undefined,
            (error) => {
                console.error(`Error loading heightmap texture ${textureName}:`, error);
            }
        );
    }
    
    remove() {
        if (this.animation) {
            this.animation.pause();
        }
        scene.remove(this.group);
        if (this.mesh && this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh && this.mesh.material) this.mesh.material.dispose();
        delete modelObjects[this.name];
    }
}

// Track model objects
let modelObjects = {};
let currentModel = null;

// Track nurbs objects
let nurbsObjects = {};
window.nurbsObjects = nurbsObjects;
window.currentNurbs = null;

// Track texture objects for som, eca
let textureObjects = {};

// Track texture buffers for fpic command (tex0, tex1, tex2, tex3)
let textureBuffers = {};
// Track which geometries use which texture buffers for automatic updates
let textureBufferUsers = {};  // Format: { tex0: [geo1, geo2], tex1: [geo3] }
window.textureBuffers = textureBuffers;

// Video recording/camera state
let cameraStream = null;  // MediaStream from getUserMedia
let cameraVideoElement = null;  // Video element for camera feed
let cameraTexture = null;  // VideoTexture for camera
let cameraEnabled = false;  // Camera power state
let cameraDevices = [];  // Available camera devices
let currentCameraDeviceId = null;  // Current selected camera device ID
// Track current video effect state
let cameraFilter = '';  // CSS filter string (e.g., 'grayscale(100%) brightness(150%)')
let cameraFlip = 'none';  // Flip state: 'none', 'x', 'y', 'both'
let cameraRotation = 0;  // Rotation state: 0, 90, 180, 270
let cameraZoom = 1;  // Zoom factor: 1.0 = normal
let cameraFps = 30;  // Target FPS
window.cameraEnabled = cameraEnabled;

// Notify all geometries using a texture buffer that it has been updated
function notifyTextureBufferUsers(textureName) {
    if (!textureBufferUsers[textureName]) return;
    
    textureBufferUsers[textureName].forEach(geoObject => {
        if (geoObject && geoObject.mesh && geoObject.mesh.material) {
            geoObject.mesh.material.needsUpdate = true;
        }
    });
    
    // Force render
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

// Helper function to format time in HH:MM:SS format
function formatTime(seconds) {
    if (!seconds || seconds < 0) return '00:00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    const pad = (num) => num.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

// NurbsObject class (based on OpenNURBS/rhino3dm)
// Creates NURBS surfaces that can be manipulated
// Note: rhino3dm requires loading from npm, but we can simulate basic NURBS with THREE.js
const NURBS_CONFIG = {
    // Default NURBS parameters
    degreeU: 3,
    degreeV: 3,
    controlPointsU: 4,
    controlPointsV: 4,
    scale: 2,
    // For designer mode
    designerMode: false
};

class NurbsObject {
    constructor(name, x = 0, y = 0, z = -3) {
        this.name = name;
        this.position = new THREE.Vector3(x, y, z);
        // NURBS parameters
        this.params = {
            degreeU: NURBS_CONFIG.degreeU,
            degreeV: NURBS_CONFIG.degreeV,
            controlPointsU: NURBS_CONFIG.controlPointsU,
            controlPointsV: NURBS_CONFIG.controlPointsV,
            scale: NURBS_CONFIG.scale
        };
        // Control points for NURBS surface
        this.controlPoints = [];
        // Single mesh for this nurbs object
        this.mesh = null;
        // Color for the mesh
        this.color = COLORS.nurbs || COLORS.default;
        // Track active animations
        this.animation = null;
        // Designer mode state
        this.designerMode = false;
        
        this.createMesh();
    }
    
    createMesh() {
        // Create a placeholder surface until proper NURBS is loaded
        // For now, create a simple surface using THREE.js ParametricGeometry
        const geometry = this.createNURBSGeometry();
        
        // Main material
        const material = new THREE.MeshBasicMaterial({ 
            color: this.color,
            side: THREE.DoubleSide
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        scene.add(this.mesh);
        
        // Add a wireframe edge for better visibility
        const edgeGeometry = new THREE.EdgesGeometry(geometry);
        const edgeMaterial = new THREE.LineBasicMaterial({ 
            color: 0xffffff,
            linewidth: 2
        });
        const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
        edges.position.copy(this.position);
        scene.add(edges);
        this.edges = edges;
        
        console.log(`NURBS object "${this.name}" created at (${this.position.x}, ${this.position.y}, ${this.position.z}) with color ${this.color.toString(16)}`);
    }
    
    createNURBSGeometry() {
        // Create a simple parametric surface as placeholder
        // This simulates a NURBS surface with control points
        const size = this.params.scale;
        const segments = Math.max(this.params.controlPointsU, this.params.controlPointsV);
        
        // Create a simple curved surface
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        
        // Apply some curvature to simulate NURBS
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            
            // Apply some curvature
            const curveFactor = 0.2;
            position.setZ(i, Math.sin(x * curveFactor) * Math.cos(y * curveFactor) * size * 0.2);
        }
        
        geometry.computeVertexNormals();
        return geometry;
    }
    
    updateControlPoints(points) {
        // Update control points and recreate geometry
        this.controlPoints = points;
        this.updateGeometry();
    }
    
    updateGeometry() {
        if (this.mesh) {
            const oldGeometry = this.mesh.geometry;
            this.mesh.geometry = this.createNURBSGeometry();
            if (oldGeometry) oldGeometry.dispose();
        }
    }
    
    setParams(params) {
        if (params.degreeU !== undefined) this.params.degreeU = params.degreeU;
        if (params.degreeV !== undefined) this.params.degreeV = params.degreeV;
        if (params.controlPointsU !== undefined) this.params.controlPointsU = params.controlPointsU;
        if (params.controlPointsV !== undefined) this.params.controlPointsV = params.controlPointsV;
        if (params.scale !== undefined) this.params.scale = params.scale;
        
        this.updateGeometry();
    }
    
    setPosition(x, y, z) {
        this.position.set(x, y, z);
        this.mesh.position.copy(this.position);
    }
    
    setMaterialColor(color) {
        this.color = color;
        this.mesh.material.color.setHex(color);
    }
    
    // Toggle designer mode
    toggleDesignerMode(enable) {
        this.designerMode = enable !== undefined ? enable : !this.designerMode;
        
        if (this.designerMode) {
            // In designer mode, make the object interactable
            this.mesh.material.color.setHex(0xff0000); // Red for designer mode
            this.mesh.material.wireframe = false;
        } else {
            this.mesh.material.color.setHex(this.color);
            this.mesh.material.wireframe = true;
        }
        
        return this.designerMode;
    }
    
    // ANIMATION commands (based on jit.anim.drive in Max/MSP)
    animateTurn(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const nurbsObj = this;
        
        if (duration === 0) {
            // Infinite rotation
            const rotationPerFrame = {
                x: (x * Math.PI * 2) / 60,
                y: (y * Math.PI * 2) / 60,
                z: (z * Math.PI * 2) / 60
            };
            
            let animationFrameId;
            const animate = function() {
                nurbsObj.mesh.rotation.x += rotationPerFrame.x;
                nurbsObj.mesh.rotation.y += rotationPerFrame.y;
                nurbsObj.mesh.rotation.z += rotationPerFrame.z;
                animationFrameId = requestAnimationFrame(animate);
            };
            
            this.animation = {
                pause: function() {
                    cancelAnimationFrame(animationFrameId);
                }
            };
            
            requestAnimationFrame(animate);
        } else {
            // Finite rotation
            const startRot = { x: this.mesh.rotation.x, y: this.mesh.rotation.y, z: this.mesh.rotation.z };
            const targetRot = {
                x: startRot.x + x * Math.PI * 2,
                y: startRot.y + y * Math.PI * 2,
                z: startRot.z + z * Math.PI * 2
            };
            
            this.animation = anime({
                targets: startRot,
                x: targetRot.x,
                y: targetRot.y,
                z: targetRot.z,
                duration: duration * 1000,
                easing: 'easeInOutQuad',
                update: function() {
                    nurbsObj.mesh.rotation.set(startRot.x, startRot.y, startRot.z);
                },
                complete: function() {
                    nurbsObj.animation = null;
                }
            });
        }
    }
    
    animateMoveTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const nurbsObj = this;
        const startX = this.mesh.position.x;
        const startY = this.mesh.position.y;
        const startZ = this.mesh.position.z;
        const startTime = Date.now();
        const endTime = startTime + duration * 1000;
        
        let animationFrameId;
        
        const animate = function() {
            const currentTime = Date.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / (duration * 1000), 1);
            const easedProgress = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
            
            nurbsObj.mesh.position.x = startX + (x - startX) * easedProgress;
            nurbsObj.mesh.position.y = startY + (y - startY) * easedProgress;
            nurbsObj.mesh.position.z = startZ + (z - startZ) * easedProgress;
            nurbsObj.position.copy(nurbsObj.mesh.position);
            
            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            } else {
                nurbsObj.animation = null;
            }
        };
        
        this.animation = {
            pause: function() {
                cancelAnimationFrame(animationFrameId);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    animateScaleTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const nurbsObj = this;
        const startX = this.mesh.scale.x;
        const startY = this.mesh.scale.y;
        const startZ = this.mesh.scale.z;
        
        this.animation = anime({
            targets: nurbsObj.mesh.scale,
            x: startX + x,
            y: startY + y,
            z: startZ + z,
            duration: duration * 1000,
            easing: 'easeInOutQuad',
            complete: function() {
                nurbsObj.animation = null;
            }
        });
    }
    
    animateRotateTo(x, y, z, w, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const nurbsObj = this;
        const quaternion = new THREE.Quaternion(x, y, z, w);
        
        this.animation = anime({
            targets: nurbsObj.mesh.quaternion,
            x: quaternion.x,
            y: quaternion.y,
            z: quaternion.z,
            w: quaternion.w,
            duration: duration * 1000,
            easing: 'easeInOutQuad',
            complete: function() {
                nurbsObj.animation = null;
            }
        });
    }
    
    // Load NURBS geometry from a rhino3dm File3dm object
    loadFromRhino3dm(file3dm) {
        try {
            // Get all objects from the .3dm file
            const objects = file3dm.getObjects();
            
            if (objects.length === 0) {
                console.warn('No objects found in .3dm file');
                return false;
            }
            
            // Find the first NURBS surface
            let nurbsSurface = null;
            for (let i = 0; i < objects.length; i++) {
                const obj = objects.get(i);
                if (obj && obj.geometry && obj.geometry.isNurbsSurface) {
                    nurbsSurface = obj.geometry;
                    break;
                }
            }
            
            if (!nurbsSurface) {
                console.warn('No NURBS surface found in .3dm file');
                return false;
            }
            
            // Convert rhino3dm NURBS to THREE.js geometry
            // This requires rhino3dm.toThreejs() if available
            let geometry;
            if (window.rhino3dm && window.rhino3dm.toThreejs) {
                geometry = window.rhino3dm.toThreejs(nurbsSurface);
            } else {
                // Fallback: create a geometry from control points
                // This is a simplified approach - for full support, rhino3dm.toThreejs is needed
                console.warn('rhino3dm.toThreejs not available. Using simplified conversion.');
                geometry = this.createGeometryFromRhino3dm(nurbsSurface);
            }
            
            if (geometry) {
                // Replace the current mesh geometry
                if (this.mesh.geometry) this.mesh.geometry.dispose();
                this.mesh.geometry = geometry;
                this.mesh.geometry.computeVertexNormals();
                
                // Update parameters from the loaded surface
                this.params.degreeU = nurbsSurface.degreeU || this.params.degreeU;
                this.params.degreeV = nurbsSurface.degreeV || this.params.degreeV;
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error loading from rhino3dm:', error);
            return false;
        }
    }
    
    // Helper to create THREE.js geometry from rhino3dm NURBS surface
    createGeometryFromRhino3dm(nurbsSurface) {
        // This is a placeholder - in a full implementation, we would
        // properly convert the NURBS surface to a THREE.BufferGeometry
        // using the control points, knots, and degrees from the rhino3dm object
        
        const size = this.params.scale || 2;
        const segments = Math.max(
            nurbsSurface.controlPointCountU || this.params.controlPointsU,
            nurbsSurface.controlPointCountV || this.params.controlPointsV
        );
        
        // For now, create a simple curved plane as a placeholder
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        
        // Apply curvature based on NURBS parameters
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const curveFactor = 0.2;
            position.setZ(i, Math.sin(x * curveFactor) * Math.cos(y * curveFactor) * size * 0.2);
        }
        
        geometry.computeVertexNormals();
        return geometry;
    }
    
    remove() {
        if (this.mesh) {
            scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
            this.mesh = null;
        }
        if (this.edges) {
            // Handle both single edges object and array of edges
            if (Array.isArray(this.edges)) {
                this.edges.forEach(edge => {
                    scene.remove(edge);
                    if (edge.geometry) edge.geometry.dispose();
                    if (edge.material) edge.material.dispose();
                });
            } else {
                scene.remove(this.edges);
                if (this.edges.geometry) this.edges.geometry.dispose();
                if (this.edges.material) this.edges.material.dispose();
            }
            this.edges = null;
        }
        // Also remove loadedObject if it exists (for 3dm files)
        if (this.loadedObject) {
            scene.remove(this.loadedObject);
            this.loadedObject.traverse(child => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
            this.loadedObject = null;
        }
        delete nurbsObjects[this.name];
    }
}

// Texture command implementations

// SOM (Self-Organizing Map) texture
class SomTexture {
    constructor(name, width = 256, height = 256) {
        this.name = name || 'som1';
        this.width = width;
        this.height = height;
        this.texture = null;
        this.data = null;
        
        this.createTexture();
    }
    
    createTexture() {
        // Create a canvas to generate the SOM texture
        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext('2d');
        
        // Generate SOM pattern
        this.generateSOM(ctx);
        
        // Create THREE.js texture from canvas
        this.texture = new THREE.CanvasTexture(canvas);
        this.texture.needsUpdate = true;
        
        // Store in texture objects
        textureObjects[this.name] = this;
    }
    
    generateSOM(ctx) {
        // Simple SOM-inspired pattern generation
        const imageData = ctx.createImageData(this.width, this.height);
        const data = imageData.data;
        
        // Create a grid of nodes
        const nodeSize = 16;
        const nodesX = Math.ceil(this.width / nodeSize);
        const nodesY = Math.ceil(this.height / nodeSize);
        
        // Generate random node positions and colors
        const nodes = [];
        for (let i = 0; i < nodesX * nodesY; i++) {
            nodes.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                r: Math.random(),
                g: Math.random(),
                b: Math.random()
            });
        }
        
        // Fill image data based on distance to nearest nodes
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = (y * this.width + x) * 4;
                
                // Find closest node
                let closest = nodes[0];
                let minDist = this.distance(x, y, closest.x, closest.y);
                
                for (let i = 1; i < nodes.length; i++) {
                    const dist = this.distance(x, y, nodes[i].x, nodes[i].y);
                    if (dist < minDist) {
                        minDist = dist;
                        closest = nodes[i];
                    }
                }
                
                // Color based on closest node
                data[idx] = closest.r * 255;
                data[idx + 1] = closest.g * 255;
                data[idx + 2] = closest.b * 255;
                data[idx + 3] = 255;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    distance(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }
    
    getTexture() {
        return this.texture;
    }
}

// ECA (Elementary Cellular Automaton) texture
class EcaTexture {
    constructor(name, width = 256, height = 256, rule = 30) {
        this.name = name || 'eca';
        this.width = width;
        this.height = height;
        this.rule = rule;
        this.texture = null;
        this.data = null;
        
        this.createTexture();
    }
    
    createTexture() {
        // Create a canvas to generate the ECA texture
        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext('2d');
        
        // Generate ECA pattern
        this.generateECA(ctx);
        
        // Create THREE.js texture from canvas
        this.texture = new THREE.CanvasTexture(canvas);
        this.texture.needsUpdate = true;
        
        // Store in texture objects
        textureObjects[this.name] = this;
    }
    
    generateECA(ctx) {
        // Initialize with random starting row
        let currentRow = [];
        for (let i = 0; i < this.width; i++) {
            currentRow[i] = Math.random() > 0.5 ? 1 : 0;
        }
        
        // Create image data
        const imageData = ctx.createImageData(this.width, this.height);
        const data = imageData.data;
        
        // Generate ECA pattern row by row
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = (y * this.width + x) * 4;
                const value = currentRow[x];
                
                // Set pixel color based on cell state
                data[idx] = value * 255;
                data[idx + 1] = value * 255;
                data[idx + 2] = value * 255;
                data[idx + 3] = 255;
            }
            
            // Generate next row
            const nextRow = [];
            for (let x = 0; x < this.width; x++) {
                const left = x > 0 ? currentRow[x - 1] : currentRow[this.width - 1];
                const center = currentRow[x];
                const right = x < this.width - 1 ? currentRow[x + 1] : currentRow[0];
                
                // Apply ECA rule
                const pattern = (left << 2) | (center << 1) | right;
                nextRow[x] = (this.rule >> pattern) & 1;
            }
            
            currentRow = nextRow;
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    setRule(rule) {
        this.rule = rule;
        this.createTexture();
    }
    
    getTexture() {
        return this.texture;
    }
}

// Texture manager functions
function getTexture(name) {
    return textureObjects[name] ? textureObjects[name].getTexture() : null;
}

function createSomTexture(name, width, height) {
    return new SomTexture(name, width, height);
}

function createEcaTexture(name, width, height, rule) {
    return new EcaTexture(name, width, height, rule);
}

// LzObject class (based on jit.gl.lorenz from Max/MSP Jitter)
// Creates a Lorenz attractor - a chaotic 3D system
// The Lorenz system is defined by:
//   dx/dt = sigma * (y - x)
//   dy/dt = x * (rho - z) - y
//   dz/dt = x * y - beta * z
// Classic parameters: sigma=10, rho=28, beta=8/3
class LzObject {
    constructor(name, x = 0, y = 0, z = -3) {
        this.name = name;
        this.position = new THREE.Vector3(x, y, z);
        // Lorenz parameters (can be modified via commands)
        this.params = {
            sigma: LZ_CONFIG.sigma,
            rho: LZ_CONFIG.rho,
            beta: LZ_CONFIG.beta
        };
        // Integration parameters
        this.integration = {
            dt: LZ_CONFIG.dt,
            steps: LZ_CONFIG.steps,
            scale: LZ_CONFIG.scale
        };
        // Time control (similar to proc)
        this.time = 1.0;  // 1.0 = animating, 0.0 = frozen
        // Current state of the attractor
        this.state = {
            x: 0.1,
            y: 0,
            z: 0
        };
        // Single mesh for this lz object
        this.mesh = null;
        // Line for the trajectory
        this.line = null;
        // Points for the trajectory
        this.points = [];
        // Color for the mesh
        this.color = COLORS.default;
        // Track active animations
        this.animation = null;
        this.trajectoryAnimation = null;
        // History of positions for the trajectory
        this.positionHistory = [];
        this.maxHistory = 1000;
        // Designer mode state
        this.designerMode = false;
        
        this.createMesh();
    }
    
    createMesh() {
        // Create a small sphere at the initial position to represent the attractor point
        const geometry = new THREE.SphereGeometry(0.05, 16, 16);
        const material = new THREE.MeshBasicMaterial({ 
            color: this.color,
            transparent: false
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        scene.add(this.mesh);
        
        // Create a line for the trajectory
        const lineGeometry = new THREE.BufferGeometry();
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: this.color,
            linewidth: 1
        });
        this.line = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(this.line);
        
        // Initialize with current position
        this.points = [new THREE.Vector3().copy(this.mesh.position)];
        this.updateTrajectory();
        
        // Start animation
        this.startTrajectoryAnimation();
    }
    
    // Update the Lorenz attractor state using Runge-Kutta 4th order integration
    updateState() {
        const dx = this.params.sigma * (this.state.y - this.state.x);
        const dy = this.state.x * (this.params.rho - this.state.z) - this.state.y;
        const dz = this.state.x * this.state.y - this.params.beta * this.state.z;
        
        // RK4 integration
        const k1x = this.integration.dt * dx;
        const k1y = this.integration.dt * dy;
        const k1z = this.integration.dt * dz;
        
        const k2x = this.integration.dt * (this.params.sigma * ((this.state.y + k1y/2) - (this.state.x + k1x/2)));
        const k2y = this.integration.dt * ((this.state.x + k1x/2) * (this.params.rho - (this.state.z + k1z/2)) - (this.state.y + k1y/2));
        const k2z = this.integration.dt * ((this.state.x + k1x/2) * (this.state.y + k1y/2) - this.params.beta * (this.state.z + k1z/2));
        
        const k3x = this.integration.dt * (this.params.sigma * ((this.state.y + k2y/2) - (this.state.x + k2x/2)));
        const k3y = this.integration.dt * ((this.state.x + k2x/2) * (this.params.rho - (this.state.z + k2z/2)) - (this.state.y + k2y/2));
        const k3z = this.integration.dt * ((this.state.x + k2x/2) * (this.state.y + k2y/2) - this.params.beta * (this.state.z + k2z/2));
        
        const k4x = this.integration.dt * (this.params.sigma * ((this.state.y + k3y) - (this.state.x + k3x)));
        const k4y = this.integration.dt * ((this.state.x + k3x) * (this.params.rho - (this.state.z + k3z)) - (this.state.y + k3y));
        const k4z = this.integration.dt * ((this.state.x + k3x) * (this.state.y + k3y) - this.params.beta * (this.state.z + k3z));
        
        this.state.x += (k1x + 2*k2x + 2*k3x + k4x) / 6;
        this.state.y += (k1y + 2*k2y + 2*k3y + k4y) / 6;
        this.state.z += (k1z + 2*k2z + 2*k3z + k4z) / 6;
    }
    
    // Update the trajectory line
    updateTrajectory() {
        if (!this.line || !this.line.geometry) return;
        
        const positions = [];
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            positions.push(p.x, p.y, p.z);
        }
        
        this.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.line.geometry.needsUpdate = true;
    }
    
    // Start the trajectory animation
    startTrajectoryAnimation() {
        // Stop any existing animation
        if (this.trajectoryAnimation) {
            this.trajectoryAnimation.pause();
        }
        
        const lzObj = this;
        let lastTime = 0;
        
        function animate(currentTime) {
            if (!lzObj.time) {
                // Animation frozen
                requestAnimationFrame(animate);
                return;
            }
            
            const deltaTime = currentTime - lastTime;
            lastTime = currentTime;
            
            // Update state based on time
            const steps = Math.floor(deltaTime * 0.06); // Adjust speed
            for (let i = 0; i < steps && lzObj.time; i++) {
                lzObj.updateState();
                
                // Add new point to trajectory
                const newPoint = new THREE.Vector3(
                    lzObj.state.x * lzObj.integration.scale + lzObj.position.x,
                    lzObj.state.y * lzObj.integration.scale + lzObj.position.y,
                    lzObj.state.z * lzObj.integration.scale + lzObj.position.z
                );
                lzObj.points.push(newPoint);
                
                // Limit history
                if (lzObj.points.length > lzObj.maxHistory) {
                    lzObj.points.shift();
                }
                
                // Update mesh position
                lzObj.mesh.position.copy(newPoint);
            }
            
            lzObj.updateTrajectory();
            requestAnimationFrame(animate);
        }
        
        this.trajectoryAnimation = { pause: () => {} }; // Simple stub for cancellation
        requestAnimationFrame(animate);
    }
    
    // Set Lorenz parameters
    setSigma(sigma) {
        this.params.sigma = parseFloat(sigma);
    }
    
    setRho(rho) {
        this.params.rho = parseFloat(rho);
    }
    
    setBeta(beta) {
        this.params.beta = parseFloat(beta);
    }
    
    // Set integration parameters
    setDt(dt) {
        this.integration.dt = parseFloat(dt);
    }
    
    setScale(scale) {
        this.integration.scale = parseFloat(scale);
    }
    
    setSteps(steps) {
        this.integration.steps = parseInt(steps);
    }
    
    // Set time parameter - controls animation
    // time 0. stops animation (freezes), time 1. enables animation
    setTime(time) {
        this.time = Math.max(0, Math.min(1, parseFloat(time)));
    }
    
    // Set position
    setPosition(x, y, z) {
        this.position.set(x, y, z);
        this.mesh.position.copy(this.position);
        // Reset trajectory to start from new position
        this.points = [new THREE.Vector3().copy(this.mesh.position)];
        this.updateTrajectory();
    }
    
    // Set material color
    setMaterialColor(color) {
        this.color = color;
        this.mesh.material.color.setHex(color);
        this.line.material.color.setHex(color);
    }
    
    // ANIMATION commands (based on jit.anim.drive in Max/MSP)
    animateTurn(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const lzObj = this;
        
        if (duration === 0) {
            // Infinite rotation: continuously add to rotation
            const rotationPerFrame = {
                x: (x * Math.PI * 2) / 60,
                y: (y * Math.PI * 2) / 60,
                z: (z * Math.PI * 2) / 60
            };
            
            let animationFrameId;
            const animate = function() {
                lzObj.mesh.rotation.x += rotationPerFrame.x;
                lzObj.mesh.rotation.y += rotationPerFrame.y;
                lzObj.mesh.rotation.z += rotationPerFrame.z;
                // Also rotate the trajectory line
                if (lzObj.line) {
                    lzObj.line.rotation.x += rotationPerFrame.x;
                    lzObj.line.rotation.y += rotationPerFrame.y;
                    lzObj.line.rotation.z += rotationPerFrame.z;
                }
                animationFrameId = requestAnimationFrame(animate);
            };
            
            this.animation = {
                pause: function() {
                    cancelAnimationFrame(animationFrameId);
                }
            };
            
            requestAnimationFrame(animate);
        } else {
            // Finite rotation: add x, y, z turns to current rotation
            const startRot = { x: this.mesh.rotation.x, y: this.mesh.rotation.y, z: this.mesh.rotation.z };
            const targetRot = {
                x: startRot.x + x * Math.PI * 2,
                y: startRot.y + y * Math.PI * 2,
                z: startRot.z + z * Math.PI * 2
            };
            
            this.animation = anime({
                targets: startRot,
                x: targetRot.x,
                y: targetRot.y,
                z: targetRot.z,
                duration: duration * 1000,
                easing: 'easeInOutQuad',
                update: function() {
                    lzObj.mesh.rotation.set(startRot.x, startRot.y, startRot.z);
                    // Also rotate the trajectory line
                    if (lzObj.line) {
                        lzObj.line.rotation.set(startRot.x, startRot.y, startRot.z);
                    }
                },
                complete: function() {
                    lzObj.animation = null;
                }
            });
        }
    }
    
    animateMoveTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const lzObj = this;
        // Store starting position
        const startX = this.mesh.position.x;
        const startY = this.mesh.position.y;
        const startZ = this.mesh.position.z;
        const startTime = Date.now();
        const endTime = startTime + duration * 1000;  // Convert seconds to milliseconds
        
        // Use requestAnimationFrame for more direct control
        let animationFrameId;
        
        const animate = function() {
            const currentTime = Date.now();
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / (duration * 1000), 1);
            
            // Ease in out quad
            const easedProgress = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
            
            // Update position
            lzObj.mesh.position.x = startX + (x - startX) * easedProgress;
            lzObj.mesh.position.y = startY + (y - startY) * easedProgress;
            lzObj.mesh.position.z = startZ + (z - startZ) * easedProgress;
            lzObj.position.copy(lzObj.mesh.position);
            
            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            } else {
                lzObj.animation = null;
            }
        };
        
        // Store animation reference for cancellation
        this.animation = {
            pause: function() {
                cancelAnimationFrame(animationFrameId);
            }
        };
        
        requestAnimationFrame(animate);
    }
    
    animateScaleTo(x, y, z, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const lzObj = this;
        const startScale = { x: this.mesh.scale.x, y: this.mesh.scale.y, z: this.mesh.scale.z };
        
        this.animation = anime({
            targets: startScale,
            x: x,
            y: y,
            z: z,
            duration: duration * 1000,
            easing: 'easeInOutQuad',
            update: function() {
                lzObj.mesh.scale.set(startScale.x, startScale.y, startScale.z);
            },
            complete: function() {
                lzObj.animation = null;
            }
        });
    }
    
    animateRotateTo(x, y, z, w, duration = 1) {
        if (this.animation) {
            this.animation.pause();
        }
        
        const lzObj = this;
        const startQuat = this.mesh.quaternion.clone();
        const targetQuat = new THREE.Quaternion(x, y, z, w);
        
        this.animation = anime({
            targets: { progress: 0 },
            progress: 1,
            duration: duration * 1000,
            easing: 'easeInOutQuad',
            update: function() {
                THREE.Quaternion.slerp(startQuat, targetQuat, this.progress, lzObj.mesh.quaternion);
            },
            complete: function() {
                lzObj.animation = null;
            }
        });
    }
    
    // MESH commands (based on jit.gl.mesh in Max/MSP)
    setPolyMode(mode1, mode2) {
        // For now, just acknowledge - Lorenz is a line, not a mesh with polygons
        // Could change to show points vs line
        console.log(`Lorenz: poly_mode ${mode1} ${mode2} (not fully implemented for attractor)`);
    }
    
    setDrawMode(mode) {
        switch (mode.toLowerCase()) {
            case 'points':
                this.line.visible = false;
                break;
            case 'lines':
            case 'line_loop':
            case 'line_strip':
                this.line.visible = true;
                break;
            default:
                this.line.visible = true;
        }
    }
    
    setPointSize(size) {
        // Not applicable for line geometry
        console.log(`Lorenz: point_size ${size} (not applicable)`);
    }
    
    setLineWidth(width) {
        this.line.material.linewidth = width;
    }
    
    rotateXYZ(x, y, z) {
        this.mesh.rotation.set(
            x * Math.PI / 180,
            y * Math.PI / 180,
            z * Math.PI / 180
        );
        this.position.copy(this.mesh.position);
    }
    
    // MATERIAL commands (based on jit.gl.material in Max/MSP)
    setMatDiffuse(r, g, b) {
        this.mesh.material.color.setRGB(r, g, b);
        this.line.material.color.setRGB(r, g, b);
    }
    
    setMatEmission(r, g, b) {
        if (this.mesh.material.emissive) {
            this.mesh.material.emissive.setRGB(r, g, b);
            this.mesh.material.emissiveIntensity = 1;
        }
    }
    
    setDiffuseTexture(textureName) {
        if (!this.mesh || !this.mesh.material) {
            console.warn(`No mesh or material available for ${this.name}`);
            return;
        }
        
        // Check if this is a texture buffer (tex0, tex1, tex2, tex3)
        if (textureName.startsWith('tex') && textureBuffers[textureName]) {
            const buffer = textureBuffers[textureName];
            if (buffer.texture) {
                this.mesh.material.map = buffer.texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Applied texture buffer ${textureName} to ${this.name}`);
                return;
            }
        }
        
        // Check if it's a direct texture object reference
        if (window[textureName] && window[textureName].texture) {
            this.mesh.material.map = window[textureName].texture;
            this.mesh.material.needsUpdate = true;
            console.log(`Applied texture ${textureName} to ${this.name}`);
            return;
        }
        
        // For regular texture paths
        const loader = new THREE.TextureLoader();
        loader.load(
            textureName,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                this.mesh.material.map = texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Loaded and applied texture ${textureName} to ${this.name}`);
            },
            undefined,
            (error) => {
                console.error(`Error loading texture ${textureName}:`, error);
            }
        );
    }
    
    setHeightmapTexture(textureName) {
        if (!this.mesh || !this.mesh.material) {
            console.warn(`No mesh or material available for ${this.name}`);
            return;
        }
        
        // Check if this is a texture buffer (tex0, tex1, tex2, tex3)
        if (textureName.startsWith('tex') && textureBuffers[textureName]) {
            const buffer = textureBuffers[textureName];
            if (buffer.texture) {
                this.mesh.material.displacementMap = buffer.texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Applied heightmap texture buffer ${textureName} to ${this.name}`);
                return;
            }
        }
        
        // Check if it's a direct texture object reference
        if (window[textureName] && window[textureName].texture) {
            this.mesh.material.displacementMap = window[textureName].texture;
            this.mesh.material.needsUpdate = true;
            console.log(`Applied heightmap texture ${textureName} to ${this.name}`);
            return;
        }
        
        // For regular texture paths
        const loader = new THREE.TextureLoader();
        loader.load(
            textureName,
            (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                this.mesh.material.displacementMap = texture;
                this.mesh.material.needsUpdate = true;
                console.log(`Loaded and applied heightmap texture ${textureName} to ${this.name}`);
            },
            undefined,
            (error) => {
                console.error(`Error loading heightmap texture ${textureName}:`, error);
            }
        );
    }
    
    remove() {
        if (this.animation) {
            this.animation.pause();
        }
        scene.remove(this.mesh);
        scene.remove(this.line);
        if (this.mesh.geometry) this.mesh.geometry.dispose();
        if (this.mesh.material) this.mesh.material.dispose();
        if (this.line.geometry) this.line.geometry.dispose();
        if (this.line.material) this.line.material.dispose();
        delete lzObjects[this.name];
    }
    
    // Toggle designer mode
    toggleDesignerMode(enable) {
        this.designerMode = enable !== undefined ? enable : !this.designerMode;
        
        if (this.designerMode) {
            // In designer mode, make the object interactable
            this.mesh.material.color.setHex(0xff00ff); // Magenta for designer mode
            this.line.material.color.setHex(0xff00ff);
        } else {
            this.mesh.material.color.setHex(this.color);
            this.line.material.color.setHex(this.color);
        }
        
        return this.designerMode;
    }
}

// Track lz objects

// Helper functions for Lz commands
function handleAnimCommandForLz(target, tokens) {
    const lz = lzObjects[target];
    if (!lz) {
        return { error: `Lz ${target} not found` };
    }
    
    const subcommand = tokens[0];
    const args = tokens.slice(1);
    
    switch (subcommand) {
        case 'turn':
            if (args.length >= 3) {
                const x = parseFloat(args[0]) || 0;
                const y = parseFloat(args[1]) || 0;
                const z = parseFloat(args[2]) || 0;
                const duration = args.length >= 4 ? parseFloat(args[3]) : 0;
                lz.animateTurn(x, y, z, duration);
                return { output: `Lz: anim turn ${x} ${y} ${z} ${duration}` };
            }
            return { error: 'Usage: lz anim turn <x> <y> <z> [duration]' };
            
        case 'moveto':
            if (args.length >= 3) {
                const x = parseFloat(args[0]) || 0;
                const y = parseFloat(args[1]) || 0;
                const z = parseFloat(args[2]) || 0;
                const duration = args.length >= 4 ? parseFloat(args[3]) : 1;
                lz.animateMoveTo(x, y, z, duration);
                return { output: `Lz: anim moveto ${x} ${y} ${z} ${duration}` };
            }
            return { error: 'Usage: lz anim moveto <x> <y> <z> [duration]' };
            
        case 'scaleto':
            if (args.length >= 3) {
                const x = parseFloat(args[0]) || 1;
                const y = parseFloat(args[1]) || 1;
                const z = parseFloat(args[2]) || 1;
                const duration = args.length >= 4 ? parseFloat(args[3]) : 1;
                lz.animateScaleTo(x, y, z, duration);
                return { output: `Lz: anim scaleto ${x} ${y} ${z} ${duration}` };
            }
            return { error: 'Usage: lz anim scaleto <x> <y> <z> [duration]' };
            
        case 'rotateto':
            if (args.length >= 4) {
                const x = parseFloat(args[0]) || 0;
                const y = parseFloat(args[1]) || 0;
                const z = parseFloat(args[2]) || 0;
                const w = parseFloat(args[3]) || 1;
                const duration = args.length >= 5 ? parseFloat(args[4]) : 1;
                lz.animateRotateTo(x, y, z, w, duration);
                return { output: `Lz: anim rotateto ${x} ${y} ${z} ${w} ${duration}` };
            }
            return { error: 'Usage: lz anim rotateto <x> <y> <z> <w> [duration]' };
            
        default:
            return { error: `Unknown anim subcommand: ${subcommand}` };
    }
}

function handleMeshCommandForLz(target, tokens) {
    const lz = lzObjects[target];
    if (!lz) {
        return { error: `Lz ${target} not found` };
    }
    
    const subcommand = tokens[0];
    const args = tokens.slice(1);
    
    switch (subcommand) {
        case 'position':
            if (args.length >= 3) {
                const x = parseFloat(args[0]) || 0;
                const y = parseFloat(args[1]) || 0;
                const z = parseFloat(args[2]) || 0;
                lz.setPosition(x, y, z);
                return { output: `Lz: mesh position ${x} ${y} ${z}` };
            }
            return { error: 'Usage: lz mesh position <x> <y> <z>' };
            
        case 'color':
            if (args.length >= 3) {
                const r = parseFloat(args[0]) || 0;
                const g = parseFloat(args[1]) || 0;
                const b = parseFloat(args[2]) || 0;
                const color = (r << 16) | (g << 8) | b;
                lz.setMaterialColor(color);
                return { output: `Lz: mesh color ${r} ${g} ${b}` };
            }
            return { error: 'Usage: lz mesh color <r> <g> <b>' };
            
        default:
            return { error: `Unknown mesh subcommand: ${subcommand}` };
    }
}

// Helper function to apply animation commands to a single object
function handleAnimCommandForObject(object, objectName, animSubcommand, animArgs) {
    switch (animSubcommand) {
        case 'turn':
            if (animArgs.length >= 3) {
                const x = parseFloat(animArgs[0]) || 0;
                const y = parseFloat(animArgs[1]) || 0;
                const z = parseFloat(animArgs[2]) || 0;
                const duration = animArgs.length >= 3 ? parseInt(animArgs[3]) || 0 : 0;
                object.animateTurn(x, y, z, duration);
            }
            break;
            
        case 'moveto':
            if (animArgs.length >= 3) {
                const x = parseFloat(animArgs[0]) || 0;
                const y = parseFloat(animArgs[1]) || 0;
                const z = parseFloat(animArgs[2]) || 0;
                const duration = animArgs.length >= 4 ? parseInt(animArgs[3]) || 1000 : 1000;
                object.animateMoveTo(x, y, z, duration);
            }
            break;
            
        case 'scaleto':
            if (animArgs.length >= 3) {
                const x = parseFloat(animArgs[0]) || 1;
                const y = parseFloat(animArgs[1]) || 1;
                const z = parseFloat(animArgs[2]) || 1;
                const duration = animArgs.length >= 4 ? parseInt(animArgs[3]) || 1000 : 1000;
                object.animateScaleTo(x, y, z, duration);
            }
            break;
            
        case 'rotateto':
            if (animArgs.length >= 4) {
                const x = parseFloat(animArgs[0]) || 0;
                const y = parseFloat(animArgs[1]) || 0;
                const z = parseFloat(animArgs[2]) || 0;
                const w = parseFloat(animArgs[3]) || 1;
                const duration = animArgs.length >= 5 ? parseInt(animArgs[4]) || 1000 : 1000;
                object.animateRotateTo(x, y, z, w, duration);
            }
            break;
    }
}

// Helper functions for geo subcommands - moved here to avoid hoisting issues
function handleAnimCommand(target, tokens) {
    if (!geoObjects[target]) {
        return { error: `Geo ${target} not found` };
    }
    
    const geo = geoObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'turn':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                // No duration or duration=0 means infinite
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) : 0;
                geo.animateTurn(x, y, z, duration);
                
                if (duration === 0) {
                    return { output: `Anim: turn ${x} ${y} ${z} (infinite)` };
                } else {
                    return { output: `Anim: turn ${x} ${y} ${z} over ${duration}ms` };
                }
            }
            return { error: 'Usage: geo anim turn <x> <y> <z> [duration]' };
            
        case 'moveto':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) || 1000 : 1000;
                geo.animateMoveTo(x, y, z, duration);
                return { output: `Anim: moveto ${x} ${y} ${z} over ${duration}ms` };
            }
            return { error: 'Usage: geo anim moveto <x> <y> <z> [duration]' };
            
        case 'scaleto':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 1;
                const y = parseFloat(tokens[2]) || 1;
                const z = parseFloat(tokens[3]) || 1;
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) || 1000 : 1000;
                geo.animateScaleTo(x, y, z, duration);
                return { output: `Anim: scaleto ${x} ${y} ${z} over ${duration}ms` };
            }
            return { error: 'Usage: geo anim scaleto <x> <y> <z> [duration]' };
            
        case 'rotateto':
            if (tokens.length >= 5) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                const w = parseFloat(tokens[4]) || 1;
                const duration = tokens.length >= 6 ? parseInt(tokens[5]) || 1000 : 1000;
                geo.animateRotateTo(x, y, z, w, duration);
                return { output: `Anim: rotateto ${x} ${y} ${z} ${w} over ${duration}ms` };
            }
            return { error: 'Usage: geo anim rotateto <x> <y> <z> <w> [duration]' };
            
        default:
            return { error: `Unknown anim subcommand: ${subcommand}` };
    }
}

function handleMeshCommand(target, tokens) {
    if (!geoObjects[target]) {
        return { error: `Geo ${target} not found` };
    }
    
    const geo = geoObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'poly_mode':
            if (tokens.length >= 3) {
                const mode1 = parseInt(tokens[1]);
                const mode2 = parseInt(tokens[2]);
                if (isNaN(mode1) || isNaN(mode2)) {
                    return { error: 'Mode values must be numbers (0 or 1)' };
                }
                geo.setPolyMode(mode1, mode2);
                return { output: `Mesh: poly_mode ${mode1} ${mode2}` };
            }
            return { error: 'Usage: geo mesh poly_mode <mode1> <mode2>' };
            
        case 'draw_mode':
            if (tokens.length >= 2) {
                const mode = tokens[1];
                geo.setDrawMode(mode);
                return { output: `Mesh: draw_mode ${mode}` };
            }
            return { error: 'Usage: geo mesh draw_mode <mode>' };
            
        case 'point_size':
            if (tokens.length >= 2) {
                const size = parseFloat(tokens[1]) || 1;
                geo.setPointSize(size);
                return { output: `Mesh: point_size ${size}` };
            }
            return { error: 'Usage: geo mesh point_size <size>' };
            
        case 'line_width':
            if (tokens.length >= 2) {
                const width = parseFloat(tokens[1]) || 1;
                geo.setLineWidth(width);
                return { output: `Mesh: line_width ${width}` };
            }
            return { error: 'Usage: geo mesh line_width <width>' };
            
        case 'rotatexyz':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                geo.rotateXYZ(x, y, z);
                return { output: `Mesh: rotatexyz ${x} ${y} ${z}` };
            }
            return { error: 'Usage: geo mesh rotatexyz <x> <y> <z>' };
            
        case 'position':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                geo.setPosition(x, y, z);
                return { output: `Mesh: position ${x} ${y} ${z}` };
            }
            return { error: 'Usage: geo mesh position <x> <y> <z>' };
            
        default:
            return { error: `Unknown mesh subcommand: ${subcommand}` };
    }
}

function handleMaterialCommand(target, tokens) {
    if (!geoObjects[target]) {
        return { error: `Geo ${target} not found` };
    }
    
    const geo = geoObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'mat_diffuse':
            if (tokens.length >= 4) {
                const r = parseFloat(tokens[1]) || 0;
                const g = parseFloat(tokens[2]) || 0;
                const b = parseFloat(tokens[3]) || 0;
                geo.setMatDiffuse(r, g, b);
                return { output: `Material: mat_diffuse ${r} ${g} ${b}` };
            }
            return { error: 'Usage: geo material mat_diffuse <r> <g> <b>' };
            
        case 'mat_emission':
            if (tokens.length >= 4) {
                const r = parseFloat(tokens[1]) || 0;
                const g = parseFloat(tokens[2]) || 0;
                const b = parseFloat(tokens[3]) || 0;
                geo.setMatEmission(r, g, b);
                return { output: `Material: mat_emission ${r} ${g} ${b}` };
            }
            return { error: 'Usage: geo material mat_emission <r> <g> <b>' };
            
        case 'diffuse_texture':
            if (tokens.length >= 2) {
                const texture = tokens[1];
                geo.setDiffuseTexture(texture);
                return { output: `Material: diffuse_texture ${texture}` };
            }
            return { error: 'Usage: geo material diffuse_texture <texture>' };
            
        case 'heightmap_texture':
            if (tokens.length >= 2) {
                const texture = tokens[1];
                geo.setHeightmapTexture(texture);
                return { output: `Material: heightmap_texture ${texture}` };
            }
            return { error: 'Usage: geo material heightmap_texture <texture>' };
            
        default:
            return { error: `Unknown material subcommand: ${subcommand}` };
    }
}

// Command implementations
const ThreeCommands = {
    wrld: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: wrld <size|dim|border|visible> [args...]' };
        }
        
        const command = tokens[1];
        
        switch (command) {
            case 'size':
                if (tokens.length >= 4) {
                    // For now, just acknowledge - world size affects camera/dimensions
                    return { output: `World size set to ${tokens[2]}x${tokens[3]}` };
                }
                break;
                
            case 'dim':
                if (tokens.length >= 4) {
                    // Set world dimensions
                    const x = parseInt(tokens[2]);
                    const y = parseInt(tokens[3]);
                    const z = tokens.length >= 5 ? parseInt(tokens[4]) : x;
                    return { output: `World dimensions set to ${x}x${y}x${z}` };
                }
                break;
                
            case 'border':
                if (tokens.length >= 3) {
                    return { output: `World border set to ${tokens[2]}` };
                }
                break;
                
            case 'visible':
                if (tokens.length >= 3) {
                    const visible = tokens[2] === '1' || tokens[2].toLowerCase() === 'true';
                    return { output: `World visibility set to ${visible}` };
                }
                break;
                
            default:
                return { error: `Unknown wrld command: ${command}` };
        }
    },
    
    // Create new object
    // Format: new <name> <x> <y> <type> (old syntax)
    // or: new <type> (new simplified syntax - auto-generates name)
    new: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: new <type> [name x y] or new <name> <x> <y> <type>' };
        }
        
        const typeSpec = tokens[1].toLowerCase();
        
        // New simplified syntax: new model (auto-generate name)
        if (typeSpec === 'model' && tokens.length === 2) {
            if (!window.modelObjects) {
                window.modelObjects = {};
            }
            
            const existingModels = Object.keys(window.modelObjects).filter(name => name.startsWith('model-'));
            const nextNumber = existingModels.length + 1;
            const modelName = `model-${String(nextNumber).padStart(2, '0')}`;
            
            const model = new ModelObject(modelName, 0, 0, -3);
            modelObjects[modelName] = model;
            currentModel = modelName;
            
            return { output: `Created model: ${modelName}` };
        }
        
        // New simplified syntax: new nurbs (auto-generate name and load default file)
        if (typeSpec === 'nurbs' && tokens.length === 2) {
            const existingNurbs = Object.keys(nurbsObjects).filter(name => name.startsWith('nurbs-'));
            const nextNumber = existingNurbs.length + 1;
            const nurbsName = `nurbs-${String(nextNumber).padStart(2, '0')}`;
            
            const nurbs = new NurbsObject(nurbsName, 0, 0, -3);
            nurbsObjects[nurbsName] = nurbs;
            window.currentNurbs = nurbsName;
            console.log(`Created nurbs ${nurbsName}, currentNurbs set to ${window.currentNurbs}`);
            
            // Try to load default Rhino_Logo.3dm file from local 3dm directory
            if (typeof THREE.Rhino3dmLoader !== 'undefined') {
                const loader = window.nurbs3dmLoader || new THREE.Rhino3dmLoader();
                // Set library path for WASM files (not model files)
                // Use v7.11.1 which is compatible with three.js r147
                loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@7.11.1/');
                // Load model from local 3dm directory (relative to page)
                // Note: This requires the file to exist at /3dm/Rhino_Logo.3dm on the server
                loader.load('3dm/Rhino_Logo.3dm', function(object) {
                        console.log('Loaded default Rhino_Logo.3dm for nurbs:', nurbsName);
                        
                        // Replace placeholder with loaded object
                        if (nurbs.mesh) {
                            scene.remove(nurbs.mesh);
                            if (nurbs.edges) {
                                // nurbs.edges might be an array or a single object
                                if (Array.isArray(nurbs.edges)) {
                                    nurbs.edges.forEach(edge => scene.remove(edge));
                                } else {
                                    scene.remove(nurbs.edges);
                                }
                            }
                            if (nurbs.mesh.geometry) nurbs.mesh.geometry.dispose();
                            if (nurbs.mesh.material) nurbs.mesh.material.dispose();
                        }
                        
                        // Scale down (Rhino units are different)
                        object.scale.set(0.01, 0.01, 0.01);
                        
                        // Center the object
                        const box = new THREE.Box3().setFromObject(object);
                        const center = box.getCenter(new THREE.Vector3());
                        object.position.copy(nurbs.position);
                        object.position.sub(center);
                        
                        nurbs.loadedObject = object;
                        nurbs.mesh = object;
                        scene.add(object);
                        
                        // Add wireframe edges
                        nurbs.edges = [];
                        object.traverse(function(child) {
                            if (child.isMesh && child.geometry) {
                                try {
                                    const edges = new THREE.EdgesGeometry(child.geometry);
                                    const edgeMaterial = new THREE.LineBasicMaterial({ 
                                        color: 0xffffff,
                                        linewidth: 1
                                    });
                                    const wireframe = new THREE.LineSegments(edges, edgeMaterial);
                                    wireframe.position.copy(child.position);
                                    wireframe.rotation.copy(child.rotation);
                                    wireframe.scale.copy(child.scale);
                                    scene.add(wireframe);
                                    nurbs.edges.push(wireframe);
                                } catch(e) {
                                    console.warn('Could not create edges for mesh:', e);
                                }
                            }
                        });
                        
                        window.addTerminalMessage(
                            `Loaded default Rhino_Logo.3dm for ${nurbsName}`,
                            false
                        );
                    }, undefined, function(error) {
                        console.warn('Could not load default Rhino_Logo.3dm:', error ? (error.message || error) : 'unknown error');
                        console.log('Using placeholder geometry for:', nurbsName);
                    });
            }
            
            return { output: `Created nurbs: ${nurbsName}` };
        }
        
        // Old syntax: new name x y type
        if (tokens.length < 5) {
            return { error: 'Usage: new <name> <x> <y> <type> (for old syntax) or new <type> (for new syntax)' };
        }
        
        const name = tokens[1];
        const x = parseFloat(tokens[2]) || 0;
        const y = parseFloat(tokens[3]) || 0;
        const typeSpecOld = tokens[4].toLowerCase();
        
        // Handle new name x y geo
        if (typeSpecOld === 'geo') {
            if (geoObjects[name]) {
                return { error: `Geo ${name} already exists` };
            }
            
            const geo = new GeoObject(name, x, y);
            geoObjects[name] = geo;
            currentGeo = name;
            
            return { output: `Created geo: ${name}` };
        }
        
        // Handle new name x y plato (based on jit.gl.plato)
        if (typeSpecOld === 'plato') {
            if (platoObjects[name]) {
                return { error: `Plato ${name} already exists` };
            }
            
            const plato = new PlatoObject(name, x, y);
            platoObjects[name] = plato;
            currentPlato = name;
            
            return { output: `Created plato: ${name}` };
        }
        
        // Handle new name x y proc (procedural geometry)
        if (typeSpecOld === 'proc') {
            if (procObjects[name]) {
                return { error: `Proc ${name} already exists` };
            }
            
            const proc = new ProcObject(name, x, y);
            procObjects[name] = proc;
            currentProc = name;
            
            return { output: `Created proc: ${name}` };
        }
        
        // Handle new name x y lz (Lorenz attractor)
        if (typeSpecOld === 'lz') {
            if (lzObjects[name]) {
                return { error: `Lz ${name} already exists` };
            }
            
            const lz = new LzObject(name, x, y);
            lzObjects[name] = lz;
            currentLz = name;
            
            return { output: `Created lz: ${name}` };
        }
        
        // Handle new name x y typo (3D text)
        if (typeSpecOld === 'typo') {
            if (typoObjects[name]) {
                return { error: `Typo ${name} already exists` };
            }
            
            const typo = new TypoObject(name, x, y);
            typoObjects[name] = typo;
            currentTypo = name;
            
            return { output: `Created typo: ${name}` };
        }
        
        // Handle new name x y model (3D model)
        if (typeSpecOld === 'model') {
            if (modelObjects[name]) {
                return { error: `Model ${name} already exists` };
            }
            
            const model = new ModelObject(name, x, y);
            modelObjects[name] = model;
            currentModel = name;
            
            return { output: `Created model: ${name}` };
        }
        
        // Handle new name x y nurbs (NURBS surface)
        if (typeSpecOld === 'nurbs') {
            if (nurbsObjects[name]) {
                return { error: `Nurbs ${name} already exists` };
            }
            
            const nurbs = new NurbsObject(name, x, y);
            nurbsObjects[name] = nurbs;
            window.currentNurbs = name;
            console.log(`Created nurbs ${name}, currentNurbs set to ${window.currentNurbs}`);
            
            // Try to load default Rhino_Logo.3dm file from local 3dm directory
            if (typeof THREE.Rhino3dmLoader !== 'undefined') {
                const loader = window.nurbs3dmLoader || new THREE.Rhino3dmLoader();
                // Set library path for WASM files (not model files)
                // Use v7.11.1 which is compatible with three.js r147
                loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@7.11.1/');
                loader.load('3dm/Rhino_Logo.3dm', function(object) {
                    console.log('Loaded default Rhino_Logo.3dm for nurbs:', name);
                    
                    // Replace placeholder with loaded object
                    if (nurbs.mesh) {
                        scene.remove(nurbs.mesh);
                        if (nurbs.edges) {
                            if (Array.isArray(nurbs.edges)) {
                                nurbs.edges.forEach(edge => scene.remove(edge));
                            } else {
                                scene.remove(nurbs.edges);
                            }
                        }
                        if (nurbs.mesh.geometry) nurbs.mesh.geometry.dispose();
                        if (nurbs.mesh.material) nurbs.mesh.material.dispose();
                    }
                    
                    // Scale down (Rhino units are different)
                    object.scale.set(0.01, 0.01, 0.01);
                    
                    // Center the object
                    const box = new THREE.Box3().setFromObject(object);
                    const center = box.getCenter(new THREE.Vector3());
                    object.position.copy(nurbs.position);
                    object.position.sub(center);
                    
                    nurbs.loadedObject = object;
                    nurbs.mesh = object;
                    scene.add(object);
                    
                    // Add wireframe edges
                    nurbs.edges = [];
                    object.traverse(function(child) {
                        if (child.isMesh && child.geometry) {
                            try {
                                const edges = new THREE.EdgesGeometry(child.geometry);
                                const edgeMaterial = new THREE.LineBasicMaterial({ 
                                    color: 0xffffff,
                                    linewidth: 1
                                });
                                const wireframe = new THREE.LineSegments(edges, edgeMaterial);
                                wireframe.position.copy(child.position);
                                wireframe.rotation.copy(child.rotation);
                                wireframe.scale.copy(child.scale);
                                scene.add(wireframe);
                                nurbs.edges.push(wireframe);
                            } catch(e) {
                                console.warn('Could not create edges for mesh:', e);
                            }
                        }
                    });
                    
                    window.addTerminalMessage(
                        `Loaded default Rhino_Logo.3dm for ${name}`,
                        false
                    );
                }, undefined, function(error) {
                    console.warn('Could not load default Rhino_Logo.3dm:', error ? (error.message || error) : 'unknown error');
                    console.log('Using placeholder geometry for:', name);
                });
            }
            
            return { output: `Created nurbs: ${name}` };
        }
        
        // Handle texture objects - som, eca
        // Format: new <name> <width> <height> som
        if (typeSpecOld === 'som') {
            if (textureObjects[name]) {
                return { error: `Texture ${name} already exists` };
            }
            
            const width = Math.max(1, Math.floor(x)) || 256;
            const height = Math.max(1, Math.floor(y)) || 256;
            const somTexture = new SomTexture(name, width, height);
            return { output: `Created som texture: ${name} (${width}x${height})` };
        }
        
        if (typeSpecOld === 'eca') {
            if (textureObjects[name]) {
                return { error: `Texture ${name} already exists` };
            }
            
            const width = Math.max(1, Math.floor(x)) || 256;
            const height = Math.max(1, Math.floor(y)) || 256;
            const rule = parseInt(tokens[5]) || 30; // Optional rule parameter
            const ecaTexture = new EcaTexture(name, width, height, rule);
            return { output: `Created eca texture: ${name} (${width}x${height}, rule ${rule})` };
        }
        
    },
    
    // Create a model object (helper for model command)
    createModel: function(name, x = 0, y = 0, z = -3) {
        if (modelObjects[name]) {
            return { error: `Model ${name} already exists` };
        }
        
        const model = new ModelObject(name, x, y, z);
        modelObjects[name] = model;
        currentModel = name;
        
        return { output: `Created model: ${name}` };
    },
    
    // Geo commands
    geo: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: geo <subcommand> [args...]' };
        }
        
        const subcommand = tokens[1];
        let target = currentGeo || Object.keys(geoObjects)[0];
        let geo = geoObjects[target];
        
        // Special case: "geo anim" should affect ALL geo objects, not just current
        if (subcommand === 'anim' && tokens.length >= 3) {
            // Apply animation to ALL geo objects
            const animSubcommand = tokens[2];
            const animArgs = tokens.slice(3);
            
            for (const name in geoObjects) {
                const g = geoObjects[name];
                handleAnimCommandForObject(g, name, animSubcommand, animArgs);
            }
            
            return { output: `Applied ${animSubcommand} to all ${Object.keys(geoObjects).length} geo objects` };
        }
        
        if (!geo) {
            return { error: `No geo selected. Create one with: new <name> <x> <y> geo` };
        }
        
        switch (subcommand) {
            case 'gs1':
                if (tokens.length < 4) {
                    return { error: 'Usage: geo gs1 <property> <value>' };
                }
                const prop1 = tokens[2];
                const value1 = tokens[3];
                
                if (prop1 === 'shape') {
                    geo.updateShape('gs1', value1);
                    return { output: `gs1 shape set to ${value1}` };
                } else if (prop1 === 'dim') {
                    geo.gs1.dim = parseInt(value1) || 32;
                    geo.updateShape('gs1', geo.gs1.shape, geo.gs1.dim);
                    return { output: `gs1 dim set to ${value1}` };
                }
                return { error: `Unknown gs1 property: ${prop1}` };
                
            case 'gs2':
                if (tokens.length < 4) {
                    return { error: 'Usage: geo gs2 <property> <value>' };
                }
                const prop2 = tokens[2];
                const value2 = tokens[3];
                
                if (prop2 === 'shape') {
                    geo.updateShape('gs2', value2);
                    return { output: `gs2 shape set to ${value2}` };
                } else if (prop2 === 'dim') {
                    geo.gs2.dim = parseInt(value2) || 32;
                    geo.updateShape('gs2', geo.gs2.shape, geo.gs2.dim);
                    return { output: `gs2 dim set to ${value2}` };
                }
                return { error: `Unknown gs2 property: ${prop2}` };
                
            case '^':
                if (tokens.length < 3) {
                    return { error: 'Usage: geo ^ <factor> [duration]' };
                }
                const factor = parseFloat(tokens[2]);
                const duration = tokens.length >= 4 ? tokens[3] : 500;
                geo.morph(factor, duration);
                return { output: `Morphing to ${factor} over ${duration}ms` };
                
            case 'reset':
                geo.gs1 = { shape: 'sphere', dim: 32 };
                geo.gs2 = { shape: 'box', dim: 32 };
                geo.morph(0);
                return { output: `Geo ${target} reset` };
                
            case 'color':
                if (tokens.length < 3) {
                    return { error: 'Usage: geo color <hex-color>' };
                }
                const color = parseInt(tokens[2].replace('#', '0x'), 16) || COLORS.default;
                geo.setMaterialColor(color);
                return { output: `Color set to ${tokens[2]}` };
                
            case 'iso':
                // Isolate: hide all other geos
                for (const name in geoObjects) {
                    const g = geoObjects[name];
                    g.mesh.visible = (name === target);
                }
                return { output: `Isolated: ${target}` };
            
            // ANIM commands (jit.anim.drive)
            case 'anim':
                if (tokens.length < 3) {
                    return { error: 'Usage: geo anim <turn|moveto|scaleto|rotateto> [args...]' };
                }
                return handleAnimCommand(target, tokens.slice(2));
                
            // MESH commands (jit.gl.mesh)
            case 'mesh':
                if (tokens.length < 3) {
                    return { error: 'Usage: geo mesh <poly_mode|draw_mode|point_size|line_width|rotatexyz|position> [args...]' };
                }
                return handleMeshCommand(target, tokens.slice(2));
            
            // MATERIAL commands (jit.gl.material)
            case 'material':
                if (tokens.length < 3) {
                    return { error: 'Usage: geo material <mat_diffuse|mat_emission|diffuse_texture|heightmap_texture> [args...]' };
                }
                return handleMaterialCommand(target, tokens.slice(2));
            
            default:
                return { error: `Unknown geo subcommand: ${subcommand}` };
        }
    },
    
    // Plato commands (based on jit.gl.plato from Max/MSP)
    plato: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: plato <subcommand> [args...]' };
        }
        
        const subcommand = tokens[1];
        const target = currentPlato || Object.keys(platoObjects)[0];
        const plato = platoObjects[target];
        
        if (!plato) {
            return { error: `No plato selected. Create one with: new plato <x> <y> <name>` };
        }
        
        switch (subcommand) {
            case 'gs1':
                if (tokens.length < 4) {
                    return { error: 'Usage: plato gs1 <property> <value>' };
                }
                const prop1 = tokens[2];
                const value1 = tokens[3];
                
                if (prop1 === 'shape') {
                    plato.updateShape('gs1', value1);
                    return { output: `gs1 shape set to ${value1}` };
                } else if (prop1 === 'dim') {
                    plato.gs1.dim = parseInt(value1) || 32;
                    plato.updateShape('gs1', plato.gs1.shape, plato.gs1.dim);
                    return { output: `gs1 dim set to ${value1}` };
                }
                return { error: `Unknown gs1 property: ${prop1}` };
                
            case 'gs2':
                if (tokens.length < 4) {
                    return { error: 'Usage: plato gs2 <property> <value>' };
                }
                const prop2 = tokens[2];
                const value2 = tokens[3];
                
                if (prop2 === 'shape') {
                    plato.updateShape('gs2', value2);
                    return { output: `gs2 shape set to ${value2}` };
                } else if (prop2 === 'dim') {
                    plato.gs2.dim = parseInt(value2) || 32;
                    plato.updateShape('gs2', plato.gs2.shape, plato.gs2.dim);
                    return { output: `gs2 dim set to ${value2}` };
                }
                return { error: `Unknown gs2 property: ${prop2}` };
                
            case '^':
                if (tokens.length < 3) {
                    return { error: 'Usage: plato ^ <factor> [duration]' };
                }
                const factor = parseFloat(tokens[2]);
                const duration = tokens.length >= 4 ? tokens[3] : 500;
                plato.morph(factor, duration);
                return { output: `Morphing to ${factor} over ${duration}ms` };
                
            case 'reset':
                plato.gs1 = { shape: 'tetrahedron', dim: 32 };
                plato.gs2 = { shape: 'cube', dim: 32 };
                plato.morph(0);
                return { output: `Plato ${target} reset` };
                
            case 'color':
                if (tokens.length < 3) {
                    return { error: 'Usage: plato color <hex-color>' };
                }
                const color = parseInt(tokens[2].replace('#', '0x'), 16) || COLORS.default;
                plato.setMaterialColor(color);
                return { output: `Color set to ${tokens[2]}` };
                
            case 'iso':
                // Isolate: hide all other platos
                for (const name in platoObjects) {
                    const p = platoObjects[name];
                    p.mesh.visible = (name === target);
                }
                return { output: `Isolated: ${target}` };
            
            // ANIM commands (jit.anim.drive)
            case 'anim':
                if (tokens.length < 3) {
                    return { error: 'Usage: plato anim <turn|moveto|scaleto|rotateto> [args...]' };
                }
                return handlePlatoAnimCommand(target, tokens.slice(2));
                
            // MESH commands (jit.gl.mesh)
            case 'mesh':
                if (tokens.length < 3) {
                    return { error: 'Usage: plato mesh <poly_mode|draw_mode|point_size|line_width|rotatexyz|position> [args...]' };
                }
                return handlePlatoMeshCommand(target, tokens.slice(2));
            
            // MATERIAL commands (jit.gl.material)
            case 'material':
                if (tokens.length < 3) {
                    return { error: 'Usage: plato material <mat_diffuse|mat_emission|diffuse_texture|heightmap_texture> [args...]' };
                }
                return handlePlatoMaterialCommand(target, tokens.slice(2));
            
            default:
                return { error: `Unknown plato subcommand: ${subcommand}` };
        }
    },
    
    // Proc commands (procedural geometry)
    // Based on jit.gl.proc from Max/MSP Jitter
    // proc starts with gridshape (gs) - default is cone with dim 100x100
    // Processed through noise.simplex algorithm and normalized
    // "period time 0." stops animation, freezing proc at current form
    proc: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: proc <subcommand> [args...]' };
        }
        
        const subcommand = tokens[1];
        const target = currentProc || Object.keys(procObjects)[0];
        const proc = procObjects[target];
        
        if (!proc) {
            return { error: `No proc selected. Create one with: new proc <x> <y> <name>` };
        }
        
        switch (subcommand) {
            case 'gs':
                // Gridshape parameter - sets the base geometry
                // Supports: proc gs shape <value> [dim] OR proc gs <shape> [dim]
                if (tokens.length < 3) {
                    return { error: 'Usage: proc gs shape <value> [dim] OR proc gs <shape> [dim]' };
                }
                
                let shape, dim;
                if (tokens[2] === 'shape' && tokens.length >= 4) {
                    // proc gs shape sphere [dim]
                    shape = tokens[3];
                    dim = tokens.length >= 5 ? parseInt(tokens[4]) : proc.gs.dim;
                } else {
                    // proc gs sphere [dim]
                    shape = tokens[2];
                    dim = tokens.length >= 4 ? parseInt(tokens[3]) : proc.gs.dim;
                }
                return { output: proc.setGridshape(shape, dim) };
                
            case 'time':
                // Time parameter - controls animation
                // time 0. stops animation (freezes), time 1. enables animation
                if (tokens.length < 3) {
                    return { error: 'Usage: proc time <value>' };
                }
                const time = parseFloat(tokens[2]);
                proc.setTime(time);
                return { output: `Time set to ${time.toFixed(2)}` };
                
            case 'noise':
                // Noise sub-parameters
                if (tokens.length < 3) {
                    return { error: 'Usage: proc noise <scale|strength> <value>' };
                }
                const noiseParam = tokens[2];
                const noiseValue = parseFloat(tokens[3]);
                if (noiseParam === 'scale') {
                    proc.setNoiseScale(noiseValue);
                    return { output: `Noise scale set to ${noiseValue.toFixed(2)}` };
                } else if (noiseParam === 'strength') {
                    proc.setNoiseStrength(noiseValue);
                    return { output: `Noise strength set to ${noiseValue.toFixed(2)}` };
                }
                return { error: `Unknown noise parameter: ${noiseParam}` };
                
            case 'period':
                // Period subcommand for timing control
                // proc period <value> - stops/freezes animation at 0, enables at 1
                // or proc period time <value> for explicit time parameter
                if (tokens.length < 3) {
                    return { error: 'Usage: proc period <value> OR proc period time <value>' };
                }
                
                // Support both: proc period 0.4 AND proc period time 0.4
                let timeValue;
                if (tokens[2] === 'time' && tokens.length >= 4) {
                    // proc period time <value>
                    timeValue = parseFloat(tokens[3]);
                } else {
                    // proc period <value>
                    timeValue = parseFloat(tokens[2]);
                }
                
                proc.setTime(timeValue);
                return { output: `Period time set to ${timeValue.toFixed(2)}` };
                
            case 'reset':
                // Reset to default values
                proc.setGridshape('cone', 100);
                proc.setTime(1.0);
                proc.noise.scale = 0.5;
                proc.noise.strength = 0.3;
                return { output: `Proc ${target} reset` };
                
            case 'color':
                if (tokens.length < 3) {
                    return { error: 'Usage: proc color <hex-color>' };
                }
                const color = parseInt(tokens[2].replace('#', '0x'), 16) || COLORS.default;
                proc.setMaterialColor(color);
                return { output: `Color set to ${tokens[2]}` };
                
            case 'iso':
                // Isolate: hide all other procs
                for (const name in procObjects) {
                    const p = procObjects[name];
                    p.mesh.visible = (name === target);
                }
                return { output: `Isolated: ${target}` };
            
            // ANIM commands (jit.anim.drive)
            case 'anim':
                if (tokens.length < 3) {
                    return { error: 'Usage: proc anim <turn|moveto|scaleto|rotateto> [args...]' };
                }
                return handleProcAnimCommand(target, tokens.slice(2));
                
            // MESH commands (jit.gl.mesh)
            case 'mesh':
                if (tokens.length < 3) {
                    return { error: 'Usage: proc mesh <poly_mode|draw_mode|point_size|line_width|rotatexyz|position> [args...]' };
                }
                return handleProcMeshCommand(target, tokens.slice(2));
            
            // MATERIAL commands (jit.gl.material)
            case 'material':
                if (tokens.length < 3) {
                    return { error: 'Usage: proc material <mat_diffuse|mat_emission|diffuse_texture|heightmap_texture> [args...]' };
                }
                return handleProcMaterialCommand(target, tokens.slice(2));
            
            default:
                return { error: `Unknown proc subcommand: ${subcommand}` };
        }
    },
    
    // Typo commands (3D text)
    // Based on jit.gl.text from Max/MSP Jitter
    typo: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: typo <subcommand> [args...]' };
        }
        
        const subcommand = tokens[1];
        const target = currentTypo || Object.keys(typoObjects)[0];
        const typo = typoObjects[target];
        
        if (!typo) {
            return { error: `No typo selected. Create one with: new typo <x> <y> <name>` };
        }
        
        switch (subcommand) {
            case 'text':
                if (tokens.length < 3) {
                    return { error: 'Usage: typo text <string>' };
                }
                const text = tokens.slice(2).join(' ');
                typo.setText(text);
                return { output: `Text set to "${text}"` };
                
            case 'font':
                if (tokens.length < 3) {
                    return { error: 'Usage: typo font <fontname>' };
                }
                typo.setFont(tokens[2]);
                return { output: `Font set to ${tokens[2]}` };
                
            case 'size':
                if (tokens.length < 3) {
                    return { error: 'Usage: typo size <value>' };
                }
                typo.setSize(tokens[2]);
                return { output: `Size set to ${tokens[2]}` };
                
            case 'height':
                if (tokens.length < 3) {
                    return { error: 'Usage: typo height <value>' };
                }
                typo.setHeight(tokens[2]);
                return { output: `Height set to ${tokens[2]}` };
                
            case 'time':
                // Time parameter - controls animation
                if (tokens.length < 3) {
                    return { error: 'Usage: typo time <value>' };
                }
                const time = parseFloat(tokens[2]);
                typo.setTime(time);
                return { output: `Time set to ${time.toFixed(2)}` };
                
            case 'reset':
                // Reset to default values
                typo.setText('A');
                typo.setFont(TYPO_CONFIG.font);
                typo.setSize(TYPO_CONFIG.size);
                typo.setHeight(TYPO_CONFIG.height);
                typo.setTime(1.0);
                return { output: `Typo ${target} reset` };
                
            case 'color':
                if (tokens.length < 3) {
                    return { error: 'Usage: typo color <hex-color>' };
                }
                const color = parseInt(tokens[2].replace('#', '0x'), 16) || COLORS.default;
                typo.setMaterialColor(color);
                return { output: `Color set to ${tokens[2]}` };
                
            case 'iso':
                // Isolate: hide all other typolos
                for (const name in typoObjects) {
                    const t = typoObjects[name];
                    if (t.group) t.group.visible = (name === target);
                }
                return { output: `Isolated: ${target}` };
                
            // ANIM commands (jit.anim.drive)
            case 'anim':
                if (tokens.length < 3) {
                    return { error: 'Usage: typo anim <turn|moveto|scaleto|rotateto> [args...]' };
                }
                return handleTypoAnimCommand(target, tokens.slice(2));
                
            // MESH commands (jit.gl.mesh)
            case 'mesh':
                if (tokens.length < 3) {
                    return { error: 'Usage: typo mesh <poly_mode|draw_mode|point_size|line_width|rotatexyz|position> [args...]' };
                }
                return handleTypoMeshCommand(target, tokens.slice(2));
                
            // MATERIAL commands (jit.gl.material)
            case 'material':
                if (tokens.length < 3) {
                    return { error: 'Usage: typo material <mat_diffuse|mat_emission|diffuse_texture|heightmap_texture> [args...]' };
                }
                return handleTypoMaterialCommand(target, tokens.slice(2));
                
            default:
                return { error: `Unknown typo subcommand: ${subcommand}` };
        }
    },
    
    // Lz (Lorenz attractor) commands
    lz: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: lz <subcommand> [args...]' };
        }
        
        const subcommand = tokens[1];
        const target = currentLz || Object.keys(lzObjects)[0];
        const lz = lzObjects[target];
        
        if (!lz) {
            return { error: `No lz selected. Create one with: new lz <x> <y> <name>` };
        }
        
        switch (subcommand) {
            case 'time':
                // Time parameter - controls animation (0 = frozen, 1 = animating)
                if (tokens.length < 3) {
                    return { error: 'Usage: lz time <value>' };
                }
                const time = parseFloat(tokens[2]);
                lz.setTime(time);
                return { output: `Time set to ${time.toFixed(2)}` };
                
            case 'sigma':
                // Lorenz sigma parameter
                if (tokens.length < 3) {
                    return { error: 'Usage: lz sigma <value>' };
                }
                const sigma = parseFloat(tokens[2]);
                lz.setSigma(sigma);
                return { output: `Sigma set to ${sigma}` };
                
            case 'rho':
                // Lorenz rho parameter
                if (tokens.length < 3) {
                    return { error: 'Usage: lz rho <value>' };
                }
                const rho = parseFloat(tokens[2]);
                lz.setRho(rho);
                return { output: `Rho set to ${rho}` };
                
            case 'beta':
                // Lorenz beta parameter
                if (tokens.length < 3) {
                    return { error: 'Usage: lz beta <value>' };
                }
                const beta = parseFloat(tokens[2]);
                lz.setBeta(beta);
                return { output: `Beta set to ${beta}` };
                
            case 'dt':
                // Integration time step
                if (tokens.length < 3) {
                    return { error: 'Usage: lz dt <value>' };
                }
                const dt = parseFloat(tokens[2]);
                lz.setDt(dt);
                return { output: `dt set to ${dt}` };
                
            case 'scale':
                // Scale of the attractor
                if (tokens.length < 3) {
                    return { error: 'Usage: lz scale <value>' };
                }
                const scale = parseFloat(tokens[2]);
                lz.setScale(scale);
                return { output: `Scale set to ${scale}` };
                
            case 'steps':
                // Number of integration steps
                if (tokens.length < 3) {
                    return { error: 'Usage: lz steps <value>' };
                }
                const steps = parseInt(tokens[2]);
                lz.setSteps(steps);
                return { output: `Steps set to ${steps}` };
                
            case 'color':
                if (tokens.length < 3) {
                    return { error: 'Usage: lz color <hex-color>' };
                }
                const color = parseInt(tokens[2].replace('#', '0x'), 16) || COLORS.default;
                lz.setMaterialColor(color);
                return { output: `Color set to ${tokens[2]}` };
                
            case 'iso':
                // Isolate: hide all other lzs
                for (const name in lzObjects) {
                    const l = lzObjects[name];
                    l.mesh.visible = (name === target);
                    l.line.visible = (name === target);
                }
                return { output: `Isolated: ${target}` };
                
            case '^':
                // TRANS command - set all equation values for the attractor
                // Format: lz ^ <sigma> <rho> <beta> [dt] [scale] [steps]
                // This allows setting multiple parameters at once
                if (tokens.length < 5) {
                    return { error: 'Usage: lz ^ <sigma> <rho> <beta> [dt] [scale] [steps]' };
                }
                const newSigma = parseFloat(tokens[2]);
                const newRho = parseFloat(tokens[3]);
                const newBeta = parseFloat(tokens[4]);
                const newDt = tokens.length >= 6 ? parseFloat(tokens[5]) : lz.integration.dt;
                const newScale = tokens.length >= 7 ? parseFloat(tokens[6]) : lz.integration.scale;
                const newSteps = tokens.length >= 8 ? parseInt(tokens[7]) : lz.integration.steps;
                
                lz.setSigma(newSigma);
                lz.setRho(newRho);
                lz.setBeta(newBeta);
                lz.setDt(newDt);
                lz.setScale(newScale);
                lz.setSteps(newSteps);
                
                return { output: `Equation set to sigma=${newSigma} rho=${newRho} beta=${newBeta} dt=${newDt} scale=${newScale} steps=${newSteps}` };
                
            case 'reset':
                // Reset to default Lorenz parameters
                lz.setSigma(LZ_CONFIG.sigma);
                lz.setRho(LZ_CONFIG.rho);
                lz.setBeta(LZ_CONFIG.beta);
                lz.setDt(LZ_CONFIG.dt);
                lz.setScale(LZ_CONFIG.scale);
                lz.setSteps(LZ_CONFIG.steps);
                lz.setTime(1.0);
                lz.state = { x: 0.1, y: 0, z: 0 };
                lz.points = [new THREE.Vector3().copy(lz.mesh.position)];
                lz.updateTrajectory();
                return { output: `Lz ${target} reset to defaults` };
                
            // ANIM commands (jit.anim.drive)
            case 'anim':
                if (tokens.length < 3) {
                    return { error: 'Usage: lz anim <turn|moveto|scaleto|rotateto> [args...]' };
                }
                return handleAnimCommandForLz(target, tokens.slice(2));
                
            // MESH commands (jit.gl.mesh)
            case 'mesh':
                if (tokens.length < 3) {
                    return { error: 'Usage: lz mesh <position|color> [args...]' };
                }
                return handleMeshCommandForLz(target, tokens.slice(2));
                
            // MATERIAL commands (jit.gl.material)
            case 'material':
                if (tokens.length < 3) {
                    return { error: 'Usage: lz material <mat_diffuse|mat_emission|diffuse_texture|heightmap_texture> [args...]' };
                }
                return handleLzMaterialCommand(target, tokens.slice(2));
                
            default:
                return { error: `Unknown lz subcommand: ${subcommand}` };
        }
    },
    
    // Camera commands
    camera: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: camera <subcommand> [args...]' };
        }
        
        const subcommand = tokens[1];
        
        switch (subcommand) {
            case 'position':
                if (tokens.length < 5) {
                    return { error: 'Usage: camera position <x> <y> <z>' };
                }
                camera.position.set(
                    parseFloat(tokens[2]),
                    parseFloat(tokens[3]),
                    parseFloat(tokens[4])
                );
                camera.lookAt(0, 0, 0);
                return { output: `Camera position set to ${tokens[2]},${tokens[3]},${tokens[4]}` };
                
            default:
                return { error: `Unknown camera subcommand: ${subcommand}` };
        }
    },
    
    // Clear scene
    qs: function() {
        // Cancel all active animations for geo
        for (const name in geoObjects) {
            if (geoObjects[name].animation) {
                geoObjects[name].animation.pause();
            }
        }
        // Cancel all active animations for plato
        for (const name in platoObjects) {
            if (platoObjects[name].animation) {
                platoObjects[name].animation.pause();
            }
        }
        // Cancel all active animations for proc
        for (const name in procObjects) {
            if (procObjects[name].animation) {
                procObjects[name].animation.pause();
            }
        }
        // Cancel all active animations for lz
        for (const name in lzObjects) {
            if (lzObjects[name].animation) {
                lzObjects[name].animation.pause();
            }
        }
        // Cancel all active animations for typo
        for (const name in typoObjects) {
            if (typoObjects[name].animation) {
                typoObjects[name].animation.pause();
            }
        }
        // Cancel all active animations for nurbs
        for (const name in nurbsObjects) {
            if (nurbsObjects[name].animation) {
                nurbsObjects[name].animation.pause();
            }
        }
        activeAnimations = {};
        
        // Remove all geo objects
        for (const name in geoObjects) {
            geoObjects[name].remove();
        }
        geoObjects = {};
        window.geoObjects = geoObjects;
        currentGeo = null;
        window.currentGeo = null;
        
        // Remove all plato objects
        for (const name in platoObjects) {
            platoObjects[name].remove();
        }
        platoObjects = {};
        window.platoObjects = platoObjects;
        currentPlato = null;
        window.currentPlato = null;
        
        // Remove all proc objects
        for (const name in procObjects) {
            procObjects[name].remove();
        }
        procObjects = {};
        window.procObjects = procObjects;
        currentProc = null;
        window.currentProc = null;
        
        // Remove all lz objects
        for (const name in lzObjects) {
            lzObjects[name].remove();
        }
        lzObjects = {};
        window.lzObjects = lzObjects;
        currentLz = null;
        window.currentLz = null;
        
        // Remove all typo objects
        for (const name in typoObjects) {
            typoObjects[name].remove();
        }
        typoObjects = {};
        window.typoObjects = typoObjects;
        currentTypo = null;
        window.currentTypo = null;
        
        // Remove all nurbs objects
        for (const name in nurbsObjects) {
            nurbsObjects[name].remove();
        }
        nurbsObjects = {};
        window.nurbsObjects = nurbsObjects;
        window.currentNurbs = null;
        
        return { output: 'Scene cleared' };
    },
    
    // Zap (remove) geo object
    zap: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: zap <name>' };
        }
        const name = tokens[1];
        if (geoObjects[name]) {
            geoObjects[name].remove();
            delete geoObjects[name];
            if (currentGeo === name) {
                currentGeo = null;
            }
            return { output: `Zapped geo: ${name}` };
        }
        if (platoObjects[name]) {
            platoObjects[name].remove();
            delete platoObjects[name];
            if (currentPlato === name) {
                currentPlato = null;
            }
            return { output: `Zapped plato: ${name}` };
        }
        if (procObjects[name]) {
            procObjects[name].remove();
            delete procObjects[name];
            if (currentProc === name) {
                currentProc = null;
            }
            return { output: `Zapped proc: ${name}` };
        }
        if (lzObjects[name]) {
            lzObjects[name].remove();
            delete lzObjects[name];
            if (currentLz === name) {
                currentLz = null;
            }
            return { output: `Zapped lz: ${name}` };
        }
        if (typoObjects[name]) {
            typoObjects[name].remove();
            delete typoObjects[name];
            if (currentTypo === name) {
                currentTypo = null;
            }
            return { output: `Zapped typo: ${name}` };
        }
        if (modelObjects[name]) {
            modelObjects[name].remove();
            delete modelObjects[name];
            if (currentModel === name) {
                currentModel = null;
            }
            return { output: `Zapped model: ${name}` };
        }
        if (nurbsObjects[name]) {
            nurbsObjects[name].remove();
            delete nurbsObjects[name];
            if (window.currentNurbs === name) {
                window.currentNurbs = null;
            }
            return { output: `Zapped nurbs: ${name}` };
        }
        return { error: `Object ${name} not found (geo, plato, proc, lz, typo, model, or nurbs)` };
    },
    
    // List all spatial objects
    ls: function() {
        const geos = Object.keys(geoObjects);
        const platos = Object.keys(platoObjects);
        const procs = Object.keys(procObjects);
        const lzs = Object.keys(lzObjects);
        const typoes = Object.keys(typoObjects);
        const models = Object.keys(modelObjects || {});
        const nurbses = Object.keys(nurbsObjects || {});
        
        const allObjects = [
            ...geos.map(name => ({ name, type: 'geo' })),
            ...platos.map(name => ({ name, type: 'plato' })),
            ...procs.map(name => ({ name, type: 'proc' })),
            ...lzs.map(name => ({ name, type: 'lz' })),
            ...typoes.map(name => ({ name, type: 'typo' })),
            ...models.map(name => ({ name, type: 'model' })),
            ...nurbses.map(name => ({ name, type: 'nurbs' }))
        ];
        
        if (allObjects.length === 0) {
            return { output: '(no objects)' };
        }
        
        // Create colored HTML output for each object
        // Use span with obj-{type} class for colored background and text
        const coloredObjects = allObjects.map(obj => {
            return `<span class="cmd-word obj-${obj.type}">${obj.name}</span> <span style="color: #8699A9">(${obj.type})</span>`;
        });
        
        // Return HTML output that will be rendered in the terminal
        return { output: coloredObjects.join('<br>'), isHtml: true };
    },
    
    // Load image/texture into texture buffers (fpic command)
    // Format: fpic read <path> - loads into tex0
    // Format: fpic <index> read <path> - loads into tex<index> (tex0, tex1, tex2, tex3)
    // Format: fpic <index> read - opens file picker dialog for tex<index>
    // Format: fpic ls - list all loaded textures
    // Format: fpic <index> vol [0-100] - set video volume
    // Format: fpic <index> play/pause/stop - control video playback
    // Format: fpic <index> info - show texture details
    // Format: fpic <index> time - show time info
    // Format: fpic <index> hop [timestamp] - seek to timestamp
    fpic: function(tokens) {
        if (tokens.length === 1) {
            return this.listTextures();
        }
        
        const subcommand = tokens[1].toLowerCase();
        
        // Handle global commands (not texture-specific)
        if (subcommand === 'ls') {
            return this.listTextures();
        }
        
        // Determine texture index (default to 0 if not specified as number)
        let texIndex = 0;
        let actualSubcommand = subcommand;
        let args = tokens.slice(2);
        
        // Check if first token is a number (texture index)
        const parsedIndex = parseInt(subcommand);
        if (!isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex <= 3) {
            texIndex = parsedIndex;
            actualSubcommand = tokens.length > 2 ? tokens[2].toLowerCase() : '';
            args = tokens.slice(3);
        }
        
        const textureName = `tex${texIndex}`;
        
        // Handle different subcommands
        switch (actualSubcommand) {
            case 'read':
                if (args.length === 0) {
                    // Open file picker
                    return this.createFilePickerForTexture(texIndex);
                } else {
                    // Load from path
                    const filePath = args.join(' ');
                    return this.loadTextureIntoBuffer(texIndex, filePath);
                }
                
            case 'vol':
            case 'play':
            case 'pause':
            case 'stop':
            case 'info':
            case 'time':
            case 'hop':
                // For these commands, we need an existing buffer
                const buffer = textureBuffers[textureName];
                if (!buffer) {
                    return { error: `Texture buffer ${textureName} not loaded. Use 'fpic [index] read [path]' to load a texture first.` };
                }
                
                // Now handle the specific command
                switch (actualSubcommand) {
                    case 'vol':
                        return this.handleFpicVolume(texIndex, args);
                    case 'play':
                        return this.handleFpicPlay(texIndex, true);
                    case 'pause':
                        return this.handleFpicPause(texIndex);
                    case 'stop':
                        return this.handleFpicStop(texIndex);
                    case 'info':
                        return this.handleFpicInfo(texIndex);
                    case 'time':
                        return this.handleFpicTime(texIndex);
                    case 'hop':
                        return this.handleFpicHop(texIndex, args);
                }
                break;
                
            default:
                return { error: `Unknown fpic subcommand: ${actualSubcommand}. Usage: fpic [index] <read|vol|play|pause|stop|info|time|hop> [args]` };
        }
    },
    
    // Video recording/camera control (vrec command)
    // Format: vrec pwr <0|1> - turn camera on/off
    // Format: vrec send <tex_index> - send camera feed to texture buffer
    vrec: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: vrec <pwr|send|device|resolution|fps|mirror|zoom|contrast|saturate|blur|posterize|threshold|flip|rotate|effect|brightness|opacity> [args]' };
        }
        
        const subcommand = tokens[1].toLowerCase();
        
        switch (subcommand) {
            case 'pwr':
                return this.handleVrecPower(tokens.slice(2));
                
            case 'send':
                return this.handleVrecSend(tokens.slice(2));
                
            case 'device':
                return this.handleVrecDevice(tokens.slice(2));
                
            case 'resolution':
                return this.handleVrecResolution(tokens.slice(2));
                
            case 'fps':
                return this.handleVrecFps(tokens.slice(2));
                
            case 'mirror':
                return this.handleVrecMirror(tokens.slice(2));
                
            case 'zoom':
                return this.handleVrecZoom(tokens.slice(2));
                
            case 'contrast':
                return this.handleVrecContrast(tokens.slice(2));
                
            case 'saturate':
                return this.handleVrecSaturate(tokens.slice(2));
                
            case 'blur':
                return this.handleVrecBlur(tokens.slice(2));
                
            case 'posterize':
                return this.handleVrecPosterize(tokens.slice(2));
                
            case 'threshold':
                return this.handleVrecThreshold(tokens.slice(2));
                
            case 'flip':
                return this.handleVrecFlip(tokens.slice(2));
                
            case 'rotate':
                return this.handleVrecRotate(tokens.slice(2));
                
            case 'effect':
                return this.handleVrecEffect(tokens.slice(2));
                
            case 'brightness':
                return this.handleVrecBrightness(tokens.slice(2));
                
            case 'opacity':
                return this.handleVrecOpacity(tokens.slice(2));
                
            default:
                return { error: `Unknown vrec subcommand: ${subcommand}. Usage: vrec <pwr|send|device|resolution|fps|mirror|zoom|contrast|saturate|blur|posterize|threshold|flip|rotate|effect|brightness|opacity> [args]` };
        }
    },
    
    // Handle vrec pwr command: vrec pwr <0|1>
    handleVrecPower: function(args) {
        if (args.length === 0) {
            // Return current power status
            return { output: `Camera is currently ${cameraEnabled ? 'ON' : 'OFF'}` };
        }
        
        const powerValue = parseInt(args[0]);
        if (isNaN(powerValue) || (powerValue !== 0 && powerValue !== 1)) {
            return { error: 'Usage: vrec pwr <0|1> - 0=off, 1=on' };
        }
        
        const shouldEnable = powerValue === 1;
        
        if (shouldEnable && !cameraEnabled) {
            // Turn on camera
            return this.initializeCamera();
        } else if (!shouldEnable && cameraEnabled) {
            // Turn off camera
            return this.stopCamera();
        } else {
            // Already in desired state
            return { output: `Camera is already ${shouldEnable ? 'ON' : 'OFF'}` };
        }
    },
    
    // Handle vrec send command: vrec send <tex_index>
    handleVrecSend: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec send <tex_index> - tex_index must be 0-3' };
        }
        
        const texIndex = parseInt(args[0]);
        if (isNaN(texIndex) || texIndex < 0 || texIndex > 3) {
            return { error: 'Texture index must be 0-3' };
        }
        
        if (!cameraEnabled || !cameraTexture) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        const textureName = `tex${texIndex}`;
        
        // Create or update the texture buffer with camera texture
        textureBuffers[textureName] = {
            texture: cameraTexture,
            filePath: 'camera_feed',
            originalFilename: 'Live Camera Feed',
            isVideo: true,
            videoElement: cameraVideoElement,
            isCamera: true
        };
        
        // Also store on window for external access
        window[textureName] = textureBuffers[textureName];
        
        return { output: `Camera feed sent to ${textureName}. Use with "geo diffuse_texture ${textureName}"` };
    },
    
    // Handle vrec device command: vrec device [index]
    handleVrecDevice: function(args) {
        // Enumerate devices first to get the list
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return { error: 'Device enumeration not supported in this browser' };
        }
        
        return navigator.mediaDevices.enumerateDevices().then(devices => {
            cameraDevices = devices.filter(d => d.kind === 'videoinput');
            
            if (args.length === 0) {
                // List available devices
                if (cameraDevices.length === 0) {
                    return { output: 'No video input devices found' };
                }
                let deviceList = 'Available video input devices:\n';
                cameraDevices.forEach((device, index) => {
                    const label = device.label || `Camera ${index + 1}`;
                    const isCurrent = currentCameraDeviceId === device.deviceId;
                    deviceList += `  ${index}: ${label}${isCurrent ? ' (current)' : ''}\n`;
                });
                return { output: deviceList };
            }
            
            // Switch to specific device
            const deviceIndex = parseInt(args[0]);
            if (isNaN(deviceIndex) || deviceIndex < 0 || deviceIndex >= cameraDevices.length) {
                return { error: `Device index must be a number between 0 and ${cameraDevices.length - 1}` };
            }
            
            // Turn off current camera
            if (cameraEnabled) {
                this.stopCamera();
            }
            
            // Initialize with new device
            return this.initializeCamera(deviceIndex);
        }).catch(error => {
            console.error('Error enumerating devices:', error);
            return { error: `Error enumerating devices: ${error.message || error}` };
        });
    },
    
    // Handle vrec resolution command: vrec resolution <width> <height>
    handleVrecResolution: function(args) {
        if (args.length < 2) {
            return { error: 'Usage: vrec resolution <width> <height> - e.g., vrec resolution 1280 720' };
        }
        
        if (!cameraEnabled) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        const width = parseInt(args[0]);
        const height = parseInt(args[1]);
        
        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
            return { error: 'Width and height must be positive numbers' };
        }
        
        // Stop current stream
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        
        // Restart camera with new resolution
        const constraints = {
            video: { width: { exact: width }, height: { exact: height } },
            audio: false
        };
        
        if (currentCameraDeviceId) {
            constraints.video.deviceId = { exact: currentCameraDeviceId };
        }
        
        return navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            this.setupCameraStream(stream, cameraDevices.find(d => d.deviceId === currentCameraDeviceId));
            return { output: `Camera resolution set to ${width}x${height}` };
        }).catch(error => {
            console.error('Error setting camera resolution:', error);
            return { error: `Failed to set resolution: ${error.message || error}` };
        });
    },
    
    // Handle vrec fps command: vrec fps <n>
    handleVrecFps: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec fps <frame-rate> - e.g., vrec fps 30' };
        }
        
        if (!cameraEnabled) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        const fps = parseInt(args[0]);
        if (isNaN(fps) || fps <= 0) {
            return { error: 'Frame rate must be a positive number' };
        }
        
        cameraFps = fps;
        return { output: `Camera FPS target set to: ${fps} (browser support may vary)` };
    },
    
    // Handle vrec mirror command: vrec mirror <0|1>
    handleVrecMirror: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec mirror <0|1> - 0=normal, 1=mirrored' };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        const mirrorValue = parseInt(args[0]);
        if (isNaN(mirrorValue) || (mirrorValue !== 0 && mirrorValue !== 1)) {
            return { error: 'Mirror must be 0 (off) or 1 (on)' };
        }
        
        // Toggle flip X for mirror effect
        if (mirrorValue === 1) {
            if (cameraFlip === 'none') cameraFlip = 'x';
            else if (cameraFlip === 'x') cameraFlip = 'none';
            else if (cameraFlip === 'y') cameraFlip = 'both';
            else if (cameraFlip === 'both') cameraFlip = 'y';
        } else {
            if (cameraFlip === 'x') cameraFlip = 'none';
            else if (cameraFlip === 'both') cameraFlip = 'y';
        }
        
        this.rebuildCameraTransform();
        this.applyCameraEffects();
        
        return { output: `Camera mirror set to: ${mirrorValue === 1 ? 'ON' : 'OFF'}` };
    },
    
    // Handle vrec zoom command: vrec zoom <1-10>
    handleVrecZoom: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec zoom <factor> - 1.0=normal, 2.0=2x zoom (1-10)' };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        const zoomValue = parseFloat(args[0]);
        if (isNaN(zoomValue) || zoomValue < 1 || zoomValue > 10) {
            return { error: 'Zoom must be a number between 1 and 10' };
        }
        
        cameraZoom = zoomValue;
        this.rebuildCameraTransform();
        this.applyCameraEffects();
        
        return { output: `Camera zoom set to: ${zoomValue}x` };
    },
    
    // Handle vrec contrast command: vrec contrast <0-200>
    handleVrecContrast: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec contrast <value> - 100=normal, 0-200' };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        const contrast = parseFloat(args[0]);
        if (isNaN(contrast) || contrast < 0 || contrast > 200) {
            return { error: 'Contrast must be a number between 0 and 200' };
        }
        
        const currentFilter = cameraFilter || '';
        const newFilter = currentFilter.replace(/contrast\([^)]*\)/, '') + `contrast(${contrast}%)`;
        cameraFilter = newFilter;
        this.applyCameraEffects();
        
        return { output: `Camera contrast set to: ${contrast}%` };
    },
    
    // Handle vrec saturate command: vrec saturate <0-200>
    handleVrecSaturate: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec saturate <value> - 100=normal, 0-200' };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        const saturate = parseFloat(args[0]);
        if (isNaN(saturate) || saturate < 0 || saturate > 200) {
            return { error: 'Saturation must be a number between 0 and 200' };
        }
        
        const currentFilter = cameraFilter || '';
        const newFilter = currentFilter.replace(/saturate\([^)]*\)/, '') + `saturate(${saturate}%)`;
        cameraFilter = newFilter;
        this.applyCameraEffects();
        
        return { output: `Camera saturation set to: ${saturate}%` };
    },
    
    // Handle vrec blur command: vrec blur <0-10>
    handleVrecBlur: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec blur <value> - 0=no blur, 10=maximum blur' };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        const blurValue = parseFloat(args[0]);
        if (isNaN(blurValue) || blurValue < 0 || blurValue > 10) {
            return { error: 'Blur must be a number between 0 and 10' };
        }
        
        const currentFilter = cameraFilter || '';
        const newFilter = currentFilter.replace(/blur\([^)]*\)/, '') + `blur(${blurValue}px)`;
        cameraFilter = newFilter;
        this.applyCameraEffects();
        
        return { output: `Camera blur set to: ${blurValue}px` };
    },
    
    // Handle vrec posterize command: vrec posterize <2-256>
    handleVrecPosterize: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec posterize <levels> - 2-256 (2=black & white)' };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        const levels = parseInt(args[0]);
        if (isNaN(levels) || levels < 2 || levels > 256) {
            return { error: 'Levels must be between 2 and 256' };
        }
        
        // Approximate with contrast
        const currentFilter = cameraFilter || '';
        const newFilter = currentFilter.replace(/contrast\([^)]*\)/g, '') + `contrast(${Math.min(levels * 10, 1000)}%)`;
        cameraFilter = newFilter;
        this.applyCameraEffects();
        
        return { output: `Camera posterize set to: ${levels} levels (approximated)` };
    },
    
    // Handle vrec threshold command: vrec threshold <0-255>
    handleVrecThreshold: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec threshold <value> - 0-255' };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        const threshold = parseInt(args[0]);
        if (isNaN(threshold) || threshold < 0 || threshold > 255) {
            return { error: 'Threshold must be between 0 and 255' };
        }
        
        // Approximate with brightness/contrast
        const currentFilter = cameraFilter || '';
        const brightness = threshold > 128 ? 200 : 0;
        const contrastVal = threshold > 128 ? 500 : 0;
        const newFilter = currentFilter.replace(/brightness\([^)]*\)|contrast\([^)]*\)/g, '') + `brightness(${brightness}%) contrast(${contrastVal}%)`;
        cameraFilter = newFilter;
        this.applyCameraEffects();
        
        return { output: `Camera threshold set to: ${threshold} (approximated)` };
    },
    
    // Initialize camera stream
    initializeCamera: function(deviceIndex = null) {
        if (cameraEnabled) {
            return { output: 'Camera is already ON' };
        }
        
        // Clean up any existing camera
        this.stopCamera();
        
        // Reset effect states
        cameraFilter = '';
        cameraFlip = 'none';
        cameraRotation = 0;
        cameraZoom = 1;
        cameraFps = 30;
        cameraTransform = '';
        
        // Check if browser supports media devices
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return { error: 'Camera access not supported in this browser. Try Chrome, Firefox, or Edge.' };
        }
        
        // Build constraints for device selection
        const constraints = { 
            video: true,
            audio: false 
        };
        
        // If a specific device is requested
        if (deviceIndex !== null || currentCameraDeviceId) {
            // Enumerate devices first
            navigator.mediaDevices.enumerateDevices().then(devices => {
                cameraDevices = devices.filter(d => d.kind === 'videoinput');
                
                if (cameraDevices.length === 0) {
                    return { error: 'No video input devices found' };
                }
                
                // Select device
                let selectedDevice;
                if (deviceIndex !== null && deviceIndex >= 0 && deviceIndex < cameraDevices.length) {
                    selectedDevice = cameraDevices[deviceIndex];
                    currentCameraDeviceId = selectedDevice.deviceId;
                } else if (currentCameraDeviceId) {
                    selectedDevice = cameraDevices.find(d => d.deviceId === currentCameraDeviceId);
                }
                
                if (selectedDevice) {
                    constraints.video = { deviceId: { exact: selectedDevice.deviceId } };
                }
                
                // Request camera access with selected device
                navigator.mediaDevices.getUserMedia(constraints).then(stream => {
                    this.setupCameraStream(stream, selectedDevice);
                }).catch(error => {
                    console.error('Camera access error:', error);
                    cameraEnabled = false;
                    window.cameraEnabled = cameraEnabled;
                    ThreeCommands.addToTerminal(`Camera access denied: ${error.message || 'User denied camera access'}`, true);
                });
            }).catch(error => {
                console.error('Error enumerating devices:', error);
                return { error: `Error enumerating devices: ${error.message}` };
            });
            
            return { output: 'Enumerating video devices...' };
        }
        
        // Request camera access with default device
        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            this.setupCameraStream(stream, null);
        }).catch(error => {
            console.error('Camera access error:', error);
            cameraEnabled = false;
            window.cameraEnabled = cameraEnabled;
            ThreeCommands.addToTerminal(`Camera access denied: ${error.message || 'User denied camera access'}`, true);
        });
        
        return { output: 'Initializing camera...' };
    },
    
    // Setup camera stream after successful getUserMedia
    setupCameraStream: function(stream, device) {
        cameraStream = stream;
        
        // Create video element for camera feed
        cameraVideoElement = document.createElement('video');
        cameraVideoElement.srcObject = stream;
        cameraVideoElement.loop = true;
        cameraVideoElement.muted = true;
        cameraVideoElement.playsInline = true;
        cameraVideoElement.style.display = 'none';
        
        // Apply any pending filter and transform
        if (cameraFilter) {
            cameraVideoElement.style.filter = cameraFilter;
        }
        if (cameraTransform) {
            cameraVideoElement.style.transform = cameraTransform;
        }
        
        // Add to DOM (required for some browsers)
        document.body.appendChild(cameraVideoElement);
        
        // Create video texture
        cameraTexture = new THREE.VideoTexture(cameraVideoElement);
        cameraTexture.colorSpace = THREE.SRGBColorSpace;
        cameraTexture.needsUpdate = true;
        
        // Try to play the camera stream
        const playPromise = cameraVideoElement.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                cameraEnabled = true;
                window.cameraEnabled = cameraEnabled;
                if (device) {
                    ThreeCommands.addToTerminal(`Camera initialized: ${device.label || 'Unknown device'}`);
                } else {
                    ThreeCommands.addToTerminal('Camera initialized successfully');
                }
                
                // Force render update
                if (renderer && scene && camera) {
                    renderer.render(scene, camera);
                }
            }).catch(error => {
                console.error('Camera play failed:', error);
                cameraEnabled = false;
                window.cameraEnabled = false;
                ThreeCommands.addToTerminal(`Camera error: ${error.message || 'Failed to start camera'}`, true);
                this.stopCamera();
            });
        } else {
            // Play promise not supported, assume it works
            cameraEnabled = true;
            window.cameraEnabled = cameraEnabled;
            if (device) {
                ThreeCommands.addToTerminal(`Camera initialized: ${device.label || 'Unknown device'}`);
            } else {
                ThreeCommands.addToTerminal('Camera initialized successfully');
            }
        }
        
        return { output: 'Initializing camera...' };
    },
    
    // Stop camera stream
    stopCamera: function() {
        if (!cameraEnabled) {
            return { output: 'Camera is already OFF' };
        }
        
        // Stop all tracks in the stream
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            cameraStream = null;
        }
        
        // Remove video element
        if (cameraVideoElement) {
            document.body.removeChild(cameraVideoElement);
            cameraVideoElement = null;
        }
        
        // Dispose of camera texture
        if (cameraTexture) {
            cameraTexture.dispose();
            cameraTexture = null;
        }
        
        cameraEnabled = false;
        window.cameraEnabled = cameraEnabled;
        
        return { output: 'Camera turned OFF' };
    },
    
    // Handle vrec flip command: vrec flip <x|y|both|none>
    handleVrecFlip: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec flip <x|y|both|none>' };
        }
        
        const flipMode = args[0].toLowerCase();
        const validModes = ['x', 'y', 'both', 'none'];
        
        if (!validModes.includes(flipMode)) {
            return { error: `Invalid flip mode. Use: ${validModes.join('|')}` };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        // Build transform for flip
        let flipTransform = '';
        switch (flipMode) {
            case 'x':
                flipTransform = 'scaleX(-1)';
                break;
            case 'y':
                flipTransform = 'scaleY(-1)';
                break;
            case 'both':
                flipTransform = 'scale(-1, -1)';
                break;
            case 'none':
                flipTransform = '';
                break;
        }
        
        // Store flip separately so rotate can be combined with it
        cameraFlip = flipMode;
        
        // Rebuild the complete transform
        this.rebuildCameraTransform();
        
        // Apply all effects
        this.applyCameraEffects();
        
        return { output: `Camera flip set to: ${flipMode}` };
    },
    
    // Handle vrec rotate command: vrec rotate <0|90|180|270>
    handleVrecRotate: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec rotate <0|90|180|270>' };
        }
        
        const rotation = parseInt(args[0]);
        const validRotations = [0, 90, 180, 270];
        
        if (!validRotations.includes(rotation)) {
            return { error: `Invalid rotation. Use: ${validRotations.join('|')}` };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        // Update rotation state
        cameraRotation = rotation;
        
        // Rebuild the complete transform
        this.rebuildCameraTransform();
        
        // Apply all effects
        this.applyCameraEffects();
        
        return { output: `Camera rotation set to: ${rotation}°` };
    },
    
    // Apply all camera video effects (filter + transform) at once
    applyCameraEffects: function() {
        if (!cameraVideoElement) return;
        
        // Build the complete filter string
        let filter = cameraFilter || '';
        
        // Build the complete transform string  
        let transform = cameraTransform || '';
        
        // Only update if something changed
        if (cameraVideoElement.style.filter !== filter) {
            cameraVideoElement.style.filter = filter;
        }
        if (cameraVideoElement.style.transform !== transform) {
            cameraVideoElement.style.transform = transform;
        }
        
        // Force texture update
        if (cameraTexture) {
            cameraTexture.needsUpdate = true;
        }
        
        // Notify all geometries using camera texture buffers
        for (let i = 0; i < 4; i++) {
            const texName = `tex${i}`;
            if (textureBuffers[texName] && textureBuffers[texName].isCamera) {
                notifyTextureBufferUsers(texName);
            }
        }
        
        // Force render
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    },
    
    // Rebuild the complete transform string from flip and rotation states
    rebuildCameraTransform: function() {
        const parts = [];
        
        // Add flip transform
        switch (cameraFlip) {
            case 'x':
                parts.push('scaleX(-1)');
                break;
            case 'y':
                parts.push('scaleY(-1)');
                break;
            case 'both':
                parts.push('scale(-1, -1)');
                break;
        }
        
        // Add rotation transform
        if (cameraRotation !== 0) {
            parts.push(`rotate(${cameraRotation}deg)`);
        }
        
        // Add zoom transform
        if (cameraZoom !== 1) {
            parts.push(`scale(${cameraZoom})`);
        }
        
        cameraTransform = parts.join(' ');
    },
    
    // Handle vrec effect command: vrec effect <normal|grayscale|sepia|invert|nightvision>
    handleVrecEffect: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec effect <normal|grayscale|sepia|invert|nightvision>' };
        }
        
        const effect = args[0].toLowerCase();
        const validEffects = ['normal', 'grayscale', 'sepia', 'invert', 'nightvision'];
        
        if (!validEffects.includes(effect)) {
            return { error: `Invalid effect. Use: ${validEffects.join('|')}` };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        // Set filter based on effect
        switch (effect) {
            case 'normal':
                cameraFilter = '';
                break;
            case 'grayscale':
                cameraFilter = 'grayscale(100%)';
                break;
            case 'sepia':
                cameraFilter = 'sepia(100%)';
                break;
            case 'invert':
                cameraFilter = 'invert(100%)';
                break;
            case 'nightvision':
                cameraFilter = 'grayscale(100%) invert(100%) contrast(200%) brightness(150%)';
                break;
        }
        
        // Apply all effects
        this.applyCameraEffects();
        
        return { output: `Camera effect set to: ${effect}` };
    },
    
    // Handle vrec brightness command: vrec brightness <0-200>
    handleVrecBrightness: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec brightness <0-200> - 100 is normal' };
        }
        
        const brightness = parseFloat(args[0]);
        if (isNaN(brightness) || brightness < 0 || brightness > 200) {
            return { error: 'Brightness must be a number between 0 and 200' };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        // Update brightness in filter - combine with any existing effect
        // Remove any existing brightness from filter
        const currentFilter = cameraFilter || '';
        const newFilter = currentFilter.replace(/brightness\([^)]*\)/, '') + `brightness(${brightness}%)`;
        cameraFilter = newFilter;
        
        // Apply all effects
        this.applyCameraEffects();
        
        return { output: `Camera brightness set to: ${brightness}%` };
    },
    
    // Handle vrec opacity command: vrec opacity <0-100>
    handleVrecOpacity: function(args) {
        if (args.length === 0) {
            return { error: 'Usage: vrec opacity <0-100> - 100 is fully opaque' };
        }
        
        const opacity = parseFloat(args[0]);
        if (isNaN(opacity) || opacity < 0 || opacity > 100) {
            return { error: 'Opacity must be a number between 0 and 100' };
        }
        
        if (!cameraVideoElement) {
            return { error: 'Camera is not enabled. Turn on camera with "vrec pwr 1" first.' };
        }
        
        // Apply opacity using CSS (separate from filter)
        cameraVideoElement.style.opacity = opacity / 100;
        
        // Apply all effects (which will also handle texture update and render)
        this.applyCameraEffects();
        
        return { output: `Camera opacity set to: ${opacity}%` };
    },
    
    // Create file picker dialog for texture loading
    createFilePickerForTexture: function(texIndex) {
        const textureName = `tex${texIndex}`;
        
        // Create file input element
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*, video/*';
        fileInput.style.display = 'none';
        
        // Add change handler
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                // Create URL for the file
                const fileURL = URL.createObjectURL(file);
                console.log(`File selected for ${textureName}: ${file.name}, URL: ${fileURL}`);
                
                // Load the texture into the buffer
                this.loadTextureIntoBuffer(texIndex, fileURL, file.name);
            }
            
            // Remove the input element
            document.body.removeChild(fileInput);
        });
        
        // Add to DOM and click
        document.body.appendChild(fileInput);
        fileInput.click();
        
        return { output: `Opened file picker for ${textureName}...` };
    },
    
    // Load texture into texture buffer
    loadTextureIntoBuffer: function(texIndex, filePath, originalFilename = null) {
        if (texIndex < 0 || texIndex > 3) {
            return { error: `Texture index must be 0-3, got ${texIndex}` };
        }
        
        const textureName = `tex${texIndex}`;
        
        // Check if path is valid
        const isBlobUrl = filePath.startsWith('blob:');
        const isHttpUrl = filePath.startsWith('http://') || filePath.startsWith('https://');
        const isRelativePath = !filePath.startsWith('/') && !filePath.includes(':');
        const isAbsoluteLocalPath = filePath.startsWith('/') && !isBlobUrl && !isHttpUrl;
        
        if (isAbsoluteLocalPath) {
            return { error: 'Local file paths not supported. Use relative paths or place files in project folder.' };
        }
        
        // Determine if this is a video based on file extension
        const isVideo = filePath.endsWith('.mp4') || filePath.endsWith('.webm') || filePath.endsWith('.ogg') || filePath.endsWith('.mov');
        
        // For video files, create video element and texture
        if (isVideo) {
            // Create video element
            const videoElement = document.createElement('video');
            videoElement.loop = true;
            videoElement.muted = true; // Required for autoplay in most browsers
            videoElement.playsInline = true;
            videoElement.crossOrigin = 'anonymous';
            
            // Handle blob URLs and regular URLs
            if (filePath.startsWith('blob:')) {
                videoElement.src = filePath;
            } else {
                videoElement.src = filePath;
            }
            
            // For blob URLs, we need to add the video to DOM to work properly
            if (filePath.startsWith('blob:')) {
                videoElement.style.display = 'none';
                document.body.appendChild(videoElement);
            }
            
            // Set up event handlers
            videoElement.addEventListener('loadedmetadata', () => {
                console.log(`Video metadata loaded for ${textureName}: ${filePath}`);
                
                // Create video texture
                const texture = new THREE.VideoTexture(videoElement);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                
                // Try to play the video
                const playPromise = videoElement.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn('Autoplay prevented:', error);
                        // Add user interaction to start video
                        videoElement.addEventListener('click', () => {
                            videoElement.play().catch(e => console.warn('Video play failed:', e));
                        });
                    });
                }
                
                // Store the texture in the buffer
                textureBuffers[textureName] = {
                    texture: texture,
                    filePath: filePath,
                    originalFilename: originalFilename || filePath,
                    isVideo: isVideo,
                    videoElement: videoElement
                };
                
                // Also store on window for external access
                window[textureName] = textureBuffers[textureName];
                
                // Add to terminal
                const displayName = originalFilename || filePath;
                ThreeCommands.addToTerminal(`Video texture loaded: ${displayName} -> ${textureName}`);
                
                // Force render update
                if (renderer && scene && camera) {
                    renderer.render(scene, camera);
                }
            });
            
            videoElement.addEventListener('error', (error) => {
                console.error(`Error loading video for ${textureName}:`, error);
                let errorMsg = error.message || 'Unknown error';
                if (error.code) {
                    errorMsg = `Error code ${error.code}: ${errorMsg}`;
                }
                // Check if it's a format issue
                if (errorMsg.includes('unsupported') || errorMsg.includes('format') || errorMsg.includes('codec')) {
                    errorMsg = `Video format not supported in this browser. Try MP4 or WEBM. Original: ${errorMsg}`;
                }
                ThreeCommands.addToTerminal(`Error loading video: ${filePath} - ${errorMsg}`, true);
            });
            
            // Start loading the video
            videoElement.load();
            
            return { output: `Loading video ${filePath} for ${textureName}...` };
        } else {
            // For regular image textures
            let loader;
            if (filePath.endsWith('.exr')) {
                loader = new THREE.ExrLoader();
            } else {
                loader = new THREE.TextureLoader();
            }
            
            const actualPath = filePath;
            
            loader.load(
                actualPath,
                function(texture) {
                    console.log(`Texture loaded for ${textureName}: ${actualPath}`);
                    
                    // Apply texture settings
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.needsUpdate = true;
                    
                    // Store the texture in the buffer
                    textureBuffers[textureName] = {
                        texture: texture,
                        filePath: filePath,
                        originalFilename: originalFilename || filePath,
                        isVideo: false,
                        videoElement: null
                    };
                    
                    // Also store on window for external access
                    window[textureName] = textureBuffers[textureName];
                    
                    // Add to terminal
                    const displayName = originalFilename || filePath;
                    ThreeCommands.addToTerminal(`Texture loaded: ${displayName} -> ${textureName}`);
                    
                    // Force render update
                    if (renderer && scene && camera) {
                        renderer.render(scene, camera);
                    }
                },
                undefined, // Progress
                function(error) {
                    console.error(`Error loading texture for ${textureName}:`, error);
                    ThreeCommands.addToTerminal(`Error loading texture: ${actualPath}`, true);
                }
            );
            
            return { output: `Loading texture ${filePath} for ${textureName}...` };
        }
    },
    
    // fpic volume control: fpic <index> vol [0-100]
    handleFpicVolume: function(texIndex, args) {
        const textureName = `tex${texIndex}`;
        const buffer = textureBuffers[textureName];
        
        if (!buffer) {
            return { error: `Texture buffer ${textureName} not loaded` };
        }
        
        if (!buffer.isVideo || !buffer.videoElement) {
            return { error: `Volume control only works for video textures. ${textureName} is an image.` };
        }
        
        if (args.length === 0) {
            // Get current volume
            const volume = buffer.videoElement.volume * 100;
            return { output: `Volume for ${textureName}: ${volume.toFixed(1)}%` };
        }
        
        const volumeValue = parseFloat(args[0]);
        if (isNaN(volumeValue) || volumeValue < 0 || volumeValue > 100) {
            return { error: 'Volume must be a number between 0 and 100' };
        }
        
        // Convert 0-100 to 0-1
        buffer.videoElement.volume = volumeValue / 100;
        return { output: `Set ${textureName} volume to ${volumeValue}%` };
    },
    
    // fpic play control: fpic <index> play
    handleFpicPlay: function(texIndex, resume = true) {
        const textureName = `tex${texIndex}`;
        const buffer = textureBuffers[textureName];
        
        if (!buffer) {
            return { error: `Texture buffer ${textureName} not loaded` };
        }
        
        if (!buffer.isVideo || !buffer.videoElement) {
            return { error: `Play control only works for video textures. ${textureName} is an image.` };
        }
        
        const videoElement = buffer.videoElement;
        
        // Try to play the video
        const playPromise = videoElement.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                ThreeCommands.addToTerminal(`${textureName} playback started`);
                // Notify users when playback actually starts
                notifyTextureBufferUsers(textureName);
            }).catch(error => {
                console.warn('Play failed:', error);
                ThreeCommands.addToTerminal(`Failed to play ${textureName}: ${error.message || 'Browser autoplay restriction'}`, true);
                
                // Add click to play
                videoElement.addEventListener('click', () => {
                    videoElement.play().catch(e => console.warn('Video play failed:', e));
                });
            });
        } else {
            // No promise, assume it worked
            notifyTextureBufferUsers(textureName);
        }
        
        return { output: `Starting playback for ${textureName}...` };
    },
    
    // fpic pause control: fpic <index> pause
    handleFpicPause: function(texIndex) {
        const textureName = `tex${texIndex}`;
        const buffer = textureBuffers[textureName];
        
        if (!buffer) {
            return { error: `Texture buffer ${textureName} not loaded` };
        }
        
        if (!buffer.isVideo || !buffer.videoElement) {
            return { error: `Pause control only works for video textures. ${textureName} is an image.` };
        }
        
        buffer.videoElement.pause();
        notifyTextureBufferUsers(textureName);
        return { output: `Paused ${textureName}` };
    },
    
    // fpic stop control: fpic <index> stop
    handleFpicStop: function(texIndex) {
        const textureName = `tex${texIndex}`;
        const buffer = textureBuffers[textureName];
        
        if (!buffer) {
            return { error: `Texture buffer ${textureName} not loaded` };
        }
        
        if (!buffer.isVideo || !buffer.videoElement) {
            return { error: `Stop control only works for video textures. ${textureName} is an image.` };
        }
        
        const videoElement = buffer.videoElement;
        videoElement.pause();
        videoElement.currentTime = 0;
        notifyTextureBufferUsers(textureName);
        return { output: `Stopped ${textureName}` };
    },
    
    // fpic info: fpic <index> info - show texture details
    handleFpicInfo: function(texIndex) {
        const textureName = `tex${texIndex}`;
        const buffer = textureBuffers[textureName];
        
        if (!buffer) {
            return { error: `Texture buffer ${textureName} not loaded` };
        }
        
        const texture = buffer.texture;
        const lines = [`Texture Info for ${textureName}:`, '=========================='];
        
        // Basic info
        lines.push(`Type: ${buffer.isVideo ? 'VIDEO' : 'IMAGE'}`);
        lines.push(`File: ${buffer.originalFilename || buffer.filePath}`);
        lines.push(`Color Space: ${texture.colorSpace || 'Unknown'}`);
        
        // Image/Texture dimensions
        if (texture.image) {
            if (buffer.isVideo) {
                // Video texture
                const video = texture.image;
                lines.push(`Video Format: ${video.videoWidth}x${video.videoHeight}`);
                lines.push(`Actual Dimensions: ${video.videoWidth}x${video.videoHeight}`);
                lines.push(`Duration: ${video.duration ? video.duration.toFixed(2) : 'Unknown'}s`);
                lines.push(`FPS: ${video.fps ? video.fps.toFixed(2) : 'Unknown'}`);
                lines.push(`Current Time: ${video.currentTime ? video.currentTime.toFixed(2) : '0.00'}s`);
                lines.push(`Paused: ${video.paused ? 'Yes' : 'No'}`);
                lines.push(`Volume: ${(video.volume * 100).toFixed(1)}%`);
                lines.push(`Loop: ${video.loop ? 'Yes' : 'No'}`);
            } else {
                // Image texture
                const image = texture.image;
                lines.push(`Image Format: ${image.width}x${image.height}`);
                lines.push(`Actual Dimensions: ${image.width}x${image.height}`);
            }
        } else {
            lines.push(`Texture Dimensions: ${texture.width || 'Unknown'}x${texture.height || 'Unknown'}`);
        }
        
        // Additional texture properties
        lines.push(`Needs Update: ${texture.needsUpdate || false}`);
        lines.push(`Repeat: ${texture.repeat ? `x:${texture.repeat.x}, y:${texture.repeat.y}` : 'Default'}`);
        lines.push(`Wrap: ${texture.wrapS || 'ClampToEdge'} / ${texture.wrapT || 'ClampToEdge'}`);
        lines.push(`Filter: ${texture.magFilter || 'Linear'} / ${texture.minFilter || 'Linear'}`);
        
        return { output: lines.join('\n'), isMultiline: true };
    },
    
    // fpic time: fpic <index> time - show time info
    handleFpicTime: function(texIndex) {
        const textureName = `tex${texIndex}`;
        const buffer = textureBuffers[textureName];
        
        if (!buffer) {
            return { error: `Texture buffer ${textureName} not loaded` };
        }
        
        const texture = buffer.texture;
        
        if (buffer.isVideo && buffer.videoElement) {
            // For videos - show real-time clock/length
            const video = buffer.videoElement;
            const currentTime = video.currentTime;
            const duration = video.duration;
            
            if (duration && duration > 0) {
                const progress = (currentTime / duration * 100).toFixed(1);
                const timeDisplay = `${formatTime(currentTime)} / ${formatTime(duration)} (${progress}%)`;
                const status = video.paused ? 'PAUSED' : 'PLAYING';
                return { output: `${textureName} [VIDEO] ${status}: ${timeDisplay}` };
            } else {
                return { output: `${textureName} [VIDEO] Loading metadata...` };
            }
        } else {
            // For images - show static format info
            const image = texture.image;
            const format = image && image.format ? image.format : 'Unknown';
            const dimensions = image ? `${image.width}x${image.height}` : 'Unknown';
            return { output: `${textureName} [IMAGE] Format: ${format}, Dimensions: ${dimensions}, Static` };
        }
    },
    
    // fpic hop: fpic <index> hop [timestamp] - seek to timestamp
    handleFpicHop: function(texIndex, args) {
        const textureName = `tex${texIndex}`;
        const buffer = textureBuffers[textureName];
        
        if (!buffer) {
            return { error: `Texture buffer ${textureName} not loaded` };
        }
        
        if (!buffer.isVideo || !buffer.videoElement) {
            return { error: `Hop command only works for video textures. ${textureName} is an image.` };
        }
        
        if (args.length === 0) {
            return { error: 'Usage: fpic <index> hop <timestamp> - timestamp in seconds' };
        }
        
        const timestamp = parseFloat(args[0]);
        if (isNaN(timestamp)) {
            return { error: 'Timestamp must be a number (in seconds)' };
        }
        
        const videoElement = buffer.videoElement;
        const texture = buffer.texture;
        const duration = videoElement.duration;
        
        // Check if video metadata is loaded and video is seekable
        if (!duration || duration <= 0 || isNaN(duration)) {
            return { error: `Video metadata not loaded yet for ${textureName}. Wait for video to load first.` };
        }
        
        if (!videoElement.seekable) {
            return { error: `Video ${textureName} is not seekable yet. Wait for buffering to complete.` };
        }
        
        // Clamp timestamp to valid range
        const clampedTimestamp = Math.max(0, Math.min(timestamp, duration));
        
        // Store the playback state before seeking
        const wasPlaying = !videoElement.paused;
        
        // Pause the video before seeking (this helps with seeking accuracy)
        videoElement.pause();
        
        // Set the new time
        videoElement.currentTime = clampedTimestamp;
        
        // Force texture update - mark that the texture needs to be updated
        if (texture) {
            texture.needsUpdate = true;
        }
        
        // For VideoTexture, we might need to force an immediate update
        // This ensures the texture reflects the new video frame
        if (texture && texture.update) {
            texture.update();
        }
        
        // Notify all geometries using this texture buffer
        notifyTextureBufferUsers(textureName);
        
        // Wait a brief moment for the seek to take effect, then force render
        setTimeout(() => {
            if (renderer && scene && camera) {
                renderer.render(scene, camera);
            }
        }, 100);
        
        // Restore playback state if it was playing
        if (wasPlaying) {
            // Wait a bit longer for the seek to complete before resuming playback
            setTimeout(() => {
                const playPromise = videoElement.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.warn('Play after seek failed:', error);
                        // Try one more time after user interaction
                        videoElement.addEventListener('click', () => {
                            videoElement.play().catch(e => console.warn('Video play failed:', e));
                        });
                    });
                }
            }, 200);
        }
        
        return { output: `Seeking ${textureName} to ${clampedTimestamp.toFixed(2)}s (${wasPlaying ? 'playing' : 'paused'})` };
    },
    
    // List all loaded textures
    listTextures: function() {
        const textureNames = Object.keys(textureBuffers);
        
        if (textureNames.length === 0) {
            return { output: 'No textures loaded. Use "fpic [index] read [path]" or "fpic read [path]" to load textures.' };
        }
        
        const outputLines = ['Loaded Textures:', '================'];
        
        for (let i = 0; i < 4; i++) {
            const texName = `tex${i}`;
            if (textureBuffers[texName]) {
                const buffer = textureBuffers[texName];
                const status = buffer.isVideo ? '[VIDEO]' : '[IMAGE]';
                outputLines.push(`${texName}: ${status} ${buffer.originalFilename || buffer.filePath}`);
            } else {
                outputLines.push(`${texName}: [EMPTY]`);
            }
        }
        
        return { output: outputLines.join('\n'), isMultiline: true };
    },
    
    // Sky/background control
    sky: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: sky <subcommand> [args...]' };
        }
        
        const subcommand = tokens[1];
        
        switch (subcommand) {
            case 'color':
                if (tokens.length >= 3) {
                    const color = parseInt(tokens[2].replace('#', '0x'), 16) || COLORS.background;
                    if (scene) {
                        // If background is a texture, dispose it and set to color
                        if (scene.background && !(scene.background instanceof THREE.Color)) {
                            // Dispose the texture if it has dispose method
                            if (scene.background.dispose) {
                                scene.background.dispose();
                            }
                            // Also reset renderer clear color to opaque
                            if (renderer) {
                                renderer.setClearColor(color, 1);
                            }
                        }
                        // Set background to a new Color object
                        scene.background = new THREE.Color(color);
                    }
                    return { output: `Sky color set to ${tokens[2]}` };
                }
                break;
                
            case 'cubemap':
                if (tokens.length >= 3) {
                    return { output: `Sky cubemap set to ${tokens[2]} (not implemented)` };
                }
                break;
                
            case 'read':
                if (tokens.length >= 3) {
                    const filePath = tokens[2];
                    // Check if this is a video file
                    const isVideo = filePath.match(/\.(mp4|mov|webm|ogg)$/i);
                    
                    if (isVideo) {
                        // Load as video background
                        return this.movie(['movie', 'load', filePath]);
                    } else {
                        // Load as texture background
                        return this.loadTextureAsBackground(filePath);
                    }
                } else {
                    // No path provided - open file dialog
                    return this.openFileDialogForSky();
                }
                break;
                
            case 'anim':
                if (tokens.length >= 4) {
                    const animCommand = tokens[3];
                    return { output: `Sky animation ${animCommand} (not implemented)` };
                }
                break;
                
            default:
                return { error: `Unknown sky subcommand: ${subcommand}` };
        }
    },
    
    // Helper function to load texture as background/environment
    loadTextureAsBackground: function(filePath) {
        try {
            // Check if we have a scene and renderer
            if (!scene || !renderer) {
                return { error: 'Scene or renderer not initialized' };
            }
            
            // Use the filePath directly - no $ handling
            const actualPath = filePath;
            
            // Check if this looks like a local absolute path (won't work in browser)
            // Explicitly allow: blob: http:// https:// and relative paths
            const isBlobUrl = actualPath.startsWith('blob:');
            const isHttpUrl = actualPath.startsWith('http://') || actualPath.startsWith('https://');
            const isRelativePath = !actualPath.startsWith('/') && !actualPath.includes(':');
            const isAbsoluteLocalPath = actualPath.startsWith('/') && !isBlobUrl && !isHttpUrl;
            
            if (isAbsoluteLocalPath) {
                console.warn('Local file paths cannot be loaded directly in browser. Use file dialog or web server.');
                return { error: 'Local file paths not supported. Use sky read (no path) to open file dialog, or place files in project folder and use relative paths.' };
            }
            
            console.log('Path type: blob=', isBlobUrl, 'http=', isHttpUrl, 'relative=', isRelativePath);
            
            // Create appropriate loader based on file extension
            let loaderToUse;
            if (actualPath.endsWith('.exr')) {
                loaderToUse = new THREE.ExrLoader();
            } else {
                // For regular images, configure TextureLoader to not flip Y
                loaderToUse = new THREE.TextureLoader();
            }
            
            // Try to load the texture
            console.log(`Loading texture from: ${actualPath}, using loader:`, loaderToUse.constructor.name);
            
            // Set a timeout for loading - blob URLs should load quickly
            const loadTimeout = setTimeout(() => {
                console.error(`Timeout loading texture from: ${actualPath}`);
                ThreeCommands.addToTerminal(`Error: Timeout loading texture from ${actualPath}`, true);
            }, 5000); // 5 second timeout
            
            loaderToUse.load(
                actualPath,
                function(texture) {
                    clearTimeout(loadTimeout);
                    console.log(`Texture loaded successfully: ${actualPath}`);
                    console.log(`  - Image dimensions: ${texture.image ? texture.image.width + 'x' + texture.image.height : 'unknown'}`);
                    console.log(`  - Mapping: ${texture.mapping}`);
                    console.log(`  - ColorSpace: ${texture.colorSpace}`);
                    console.log(`  - FlipY: ${texture.flipY}`);
                    console.log(`  - Texture object:`, texture);
                    
                    // For HDRI/EXR files, set as environment map
                    if (actualPath.endsWith('.exr') || actualPath.endsWith('.hdr')) {
                        texture.mapping = THREE.EquirectangularReflectionMapping;
                        texture.colorSpace = THREE.SRGBColorSpace;
                        
                        // Set as environment map for scene and objects
                        if (scene) {
                            scene.background = texture;
                            scene.environment = texture;
                            // Set clear color to transparent so HDRI environment shows through
                            renderer.setClearColor(0x000000, 0);
                            
                            // Update all objects to use this environment
                            for (const objName in geoObjects) {
                                const obj = geoObjects[objName];
                                if (obj.mesh && obj.mesh.material) {
                                    const material = obj.mesh.material;
                                    if (Array.isArray(material)) {
                                        material.forEach(mat => {
                                            if (mat.envMap) mat.envMap = texture;
                                            if (mat.needsUpdate) mat.needsUpdate = true;
                                        });
                                    } else {
                                        if (material.envMap) material.envMap = texture;
                                        if (material.needsUpdate) material.needsUpdate = true;
                                    }
                                }
                            }
                        }
                    } else {
                        // For regular images, set as background only
                        // Configure texture for proper display
                        texture.colorSpace = THREE.SRGBColorSpace;
                        texture.flipY = true; // Try flipping Y for scene background
                        texture.needsUpdate = true; // Ensure changes are applied
                        console.log(`After fixing: flipY=${texture.flipY}, colorSpace=${texture.colorSpace}`);
                        scene.background = texture;
                        // Set clear color to transparent so scene background texture shows through
                        renderer.setClearColor(0x000000, 0);
                        console.log('Set scene.background to texture:', texture);
                        console.log('Scene background type:', typeof scene.background);
                        console.log('Renderer clear color set to transparent');
                    }
                    
                    // Trigger immediate render to show the new texture
                    if (renderer && scene && camera) {
                        renderer.render(scene, camera);
                    }
                    
                    // Add success message to terminal
                    ThreeCommands.addToTerminal(`Loaded: ${actualPath}`);
                },
                undefined, // Progress callback
                function(error) {
                    console.error('Error loading texture:', actualPath, error);
                    // Check if this looks like a local file path
                    const errorMsg = error.message || String(error);
                    let userMsg = `Error loading texture: ${actualPath}`;
                    // If it looks like a local absolute path, suggest using the file dialog
                    if (actualPath.startsWith('/') || actualPath.includes(':')) {
                        userMsg += ' (use sky read without a path to open file dialog)';
                    }
                    userMsg += `: ${errorMsg}`;
                    // Add error message to terminal
                    ThreeCommands.addToTerminal(userMsg, true);
                }
            );
            
            return { output: `Loading: ${filePath}` };
            
        } catch (error) {
            console.error('Error in loadTextureAsBackground:', error);
            return { error: `Error loading: ${error.message}` };
        }
    },
    
    // Add message to terminal
    addToTerminal: function(message, isError) {
        // This will be available for the UI to call
        if (window.addTerminalMessage) {
            window.addTerminalMessage(message, isError);
        } else {
            console.log(isError ? 'ERROR: ' + message : message);
        }
    },
    
    // Open file dialog for sky/background selection
    openFileDialogForSky: function() {
        try {
            // Create a file input element if it doesn't exist
            let fileInput = document.getElementById('sky-file-input');
            if (!fileInput) {
                fileInput = document.createElement('input');
                fileInput.id = 'sky-file-input';
                fileInput.type = 'file';
                fileInput.accept = '.exr,.hdr,.jpg,.jpeg,.png';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);
                
                fileInput.addEventListener('change', function(e) {
                    if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        console.log('File selected:', file.name, file.type, file.size);
                        // Use createObjectURL instead of FileReader for better THREE.js compatibility
                        const imageUrl = URL.createObjectURL(file);
                        console.log('Created blob URL:', imageUrl);
                        
                        // Load the selected image as sky
                        // Call directly with explicit check that it's a blob URL
                        console.log('Checking if blob URL...');
                        if (imageUrl.startsWith('blob:')) {
                            console.log('Is blob URL, calling loadTextureAsBackground directly');
                            ThreeCommands.loadTextureAsBackground(imageUrl);
                        } else {
                            console.error('Not a blob URL! Got:', imageUrl);
                        }
                        
                        // Reset the input so it can be used again
                        fileInput.value = '';
                    }
                });
            }
            
            // Trigger the file dialog
            fileInput.click();
            return { output: 'Select an image file...' };
            
        } catch (error) {
            console.error('Error opening file dialog:', error);
            return { error: `Error opening file dialog: ${error.message}` };
        }
    },
    
    // Movie/Video background support
    movieVideo: null, // Reference to video element
    movieTexture: null, // Reference to video texture
    movieVolume: 0, // Default volume is 0 (muted)
    
    movie: function(tokens) {
        if (tokens.length < 2) {
            return { error: 'Usage: movie <load|play|pause|stop|volume> [args...]' };
        }
        
        const subcommand = tokens[1].toLowerCase();
        
        switch (subcommand) {
            case 'load':
                if (tokens.length < 3) {
                    return { error: 'Usage: movie load <videoFile>' };
                }
                return this.loadVideo(tokens[2]);
                
            case 'play':
                if (tokens.length >= 3) {
                    const direction = parseInt(tokens[2]) || 1;
                    return this.playVideo(direction);
                }
                return this.playVideo(1);
                
            case 'pause':
                return this.pauseVideo();
                
            case 'stop':
                return this.stopVideo();
                
            case 'volume':
                if (tokens.length < 3) {
                    return { error: 'Usage: movie volume <0-1>' };
                }
                return this.setVideoVolume(parseFloat(tokens[2]));
                
            default:
                return { error: `Unknown movie subcommand: ${subcommand}` };
        }
    },
    
    // Load video and apply as background
    loadVideo: function(videoFile) {
        if (!scene || !renderer) {
            return { error: 'Scene or renderer not initialized' };
        }
        
        // Clean up existing video
        this.stopVideo();
        
        // Check if path is valid
        const isBlobUrl = videoFile.startsWith('blob:');
        const isHttpUrl = videoFile.startsWith('http://') || videoFile.startsWith('https://');
        const isRelativePath = !videoFile.startsWith('/') && !videoFile.includes(':');
        const isAbsoluteLocalPath = videoFile.startsWith('/') && !isBlobUrl && !isHttpUrl;
        
        if (isAbsoluteLocalPath) {
            return { error: 'Local file paths not supported. Use relative paths or place files in project folder.' };
        }
        
        // Create video element
        const video = document.createElement('video');
        video.src = videoFile;
        video.loop = true;
        video.muted = true; // Muted by default
        video.volume = this.movieVolume;
        video.autoplay = true;
        video.crossOrigin = 'anonymous';
        video.style.display = 'none';
        
        // Try to load and play
        const promise = video.play();
        
        if (promise !== undefined) {
            promise.catch(error => {
                console.error('Video autoplay prevented:', error);
                console.log('Trying to play after user interaction...');
                // Try to play on next user interaction
                document.addEventListener('click', function tryPlay() {
                    video.play().catch(e => console.error('Still cannot play:', e));
                    document.removeEventListener('click', tryPlay);
                }, { once: true });
            });
        }
        
        // Wait for video metadata to load
        video.addEventListener('loadedmetadata', () => {
            console.log(`Video loaded: ${videoFile}, dimensions: ${video.videoWidth}x${video.videoHeight}`);
            
            // Create texture from video
            this.movieTexture = new THREE.VideoTexture(video);
            this.movieTexture.colorSpace = THREE.SRGBColorSpace;
            this.movieTexture.needsUpdate = true;
            
            // Set as scene background
            scene.background = this.movieTexture;
            
            // Set clear color to transparent
            renderer.setClearColor(0x000000, 0);
            
            this.movieVideo = video;
            
            ThreeCommands.addToTerminal(`Video loaded: ${videoFile}`);
            
            // Force render
            if (renderer && scene && camera) {
                renderer.render(scene, camera);
            }
        });
        
        video.addEventListener('error', (error) => {
            console.error('Video error:', error);
            ThreeCommands.addToTerminal(`Error loading video: ${videoFile}`, true);
        });
        
        // Store reference
        this.movieVideo = video;
        
        // Add to document body
        document.body.appendChild(video);
        
        return { output: `Loading video: ${videoFile}...` };
    },
    
    // Play video
    playVideo: function(direction = 1) {
        if (!this.movieVideo) {
            return { error: 'No video loaded. Use movie load <file> first.' };
        }
        
        if (direction === 0) {
            // Stop (same as pause and seek to beginning)
            this.movieVideo.pause();
            this.movieVideo.currentTime = 0;
            ThreeCommands.addToTerminal('Video stopped');
        } else {
            // Play forwards or backwards
            if (direction < 0) {
                this.movieVideo.playbackRate = -1;
            } else {
                this.movieVideo.playbackRate = 1;
            }
            
            const promise = this.movieVideo.play();
            
            if (promise !== undefined) {
                promise.then(() => {
                    ThreeCommands.addToTerminal(`Video playing ${direction < 0 ? 'reverse' : 'forward'}`);
                }).catch(error => {
                    console.error('Cannot play video:', error);
                    ThreeCommands.addToTerminal('Cannot play video: browser autoplay policy. Click on page to enable.', true);
                });
            }
        }
        
        return { output: `Video play ${direction === 0 ? 'stopped' : direction < 0 ? 'reverse' : 'forward'}` };
    },
    
    // Pause video
    pauseVideo: function() {
        if (!this.movieVideo) {
            return { error: 'No video loaded' };
        }
        
        this.movieVideo.pause();
        ThreeCommands.addToTerminal('Video paused');
        
        return { output: 'Video paused' };
    },
    
    // Stop video
    stopVideo: function() {
        if (!this.movieVideo) {
            return { error: 'No video loaded' };
        }
        
        this.movieVideo.pause();
        this.movieVideo.currentTime = 0;
        
        // Remove from background
        if (scene) {
            scene.background = null;
        }
        
        ThreeCommands.addToTerminal('Video stopped');
        
        return { output: 'Video stopped' };
    },
    
    // Set video volume (0-1)
    setVideoVolume: function(volume) {
        if (!this.movieVideo) {
            return { error: 'No video loaded' };
        }
        
        const clampedVolume = Math.max(0, Math.min(1, volume));
        this.movieVideo.volume = clampedVolume;
        this.movieVolume = clampedVolume;
        
        ThreeCommands.addToTerminal(`Video volume set to ${clampedVolume}`);
        
        return { output: `Volume: ${clampedVolume}` };
    }
};

// Helper functions for geo subcommands

// Handle anim commands for plato (jit.anim.drive)
function handlePlatoAnimCommand(target, tokens) {
    if (!platoObjects[target]) {
        return { error: `Plato ${target} not found` };
    }
    
    const plato = platoObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'turn':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                // No duration or duration=0 means infinite
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) : 0;
                plato.animateTurn(x, y, z, duration);
                
                if (duration === 0) {
                    return { output: `Anim: turn ${x} ${y} ${z} (infinite)` };
                } else {
                    return { output: `Anim: turn ${x} ${y} ${z} over ${duration}ms` };
                }
            }
            return { error: 'Usage: plato anim turn <x> <y> <z> [duration]' };
            
        case 'moveto':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) || 1000 : 1000;
                plato.animateMoveTo(x, y, z, duration);
                return { output: `Anim: moveto ${x} ${y} ${z} over ${duration}ms` };
            }
            return { error: 'Usage: plato anim moveto <x> <y> <z> [duration]' };
            
        case 'scaleto':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 1;
                const y = parseFloat(tokens[2]) || 1;
                const z = parseFloat(tokens[3]) || 1;
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) || 1000 : 1000;
                plato.animateScaleTo(x, y, z, duration);
                return { output: `Anim: scaleto ${x} ${y} ${z} over ${duration}ms` };
            }
            return { error: 'Usage: plato anim scaleto <x> <y> <z> [duration]' };
            
        case 'rotateto':
            if (tokens.length >= 5) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                const w = parseFloat(tokens[4]) || 1;
                const duration = tokens.length >= 6 ? parseInt(tokens[5]) || 1000 : 1000;
                plato.animateRotateTo(x, y, z, w, duration);
                return { output: `Anim: rotateto ${x} ${y} ${z} ${w} over ${duration}ms` };
            }
            return { error: 'Usage: plato anim rotateto <x> <y> <z> <w> [duration]' };
            
        default:
            return { error: `Unknown anim subcommand: ${subcommand}` };
    }
}

// Handle mesh commands for plato (jit.gl.mesh)
function handlePlatoMeshCommand(target, tokens) {
    if (!platoObjects[target]) {
        return { error: `Plato ${target} not found` };
    }
    
    const plato = platoObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'poly_mode':
            if (tokens.length >= 3) {
                const mode1 = parseInt(tokens[1]);
                const mode2 = parseInt(tokens[2]);
                if (isNaN(mode1) || isNaN(mode2)) {
                    return { error: 'Mode values must be numbers (0 or 1)' };
                }
                plato.setPolyMode(mode1, mode2);
                return { output: `Mesh: poly_mode ${mode1} ${mode2}` };
            }
            return { error: 'Usage: plato mesh poly_mode <mode1> <mode2>' };
            
        case 'draw_mode':
            if (tokens.length >= 2) {
                const mode = tokens[1];
                plato.setDrawMode(mode);
                return { output: `Mesh: draw_mode ${mode}` };
            }
            return { error: 'Usage: plato mesh draw_mode <mode>' };
            
        case 'point_size':
            if (tokens.length >= 2) {
                const size = parseFloat(tokens[1]) || 1;
                plato.setPointSize(size);
                return { output: `Mesh: point_size ${size}` };
            }
            return { error: 'Usage: plato mesh point_size <size>' };
            
        case 'line_width':
            if (tokens.length >= 2) {
                const width = parseFloat(tokens[1]) || 1;
                plato.setLineWidth(width);
                return { output: `Mesh: line_width ${width}` };
            }
            return { error: 'Usage: plato mesh line_width <width>' };
            
        case 'rotatexyz':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                plato.rotateXYZ(x, y, z);
                return { output: `Mesh: rotatexyz ${x} ${y} ${z}` };
            }
            return { error: 'Usage: plato mesh rotatexyz <x> <y> <z>' };
            
        case 'position':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                plato.setPosition(x, y, z);
                return { output: `Mesh: position ${x} ${y} ${z}` };
            }
            return { error: 'Usage: plato mesh position <x> <y> <z>' };
            
        default:
            return { error: `Unknown mesh subcommand: ${subcommand}` };
    }
}

// Handle material commands for plato (jit.gl.material)
function handlePlatoMaterialCommand(target, tokens) {
    if (!platoObjects[target]) {
        return { error: `Plato ${target} not found` };
    }
    
    const plato = platoObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'mat_diffuse':
            if (tokens.length >= 4) {
                const r = parseFloat(tokens[1]) || 0;
                const g = parseFloat(tokens[2]) || 0;
                const b = parseFloat(tokens[3]) || 0;
                plato.setMatDiffuse(r, g, b);
                return { output: `Material: mat_diffuse ${r} ${g} ${b}` };
            }
            return { error: 'Usage: plato material mat_diffuse <r> <g> <b>' };
            
        case 'mat_emission':
            if (tokens.length >= 4) {
                const r = parseFloat(tokens[1]) || 0;
                const g = parseFloat(tokens[2]) || 0;
                const b = parseFloat(tokens[3]) || 0;
                plato.setMatEmission(r, g, b);
                return { output: `Material: mat_emission ${r} ${g} ${b}` };
            }
            return { error: 'Usage: plato material mat_emission <r> <g> <b>' };
            
        case 'diffuse_texture':
            if (tokens.length >= 2) {
                const texture = tokens[1];
                plato.setDiffuseTexture(texture);
                return { output: `Material: diffuse_texture ${texture}` };
            }
            return { error: 'Usage: plato material diffuse_texture <texture>' };
            
        case 'heightmap_texture':
            if (tokens.length >= 2) {
                const texture = tokens[1];
                plato.setHeightmapTexture(texture);
                return { output: `Material: heightmap_texture ${texture}` };
            }
            return { error: 'Usage: plato material heightmap_texture <texture>' };
            
        default:
            return { error: `Unknown material subcommand: ${subcommand}` };
    }
}

// Handle anim commands for proc (jit.anim.drive)
function handleProcAnimCommand(target, tokens) {
    if (!procObjects[target]) {
        return { error: `Proc ${target} not found` };
    }
    
    const proc = procObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'turn':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                // No duration or duration=0 means infinite
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) : 0;
                proc.animateTurn(x, y, z, duration);
                
                if (duration === 0) {
                    return { output: `Anim: turn ${x} ${y} ${z} (infinite)` };
                } else {
                    return { output: `Anim: turn ${x} ${y} ${z} over ${duration}ms` };
                }
            }
            return { error: 'Usage: proc anim turn <x> <y> <z> [duration]' };
            
        case 'moveto':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) || 1000 : 1000;
                proc.animateMoveTo(x, y, z, duration);
                return { output: `Anim: moveto ${x} ${y} ${z} over ${duration}ms` };
            }
            return { error: 'Usage: proc anim moveto <x> <y> <z> [duration]' };
            
        case 'scaleto':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 1;
                const y = parseFloat(tokens[2]) || 1;
                const z = parseFloat(tokens[3]) || 1;
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) || 1000 : 1000;
                proc.animateScaleTo(x, y, z, duration);
                return { output: `Anim: scaleto ${x} ${y} ${z} over ${duration}ms` };
            }
            return { error: 'Usage: proc anim scaleto <x> <y> <z> [duration]' };
            
        case 'rotateto':
            if (tokens.length >= 5) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                const w = parseFloat(tokens[4]) || 1;
                const duration = tokens.length >= 6 ? parseInt(tokens[5]) || 1000 : 1000;
                proc.animateRotateTo(x, y, z, w, duration);
                return { output: `Anim: rotateto ${x} ${y} ${z} ${w} over ${duration}ms` };
            }
            return { error: 'Usage: proc anim rotateto <x> <y> <z> <w> [duration]' };
            
        default:
            return { error: `Unknown anim subcommand: ${subcommand}` };
    }
}

// Handle mesh commands for proc (jit.gl.mesh)
function handleProcMeshCommand(target, tokens) {
    if (!procObjects[target]) {
        return { error: `Proc ${target} not found` };
    }
    
    const proc = procObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'poly_mode':
            if (tokens.length >= 3) {
                const mode1 = parseInt(tokens[1]);
                const mode2 = parseInt(tokens[2]);
                if (isNaN(mode1) || isNaN(mode2)) {
                    return { error: 'Mode values must be numbers (0 or 1)' };
                }
                proc.setPolyMode(mode1, mode2);
                return { output: `Mesh: poly_mode ${mode1} ${mode2}` };
            }
            return { error: 'Usage: proc mesh poly_mode <mode1> <mode2>' };
            
        case 'draw_mode':
            if (tokens.length >= 2) {
                const mode = tokens[1];
                proc.setDrawMode(mode);
                return { output: `Mesh: draw_mode ${mode}` };
            }
            return { error: 'Usage: proc mesh draw_mode <mode>' };
            
        case 'point_size':
            if (tokens.length >= 2) {
                const size = parseFloat(tokens[1]) || 1;
                proc.setPointSize(size);
                return { output: `Mesh: point_size ${size}` };
            }
            return { error: 'Usage: proc mesh point_size <size>' };
            
        case 'line_width':
            if (tokens.length >= 2) {
                const width = parseFloat(tokens[1]) || 1;
                proc.setLineWidth(width);
                return { output: `Mesh: line_width ${width}` };
            }
            return { error: 'Usage: proc mesh line_width <width>' };
            
        case 'rotatexyz':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                proc.rotateXYZ(x, y, z);
                return { output: `Mesh: rotatexyz ${x} ${y} ${z}` };
            }
            return { error: 'Usage: proc mesh rotatexyz <x> <y> <z>' };
            
        case 'position':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                proc.setPosition(x, y, z);
                return { output: `Mesh: position ${x} ${y} ${z}` };
            }
            return { error: 'Usage: proc mesh position <x> <y> <z>' };
            
        default:
            return { error: `Unknown mesh subcommand: ${subcommand}` };
    }
}

// Handle material commands for proc (jit.gl.material)
function handleProcMaterialCommand(target, tokens) {
    if (!procObjects[target]) {
        return { error: `Proc ${target} not found` };
    }
    
    const proc = procObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'mat_diffuse':
            if (tokens.length >= 4) {
                const r = parseFloat(tokens[1]) || 0;
                const g = parseFloat(tokens[2]) || 0;
                const b = parseFloat(tokens[3]) || 0;
                proc.setMatDiffuse(r, g, b);
                return { output: `Material: mat_diffuse ${r} ${g} ${b}` };
            }
            return { error: 'Usage: proc material mat_diffuse <r> <g> <b>' };
            
        case 'mat_emission':
            if (tokens.length >= 4) {
                const r = parseFloat(tokens[1]) || 0;
                const g = parseFloat(tokens[2]) || 0;
                const b = parseFloat(tokens[3]) || 0;
                proc.setMatEmission(r, g, b);
                return { output: `Material: mat_emission ${r} ${g} ${b}` };
            }
            return { error: 'Usage: proc material mat_emission <r> <g> <b>' };
            
        case 'diffuse_texture':
            if (tokens.length >= 2) {
                const texture = tokens[1];
                proc.setDiffuseTexture(texture);
                return { output: `Material: diffuse_texture ${texture}` };
            }
            return { error: 'Usage: proc material diffuse_texture <texture>' };
            
        case 'heightmap_texture':
            if (tokens.length >= 2) {
                const texture = tokens[1];
                proc.setHeightmapTexture(texture);
                return { output: `Material: heightmap_texture ${texture}` };
            }
            return { error: 'Usage: proc material heightmap_texture <texture>' };
            
        default:
            return { error: `Unknown material subcommand: ${subcommand}` };
    }
}

// Handle anim commands for lz (jit.anim.drive)
function handleLzAnimCommand(target, tokens) {
    if (!lzObjects[target]) {
        return { error: `Lz ${target} not found` };
    }
    
    const lz = lzObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'turn':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                // No duration or duration=0 means infinite
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) : 0;
                lz.animateTurn(x, y, z, duration);
                
                if (duration === 0) {
                    return { output: `Anim: turn ${x} ${y} ${z} (infinite)` };
                } else {
                    return { output: `Anim: turn ${x} ${y} ${z} over ${duration}ms` };
                }
            }
            return { error: 'Usage: lz anim turn <x> <y> <z> [duration]' };
            
        case 'moveto':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) || 1000 : 1000;
                lz.animateMoveTo(x, y, z, duration);
                return { output: `Anim: moveto ${x} ${y} ${z} over ${duration}ms` };
            }
            return { error: 'Usage: lz anim moveto <x> <y> <z> [duration]' };
            
        case 'scaleto':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 1;
                const y = parseFloat(tokens[2]) || 1;
                const z = parseFloat(tokens[3]) || 1;
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) || 1000 : 1000;
                lz.animateScaleTo(x, y, z, duration);
                return { output: `Anim: scaleto ${x} ${y} ${z} over ${duration}ms` };
            }
            return { error: 'Usage: lz anim scaleto <x> <y> <z> [duration]' };
            
        case 'rotateto':
            if (tokens.length >= 5) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                const w = parseFloat(tokens[4]) || 1;
                const duration = tokens.length >= 6 ? parseInt(tokens[5]) || 1000 : 1000;
                lz.animateRotateTo(x, y, z, w, duration);
                return { output: `Anim: rotateto ${x} ${y} ${z} ${w} over ${duration}ms` };
            }
            return { error: 'Usage: lz anim rotateto <x> <y> <z> <w> [duration]' };
            
        default:
            return { error: `Unknown anim subcommand: ${subcommand}` };
    }
}

// Handle mesh commands for lz (jit.gl.mesh)
function handleLzMeshCommand(target, tokens) {
    if (!lzObjects[target]) {
        return { error: `Lz ${target} not found` };
    }
    
    const lz = lzObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'poly_mode':
            if (tokens.length >= 3) {
                const mode1 = parseInt(tokens[1]);
                const mode2 = parseInt(tokens[2]);
                if (isNaN(mode1) || isNaN(mode2)) {
                    return { error: 'Mode values must be numbers (0 or 1)' };
                }
                lz.setPolyMode(mode1, mode2);
                return { output: `Mesh: poly_mode ${mode1} ${mode2}` };
            }
            return { error: 'Usage: lz mesh poly_mode <mode1> <mode2>' };
            
        case 'draw_mode':
            if (tokens.length >= 2) {
                const mode = tokens[1];
                lz.setDrawMode(mode);
                return { output: `Mesh: draw_mode ${mode}` };
            }
            return { error: 'Usage: lz mesh draw_mode <mode>' };
            
        case 'point_size':
            if (tokens.length >= 2) {
                const size = parseFloat(tokens[1]) || 1;
                lz.setPointSize(size);
                return { output: `Mesh: point_size ${size}` };
            }
            return { error: 'Usage: lz mesh point_size <size>' };
            
        case 'line_width':
            if (tokens.length >= 2) {
                const width = parseFloat(tokens[1]) || 1;
                lz.setLineWidth(width);
                return { output: `Mesh: line_width ${width}` };
            }
            return { error: 'Usage: lz mesh line_width <width>' };
            
        case 'rotatexyz':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                lz.rotateXYZ(x, y, z);
                return { output: `Mesh: rotatexyz ${x} ${y} ${z}` };
            }
            return { error: 'Usage: lz mesh rotatexyz <x> <y> <z>' };
            
        case 'position':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                lz.setPosition(x, y, z);
                return { output: `Mesh: position ${x} ${y} ${z}` };
            }
            return { error: 'Usage: lz mesh position <x> <y> <z>' };
            
        default:
            return { error: `Unknown mesh subcommand: ${subcommand}` };
    }
}

// Handle material commands for lz (jit.gl.material)
function handleLzMaterialCommand(target, tokens) {
    if (!lzObjects[target]) {
        return { error: `Lz ${target} not found` };
    }
    
    const lz = lzObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'mat_diffuse':
            if (tokens.length >= 4) {
                const r = parseFloat(tokens[1]) || 0;
                const g = parseFloat(tokens[2]) || 0;
                const b = parseFloat(tokens[3]) || 0;
                lz.setMatDiffuse(r, g, b);
                return { output: `Material: mat_diffuse ${r} ${g} ${b}` };
            }
            return { error: 'Usage: lz material mat_diffuse <r> <g> <b>' };
            
        case 'mat_emission':
            if (tokens.length >= 4) {
                const r = parseFloat(tokens[1]) || 0;
                const g = parseFloat(tokens[2]) || 0;
                const b = parseFloat(tokens[3]) || 0;
                lz.setMatEmission(r, g, b);
                return { output: `Material: mat_emission ${r} ${g} ${b}` };
            }
            return { error: 'Usage: lz material mat_emission <r> <g> <b>' };
            
        case 'diffuse_texture':
            if (tokens.length >= 2) {
                const texture = tokens[1];
                lz.setDiffuseTexture(texture);
                return { output: `Material: diffuse_texture ${texture}` };
            }
            return { error: 'Usage: lz material diffuse_texture <texture>' };
            
        case 'heightmap_texture':
            if (tokens.length >= 2) {
                const texture = tokens[1];
                lz.setHeightmapTexture(texture);
                return { output: `Material: heightmap_texture ${texture}` };
            }
            return { error: 'Usage: lz material heightmap_texture <texture>' };
            
        default:
            return { error: `Unknown material subcommand: ${subcommand}` };
    }
}

// Handle anim commands for typo (jit.anim.drive)
function handleTypoAnimCommand(target, tokens) {
    if (!typoObjects[target]) {
        return { error: `Typo ${target} not found` };
    }
    
    const typo = typoObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'turn':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                // No duration or duration=0 means infinite
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) : 0;
                typo.animateTurn(x, y, z, duration);
                
                if (duration === 0) {
                    return { output: `Anim: turn ${x} ${y} ${z} (infinite)` };
                } else {
                    return { output: `Anim: turn ${x} ${y} ${z} over ${duration}ms` };
                }
            }
            return { error: 'Usage: typo anim turn <x> <y> <z> [duration]' };
            
        case 'moveto':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) || 1000 : 1000;
                typo.animateMoveTo(x, y, z, duration);
                return { output: `Anim: moveto ${x} ${y} ${z} over ${duration}ms` };
            }
            return { error: 'Usage: typo anim moveto <x> <y> <z> [duration]' };
            
        case 'scaleto':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 1;
                const y = parseFloat(tokens[2]) || 1;
                const z = parseFloat(tokens[3]) || 1;
                const duration = tokens.length >= 5 ? parseInt(tokens[4]) || 1000 : 1000;
                typo.animateScaleTo(x, y, z, duration);
                return { output: `Anim: scaleto ${x} ${y} ${z} over ${duration}ms` };
            }
            return { error: 'Usage: typo anim scaleto <x> <y> <z> [duration]' };
            
        case 'rotateto':
            if (tokens.length >= 5) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                const w = parseFloat(tokens[4]) || 1;
                const duration = tokens.length >= 6 ? parseInt(tokens[5]) || 1000 : 1000;
                typo.animateRotateTo(x, y, z, w, duration);
                return { output: `Anim: rotateto ${x} ${y} ${z} ${w} over ${duration}ms` };
            }
            return { error: 'Usage: typo anim rotateto <x> <y> <z> <w> [duration]' };
            
        default:
            return { error: `Unknown anim subcommand: ${subcommand}` };
    }
}

// Handle mesh commands for typo (jit.gl.mesh)
function handleTypoMeshCommand(target, tokens) {
    if (!typoObjects[target]) {
        return { error: `Typo ${target} not found` };
    }
    
    const typo = typoObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'poly_mode':
            if (tokens.length >= 3) {
                const mode1 = parseInt(tokens[1]);
                const mode2 = parseInt(tokens[2]);
                if (isNaN(mode1) || isNaN(mode2)) {
                    return { error: 'Mode values must be numbers (0 or 1)' };
                }
                typo.setPolyMode(mode1, mode2);
                return { output: `Mesh: poly_mode ${mode1} ${mode2}` };
            }
            return { error: 'Usage: typo mesh poly_mode <mode1> <mode2>' };
            
        case 'draw_mode':
            if (tokens.length >= 2) {
                const mode = tokens[1];
                typo.setDrawMode(mode);
                return { output: `Mesh: draw_mode ${mode}` };
            }
            return { error: 'Usage: typo mesh draw_mode <mode>' };
            
        case 'point_size':
            if (tokens.length >= 2) {
                const size = parseFloat(tokens[1]) || 1;
                typo.setPointSize(size);
                return { output: `Mesh: point_size ${size}` };
            }
            return { error: 'Usage: typo mesh point_size <size>' };
            
        case 'line_width':
            if (tokens.length >= 2) {
                const width = parseFloat(tokens[1]) || 1;
                typo.setLineWidth(width);
                return { output: `Mesh: line_width ${width}` };
            }
            return { error: 'Usage: typo mesh line_width <width>' };
            
        case 'rotatexyz':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                typo.rotateXYZ(x, y, z);
                return { output: `Mesh: rotatexyz ${x} ${y} ${z}` };
            }
            return { error: 'Usage: typo mesh rotatexyz <x> <y> <z>' };
            
        case 'position':
            if (tokens.length >= 4) {
                const x = parseFloat(tokens[1]) || 0;
                const y = parseFloat(tokens[2]) || 0;
                const z = parseFloat(tokens[3]) || 0;
                typo.setPosition(x, y, z);
                return { output: `Mesh: position ${x} ${y} ${z}` };
            }
            return { error: 'Usage: typo mesh position <x> <y> <z>' };
            
        default:
            return { error: `Unknown mesh subcommand: ${subcommand}` };
    }
}

// Handle material commands for typo (jit.gl.material)
function handleTypoMaterialCommand(target, tokens) {
    if (!typoObjects[target]) {
        return { error: `Typo ${target} not found` };
    }
    
    const typo = typoObjects[target];
    const subcommand = tokens[0];
    
    switch (subcommand) {
        case 'mat_diffuse':
            if (tokens.length >= 4) {
                const r = parseFloat(tokens[1]) || 0;
                const g = parseFloat(tokens[2]) || 0;
                const b = parseFloat(tokens[3]) || 0;
                typo.setMatDiffuse(r, g, b);
                return { output: `Material: mat_diffuse ${r} ${g} ${b}` };
            }
            return { error: 'Usage: typo material mat_diffuse <r> <g> <b>' };
            
        case 'mat_emission':
            if (tokens.length >= 4) {
                const r = parseFloat(tokens[1]) || 0;
                const g = parseFloat(tokens[2]) || 0;
                const b = parseFloat(tokens[3]) || 0;
                typo.setMatEmission(r, g, b);
                return { output: `Material: mat_emission ${r} ${g} ${b}` };
            }
            return { error: 'Usage: typo material mat_emission <r> <g> <b>' };
            
        case 'diffuse_texture':
            if (tokens.length >= 2) {
                const texture = tokens[1];
                typo.setDiffuseTexture(texture);
                return { output: `Material: diffuse_texture ${texture}` };
            }
            return { error: 'Usage: typo material diffuse_texture <texture>' };
            
        case 'heightmap_texture':
            if (tokens.length >= 2) {
                const texture = tokens[1];
                typo.setHeightmapTexture(texture);
                return { output: `Material: heightmap_texture ${texture}` };
            }
            return { error: 'Usage: typo material heightmap_texture <texture>' };
            
        default:
            return { error: `Unknown material subcommand: ${subcommand}` };
    }
}

// Use THREE.js Rhino3dmLoader for proper async WASM loading
// This handles the rhino3dm WASM module initialization automatically
// Create a global loader instance that will be used for all nurbs loading
if (typeof THREE.Rhino3dmLoader !== 'undefined') {
    if (!window.nurbs3dmLoader) {
        window.nurbs3dmLoader = new THREE.Rhino3dmLoader();
        // Set default library path for rhino3dm WASM files
        // This points to where rhino3dm.js and rhino3dm.wasm are located
        // Use v7.11.1 which is compatible with three.js r147
        window.nurbs3dmLoader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@7.11.1/');
    }
}

// NURBS file loading functions
// Load .3dm (Rhino) files into NURBS object using THREE.js Rhino3dmLoader
function nurbsLoadFromDialog(nurbs) {
    console.log('Opening file dialog for NURBS...');
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.3dm';
    
    input.onchange = (e) => {
        console.log('File selected:', e.target.files);
        const file = e.target.files[0];
        if (file) {
            console.log(`Loading NURBS file: ${file.name}, size: ${file.size} bytes`);
            nurbsLoadFile(nurbs, file);
        } else {
            console.log('No file selected');
        }
        // Clean up
        document.body.removeChild(input);
    };
    
    input.onerror = (e) => {
        console.error('File input error:', e);
    };
    
    document.body.appendChild(input);
    input.click();
    
    return { output: 'Open file dialog for .3dm files...' };
}

function nurbsLoadFromPath(nurbs, filepath) {
    // Try to load from URL
    // For local files, this won't work due to CORS restrictions
    // User needs to use the file dialog or a local server
    
    // Check if it's a URL
    if (filepath.startsWith('http://') || filepath.startsWith('https://') || filepath.startsWith('/')) {
        fetch(filepath)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                return response.arrayBuffer();
            })
            .then(buffer => {
                const file = new File([buffer], filepath.split('/').pop() || 'model.3dm', { type: 'application/octet-stream' });
                nurbsLoadFile(nurbs, file);
            })
            .catch(error => {
                console.error('Error loading NURBS file:', error);
                return { error: `Failed to load NURBS file: ${error.message}` };
            });
        
        return { output: `Loading NURBS file: ${filepath}...` };
    } else {
        // Local file path - can't load directly due to browser security
        return { error: 'Cannot load local files directly. Use: nurbs read (with no path) to open file dialog, or use a local server.' };
    }
}

// Internal function to load a .3dm file into a NURBS object using Rhino3dmLoader
function nurbsLoadFile(nurbs, file) {
    console.log(`Starting to read NURBS file: ${file.name}`);
    
    // Check if we have the Rhino3dmLoader
    if (typeof THREE.Rhino3dmLoader === 'undefined') {
        console.warn('THREE.Rhino3dmLoader not available, using placeholder');
        window.addTerminalMessage(
            `Rhino3dmLoader not available. Using placeholder geometry for ${file.name}.`,
            false
        );
        nurbs.updateGeometry();
        return;
    }
    
    // Use the global loader or create a new one
    const loader = window.nurbs3dmLoader || new THREE.Rhino3dmLoader();
    
    // Set the library path for rhino3dm WASM files
    // Use v7.11.1 which is compatible with three.js r147
    // The Rhino3dmLoader will automatically load rhino3dm.js and rhino3dm.wasm from here
    loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@7.11.1/');
        
        // Create an object URL from the file so we can use loader.load()
        // This is more reliable than parse() for File objects
        const objectUrl = URL.createObjectURL(file);
        
        console.log(`Loading ${file.name} from object URL: ${objectUrl}`);
        
        loader.load(objectUrl, function(object) {
            // Clean up the object URL
            URL.revokeObjectURL(objectUrl);
            
            console.log('Successfully loaded .3dm file:', object);
            console.log('Object type:', object.type, 'Children:', object.children.length);
            
            // Debug: Check materials and visibility
            object.traverse(function(child) {
                if (child.isMesh) {
                    console.log('Mesh found:', child.type, 'Material:', child.material ? child.material.type : 'none', 'Visible:', child.visible);
                }
            });
            
            // Replace the nurbs placeholder with the loaded object
            if (nurbs.mesh) {
                // Remove old mesh and edges
                scene.remove(nurbs.mesh);
                if (nurbs.edges) {
                    if (Array.isArray(nurbs.edges)) {
                        nurbs.edges.forEach(edge => scene.remove(edge));
                    } else {
                        scene.remove(nurbs.edges);
                    }
                }
                if (nurbs.mesh.geometry) nurbs.mesh.geometry.dispose();
                if (nurbs.mesh.material) nurbs.mesh.material.dispose();
            }
            
            // The loaded object is a THREE.Group with meshes
            // Position it at the nurbs position
            object.position.copy(nurbs.position);
            
            // Scale it down if it's too large
            // Rhino models are often in different units
            object.scale.set(0.01, 0.01, 0.01);
            
            // Center the object (Rhino models might not be centered)
            const box = new THREE.Box3().setFromObject(object);
            const center = box.getCenter(new THREE.Vector3());
            object.position.sub(center);
            object.position.add(nurbs.position);
            
            console.log('Object positioned at:', object.position);
            console.log('Object scale:', object.scale);
            console.log('Object bounding box:', box);
            
            // Store the loaded object for later manipulation
            nurbs.loadedObject = object;
            nurbs.mesh = object; // For backward compatibility
            
            scene.add(object);
            
            // Add wireframe edges for better visibility
            // Create edges for each mesh in the object
            object.traverse(function(child) {
                if (child.isMesh && child.geometry) {
                    try {
                        const edges = new THREE.EdgesGeometry(child.geometry);
                        const edgeMaterial = new THREE.LineBasicMaterial({ 
                            color: 0xffffff,
                            linewidth: 1
                        });
                        const wireframe = new THREE.LineSegments(edges, edgeMaterial);
                        wireframe.position.copy(child.position);
                        wireframe.rotation.copy(child.rotation);
                        wireframe.scale.copy(child.scale);
                        scene.add(wireframe);
                        if (!nurbs.edges) nurbs.edges = [];
                        nurbs.edges.push(wireframe);
                    } catch(e) {
                        console.warn('Could not create edges for mesh:', e);
                    }
                }
            });
            
            console.log(`Successfully loaded and displayed NURBS from ${file.name}`);
            window.addTerminalMessage(
                `Successfully loaded NURBS from ${file.name}`,
                false
            );
            
        }, function(progress) {
            // Progress callback - only log if we have valid progress values
            if (progress && progress.total && progress.total > 0) {
                const percent = Math.round(progress.loaded / progress.total * 100);
                console.log(`Loading progress: ${percent}%`);
            }
        }, function(error) {
            // Clean up the object URL
            URL.revokeObjectURL(objectUrl);
            
            console.error('Error loading .3dm file with Rhino3dmLoader:', error);
            window.addTerminalMessage(
                `Failed to load ${file.name}: ${error ? (error.message || error) : 'unknown error'}. Using placeholder.`,
                true
            );
            // Fall back to placeholder
            nurbs.updateGeometry();
        });
}

// Make available globally
window.ThreeCommands = ThreeCommands;
window.geoObjects = geoObjects;
window.currentGeo = currentGeo;
window.platoObjects = platoObjects;
window.currentPlato = currentPlato;
window.procObjects = procObjects;
window.currentProc = currentProc;
window.lzObjects = lzObjects;
window.currentLz = currentLz;
window.typoObjects = typoObjects;
window.currentTypo = currentTypo;
window.modelObjects = modelObjects;
window.currentModel = currentModel;
window.textureObjects = textureObjects;
window.textureBuffers = textureBuffers;
window.nurbsLoadFromDialog = nurbsLoadFromDialog;
window.nurbsLoadFromPath = nurbsLoadFromPath;

// Export texture functions
window.getTexture = getTexture;
window.createSomTexture = createSomTexture;
window.createEcaTexture = createEcaTexture;

// onWindowResize is exported separately
window.onWindowResize = onWindowResize;

// Note: THREE.js is initialized by main.js, not here, to allow proper integration with Orca
