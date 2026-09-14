# MITRA animated presenter

## Try it

Run `npm run dev:web` and open `http://127.0.0.1:5173/?demo=1&presenter=1`. This now opens the original MITRA interface with the explanation integrated into it. For the normal dashboard, use `http://127.0.0.1:5173/?demo=1`.

- Desktop keeps the IDBI navigation rail, customer header and MITRA chat alongside the explanation in the main content pane. Home, Wealth and Time Machine have an **Explain with charts** entry.
- Mobile keeps the MITRA tab and chat header. The explanation replaces the chat body temporarily; **Back to chat** restores the conversation.
- Supported chat widgets have **Explain this chart**, **Explain this projection**, or **Explain investment gains** actions. SIP amount, duration and rate come from the selected message; spending uses that message's categories. Allocation widgets explicitly open an investment-gains walkthrough.
- **Change character** expands the four choices. Embedded cards, typefaces, colours and borders inherit the original app's day/night and light/dark theme tokens.
- Questions beyond the presenter commands return to the normal conversation. Starting a chat question, microphone interaction or call closes the presentation so the two voice experiences do not compete.

Choose a character, then select **Meet Asha / Aarav / Tara / Kabir** for a short greeting with speech, wave, pointing and a thumbs-up. **Wave**, **Point** and **Nice!** let you try each action immediately. The character choice is saved on this device and also changes the vector avatar in the existing chat and call views.

| Character | Visual style | Studio voice |
|---|---|---|
| Asha | Indian professional woman, teal blazer | Neha |
| Aarav | Indian professional man, blue blazer | Kabir |
| Tara | Playful girl, ponytail and orange hoodie | Tanya |
| Kabir | Playful boy, purple hoodie | Rahul |

These are animated characters with independently controlled mouth, eyes, head, upper arms, forearms and hands. The photographic sprite sheet has been removed. The younger styles are friendly money-learning mascots.

## Full interaction

1. Choose **Investment gains**, **Spending** or **SIP projection**.
2. Press **Play explanation**. Each spoken step highlights the bar it describes; the character looks toward the chart and points.
3. Select another bar to interrupt and hear that explanation. Previous, Next, Pause and Escape also control the presentation.
4. Change the SIP amount, years or assumed return. The chart and narration update from the same calculation; replay when ready.
5. Type or speak an English command: “show my profits”, “explain spending”, “show SIP growth”, “pause”, “next” or “repeat”. Other questions return to the existing chat experience.
6. The character moves to the other side during the second half of a desktop walkthrough, or on **Switch sides**. On mobile, the character stays in a compact area above the chart.
7. Finishing a walkthrough triggers a thumbs-up, a small bounce and sparkles. Voice off retains captions and gestures while keeping the mouth closed.

## Mouth movement and actions

- Sarvam playback feeds a WebAudio analyser. The measured waveform drives mouth opening; quiet audio and pauses close the mouth. The avatar does not use the old four-frame timer.
- Device speech uses a text-based articulation approximation, corrected by word-boundary events when available. Closed consonants, rounded vowels and wide vowels have different shapes. This is an approximation, not phoneme-accurate lip sync.
- If WebAudio is unavailable, neural playback uses the same text approximation. Audio remains usable without animation support.
- Cancelling or ending speech clears animation frames and restores the resting mouth. Stale callbacks from an interrupted utterance are ignored.
- Arm actions rotate separate shoulder, elbow and hand joints. Wave moves the palm, Point extends the index finger, Listen raises a hand toward the ear, and Nice raises a thumb. Pointing elevation follows the selected bar within the arm's available range; the chart arrow marks the exact value.
- Natural blinking, idle breathing, speech nods, gaze changes and completion celebration add personality. Reduced motion disables decorative movement while retaining speech articulation and useful poses.
- The studio, call and companion select an existing Sarvam speaker for each character. Device fallback attempts an appropriate installed voice; availability depends on the device.

Implementation references: [WebAudio waveform analysis](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData), [speech word-boundary events](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event).

## Financial data

`src/engine/presenter.js` derives chart values and narration from the same scene data. Current holdings with recorded cost supply unrealised gains and losses; missing cost is disclosed and excluded. Spending uses the existing amounts and available comparison averages. SIP scenarios use the existing `sipFutureValue` calculation and separate contributions, projected growth and total value. Projections are labelled before fees, taxes and inflation, with no guaranteed-return claim.

## Validation and remaining improvements

The production build and 82 Node tests pass. Coverage includes integrated desktop/mobile rendering, full call transcripts without truncation, semantic targets, model-action validation, provider timeout/cancellation, chart scenario preservation, interim/final recognition handling, mouth amplitude/silence, text articulation, word-boundary correction, audio-node cleanup and financial narration. Earlier, four character poses were rendered directly from the actual React SVG component and visually inspected. Browser interaction, live microphone capture and audible provider playback were not exercised in this pass; action-provider tests use stubs.

Useful next improvements are provider-supplied phoneme timestamps for tighter articulation, richer scene-aware follow-up questions, and additional hand poses. The current renderer is a working 2D character rig; no 3D service is required for its actions.

## Full-screen call and screen companion

On the normal dashboard (`?demo=1`), the small companion rises from the bottom with “What would you like to do today?” It greets visually without attempting autoplay audio. Click the character to hear the greeting. **Show me around** visits Home, Wealth allocation and the Time Machine; use **Next stop** to advance. **My wealth** and the “Where can I…” input resolve a relevant section, navigate there, highlight it and point to the rendered element. Minimise leaves a small launcher; the greeting stays minimised for the browser session. Four character choices are available directly in its bubble.

Choose **Call MITRA** in the existing chat header to open a viewport-sized conversation. The complete user/assistant turns remain in a scrollable conversation, with a large **Your words** transcript and the current answer’s widget. Browser recognition shows interim words; Sarvam shows a transcribing state and then its completed utterance. Partial recognition never submits an advisory question. The current chart can be opened/hidden, and supported investment gains, spending and SIP bars reuse the presenter’s computed values and explanations. Select a bar to hear it explained. Earlier text remains readable when a new answer arrives.

The call includes text input, suggested questions, microphone control, voice mute, **Pause voice & microphone**, and **End call**. Escape ends the call. Focus remains in the dialog, and the background app is inert until it closes. Completion produces a thumbs-up; interruption stops speech and stale recognition callbacks are ignored. Ending a call invalidates pending call directions and replies. The home companion hides during calls and stops its own narration when chat activity starts.

`src/engine/avatarDirector.js` adds a separate `guide_ui` tool-selection request to the existing Sarvam/DeepSeek providers. The model selects up to four supported actions: `navigate`, `open_chart`, `point`, and `gesture`. It sees the question and available semantic targets, including labels for the current chart’s bars. Targets are validated against the current surface; arbitrary selectors, coordinates, URLs, financial operations and unavailable charts are rejected. The UI computes pointing coordinates from real elements. Financial answers and values continue to come from the existing advisory engine. The model does not generate numbers or execute transactions through this tool.

Planning has a three-second total deadline and cancellation. Unconfigured, unavailable, or invalid provider output falls back to local section routing and the supplied chart. Chart display and speech do not wait for planning. Page guidance uses one destination at a time; a tour advances only on the user’s next action. This is bounded direction of supported UI actions, not unrestricted control of every screen element.
