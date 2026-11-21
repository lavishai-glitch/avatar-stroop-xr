# Avatar-frame Stroop: Quest 3 (WebXR)

Version 2: a human avatar driven by the controllers, a tower-building training game, and a near/far cube test.

Live: https://lavishai-glitch.github.io/avatar-stroop-xr/

## Session flow

1. **Setup page**: participant, session, phase, mapping, avatar, side sequence, button map, reps, training length.
2. **Enter VR**: sit upright and look ahead. The scene aligns to your head. The left controller's Y button re-centres it on the instruction or rest screens.
3. **Instructions**: press the right trigger to start.
4. **Training (phase = post)**: build towers of 5 cubes on the white pad in front of the avatar.
   - The controllers drive the avatar's hands. In anatomical mapping, the right controller drives its right hand, with movement rotated into its frame. In mirror mapping, the right controller drives its left hand and the lateral movement is mirrored.
   - Trigger grabs and releases a cube. Release over the pad to stack.
   - The first block uses the main training (default 300 s). Later blocks get a 45 s top-up.
5. **Test, straight after training**: a cube with קרוב or רחוק on all six faces appears on the avatar's line of sight, near or far from the avatar. Press the button for the cube's location relative to the avatar and ignore the word (A = near, B = far, or swapped by the button-map setting). **The avatar keeps following the controllers during the test.**
6. **20 s rest**: the avatar moves to the other side, then the next block starts.
7. At the end, exit VR and download the files from the page.

Phase = pre: no training, the avatar sits still (hands on the table), straight to the test.

## Design

- The cube appears only on the avatar's line of sight, so both positions are the same distance from the participant. The participant's own near/far is neutral.
- Each block has 2 positions × 2 words (+ optional ####) × reps, with a seeded shuffle and at most 3 identical cells in a row. Sides follow sequence 1 (R L L R) or 2 (L R R L).
- Each trial: ITI 800–1200 ms → fixation 500 ms → cube until a response (shown for up to 2000 ms) → timeout at 2500 ms.

## Output files

| File | Content |
|---|---|
| `*_bN_<side>_trials.csv` | One row per trial: pos, word, congruent/incongruent, button pressed, correct, RT (ms from the frame the cube was drawn), timeout |
| `*_bN_<side>_motion.csv` | Every frame during training and test: head pose, both controllers, both avatar hand points (scene frame, metres) |
| `*_training_events.csv` | Grab / stack / drop / tower events with times |
| `*_all_trials.csv`, `*_meta.json` | All trials and the full configuration |

RT resolution is one frame (≈11 ms at 90 Hz), because buttons are polled each frame.

## Avatars

- `models/rpm.glb`: male (Ready Player Me sample from the three.js examples).
- `models/Michelle.glb`: female (Mixamo character from the three.js examples).

Both come from the three.js repository examples. Check their licences (Ready Player Me / Mixamo terms) before publishing a paper or a public build. For publication, a CC0 rigged human is the safer option.

The arms use two-bone IK toward the mapped controller position. Wrist rotation is not mapped yet: the hand follows the forearm. The head copies the participant's head rotation (mirrored in mirror mode).

## Desktop test

Desktop mode works in any browser. Space starts a block. The arrows and PgUp/PgDn move the right "controller". G grabs, 1/2 press A/B, R re-centres, and Esc ends the session.

## Files

`index.html` · `js/config.js` (all parameters) · `js/avatar.js` (loading, seated pose, IK) · `js/mapping.js` (controller → avatar) · `js/training.js` (tower game) · `js/trials.js` · `js/scene.js` · `js/input.js` · `js/logger.js` · `js/main.js`
