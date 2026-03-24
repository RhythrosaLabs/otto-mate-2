# Media Generation

Ottomate has four dedicated media production environments plus agent-callable tools for on-the-fly generation.

---

## Image Studio

**URL:** `/computer/image-studio`

A standalone AI image generation and editing workspace.

### Generation

- **Providers:** Replicate (FLUX Schnell default), Adobe Firefly (Nova Image 4/4 Ultra/5 Preview), DALL-E 3
- **Aspect ratios:** 1:1, 3:4, 4:3, 9:16, 16:9, and more
- **Prompt:** text description → image
- **Negative prompt:** what to exclude
- **Seed control:** reproducible generations
- **Batch:** 1–4 images per generation

### Editing (Replicate)

| Operation | Model |
|---|---|
| Remove background | `recraft-ai/recraft-remove-background` |
| Upscale | `recraft-ai/recraft-crisp-upscale` |
| Inpainting / Fill | Stable Diffusion Inpainting |
| Face swap | fofr/face-to-many variant |
| BLIP caption | `salesforce/blip` — auto-generates a description of an uploaded image |

### Saving

Generated images are saved to the Files system with `source = "gallery"` and appear in the Files page and Nova Gallery.

---

## Dreamscape — Video Studio

**URL:** `/computer/dreamscape/studio`

A **17-mode AI creative studio** built around **Luma Dream Machine** with Replicate model support and MusicGen/Bark audio generation.

### Generation Modes

| Mode | Description |
|---|---|
| Text-to-video | Generate video from a text prompt |
| Image-to-video | Animate a still image |
| Extend | Extend an existing video clip |
| Reverse-extend | Extend backwards |
| Interpolate | Create smooth transition between two frames |
| Text-to-image | Generate still image via Luma Photon |
| Image reference | Style-guided generation from a reference image |
| Character reference | Persistent identity across multiple shots |
| Style reference | Apply a visual style from a reference |
| Modify video | Alter an existing video with a prompt |
| Modify video (keyframes) | Keyframe-controlled video modification |
| Modify image | Prompt-guided image transformation |
| Reframe | Change aspect ratio of existing media |
| Music generation | MusicGen via Replicate |
| Sound effects | Bark audio generation |
| Voiceover | AI narration |
| Lip-sync | Sync voice to video |

### Models

| Provider | Models |
|---|---|
| Luma Dream Machine | Ray 3 (highest quality), Ray Flash 2 (fast), Photon 1 (still), Photon Flash 1 (fast still) |
| Replicate | Minimax Video-01-Live, Wan 2.1 T2V + I2V 480p, Seedance 1 Lite, Stable Video Diffusion, Kling via fofr |

Auto-model selection: Flash models for fast text-to-video drafts; full Ray 3 / Photon 1 for character consistency, style transfer, and modify operations.

### Production Controls

| Control | Options |
|---|---|
| Camera motions | 20 presets: pan left/right, zoom in/out, orbit, crane up/down, dolly in/out, tracking, handheld, static, arc, dutch tilt, whip pan (with directional variants) |
| Modify intensity | 9 levels: adhere → flex → reimagine |
| Resolution | 540p, 720p, 1080p, 4K |
| Aspect ratio | 1:1, 3:4, 4:3, 9:16, 16:9, 9:21, 21:9 |
| Duration | 5s or 9s |
| Output | HDR (EXR), loop toggle |
| Batch | Up to 4 variants per generation |
| Workflow | Draft (Flash) → Hi-Fi (full model) auto-upgrade |

### Storyboard Organization

Work is organized into **boards** (storyboard, artboard, moodboard) containing individual **shots**. Each shot has:
- Prompt text and generation parameters
- Generated media with preview and playback
- Tags, likes, bookmarks
- Annotation overlay (arrows, rectangles, text) that feeds spatial context into prompts

Boards can be exported/imported as JSON.

### AI Director

A built-in chat agent with three modes:

| Mode | Description |
|---|---|
| **Brainstorm** | Free-form creative ideation |
| **Create** | Interprets natural language into a multi-shot production plan |
| **Brief** | Creates a continuity sheet (style anchors, character references, setting references) |

The AI Director generates **command chains** with dependency ordering and supports **concept pill** word-swapping for rapid prompt iteration.

---

## Audio Studio

**URL:** `/computer/audio-studio`

An AI-powered audio production studio with three tabs:

### Compose Tab

Generate music tracks from text prompts using **MusicGen** via Replicate.

| Control | Description |
|---|---|
| Prompt | Describe the music: genre, mood, instruments, scene |
| Genre | Electronic, Cinematic, Jazz, Rock, Classical, Ambient, Hip-Hop, etc. |
| Mood | Energetic, Melancholic, Uplifting, Dark, Peaceful, etc. |
| BPM | Beats per minute |
| Key | Musical key (C Major, A Minor, etc.) |
| Duration | Up to 60 seconds |
| Model | stereo-melody-large, stereo-large, melody, melody-large, large |
| Advanced | Temperature, CFG scale |

Progress is tracked in real time. Generated audio saves to Files with playback support.

### Speech Tab

Generate professional AI voiceovers from text.

| Control | Description |
|---|---|
| Text input | Content to synthesize |
| Voice | Alloy, Echo, Fable, Onyx, Nova, Shimmer (OpenAI TTS) |
| Speed | 0.25× – 4×  |
| Provider | OpenAI TTS (default), ElevenLabs (`eleven_multilingual_v2`) |

### Record Tab

Record audio directly in the browser with:
- Real-time waveform visualization
- Start/stop/pause controls
- Preview before saving
- Download as WAV/MP3

---

## Nova — Creative Suite

**URL:** `/computer/firefly`

A unified AI media hub with a polished home page and **6 creation modes**.

### Generate Image

Text-to-image with model selection:

| Model | Provider | Notes |
|---|---|---|
| Nova Image 4 | Adobe Firefly | High quality photorealistic |
| Nova Image 4 Ultra | Adobe Firefly | Maximum quality |
| Nova Image 5 (Preview) | Adobe Firefly | Latest generation |
| FLUX Schnell | Replicate | Fast, high quality |
| FLUX 1.1 Pro | Replicate | Premium quality |
| DALL-E 3 | OpenAI | Creative, stylistic |

Controls: 6 aspect ratios, negative prompt, style reference, structure reference (with adjustable strength), seed, batch (1–4 images).

Quick actions on generated images: **Edit**, **Generative Fill**, **Animate to Video**, **Upscale**, **Save to Gallery**.

### Generate Video

Text-to-video and image-to-video via Luma Dream Machine and Replicate.
Controls: aspect ratio, duration, model selection, direct download.

### Generate Soundtrack

AI music generation for video content / general use. Describe mood, genre, or scene → studio-quality soundtrack. Licensed for commercial use.

### Generate Speech

Professional AI voiceover with multiple voice profiles, speed control, and instant download.

### Edit Image

Full AI image editing suite:

| Tool | Description |
|---|---|
| Remove Background | One-click subject extraction |
| Replace Background | Remove background + generate new one from a prompt |
| Upscale | 2× or 4× resolution enhancement |
| Expand | Outpainting — extend canvas edges with AI |
| Generative Fill | Paint a mask and describe what to fill |
| Prompt Edit | Instruct-based editing — describe the change |

Upload via file picker or paste from clipboard.

### Gallery

Browse, filter, and manage all generated creations in a unified media gallery. Filter by type (image, video, soundtrack, speech, edit). Quick actions: download, share, delete, generate variants.

---

## Agent-Callable Media Generation

The agent can generate media during any task without navigating to a studio page:

```
"Generate an image of a futuristic city at sunset"
→ uses generate_image tool → saves to task files → shows preview in Files tab

"Create a 10-second cinematic video of waves crashing on rocks"
→ uses dream_machine tool → queues on Luma → polls for completion → saves

"Run replicate with MusicGen to create a 30-second jazz loop"
→ uses replicate_run tool with model "meta/musicgen"
```
