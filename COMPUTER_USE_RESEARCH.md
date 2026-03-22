# Deep Technical Research: Computer Use Agent Repos

## Table of Contents
1. [e2b-dev/open-computer-use](#1-e2b-devopen-computer-use)
2. [deedy/mac_computer_use](#2-deedymac_computer_use)
3. [Comparative Analysis](#3-comparative-analysis)

---

# 1. e2b-dev/open-computer-use

**Repo:** https://github.com/e2b-dev/open-computer-use  
**Language:** Python 98.8%, HTML 1.2%  
**License:** Apache-2.0  
**Stars:** ~1.8k  
**Key Contributor:** James Murdza (@jamesmurdza)

## 1.1 Architecture Overview

The system follows a **three-model architecture** where different LLMs handle different cognitive tasks:

```
┌─────────────────────────────────────────────────────┐
│                    main.py (Entry)                    │
│  - Initializes E2B Sandbox                           │
│  - Opens VNC browser via pywebview                   │
│  - REPL loop for user instructions                   │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│              SandboxAgent                            │
│  - Manages message history                           │
│  - Orchestrates the observe→think→act loop           │
│  - Defines tool functions via @tool decorator        │
│  - Delegates to three specialized models:            │
│    ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│    │ Vision Model │ │ Action Model │ │ Grounding  │ │
│    │ (Observe)    │ │ (Plan+Act)   │ │ (Locate)   │ │
│    └──────────────┘ └──────────────┘ └────────────┘ │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│          E2B Desktop Sandbox                         │
│  - Cloud Ubuntu VM with display server               │
│  - Provides: screenshot(), press(), write(),         │
│    left_click(), double_click(), right_click(),      │
│    move_mouse(), commands.run()                      │
│  - VNC streaming via ffmpeg                          │
└─────────────────────────────────────────────────────┘
```

### Key Files and Their Roles

| File | Role |
|------|------|
| `main.py` | Entry point. Creates E2B sandbox, starts VNC stream, opens browser, runs REPL loop |
| `os_computer_use/sandbox_agent.py` | Core agent class. Tool definitions, agent loop, message history |
| `os_computer_use/config.py` | Model configuration. Selects which provider/model for each role |
| `os_computer_use/providers.py` | All LLM provider implementations (10+ providers) |
| `os_computer_use/llm_provider.py` | Base classes: `LLMProvider`, `OpenAIBaseProvider`, `AnthropicBaseProvider`, `MistralBaseProvider` |
| `os_computer_use/streaming.py` | `Sandbox` subclass (adds ffmpeg streaming) + `DisplayClient` |
| `os_computer_use/browser.py` | `Browser` class using pywebview to display VNC stream |
| `os_computer_use/grounding.py` | Utility functions: `draw_big_dot()`, `extract_bbox_midpoint()` |
| `os_computer_use/osatlas_provider.py` | OS-Atlas grounding model via HuggingFace Spaces/Gradio |
| `os_computer_use/showui_provider.py` | ShowUI grounding model via HuggingFace Spaces/Gradio |
| `os_computer_use/logging.py` | Color-coded console + HTML log file logger |

## 1.2 The Three-Model Architecture

This is the most distinctive design decision. Instead of one model doing everything, three specialist models collaborate:

### Vision Model (Observe)
- **Purpose:** Analyze screenshots and describe what's on screen
- **Input:** Screenshot (image) + message history + structured prompt
- **Output:** Natural language description of the screen state and next step recommendation
- **Prompt template:**
  ```
  "This image shows the current display of the computer. Please respond in the following format:
  The objective is: [put the objective here]
  On the screen, I see: [an extensive list of everything relevant]
  This means the objective is: [complete|not complete]
  (Only continue if the objective is not complete.)
  The next step is to [click|type|run the shell command] [next single step] in order to [expected outcome]."
  ```
- **Supported models:** Llama 3.2 (Fireworks/OpenRouter/Groq), GPT-4o, Claude 3.5 Sonnet, Gemini 2.0 Flash, Pixtral, Moonshot, Qwen 2.5 VL

### Action Model (Plan + Act via Tool Calls)
- **Purpose:** Decide which tool to call based on observation
- **Input:** System prompt ("You are an AI assistant with computer use abilities") + message history + vision model output
- **Output:** Text reasoning + tool call(s) in function-calling format
- **Supported models:** Llama 3.3 (Fireworks/OpenRouter/Groq), GPT-4o, Claude 3.5 Sonnet, DeepSeek, Gemini, Mistral Large

### Grounding Model (Locate UI Elements)
- **Purpose:** Convert natural language element descriptions to screen coordinates
- **Input:** Screenshot image + text query (e.g., "the search bar")
- **Output:** (x, y) pixel coordinates of the element
- **Implementations:**
  - **OS-Atlas** (`OSAtlasProvider`): Uses `OS-Copilot/OS-Atlas-Base-7B` via HuggingFace Spaces. Returns bounding box format `<|box_start|>...<|box_end|>`, from which midpoint is extracted.
  - **ShowUI** (`ShowUIProvider`): Uses `showlab/ShowUI-2B` via HuggingFace Spaces. Returns normalized coordinates that are multiplied by image dimensions.

## 1.3 How Screenshots/Screen Capture Works

```python
def screenshot(self):
    file = self.sandbox.screenshot()  # E2B Desktop SDK method
    filename = self.save_image(file, "screenshot")
    self.latest_screenshot = filename
    with open(filename, "rb") as image_file:
        return image_file.read()  # Returns raw bytes
```

- **Mechanism:** Calls `self.sandbox.screenshot()` which is an E2B Desktop SDK method that captures the virtual display's framebuffer
- **Storage:** Saves to temp directory with incrementing counter (`screenshot_1.png`, `screenshot_2.png`, etc.)
- **Format:** Raw PNG bytes, also saved to disk for grounding model (which needs file paths)
- **Live Streaming (VNC):** Separate from screenshots. Uses ffmpeg to grab X11 display and stream via HTTP: `ffmpeg -f x11grab -s 1024x768 -framerate 30 -i {display} -vcodec libx264 -preset ultrafast -tune zerolatency -f mpegts -listen 1 http://localhost:8080`. The newer code uses `sandbox.stream.start()` + `sandbox.stream.get_url()` for VNC-based streaming, displayed in a pywebview window.

## 1.4 How Mouse/Keyboard Actions Are Performed

All actions go through the E2B Desktop Sandbox SDK:

```python
# Mouse
self.sandbox.move_mouse(x, y)
self.sandbox.left_click()
self.sandbox.double_click()
self.sandbox.right_click()

# Keyboard
self.sandbox.press(name)         # Single key or combo like 'Ctl-C'
self.sandbox.write(text, chunk_size=50, delay_in_ms=12)  # Typing

# Shell
self.sandbox.commands.run(command, timeout=5)       # Synchronous
self.sandbox.commands.run(command, background=True)  # Asynchronous
```

### Click Flow (with Grounding)
The click operations are particularly interesting — they use the grounding model:

```python
def click_element(self, query, click_command, action_name="click"):
    self.screenshot()                                              # 1. Take fresh screenshot
    position = grounding_model.call(query, self.latest_screenshot)  # 2. Ask grounding model for coords
    dot_image = draw_big_dot(Image.open(self.latest_screenshot), position)  # 3. Draw debug dot
    filepath = self.save_image(dot_image, "location")              # 4. Save for logging
    x, y = position
    self.sandbox.move_mouse(x, y)                                  # 5. Move mouse to target
    click_command()                                                 # 6. Execute the click
```

This is fundamentally different from Anthropic's approach where the model directly outputs coordinates.

## 1.5 Agent Loop (Observe → Think → Act)

```python
def run(self, instruction):
    self.messages.append(Message(f"OBJECTIVE: {instruction}"))
    
    should_continue = True
    while should_continue:
        self.sandbox.set_timeout(60)  # Keep sandbox alive
        
        # STEP 1: OBSERVE — Vision model analyzes screenshot
        observation = self.append_screenshot()  # Calls vision_model.call()
        # Returns description: "The objective is: X. On the screen, I see: Y. Next step is: Z."
        
        # STEP 2: THINK + ACT — Action model decides tool calls
        content, tool_calls = action_model.call(
            [system_message, *self.messages, observation_message, 
             "I will now use tool calls to take these actions..."],
            tools  # Tool definitions dict
        )
        
        # STEP 3: EXECUTE — Run each tool call
        should_continue = False
        for tool_call in tool_calls:
            name, parameters = tool_call["name"], tool_call["parameters"]
            should_continue = name != "stop"
            if not should_continue:
                break
            result = self.call_function(name, parameters)
            self.messages.append(Message(f"OBSERVATION: {result}"))
```

### Message History Format
Messages are simple dicts: `{"role": "assistant"|"user"|"system", "content": str|list}`. The `Message()` helper creates them. Tool calls are serialized as JSON strings in messages. The content list format supports interleaved text and image bytes.

## 1.6 Tool Definitions

Tools are defined using a custom `@tool` decorator pattern:

```python
tools = {
    "stop": {"description": "Indicate that the task has been completed.", "params": {}}
}

@tool(description="Run a shell command and return the result.",
      params={"command": "Shell command to run synchronously"})
def run_command(self, command): ...

@tool(description="Send a key or combination of keys to the system.",
      params={"name": "Key or combination (e.g. 'Return', 'Ctl-C')"})
def send_key(self, name): ...

@tool(description="Type a specified text into the system.",
      params={"text": "Text to type"})
def type_text(self, text): ...

@tool(description="Click on a specified UI element.",
      params={"query": "Item or UI element on the screen to click"})
def click(self, query): ...
```

**Full tool list:** `stop`, `run_command`, `run_background_command`, `send_key`, `type_text`, `click`, `double_click`, `right_click`

**Key insight:** Click tools take a *natural language query* (e.g., "the Submit button"), NOT coordinates. The grounding model translates this to coordinates. This is a higher-level abstraction than Anthropic's coordinate-based approach.

Tool schemas are dynamically converted to provider format via `create_function_schema()` in the base provider class, supporting both OpenAI and Anthropic function-calling formats.

## 1.7 LLM Provider System

Elegant class hierarchy with polymorphism:

```
LLMProvider (abstract base)
├── OpenAIBaseProvider (OpenAI-compatible API format)
│   ├── FireworksProvider
│   ├── OpenRouterProvider
│   ├── LlamaProvider
│   ├── DeepSeekProvider
│   ├── OpenAIProvider
│   ├── GeminiProvider
│   ├── GroqProvider
│   └── MoonshotProvider
├── AnthropicBaseProvider (Anthropic API format)
│   └── AnthropicProvider
└── MistralBaseProvider (Mistral API format, extends OpenAIBaseProvider)
    └── MistralProvider
```

Each provider only needs to set: `base_url`, `api_key`, `aliases` (model name shortcuts).

**Provider interface:**
- `call(messages, functions=None)` → `(content, tool_calls)` or just `content`
- `completion(messages, **kwargs)` → raw API response
- `create_function_schema(definitions)` → provider-specific tool format
- `create_image_block(image_data)` → provider-specific image format
- `transform_message(message)` → wraps raw bytes as base64 images

**Fallback parsing:** If the API returns tool calls as text instead of structured output, it regex-parses `{...}` JSON from the content.

## 1.8 Sandbox/Environment Management

- **E2B Desktop Sandbox** (`e2b-desktop` package): Cloud-hosted Ubuntu VM with a virtual display
- **Sandbox lifecycle:**
  1. `sandbox = Sandbox()` — creates a new VM
  2. `sandbox.stream.start()` / `sandbox.stream.get_url()` — starts VNC stream
  3. `sandbox.set_timeout(60)` — called each loop iteration to prevent timeout
  4. `sandbox.kill()` — cleanup in `finally` block
- **Resolution:** Fixed at 1024×768
- **Display:** X11-based, captured via ffmpeg x11grab for streaming
- **Isolation:** Full VM-level isolation. Each run gets a fresh Ubuntu instance.

## 1.9 Error Handling and Recovery

- **Tool execution:** Try/except around `func_impl(**arguments)`, returns error string to agent
- **Agent loop:** Try/except around `agent.run()`, catches KeyboardInterrupt for graceful pause, catches generic Exception and prints error, then continues REPL
- **Sandbox cleanup:** `finally` block kills sandbox and closes browser regardless of errors
- **Unimplemented tools:** Returns "Function not implemented." (agent can adapt)
- **JSON parse errors:** `parse_json()` catches `JSONDecodeError`, returns None, skips malformed tool calls
- **Sandbox timeout prevention:** `sandbox.set_timeout(60)` called every loop iteration

## 1.10 Security Considerations

- **Strong isolation:** E2B sandbox is a cloud VM — no access to host machine
- **API key management:** Via `.env` file, loaded with `python-dotenv`
- **No credential exposure:** Keys are read from env vars, never logged
- **Sandbox is ephemeral:** Destroyed after use, no persistent state
- **Limited blast radius:** Even if the agent goes rogue, it can only affect the cloud sandbox
- **HuggingFace token:** Used for grounding models to bypass rate limits, not for sensitive operations

---

# 2. deedy/mac_computer_use

**Repo:** https://github.com/deedy/mac_computer_use  
**Language:** Python 94.3%, Shell 4.6%, Dockerfile 1.1%  
**Stars:** ~855  
**Author:** Deedy Das (@deedy)

## 2.1 Architecture Overview

This is a **fork of Anthropic's official computer-use-demo** adapted for native macOS. It uses a **single-model architecture** — Claude does everything (vision, reasoning, tool execution) in one unified loop.

```
┌─────────────────────────────────────────────────────┐
│           streamlit.py (Web UI)                      │
│  - Streamlit-based chat interface                    │
│  - Renders messages, tool outputs, screenshots       │
│  - Manages session state and API config              │
│  - Callbacks for output/tool/API response rendering  │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│           loop.py (Agent Loop)                       │
│  - sampling_loop(): the core agent cycle             │
│  - Creates ToolCollection(ComputerTool, BashTool,    │
│    EditTool)                                         │
│  - Calls Anthropic beta API with tool definitions    │
│  - Processes tool_use blocks → executes → appends    │
│    results → loops until no more tool calls          │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│           tools/ (Tool Implementations)              │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────┐ │
│  │ComputerTool│ │ BashTool   │ │ EditTool         │ │
│  │ screenshot │ │ shell exec │ │ view/create/edit │ │
│  │ click/type │ │ persistent │ │ str_replace      │ │
│  │ key/mouse  │ │ bash sess. │ │ insert/undo      │ │
│  └────────────┘ └────────────┘ └──────────────────┘ │
│                                                      │
│  base.py  - ToolResult, BaseAnthropicTool, ToolError │
│  run.py   - async shell execution utility            │
│  collection.py - ToolCollection registry             │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│           Native macOS                               │
│  - screencapture (native screenshot)                 │
│  - cliclick (mouse/keyboard via CLI)                 │
│  - keyboard (Python lib for key combinations)        │
│  - sips (native image resizing)                      │
│  - /bin/bash (persistent shell session)              │
└─────────────────────────────────────────────────────┘
```

### Key Files and Their Roles

| File | Role |
|------|------|
| `streamlit.py` | Main entry point. Streamlit web UI with chat, sidebar config, API provider selection |
| `loop.py` | Core agent loop. `sampling_loop()` function, system prompt, API calls, image filtering |
| `tools/__init__.py` | Package exports: BashTool, ComputerTool, EditTool, ToolCollection, ToolResult |
| `tools/computer.py` | `ComputerTool`: screenshot, mouse, keyboard, coordinate scaling |
| `tools/bash.py` | `BashTool`: persistent bash session with stdin/stdout management |
| `tools/edit.py` | `EditTool`: file view, create, str_replace, insert, undo |
| `tools/base.py` | Abstract base: `BaseAnthropicTool`, `ToolResult` dataclass, `ToolError` |
| `tools/collection.py` | `ToolCollection`: tool registry, dispatch, error wrapping |
| `tools/run.py` | `run()` async shell helper, `maybe_truncate()` for long outputs |
| `setup.sh` | Installs homebrew, python 3.12, cliclick, creates venv |
| `requirements.txt` | Dependencies: streamlit, anthropic, keyboard, pyautogui, etc. |

## 2.2 How Screenshots/Screen Capture Works

```python
async def screenshot(self):
    output_dir = Path("/tmp/outputs")
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"screenshot_{uuid4().hex}.png"
    
    # Use macOS native screencapture (captures entire screen silently)
    screenshot_cmd = f"screencapture -x {path}"
    result = await self.shell(screenshot_cmd, take_screenshot=False)
    
    # Scale down if needed (macOS displays are high-DPI)
    if self._scaling_enabled:
        x, y = SCALE_DESTINATION['width'], SCALE_DESTINATION['height']
        await self.shell(f"sips -z {y} {x} {path}", take_screenshot=False)
    
    if path.exists():
        return result.replace(base64_image=base64.b64encode(path.read_bytes()).decode())
    raise ToolError(f"Failed to take screenshot: {result.error}")
```

**Key details:**
- Uses `screencapture -x` (macOS native, `-x` suppresses sound)
- Files saved with random UUIDs to `/tmp/outputs/`
- **Resolution scaling:** High-res Retina displays are scaled down to FWXGA (1366×768) using `sips` (macOS native image processor) — this is critical because Claude performs better at lower resolutions
- Returns base64-encoded PNG in the `ToolResult`
- Screenshots are attached to tool results and sent back to Claude as images

### Scaling System

```python
MAX_SCALING_TARGETS = {
    "XGA":  Resolution(width=1024, height=768),   # 4:3
    "WXGA": Resolution(width=1280, height=800),    # 16:10
    "FWXGA": Resolution(width=1366, height=768),   # ~16:9
}
SCALE_DESTINATION = MAX_SCALING_TARGETS["FWXGA"]  # Default target
```

Two-way coordinate scaling:
- **API → Computer** (`ScalingSource.API`): Claude outputs coordinates in FWXGA space → scaled UP to actual screen resolution
- **Computer → API** (`ScalingSource.COMPUTER`): Real screen coordinates → scaled DOWN to FWXGA for Claude

```python
def scale_coordinates(self, source: ScalingSource, x, y):
    x_scaling_factor = SCALE_DESTINATION['width'] / self.width
    y_scaling_factor = SCALE_DESTINATION['height'] / self.height
    
    if source == ScalingSource.API:
        return round(x / x_scaling_factor), round(y / y_scaling_factor)
    else:
        return round(x * x_scaling_factor), round(y * y_scaling_factor)
```

## 2.3 How Mouse/Keyboard Actions Are Performed

### Mouse Actions (via cliclick)
`cliclick` is a macOS CLI tool for simulating mouse/keyboard events:

```python
# Mouse move
await self.shell(f"cliclick m:{x},{y}")

# Click at current position  
await self.shell(f"cliclick c:.")    # left click
await self.shell(f"cliclick rc:.")   # right click
await self.shell(f"cliclick dc:.")   # double click
await self.shell(f"cliclick mc:.")   # middle click

# Drag
await self.shell(f"cliclick dd:{x},{y}")  # drag and drop
```

**Note:** Click commands use `c:.` (click at current cursor position), NOT at specific coordinates. Mouse is moved first, then clicked. This is because `coordinate` and click `action` are separate parameters in the tool definition.

### Keyboard Actions (hybrid approach)
Two different mechanisms:
1. **`keyboard` Python library** (for key presses and combos):
   ```python
   key_map = {"Return": "enter", "Tab": "tab", "Escape": "esc", ...}
   
   if "+" in text:  # Combos like "ctrl+c"
       keys = text.split("+")
       mapped_keys = [key_map.get(k.strip(), k.strip()) for k in keys]
       keyboard.press_and_release('+'.join(mapped_keys))
   else:
       keyboard.press_and_release(mapped_key)
   ```
   
2. **`cliclick` CLI** (for typing text):
   ```python
   for chunk in chunks(text, TYPING_GROUP_SIZE):  # 50 chars at a time
       cmd = f"cliclick w:{TYPING_DELAY_MS} t:{shlex.quote(chunk)}"
       results.append(await self.shell(cmd))
   ```

### Why the hybrid?
- `keyboard` library handles modifier keys and combos better (e.g., Cmd+C)
- `cliclick` handles text typing more reliably with configurable delays

## 2.4 Agent Loop (Observe → Think → Act)

The loop is in `sampling_loop()` in `loop.py`:

```python
async def sampling_loop(*, model, provider, system_prompt_suffix,
                        messages, output_callback, tool_output_callback,
                        api_response_callback, api_key, 
                        only_n_most_recent_images=None, max_tokens=4096):
    
    tool_collection = ToolCollection(ComputerTool(), BashTool(), EditTool())
    system = f"{SYSTEM_PROMPT}{suffix}"
    
    while True:
        # Optionally trim old screenshots to save tokens
        if only_n_most_recent_images:
            _maybe_filter_to_n_most_recent_images(messages, only_n_most_recent_images)
        
        # Create API client based on provider
        if provider == APIProvider.ANTHROPIC:
            client = Anthropic(api_key=api_key)
        elif provider == APIProvider.VERTEX:
            client = AnthropicVertex()
        elif provider == APIProvider.BEDROCK:
            client = AnthropicBedrock()
        
        # Call Claude with beta computer-use flag
        raw_response = client.beta.messages.with_raw_response.create(
            max_tokens=max_tokens,
            messages=messages,
            model=model,
            system=system,
            tools=tool_collection.to_params(),
            betas=[BETA_FLAG],  # "computer-use-2024-10-22"
        )
        
        response = raw_response.parse()
        messages.append({"role": "assistant", "content": response.content})
        
        # Process each content block
        tool_result_content = []
        for content_block in response.content:
            output_callback(content_block)
            
            if content_block.type == "tool_use":
                result = await tool_collection.run(
                    name=content_block.name,
                    tool_input=content_block.input,
                )
                tool_result_content.append(
                    _make_api_tool_result(result, content_block.id)
                )
                tool_output_callback(result, content_block.id)
        
        # If no tool calls, we're done
        if not tool_result_content:
            return messages
        
        # Send tool results back as user message
        messages.append({"content": tool_result_content, "role": "user"})
```

**Critical difference from open-computer-use:** There's NO separate observation step. Claude sees screenshots embedded in tool results and reasons about them internally. The loop is:
1. Call Claude with all messages + tool definitions
2. Claude returns text + tool_use blocks
3. Execute each tool, collect results (including screenshots)
4. Append results as user message
5. Repeat until Claude returns no tool_use blocks

### Image Memory Management

```python
def _maybe_filter_to_n_most_recent_images(messages, images_to_keep, 
                                           min_removal_threshold=10):
    # Count total images in all tool_result blocks
    # Remove oldest images, keeping only images_to_keep most recent
    # Remove in chunks of min_removal_threshold for cache efficiency
```

This is a critical optimization: older screenshots are stripped from the conversation to reduce token count. The `min_removal_threshold=10` means images are removed in batches to preserve prompt caching.

## 2.5 Tool Definitions

Uses Anthropic's **beta tool types** — special tool formats that Claude natively understands:

### ComputerTool
```python
name: "computer"
api_type: "computer_20241022"  # Anthropic's native computer-use tool type

# Actions: key, type, mouse_move, left_click, left_click_drag, 
#          right_click, middle_click, double_click, screenshot, cursor_position
# Parameters: action (required), text (for key/type), coordinate (for mouse)
```

### BashTool
```python
name: "bash"
api_type: "bash_20241022"  # Anthropic's native bash tool type

# Parameters: command (str), restart (bool)
# Features: Persistent bash session, 120s timeout, sentinel-based output reading
```

### EditTool
```python
name: "str_replace_editor"
api_type: "text_editor_20241022"  # Anthropic's native editor tool type

# Commands: view, create, str_replace, insert, undo_edit
# Features: File history for undo, snippet display, truncation
```

**Key insight:** These three tools use Anthropic's special beta tool types (`computer_20241022`, `bash_20241022`, `text_editor_20241022`), sent via `betas=["computer-use-2024-10-22"]`. Claude has been specifically trained to use these tool interfaces. The tool schemas are NOT arbitrary — they're Anthropic-defined.

### ToolCollection
```python
class ToolCollection:
    def __init__(self, *tools):
        self.tools = tools
        self.tool_map = {tool.to_params()["name"]: tool for tool in tools}
    
    def to_params(self) -> list[BetaToolUnionParam]:
        return [tool.to_params() for tool in self.tools]
    
    async def run(self, *, name, tool_input) -> ToolResult:
        tool = self.tool_map.get(name)
        if not tool:
            return ToolFailure(error=f"Tool {name} is invalid")
        try:
            return await tool(**tool_input)
        except ToolError as e:
            return ToolFailure(error=e.message)
```

### ToolResult Data Model
```python
@dataclass(kw_only=True, frozen=True)
class ToolResult:
    output: str | None = None        # Text output
    error: str | None = None         # Error message
    base64_image: str | None = None  # Screenshot (base64 PNG)
    system: str | None = None        # System-level messages (e.g., "tool must be restarted")
```

Results are immutable (frozen dataclass), composable via `__add__`, and replaceable via `.replace()`.

## 2.6 The BashTool's Persistent Session

This is architecturally notable:

```python
class _BashSession:
    command = "/bin/bash"
    _timeout = 120.0
    _sentinel = "<<exit>>"
    
    async def start(self):
        self._process = await asyncio.create_subprocess_shell(
            self.command,
            preexec_fn=os.setsid,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    
    async def run(self, command):
        # Write command + sentinel to stdin
        self._process.stdin.write(
            command.encode() + f"; echo '{self._sentinel}'\n".encode()
        )
        # Read stdout buffer until sentinel appears
        while True:
            output = self._process.stdout._buffer.decode()
            if self._sentinel in output:
                output = output[:output.index(self._sentinel)]
                break
        # Clear buffers
        self._process.stdout._buffer.clear()
        self._process.stderr._buffer.clear()
```

**Key pattern:** Uses a sentinel string (`<<exit>>`) appended to each command. Reads the async subprocess buffer directly (`._buffer`) instead of using `readline()` or `communicate()` (which would block). This allows the shell to persist across multiple commands while reliably detecting command completion.

## 2.7 Sandbox/Environment Management

**There is NO sandbox.** The agent runs directly on the host macOS machine. This is the fundamental trade-off:

- **Pro:** No VM overhead, sees the real screen, can interact with real apps
- **Con:** The AI agent has full access to the user's machine

The "environment" is:
- The user's macOS desktop (captured via `screencapture`)
- Mouse/keyboard via `cliclick` + `keyboard` Python lib
- Shell commands via persistent bash subprocess
- File system access via `EditTool` (reads/writes actual files)

## 2.8 Error Handling and Recovery

**Tool level:**
- `ToolError` exceptions are caught by `ToolCollection.run()` and converted to `ToolFailure` results
- `ToolResult` has separate `output` and `error` fields — both are sent to Claude
- `system` field for meta-messages like "tool must be restarted"

**BashTool recovery:**
- 120-second timeout per command
- If timed out, `_timed_out` flag is set, all future commands fail until restart
- `restart=True` parameter kills old session and starts fresh
- If bash process exits, returns error with returncode + "tool must be restarted" system message

**Response truncation:**
- `MAX_RESPONSE_LEN = 16000` characters
- Long outputs are truncated with helpful message: `"<response clipped><NOTE>To save on context only part of this file has been shown to you..."`

**Input validation in ComputerTool:**
- Coordinate type checking (must be list of 2 non-negative ints)
- Mutually exclusive parameter validation (can't send text + coordinate together)
- Action-specific parameter requirements

**API level:**
- Provider validation in `validate_auth()` checks for API keys, AWS credentials, GCP credentials
- Streamlit session state preserved across reruns

## 2.9 LLM Support

Limited to **Anthropic Claude** but through three providers:

| Provider | Class | Default Model |
|----------|-------|---------------|
| Anthropic (direct) | `Anthropic` | `claude-3-5-sonnet-20241022` |
| AWS Bedrock | `AnthropicBedrock` | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| Google Vertex | `AnthropicVertex` | `claude-3-5-sonnet-v2@20241022` |

**Why Claude only?** The `computer_20241022`, `bash_20241022`, and `text_editor_20241022` tool types are Anthropic-specific. The beta flag `computer-use-2024-10-22` enables these special tool types that Claude has been specifically trained on. Other LLMs don't support this interface.

## 2.10 Security Considerations

**⚠️ HIGH RISK — runs on actual machine:**

- **No sandboxing whatsoever.** Agent has full access to the user's macOS
- **cliclick requires Accessibility permissions** — grants ability to control any app
- **screencapture captures the real screen** — can see passwords, private data
- **BashTool can run any command** — full shell access
- **EditTool can read/write any file** — full filesystem access
- **README warning:** "The Anthropic agent can control everything on your Mac. Please be careful."
- **Partial mitigation:** "Claude 3.5 Sonnet refuses to do unsafe things like purchase items or download illegal content" — relies on the model's safety training
- **API key storage:** Saved to `~/.anthropic/api_key` with `chmod 0o600`
- **Streamlit UI:** Runs on localhost:8501

---

# 3. Comparative Analysis

## 3.1 Architecture Philosophy

| Aspect | open-computer-use | mac_computer_use |
|--------|-------------------|------------------|
| **Model Architecture** | 3 models (vision + action + grounding) | 1 model (Claude does everything) |
| **LLM Support** | 10+ providers, any vision/action LLM | Claude only (3 delivery channels) |
| **Environment** | Cloud VM sandbox (E2B) | Native macOS (no sandbox) |
| **UI** | pywebview VNC viewer + terminal REPL | Streamlit web chat |
| **Tool Interface** | Custom `@tool` decorator with NL queries | Anthropic beta tool types |
| **Click Mechanism** | Grounding model (NL → coords) | Claude directly outputs coords |
| **State** | In-memory message list | Streamlit session state |
| **Streaming** | VNC via ffmpeg | N/A (real screen) |

## 3.2 Observe → Think → Act Comparison

**open-computer-use (explicit 3-phase):**
```
1. Vision Model: screenshot → "I see a browser with Google open, search bar visible"
2. Action Model: observation → tool_call(click, query="search bar")
3. Grounding Model: "search bar" + screenshot → (512, 45)
4. Execute: move_mouse(512, 45); left_click()
```

**mac_computer_use (implicit single-phase):**
```
1. Claude receives: all messages + previous tool results (with screenshots)
2. Claude outputs: text reasoning + tool_use(computer, action="left_click", coordinate=[512, 45])
3. Execute: cliclick m:512,45 && cliclick c:.
4. Return: screenshot to Claude as tool_result
```

## 3.3 Security Comparison

| Aspect | open-computer-use | mac_computer_use |
|--------|-------------------|------------------|
| **Isolation** | Full VM isolation (E2B cloud) | None (host machine) |
| **Blast radius** | Limited to ephemeral VM | Entire macOS system |
| **Data exposure** | Only sandbox data | All user data visible |
| **Network** | Sandboxed network | Full network access |
| **Persistence** | VM destroyed after use | Permanent changes to system |
| **Risk level** | Low | High |

## 3.4 Strengths and Weaknesses

### open-computer-use
**Strengths:**
- Multi-model flexibility (swap any LLM)
- Open-source LLM support (Llama, Qwen, etc.)
- Secure cloud sandbox isolation
- Grounding model makes click operations more robust with non-Claude models
- Detailed HTML logging with color-coded actions

**Weaknesses:**
- Requires E2B API key (paid service)
- Three API calls per step (higher latency)
- Fixed 1024×768 resolution
- Grounding models can have accuracy issues
- More complex to set up

### mac_computer_use
**Strengths:**
- Uses Anthropic's purpose-built computer use API (Claude is specifically trained for this)
- Single model = lower latency per step
- Direct access to real macOS apps and environment
- Persistent bash session (maintains state across commands)
- File editing with undo history
- Prompt caching optimization via chunked image removal
- Streamlit UI is polished with HTTP logging

**Weaknesses:**
- Claude-only (no other LLM support)
- No sandboxing — serious security risk
- Runs on your actual machine
- macOS-specific (cliclick, screencapture, sips)
- `import pdb; pdb.set_trace()` left in cursor_position (debug artifact!)
- Limited to what Claude's safety training allows

## 3.5 Key Patterns Worth Adopting

1. **Grounding model abstraction** (open-computer-use): Separating "what to click" from "where it is" is powerful for non-Claude models
2. **Persistent bash session** (mac_computer_use): Sentinel-based output reading with buffer access is elegant
3. **Image memory management** (mac_computer_use): Chunked removal of old screenshots preserves prompt cache
4. **Provider polymorphism** (open-computer-use): Clean class hierarchy makes adding new LLMs trivial
5. **ToolResult composition** (mac_computer_use): Frozen dataclass with `__add__` and `replace()` is a clean pattern
6. **Coordinate scaling** (mac_computer_use): Two-way scaling between model space and screen space
7. **Response truncation** (mac_computer_use): Hard limit on output length with helpful guidance message
