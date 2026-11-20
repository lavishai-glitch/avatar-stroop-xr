# Avatar-frame spatial Stroop — Quest 3 (WebXR)

Version 1: scene + test task. The avatar is static; the visuomotor training phase comes next.

## Run it on the Quest 3

1. Host the folder on any HTTPS server (GitHub Pages works). WebXR and the microphone need HTTPS.
2. Open the page in the Quest browser, fill in Participant / Session / Phase / Block sequence.
3. **Test mic**: stay quiet 2 s (noise calibration), then speak and watch the level bar.
4. **Enter VR**. The scene aligns to your head on entry: sit upright, look straight ahead.
   - Squeeze (grip) re-centres the scene between blocks.
   - Trigger / pinch starts each block from the instruction panel.
5. After the last block (or when you exit VR), the page lists the data files. Tap each one to download.

Desktop test mode (any browser): Space starts a block, keys 1–4 simulate a voice response, R re-centres, and Esc ends the session.

## What each block does

- Sequence 1–4 sets the order of task (S = own view, A = avatar's view) × avatar side (R/L), as in the design doc.
- Each block is 20 cells (4 posts × 4 words + ####) × reps (default 4, so 80 trials). The order is shuffled with no immediate repeat, from a seed that is logged.
- Each trial: blank ITI 800–1200 ms → fixation 500 ms → word above a post until voice onset (max 2000 ms) → timeout at 2500 ms.
- There is a 30 s rest between blocks.

## Output files (per block)

| File | Content |
|---|---|
| `*_trials.csv` | One row per trial: position, word, both frame labels, correct answer, trial type in the judged frame and in both tasks, timestamps, online RT |
| `*_head.csv` | Head pose every frame during the block |
| `*_audio.wav` | Continuous microphone recording of the block (16-bit mono) |
| `*_all_trials.csv`, `*_meta.json` | All trials of the session; config, sample rate, noise threshold, seeds |

Trial types: `congJ`, `oppJ`, `matchO`, `oppO`, `neutral` (see the design doc). `type` is the type in the task actually run; `typeSelfTask` / `typeAvatarTask` give both.

**Offline RT:** the voice onset in the WAV is at sample `voiceFrame - wavFirstFrame` (online detection). For the real analysis, run a proper onset detector on the WAV starting from sample `stimAudioFrame - wavFirstFrame`. The spoken word is coded offline (Whisper or by hand).

## Known limits / to do

- **Audio–visual latency:** `stimAudioFrame` comes from the output-clock mapping. Measure the fixed offset once (photodiode on a lens + mic, or a clap filmed through the headset) and subtract it. A constant offset cancels in within-subject contrasts.
- Online detection is an energy threshold; noisy rooms need a higher `VOICE.thresholdFactor`.
- Posts C and D are on the line of sight. Check in the pilot that near/far is named at ≥95% accuracy on neutral trials.
- The avatar is a primitive mannequin. The training phase needs a rigged avatar driven by hand tracking (next version).
- three.js loads from jsDelivr, so the headset needs internet. Vendor `three.module.js` locally for offline lab use.

## Files

`index.html` (setup page) · `js/config.js` (all parameters) · `js/trials.js` (labels, classification, block generation) · `js/scene.js` · `js/avatar.js` · `js/audio.js` + `js/mic-worklet.js` · `js/logger.js` · `js/main.js` (state machine, XR loop)
