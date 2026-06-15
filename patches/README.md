# RNBO Patches Directory

Place your RNBO-exported Max patches (`.json` files) in this folder.

## How to Export from Max

1. Open your Max patch
2. Go to **File > Export > Export as RNBO...**
3. Choose export options:
   - Enable MIDI input if your patch needs MIDI
   - Set appropriate audio I/O channels
   - Include any required external files
4. Save the `.json` file to this directory

## Recommended Patch Structure

For best results with nbcli-web and Orca integration:

### Basic Synthesizer
```
[rnbo.midinotein] -> [mtof] -> [cycle~ frequency]
                         -> [*~ amplitude] -> [throw~ out1 out2]
                          
[velin] -> [*~ 0.1] -> [*~ amplitude]
```

### Drum Synth
```
[rnbo.midinotein] -> [mtof] -> [noise~]
                           -> [filter~] -> [env~] -> [throw~ out1 out2]
[velin] -> [*~ 100] -> [line~ 0 200] -> [env~ attack 10 release 200]
```

## Existing Patches

This directory is currently empty. Add your own RNBO patches.

## Tips

- Use `rnbo.*` objects for best compatibility
- Keep patches relatively simple for web performance
- Test audio output in Max before exporting
- Check browser console for any loading errors
