/**
 * o-sigv Operators for Orca Web
 * 
 * These custom operators replace the original OSC-based o-sigv operators
 * and directly call nbcli THREE.js functions for a browser-based integration.
 * 
 * Based on the official o-sigv table: https://magfoto.any.org/o-sigv-table
 * 
 * IMPORTANT: All letter parameters in o-sigv are Base36 numbers (0-9, a-z = 0-35)
 * These are typically normalized to 0-1 by dividing by 36.0
 * 
 * Operator categories:
 *   ` (backtick) - ANIM: animation commands (turn, scaleto, moveto, etc.)
 *   | (pipe)     - MAT: material/texture commands
 *   ^ (caret)    - TRANS: transform/morph commands
 *   _ (underscore) - AUDIO: audio engine commands
 *   º (degree)  - LIGHTS: lighting commands
 *   … (ellipsis) - SYSTEM: object management (new, zap, focus, etc.)
 *   ∆ (delta)    - SERIAL: serial/GPIO communication
 *   ∞ (infinity) - CHAO: Lorenz attractor (lz) commands
 *   ß (sharp s) - BUFFER: sampler/buffer commands
 */

'use strict';

// Wait for dependencies to be available
function initOrcaOSigv() {
  if (typeof library === 'undefined' || typeof Operator === 'undefined') {
    setTimeout(initOrcaOSigv, 100);
    return;
  }
  
  console.log('Initializing o-sigv operators (direct JS integration)...');
  
  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  
  // Current focus target (defaults to 'geo')
  let currentFocus = 'geo';
  
  // Convert Base36 character to number (0-35)
  function base36ToNumber(char) {
    if (/[0-9]/.test(char)) {
      return parseInt(char);
    }
    if (/[a-z]/.test(char)) {
      return 10 + (char.charCodeAt(0) - 'a'.charCodeAt(0));
    }
    return 0; // Default for unknown characters
  }
  
  // Convert Base36 string to normalized value (0-1)
  function base36ToNormalized(str) {
    const num = base36ToNumber(str);
    return Math.max(0, Math.min(1, num / 36.0));
  }
  
  // Convert Base36 string to integer value
  function base36ToInt(str) {
    return base36ToNumber(str);
  }
  
  // Find object by name, with focus fallback
  function findObject(name) {
    if (!name || name === '.' || name === 'g' || name === 'geo' || name === '0') {
      return window.currentGeo || (window.geoObjects ? Object.values(window.geoObjects)[0] : null);
    }
    
    // Try the name as-is first
    if (name === 'p' || name === 'plato' || name === '9') {
      return window.currentPlato || (window.platoObjects ? Object.values(window.platoObjects)[0] : null);
    }
    if (name === 'c' || name === 'proc' || name === '1') {
      return window.currentProc || (window.procObjects ? Object.values(window.procObjects)[0] : null);
    }
    if (name === 'l' || name === 'lz' || name === '6') {
      return window.currentLz || (window.lzObjects ? Object.values(window.lzObjects)[0] : null);
    }
    if (name === 'y' || name === 'typo' || name === '4') {
      return window.currentTypo || (window.typoObjects ? Object.values(window.typoObjects)[0] : null);
    }
    if (name === 'm' || name === 'model' || name === '3') {
      return window.currentModel || (window.modelObjects ? Object.values(window.modelObjects)[0] : null);
    }
    if (name === 'n' || name === 'nurbs') {
      return window.currentNurbs || (window.nurbsObjects ? Object.values(window.nurbsObjects)[0] : null);
    }
    if (name === 'r' || name === 'particles') {
      return window.currentParticles || (window.particlesObjects ? Object.values(window.particlesObjects)[0] : null);
    }
    if (name === 't' || name === 'terra') {
      return window.currentTerra || (window.terraObjects ? Object.values(window.terraObjects)[0] : null);
    }
    if (name === 'plato' || name === '1') {
      return window.currentPlato || (window.platoObjects ? Object.values(window.platoObjects)[0] : null);
    }
    if (name === 'wrld' || name === 'world' || name === '5') {
      // For world, return scene or camera
      return window.camera || null;
    }
    
    // Check object collections
    if (window.geoObjects && window.geoObjects[name]) return window.geoObjects[name];
    if (window.platoObjects && window.platoObjects[name]) return window.platoObjects[name];
    if (window.procObjects && window.procObjects[name]) return window.procObjects[name];
    if (window.lzObjects && window.lzObjects[name]) return window.lzObjects[name];
    if (window.typoObjects && window.typoObjects[name]) return window.typoObjects[name];
    if (window.modelObjects && window.modelObjects[name]) return window.modelObjects[name];
    if (window.nurbsObjects && window.nurbsObjects[name]) return window.nurbsObjects[name];
    if (window.particlesObjects && window.particlesObjects[name]) return window.particlesObjects[name];
    if (window.terraObjects && window.terraObjects[name]) return window.terraObjects[name];
    
    // Try to find by focus number mapping
    if (/^[0-9]$/.test(name)) {
      const focusMap = {
        '0': 'geo', '1': 'proc', '2': 'model', '3': 'nature', 
        '4': 'wrld', '5': 'midi', '6': 'lz', '7': 'spk', '9': 'plato'
      };
      const objectType = focusMap[name];
      if (objectType && window[objectType + 'Objects']) {
        return Object.values(window[objectType + 'Objects'])[0] || null;
      }
    }
    
    // Fallback to current focus
    return findObject(currentFocus);
  }
  
  // Get object by focus number
  function getObjectByFocus(focusChar) {
    const focusMap = {
      '0': 'geo', '1': 'proc', '2': 'model', '3': 'nature', 
      '4': 'wrld', '5': 'midi', '6': 'lz', '7': 'spk', '9': 'plato'
    };
    const objectType = focusMap[focusChar] || 'geo';
    
    // Try to get the first object of this type
    const collectionName = objectType + 'Objects';
    if (window[collectionName]) {
      const objects = window[collectionName];
      return Object.values(objects)[0] || null;
    }
    
    return null;
  }
  
  // Parse message from Orca cells (removes trailing dots)
  function parseMessage(msg) {
    msg = msg.replace(/\.+$/, '');
    return msg.trim();
  }
  
  // Parse Base36 parameters from message
  function parseBase36Params(msg, paramCount) {
    const chars = msg.split('');
    const params = [];
    for (let i = 0; i < Math.min(paramCount, chars.length); i++) {
      params.push(base36ToNumber(chars[i]));
    }
    return params;
  }
  
  // Parse Base36 parameters as normalized floats (0-1)
  function parseNormalizedParams(msg, paramCount) {
    const chars = msg.split('');
    const params = [];
    for (let i = 0; i < Math.min(paramCount, chars.length); i++) {
      params.push(base36ToNormalized(chars[i]));
    }
    return params;
  }
  
  // Execute nbcli command via ThreeCommands
  function executeCommand(tokens) {
    if (!window.ThreeCommands) {
      console.warn('o-sigv: ThreeCommands not available');
      return false;
    }
    
    const cmd = tokens[0].toLowerCase();
    if (window.ThreeCommands[cmd]) {
      try {
        const result = window.ThreeCommands[cmd](tokens);
        console.log(`o-sigv: Executed ${tokens.join(' ')}`, result);
        return result !== undefined;
      } catch (e) {
        console.error(`o-sigv: Error executing ${tokens.join(' ')}:`, e);
        return false;
      }
    }
    
    console.warn(`o-sigv: Command handler not found for ${cmd}`);
    return false;
  }
  
  // ============================================
  // FOCUS MANAGEMENT
  // ============================================
  
  // Set current focus (…f commands)
  function setFocus(focusChar) {
    const focusMap = {
      '0': 'geo', '1': 'proc', '2': 'model', '3': 'nature', 
      '4': 'wrld', '5': 'midi', '6': 'lz', '7': 'spk', '9': 'plato'
    };
    const objectType = focusMap[focusChar] || 'geo';
    currentFocus = focusChar; // Store the focus character
    console.log(`o-sigv: Focus set to ${objectType} (${focusChar})`);
    return true;
  }
  
  // Get current focus object
  function getFocusObject() {
    return findObject(currentFocus);
  }
  
  // ============================================
  // COMMAND IMPLEMENTATIONS
  // ============================================
  
  // ANIM commands (backtick operator)
  function handleAnimCommand(command, msg, path) {
    // path can be a focus number or object name
    const obj = findObject(path || currentFocus);
    if (!obj) {
      console.warn(`o-sigv: No object found for anim command: ${command}, path: ${path}, focus: ${currentFocus}`);
      return false;
    }
    
    const subcommand = command.charAt(0);
    const params = command.slice(1).split('');
    
    switch (subcommand) {
      case 't': // turn: ' t x y z [duration]
        {
          const x = params.length > 0 ? base36ToNormalized(params[0]) : 0;
          const y = params.length > 1 ? base36ToNormalized(params[1]) : 0;
          const z = params.length > 2 ? base36ToNormalized(params[2]) : 0;
          const duration = params.length > 3 ? base36ToInt(params[3]) * 100 : 0; // 0 = infinite
          
          if (obj.animateTurn) {
            obj.animateTurn(x, y, z, duration);
            console.log(`o-sigv: ANIM turn ${x} ${y} ${z} duration: ${duration}`);
            return true;
          }
        }
        break;
        
      case 's': // scaleto: ' s x y z [duration]
        {
          const x = params.length > 0 ? base36ToNormalized(params[0]) * 2 : 1; // Scale typically 0-2
          const y = params.length > 1 ? base36ToNormalized(params[1]) * 2 : 1;
          const z = params.length > 2 ? base36ToNormalized(params[2]) * 2 : 1;
          const duration = params.length > 3 ? base36ToInt(params[3]) * 100 : 0;
          
          if (obj.animateScaleTo) {
            obj.animateScaleTo(x, y, z, duration);
            console.log(`o-sigv: ANIM scaleto ${x} ${y} ${z} duration: ${duration}`);
            return true;
          }
        }
        break;
        
      case 'm': // moveto: ' m x y z [duration]
        {
          const x = params.length > 0 ? base36ToNormalized(params[0]) * 10 - 5 : 0; // -5 to +5 range
          const y = params.length > 1 ? base36ToNormalized(params[1]) * 10 - 5 : 0;
          const z = params.length > 2 ? base36ToNormalized(params[2]) * 10 - 5 : 0;
          const duration = params.length > 3 ? base36ToInt(params[3]) * 100 : 1000;
          
          if (obj.animateMoveTo) {
            obj.animateMoveTo(x, y, z, duration);
            console.log(`o-sigv: ANIM moveto ${x} ${y} ${z} duration: ${duration}`);
            return true;
          }
        }
        break;
        
      case 'r': // rotateto: ' r x y z [duration]
        {
          const x = params.length > 0 ? base36ToNormalized(params[0]) * Math.PI * 2 : 0;
          const y = params.length > 1 ? base36ToNormalized(params[1]) * Math.PI * 2 : 0;
          const z = params.length > 2 ? base36ToNormalized(params[2]) * Math.PI * 2 : 0;
          const duration = params.length > 3 ? base36ToInt(params[3]) * 100 : 1000;
          
          if (obj.animateRotateto) {
            obj.animateRotateto(x, y, z, duration);
            console.log(`o-sigv: ANIM rotateto ${x} ${y} ${z} duration: ${duration}`);
            return true;
          } else if (obj.animateTurn) {
            // Fallback to turn
            obj.animateTurn(x, y, z, duration);
            console.log(`o-sigv: ANIM rotateto (via turn) ${x} ${y} ${z} duration: ${duration}`);
            return true;
          }
        }
        break;
        
      case 'e': // ease: ' e value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 9;
          // Note: ease setting would need to be stored for subsequent animations
          console.log(`o-sigv: ANIM ease set to ${value}`);
          return true; // Easing not implemented yet
        }
        break;
        
      case 'f': // ease function: ' f value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 0;
          console.log(`o-sigv: ANIM ease function set to ${value}`);
          return true; // Easing function not implemented yet
        }
        break;
    }
    
    console.warn(`o-sigv: Unknown ANIM subcommand: ${subcommand}`);
    return false;
  }
  
  // TRANS commands (caret operator)
  function handleTransCommand(command, msg, path) {
    // path can be a focus number or object name
    const obj = findObject(path || currentFocus);
    if (!obj) {
      console.warn(`o-sigv: No object found for trans command: ${command}, path: ${path}, focus: ${currentFocus}`);
      return false;
    }
    
    const subcommand = command.charAt(0);
    const params = command.slice(1).split('');
    
    switch (subcommand) {
      case 'o': // morph: ^ o start end duration
        {
          const start = params.length > 0 ? base36ToNormalized(params[0]) : 0; // 0 = gs1, 1 = gs2
          const end = params.length > 1 ? base36ToNormalized(params[1]) : 1;
          const duration = params.length > 2 ? base36ToInt(params[2]) * 100 : 500;
          
          // Morph from start to end
          if (obj.morph) {
            // Calculate target morph factor (start + (end - start))
            const targetFactor = start + (end - start);
            obj.morph(targetFactor, duration);
            console.log(`o-sigv: TRANS morph from ${start} to ${end} (factor: ${targetFactor}) duration: ${duration}`);
            return true;
          }
        }
        break;
        
      case 's': // shape: ^ s target shape_index
        // Format: ^s<TARGET><SHAPE>
        // TARGET: 0 = single gs (proc), 1 = gs1, 2 = gs2
        // SHAPE: 0-9 = shape index (0=sphere, 1=torus, 2=cylinder, etc.)
        {
          const targetParam = params.length > 0 ? params[0] : '1';
          const shapeParam = params.length > 1 ? params[1] : '0';
          
          const target = base36ToInt(targetParam); // 0, 1, or 2
          const shapeIndex = base36ToInt(shapeParam);
          
          // Determine object type to use appropriate shape mapping
          let shapeName;
          if (obj.name && obj.name.includes('plato')) {
            // Plato object uses platonic solids
            // o-sigv plato shapes: 0=tetrahedron,1=cube,2=octahedron,3=dodecahedron,4=icosahedron
            const platoShapeMap = {
              0: 'tetrahedron', 1: 'cube', 2: 'octahedron', 3: 'dodecahedron', 4: 'icosahedron'
            };
            shapeName = platoShapeMap[shapeIndex % 5] || 'tetrahedron';
          } else {
            // Geo object uses regular shapes
            // o-sigv geo shapes: 0=sphere,1=torus,2=cylinder,3=opencylinder,4=cube,5=opencube,6=plane,7=circle,8=cone,9=capsule
            const geoShapeMap = {
              0: 'sphere',    // sphere
              1: 'torus',     // torus
              2: 'cylinder',  // cylinder
              3: 'cylinder',  // opencylinder -> cylinder (fallback)
              4: 'box',       // cube -> box
              5: 'box',       // opencube -> box (fallback)
              6: 'plane',     // plane
              7: 'plane',     // circle -> plane (fallback)
              8: 'cone',      // cone
              9: 'sphere'     // capsule -> sphere (fallback)
            };
            shapeName = geoShapeMap[shapeIndex % 10] || 'sphere';
          }
          
          // Check what type of object we have and apply shape accordingly
          if (obj.gs1 && obj.gs2) {
            // Object has two gridshapes (geo, plato)
            if (target === 1) {
              // Target gs1
              obj.gs1.shape = shapeName;
              console.log(`o-sigv: TRANS gs1 shape set to ${shapeName} (index: ${shapeIndex})`);
              if (obj.updateShape) {
                obj.updateShape('gs1', shapeName, obj.gs1.dim || 32);
              }
            } else if (target === 2) {
              // Target gs2
              obj.gs2.shape = shapeName;
              console.log(`o-sigv: TRANS gs2 shape set to ${shapeName} (index: ${shapeIndex})`);
              if (obj.updateShape) {
                obj.updateShape('gs2', shapeName, obj.gs2.dim || 32);
              }
            } else {
              // Target 0 - apply to gs1 as default for two-gs objects
              obj.gs1.shape = shapeName;
              console.log(`o-sigv: TRANS gs1 shape set to ${shapeName} (index: ${shapeIndex}, target 0 defaulted to gs1)`);
              if (obj.updateShape) {
                obj.updateShape('gs1', shapeName, obj.gs1.dim || 32);
              }
            }
            return true;
          } else if (obj.gs1) {
            // Object has only one gridshape (proc)
            obj.gs1.shape = shapeName;
            console.log(`o-sigv: TRANS gs1 (single) shape set to ${shapeName} (index: ${shapeIndex})`);
            if (obj.updateShape) {
              obj.updateShape('gs1', shapeName, obj.gs1.dim || 32);
            }
            return true;
          } else {
            console.warn(`o-sigv: Object has no gridshape properties`);
            return false;
          }
        }
        break;
        
      case 'd': // dimensions: ^ d target width height
        {
          const target = params.length > 0 ? params[0] : '1';
          const width = params.length > 1 ? base36ToInt(params[1]) : 32;
          const height = params.length > 2 ? base36ToInt(params[2]) : 32;
          
          if (target === '1' && obj.gs1) {
            obj.gs1.dim = Math.max(4, width); // Minimum dimension
            obj.updateGeometry();
            console.log(`o-sigv: TRANS gs1 dim set to ${width}x${height}`);
            return true;
          } else if (obj.gs2) {
            obj.gs2.dim = Math.max(4, width);
            obj.updateGeometry();
            console.log(`o-sigv: TRANS gs2 dim set to ${width}x${height}`);
            return true;
          }
        }
        break;
        
      case 'p': // poly mode: ^ p front back
        {
          const front = params.length > 0 ? base36ToInt(params[0]) : 0;
          const back = params.length > 1 ? base36ToInt(params[1]) : 0;
          
          if (obj.mesh) {
            // Poly mode would need to be implemented in the object
            console.log(`o-sigv: TRANS poly mode set to ${front} ${back}`);
            return true; // Not fully implemented
          }
        }
        break;
        
      case 'c': // cull face: ^ c value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 0;
          console.log(`o-sigv: TRANS cull face set to ${value}`);
          return true; // Not implemented
        }
        break;
        
      case '0': // point size: ^ 0 size
        {
          const size = params.length > 0 ? base36ToInt(params[0]) : 4;
          console.log(`o-sigv: TRANS point size set to ${size}`);
          return true; // Not implemented
        }
        break;
        
      case '1': // line width: ^ 1 width
        {
          const width = params.length > 0 ? base36ToInt(params[0]) : 18; // 'i' = 18
          console.log(`o-sigv: TRANS line width set to ${width}`);
          return true; // Not implemented
        }
        break;
        
      case 'f': // proc period: ^ f value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 10; // 'a' = 10
          console.log(`o-sigv: TRANS proc period set to ${value}`);
          // This would be for proc object specifically
          if (obj.setPeriod) {
            obj.setPeriod(value * 100);
            return true;
          }
        }
        break;
        
      case 'x': // proc scale: ^ x value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 18; // 'i' = 18
          console.log(`o-sigv: TRANS proc scale set to ${value}`);
          if (obj.setScale) {
            obj.setScale(value / 36.0);
            return true;
          }
        }
        break;
    }
    
    console.warn(`o-sigv: Unknown TRANS subcommand: ${subcommand}`);
    return false;
  }
  
  // SYSTEM commands (ellipsis operator)
  function handleSystemCommand(command, msg, path) {
    // For SYSTEM commands, the entire command string is the message
    // e.g., "n0" for new geo, "z0" for zap geo, "f0" for focus geo
    const subcommand = command.charAt(0);
    const params = command.slice(1).split('');
    console.log(`o-sigv: SYSTEM parsing command: ${command}, subcommand: ${subcommand}, params: [${params.join(', ')}]`);
    
    switch (subcommand) {
      case 'n': // new: … n objectType
        {
          const objectTypeChar = params.length > 0 ? params[0] : '0';
          const objectTypeMap = {
            '0': 'geo', '1': 'proc', '2': 'model', '3': 'nature',
            '4': 'wrld', '5': 'midi', '6': 'lz', '7': 'spk', '9': 'plato'
          };
          const objectType = objectTypeMap[objectTypeChar] || 'geo';
          const objectId = objectType + '_' + Date.now();
          
          if (window.ThreeCommands && window.ThreeCommands.new) {
            const result = window.ThreeCommands.new(['new', objectType, '0', '0', objectId]);
            console.log(`o-sigv: SYSTEM new ${objectType} (${objectTypeChar}) created as ${objectId}`);
            // Auto-focus on new object
            setFocus(objectTypeChar);
            return result !== undefined;
          }
        }
        break;
        
      case 'z': // zap: … z objectType
        {
          const objectTypeChar = params.length > 0 ? params[0] : '0';
          const focusMap = {
            '0': 'geo', '1': 'proc', '2': 'model', '3': 'nature', 
            '4': 'wrld', '5': 'midi', '6': 'lz', '7': 'spk', '9': 'plato'
          };
          const objectType = focusMap[objectTypeChar] || 'geo';
          const collectionName = objectType + 'Objects';
          
          // Find the first object of this type to zap
          let targetName = '';
          if (window[collectionName] && Object.keys(window[collectionName]).length > 0) {
            targetName = Object.keys(window[collectionName])[0];
          } else {
            console.warn(`o-sigv: No ${objectType} objects found to zap`);
            return false;
          }
          
          if (window.ThreeCommands && window.ThreeCommands.zap) {
            const result = window.ThreeCommands.zap(['zap', targetName]);
            console.log(`o-sigv: SYSTEM zap ${objectTypeChar} (${objectType}) object: ${targetName}`);
            return result !== undefined;
          }
        }
        break;
        
      case 'f': // focus: … f objectType
        {
          const focusChar = params.length > 0 ? params[0] : '0';
          const result = setFocus(focusChar);
          console.log(`o-sigv: SYSTEM focus set to ${focusChar}`);
          return result;
        }
        break;
        
      case 'c': // clear: … c value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 1;
          if (value === 1) {
            // Clear scene
            if (window.ThreeCommands && window.ThreeCommands.qs) {
              window.ThreeCommands.qs(['qs']);
              console.log('o-sigv: SYSTEM clear scene');
              return true;
            }
          }
          console.log(`o-sigv: SYSTEM clear with value ${value}`);
          return true;
        }
        break;
        
      case 'm': // material mode: … m value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 3;
          console.log(`o-sigv: SYSTEM material mode set to ${value}`);
          return true; // Not implemented
        }
        break;
        
      case 'x': // exit: … x value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 0;
          console.log(`o-sigv: SYSTEM exit with value ${value}`);
          return true; // Not implemented
        }
        break;
        
      case 'b': // wrld border: … b value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 0;
          console.log(`o-sigv: SYSTEM wrld border set to ${value}`);
          return true; // Not implemented
        }
        break;
        
      case 'e': // wrld exec zoom: … e value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 1;
          console.log(`o-sigv: SYSTEM wrld exec zoom with value ${value}`);
          return true; // Not implemented
        }
        break;
        
      case 'q': // fx pass: … q value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 0;
          console.log(`o-sigv: SYSTEM fx pass set to ${value}`);
          return true; // Not implemented
        }
        break;
        
      case 'w': // wrld window pos: … w value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 0;
          console.log(`o-sigv: SYSTEM wrld window pos set to ${value}`);
          return true; // Not implemented
        }
        break;
        
      case 's': // cmd enable: … s value
        {
          const value = params.length > 0 ? base36ToInt(params[0]) : 1;
          console.log(`o-sigv: SYSTEM cmd enable set to ${value}`);
          return true; // Not implemented
        }
        break;
        
      case 't': // tilde commands
        {
          const sub = params.length > 0 ? params[0] : '';
          console.log(`o-sigv: SYSTEM tilde command ${sub}`);
          return true; // Not implemented
        }
        break;
    }
    
    console.warn(`o-sigv: Unknown SYSTEM subcommand: ${subcommand}`);
    return false;
  }
  
  // MAT commands (pipe operator) - Not implemented yet
  function handleMatCommand(command, msg, path) {
    console.log(`o-sigv: MAT command: ${command} (not implemented yet)`);
    return false;
  }
  
  // LIGHTS commands (degree operator) - Not implemented yet
  function handleLightsCommand(command, msg, path) {
    console.log(`o-sigv: LIGHTS command: ${command} (not implemented yet)`);
    return false;
  }
  
  // CHAO commands (infinity operator) - Not implemented yet
  function handleChaoCommand(command, msg, path) {
    console.log(`o-sigv: CHAO command: ${command} (not implemented yet)`);
    return false;
  }
  
  // SERIAL commands (delta operator) - Not implemented yet
  function handleSerialCommand(command, msg, path) {
    console.log(`o-sigv: SERIAL command: ${command} (not implemented yet)`);
    return false;
  }
  
  // BUFFER commands (sharp s operator) - Not implemented yet
  function handleBufferCommand(command, msg, path) {
    console.log(`o-sigv: BUFFER command: ${command} (not implemented yet)`);
    return false;
  }
  
  // AUDIO commands (underscore operator) - Not implemented yet
  function handleAudioCommand(command, msg, path) {
    console.log(`o-sigv: AUDIO command: ${command} (not implemented yet)`);
    return false;
  }
  
  // ============================================
  // OPERATOR DEFINITIONS
  // ============================================
  
  // O-SIGV OPERATOR 1: ` (backtick) - ANIM
  // Example: `tiki -> anim turn with x=18/36, y=20/36, z=18/36
  // Example: `s111a -> anim scaleto with x=1/36*2, y=1/36*2, z=1/36*2, duration=10*100
  library['`'] = function OperatorOSigvAnim(orca, x, y, passive) {
    Operator.call(this, orca, x, y, '`', true);
    
    this.name = 'o-sigv-anim';
    this.info = 'o-sigv ANIM commands (turn, scaleto, moveto, etc.)';
    this.draw = false;
    
    this.ports.path = { x: 1, y: 0 };
    
    // Debug: log when this operator is created
    console.log(`o-sigv: ANIM operator created at (${x},${y})`);
    
    this.operation = function(force = false) {
      let msg = '';
      // Read message from cells to the right, starting from position x+1
      // For o-sigv, the entire command is in the message (e.g., `tiki for anim turn)
      for (let i = 1; i <= 36; i++) {
        const g = orca.glyphAt(this.x + i, this.y);
        orca.lock(this.x + i, this.y);
        // Treat '.' and 'X'/'x' as empty/end of message
        if (g === '.' || g === 'X' || g === 'x') break;
        msg += g;
      }
      
      const hasBang = this.hasNeighbor('*');
      if (!hasBang && force === false) {
        console.log(`o-sigv: ANIM operator at (${this.x},${this.y}) - no bang, waiting`);
        return;
      }
      
      // For o-sigv ANIM commands, we don't use the path port - the entire command is in msg
      // and the target is determined by the focus
      this.draw = false;
      
      const command = parseMessage(msg);
      console.log(`o-sigv: ANIM operator triggered with command: ${command}, focus: ${currentFocus}, bang: ${hasBang}`);
      if (command) {
        // Use current focus as the target path
        const result = handleAnimCommand(command, msg, currentFocus);
        console.log(`o-sigv: ANIM result: ${result}`);
        return result;
      }
      
      console.log(`o-sigv: ANIM operator - no command parsed`);
      return false;
    };
  };
  
  // O-SIGV OPERATOR 2: | (pipe) - MAT
  library['|'] = function OperatorOSigvMat(orca, x, y, passive) {
    Operator.call(this, orca, x, y, '|', true);
    
    this.name = 'o-sigv-mat';
    this.info = 'o-sigv MAT commands (material/texture)';
    this.draw = false;
    
    this.ports.path = { x: 1, y: 0 };
    
    this.operation = function(force = false) {
      let msg = '';
      // Read message from cells to the right, starting from position x+1
      for (let i = 1; i <= 36; i++) {
        const g = orca.glyphAt(this.x + i, this.y);
        orca.lock(this.x + i, this.y);
        // Treat '.' and 'X'/'x' as empty/end of message
        if (g === '.' || g === 'X' || g === 'x') break;
        msg += g;
      }
      
      if (!this.hasNeighbor('*') && force === false) return;
      
      const path = this.listen(this.ports.path);
      this.draw = false;
      
      const command = parseMessage(msg);
      if (command) {
        return handleMatCommand(command, msg, path);
      }
      
      return false;
    };
  };
  
  // O-SIGV OPERATOR 3: ^ (caret) - TRANS
  // Example: ^o0ia -> morph from gs1 (0) to 50% gs2 (i=18) over 10ms (a=10)
  // Example: ^s26 -> set gs2 shape to cylinder (2) with resolution (6)
  library['^'] = function OperatorOSigvTrans(orca, x, y, passive) {
    Operator.call(this, orca, x, y, '^', true);
    
    this.name = 'o-sigv-trans';
    this.info = 'o-sigv TRANS commands (morph, shape, dimensions)';
    this.draw = false;
    
    this.ports.path = { x: 1, y: 0 };
    
    // Debug: log when this operator is created
    console.log(`o-sigv: TRANS operator created at (${x},${y})`);
    
    this.operation = function(force = false) {
      let msg = '';
      // Read message from cells to the right, starting from position x+1
      // For o-sigv, the entire command is in the message (e.g., `o0ia for morph)
      for (let i = 1; i <= 36; i++) {
        const g = orca.glyphAt(this.x + i, this.y);
        orca.lock(this.x + i, this.y);
        // Treat '.' and 'X'/'x' as empty/end of message
        if (g === '.' || g === 'X' || g === 'x') break;
        msg += g;
      }
      
      const hasBang = this.hasNeighbor('*');
      if (!hasBang && force === false) {
        console.log(`o-sigv: TRANS operator at (${this.x},${this.y}) - no bang, waiting`);
        return;
      }
      
      // For o-sigv TRANS commands, we don't use the path port - the entire command is in msg
      // and the target is determined by the focus
      this.draw = false;
      
      const command = parseMessage(msg);
      console.log(`o-sigv: TRANS operator triggered with command: ${command}, focus: ${currentFocus}, bang: ${hasBang}`);
      if (command) {
        // Use current focus as the target path
        const result = handleTransCommand(command, msg, currentFocus);
        console.log(`o-sigv: TRANS result: ${result}`);
        return result;
      }
      
      console.log(`o-sigv: TRANS operator - no command parsed`);
      return false;
    };
  };
  
  // O-SIGV OPERATOR 4: _ (underscore) - AUDIO
  library['_'] = function OperatorOSigvAudio(orca, x, y, passive) {
    Operator.call(this, orca, x, y, '_', true);
    
    this.name = 'o-sigv-audio';
    this.info = 'o-sigv AUDIO commands';
    this.draw = false;
    
    this.ports.path = { x: 1, y: 0 };
    
    this.operation = function(force = false) {
      let msg = '';
      // Read message from cells to the right, starting from position x+1
      for (let i = 1; i <= 36; i++) {
        const g = orca.glyphAt(this.x + i, this.y);
        orca.lock(this.x + i, this.y);
        // Treat '.' and 'X'/'x' as empty/end of message
        if (g === '.' || g === 'X' || g === 'x') break;
        msg += g;
      }
      
      if (!this.hasNeighbor('*') && force === false) return;
      
      const path = this.listen(this.ports.path);
      this.draw = false;
      
      const command = parseMessage(msg);
      if (command) {
        return handleAudioCommand(command, msg, path);
      }
      
      return false;
    };
  };
  
  // O-SIGV OPERATOR 5: º (degree) - LIGHTS
  library['º'] = function OperatorOSigvLights(orca, x, y, passive) {
    Operator.call(this, orca, x, y, 'º', true);
    
    this.name = 'o-sigv-lights';
    this.info = 'o-sigv LIGHTS commands';
    this.draw = false;
    
    this.ports.path = { x: 1, y: 0 };
    
    this.operation = function(force = false) {
      let msg = '';
      // Read message from cells to the right, starting from position x+1
      for (let i = 1; i <= 36; i++) {
        const g = orca.glyphAt(this.x + i, this.y);
        orca.lock(this.x + i, this.y);
        // Treat '.' and 'X'/'x' as empty/end of message
        if (g === '.' || g === 'X' || g === 'x') break;
        msg += g;
      }
      
      if (!this.hasNeighbor('*') && force === false) return;
      
      const path = this.listen(this.ports.path);
      this.draw = false;
      
      const command = parseMessage(msg);
      if (command) {
        return handleLightsCommand(command, msg, path);
      }
      
      return false;
    };
  };
  
  // O-SIGV OPERATOR 6: … (ellipsis) - SYSTEM
  // Example: …n0 -> new geo object
  // Example: …f0 -> focus on geo
  library['…'] = function OperatorOSigvSystem(orca, x, y, passive) {
    Operator.call(this, orca, x, y, '…', true);
    
    this.name = 'o-sigv-system';
    this.info = 'o-sigv SYSTEM commands (new, zap, focus)';
    this.draw = false;
    
    this.ports.path = { x: 1, y: 0 };
    
    // Debug: log when this operator is created
    console.log(`o-sigv: SYSTEM operator created at (${x},${y})`);
    
    this.operation = function(force = false) {
      let msg = '';
      // Read message from cells to the right, starting from position x+1
      // For o-sigv, the entire command is in the message (e.g., `n0 for new geo)
      for (let i = 1; i <= 36; i++) {
        const g = orca.glyphAt(this.x + i, this.y);
        orca.lock(this.x + i, this.y);
        // Treat '.' and 'X'/'x' as empty/end of message
        if (g === '.' || g === 'X' || g === 'x') break;
        msg += g;
      }
      
      const hasBang = this.hasNeighbor('*');
      if (!hasBang && force === false) {
        console.log(`o-sigv: SYSTEM operator at (${this.x},${this.y}) - no bang, waiting`);
        return;
      }
      
      const path = this.listen(this.ports.path);
      this.draw = false;
      
      const command = parseMessage(msg);
      console.log(`o-sigv: SYSTEM operator triggered with command: ${command}, path: ${path}, bang: ${hasBang}`);
      if (command) {
        // For SYSTEM commands, the path is often not used - the command contains everything
        // e.g., …n0 means "new geo", not "new with path n0"
        const result = handleSystemCommand(command, msg, path || '');
        console.log(`o-sigv: SYSTEM result: ${result}`);
        return result;
      }
      
      console.log(`o-sigv: SYSTEM operator - no command parsed`);
      return false;
    };
  };
  
  // O-SIGV OPERATOR 7: ∆ (delta) - SERIAL
  library['∆'] = function OperatorOSigvSerial(orca, x, y, passive) {
    Operator.call(this, orca, x, y, '∆', true);
    
    this.name = 'o-sigv-serial';
    this.info = 'o-sigv SERIAL commands';
    this.draw = false;
    
    this.ports.path = { x: 1, y: 0 };
    
    this.operation = function(force = false) {
      let msg = '';
      // Read message from cells to the right, starting from position x+1
      for (let i = 1; i <= 36; i++) {
        const g = orca.glyphAt(this.x + i, this.y);
        orca.lock(this.x + i, this.y);
        // Treat '.' and 'X'/'x' as empty/end of message
        if (g === '.' || g === 'X' || g === 'x') break;
        msg += g;
      }
      
      if (!this.hasNeighbor('*') && force === false) return;
      
      const path = this.listen(this.ports.path);
      this.draw = false;
      
      const command = parseMessage(msg);
      if (command) {
        return handleSerialCommand(command, msg, path);
      }
      
      return false;
    };
  };
  
  // O-SIGV OPERATOR 8: ∞ (infinity) - CHAO
  library['∞'] = function OperatorOSigvChao(orca, x, y, passive) {
    Operator.call(this, orca, x, y, '∞', true);
    
    this.name = 'o-sigv-chao';
    this.info = 'o-sigv CHAO commands (Lorenz attractor)';
    this.draw = false;
    
    this.ports.path = { x: 1, y: 0 };
    
    this.operation = function(force = false) {
      let msg = '';
      // Read message from cells to the right, starting from position x+1
      for (let i = 1; i <= 36; i++) {
        const g = orca.glyphAt(this.x + i, this.y);
        orca.lock(this.x + i, this.y);
        // Treat '.' and 'X'/'x' as empty/end of message
        if (g === '.' || g === 'X' || g === 'x') break;
        msg += g;
      }
      
      if (!this.hasNeighbor('*') && force === false) return;
      
      const path = this.listen(this.ports.path);
      this.draw = false;
      
      const command = parseMessage(msg);
      if (command) {
        return handleChaoCommand(command, msg, path);
      }
      
      return false;
    };
  };
  
  // O-SIGV OPERATOR 9: ß (sharp s) - BUFFER
  library['ß'] = function OperatorOSigvBuffer(orca, x, y, passive) {
    Operator.call(this, orca, x, y, 'ß', true);
    
    this.name = 'o-sigv-buffer';
    this.info = 'o-sigv BUFFER commands (sampler)';
    this.draw = false;
    
    this.ports.path = { x: 1, y: 0 };
    
    this.operation = function(force = false) {
      let msg = '';
      // Read message from cells to the right, starting from position x+1
      for (let i = 1; i <= 36; i++) {
        const g = orca.glyphAt(this.x + i, this.y);
        orca.lock(this.x + i, this.y);
        // Treat '.' and 'X'/'x' as empty/end of message
        if (g === '.' || g === 'X' || g === 'x') break;
        msg += g;
      }
      
      if (!this.hasNeighbor('*') && force === false) return;
      
      const path = this.listen(this.ports.path);
      this.draw = false;
      
      const command = parseMessage(msg);
      if (command) {
        return handleBufferCommand(command, msg, path);
      }
      
      return false;
    };
  };



  console.log('o-sigv operators initialized successfully!');
  console.log('All 9 o-sigv operators replaced with direct JS integration:');
  console.log('  ` (ANIM), | (MAT), ^ (TRANS), _ (AUDIO)');
  console.log('  º (LIGHTS), … (SYSTEM), ∆ (SERIAL), ∞ (CHAO), ß (BUFFER)');
  console.log('Default focus: geo (0)');
  console.log('Focus mapping: 0=geo, 1=proc, 2=model, 3=nature, 4=wrld, 5=midi, 6=lz, 7=spk, 9=plato');
  console.log('Examples:');
  console.log('  …n0 - create new geo');
  console.log('  …n1 - create new proc');
  console.log('  …n9 - create new plato');
  console.log('  …z0 - zap/delete first geo (opposite of …n0)');
  console.log('  …f0 - focus on geo');
  console.log('  `tiki - anim turn (x=18/36, y=20/36, z=18/36) infinite');
  console.log('  ^o0ia - morph from gs1 (0%) to gs2 (50% i=18/36) over 10ms (a=10)');
  console.log('  ^s12 - set gs1 shape to cylinder (for geo with 2 gridshapes)');
  console.log('  ^s24 - set gs2 shape to box (for geo with 2 gridshapes)');
  console.log('  ^s00 - set shape to sphere (for proc with 1 gridshape)');
  console.log('  ^s10 - set plato gs1 to tetrahedron (if plato is focused)');
  console.log('  ^s21 - set plato gs2 to cube (if plato is focused)');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOrcaOSigv);
} else {
  initOrcaOSigv();
}

// Also try to initialize after a delay in case Orca loads slowly
setTimeout(initOrcaOSigv, 500);
setTimeout(initOrcaOSigv, 1500);

// Expose to window for debugging
window.initOrcaOSigv = initOrcaOSigv;

// Add debugging to see if operators are in the library
setTimeout(() => {
  console.log('o-sigv: Checking library operators...');
  const operators = ['`', '|', '^', '_', 'º', '…', '∆', '∞', 'ß'];
  operators.forEach(op => {
    if (library[op]) {
      console.log(`o-sigv: Operator ${op} (${library[op].name || 'unnamed'}) is registered`);
    } else {
      console.warn(`o-sigv: Operator ${op} is NOT registered in library`);
    }
  });
}, 2000);