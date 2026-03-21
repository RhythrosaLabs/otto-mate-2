/**
 * Streaming Message Parser — Bolt.new-style real-time parser
 *
 * Parses `<boltArtifact>` and `<boltAction>` tags as they stream in
 * from the LLM, firing callbacks for each open/close event.
 * This enables real-time file creation and action execution while
 * the model is still generating.
 *
 * Based on the open-source Bolt.new architecture:
 * - github.com/stackblitz/bolt.new/blob/main/app/lib/runtime/message-parser.ts
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActionType = "file" | "shell" | "start";

export interface FileAction {
  type: "file";
  filePath: string;
  content: string;
}

export interface ShellAction {
  type: "shell";
  content: string;
}

export interface StartAction {
  type: "start";
  content: string;
}

export type BoltAction = FileAction | ShellAction | StartAction;

export interface BoltArtifactData {
  id: string;
  title: string;
}

export interface ArtifactCallbackData extends BoltArtifactData {
  messageId: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: BoltAction;
}

export interface ParserCallbacks {
  onArtifactOpen?: (data: ArtifactCallbackData) => void;
  onArtifactClose?: (data: ArtifactCallbackData) => void;
  onActionOpen?: (data: ActionCallbackData) => void;
  onActionClose?: (data: ActionCallbackData) => void;
  onActionStream?: (data: ActionCallbackData) => void;
}

export interface StreamingMessageParserOptions {
  callbacks?: ParserCallbacks;
}

// ─── Internal State ─────────────────────────────────────────────────────────

interface MessageState {
  position: number;
  insideArtifact: boolean;
  insideAction: boolean;
  currentArtifact?: BoltArtifactData;
  currentAction: { type?: ActionType; filePath?: string; content: string };
  actionId: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ARTIFACT_TAG_OPEN = "<boltArtifact";
const ARTIFACT_TAG_CLOSE = "</boltArtifact>";
const ARTIFACT_ACTION_TAG_OPEN = "<boltAction";
const ARTIFACT_ACTION_TAG_CLOSE = "</boltAction>";

// ─── Parser Class ───────────────────────────────────────────────────────────

export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();
  #options: StreamingMessageParserOptions;

  constructor(options: StreamingMessageParserOptions = {}) {
    this.#options = options;
  }

  /**
   * Parse incremental input for a given message.
   * Returns the "plain text" portion (everything outside artifacts)
   * so the chat UI can render non-code content.
   */
  parse(messageId: string, input: string): string {
    let state = this.#messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        insideAction: false,
        insideArtifact: false,
        currentAction: { content: "" },
        actionId: 0,
      };
      this.#messages.set(messageId, state);
    }

    let output = "";
    let i = state.position;
    let earlyBreak = false;

    while (i < input.length) {
      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;
        if (!currentArtifact) break;

        if (state.insideAction) {
          const closeIndex = input.indexOf(ARTIFACT_ACTION_TAG_CLOSE, i);
          const currentAction = state.currentAction;

          if (closeIndex !== -1) {
            currentAction.content += input.slice(i, closeIndex);

            let content = currentAction.content.trim();
            if (currentAction.type === "file") {
              content += "\n";
            }
            currentAction.content = content;

            this.#options.callbacks?.onActionClose?.({
              artifactId: currentArtifact.id,
              messageId,
              actionId: String(state.actionId - 1),
              action: currentAction as BoltAction,
            });

            state.insideAction = false;
            state.currentAction = { content: "" };
            i = closeIndex + ARTIFACT_ACTION_TAG_CLOSE.length;
          } else {
            // Still streaming action content — capture what we have and emit a stream event
            const partial = input.slice(i);
            currentAction.content += partial;

            this.#options.callbacks?.onActionStream?.({
              artifactId: currentArtifact.id,
              messageId,
              actionId: String(state.actionId - 1),
              action: { ...currentAction, content: currentAction.content } as BoltAction,
            });

            i = input.length;
            break;
          }
        } else {
          const actionOpenIndex = input.indexOf(ARTIFACT_ACTION_TAG_OPEN, i);
          const artifactCloseIndex = input.indexOf(ARTIFACT_TAG_CLOSE, i);

          if (
            actionOpenIndex !== -1 &&
            (artifactCloseIndex === -1 || actionOpenIndex < artifactCloseIndex)
          ) {
            const actionEndIndex = input.indexOf(">", actionOpenIndex);

            if (actionEndIndex !== -1) {
              state.insideAction = true;
              state.currentAction = this.#parseActionTag(
                input,
                actionOpenIndex,
                actionEndIndex
              );

              this.#options.callbacks?.onActionOpen?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId++),
                action: state.currentAction as BoltAction,
              });

              i = actionEndIndex + 1;
            } else {
              break; // Tag not yet complete
            }
          } else if (artifactCloseIndex !== -1) {
            this.#options.callbacks?.onArtifactClose?.({
              messageId,
              ...currentArtifact,
            });

            state.insideArtifact = false;
            state.currentArtifact = undefined;
            i = artifactCloseIndex + ARTIFACT_TAG_CLOSE.length;
          } else {
            break; // Need more data
          }
        }
      } else if (input[i] === "<" && input[i + 1] !== "/") {
        let j = i;
        let potentialTag = "";

        while (j < input.length && potentialTag.length < ARTIFACT_TAG_OPEN.length) {
          potentialTag += input[j];

          if (potentialTag === ARTIFACT_TAG_OPEN) {
            const nextChar = input[j + 1];

            if (nextChar && nextChar !== ">" && nextChar !== " ") {
              output += input.slice(i, j + 1);
              i = j + 1;
              break;
            }

            const openTagEnd = input.indexOf(">", j);

            if (openTagEnd !== -1) {
              const artifactTag = input.slice(i, openTagEnd + 1);
              const artifactTitle = this.#extractAttribute(artifactTag, "title") || "Untitled";
              const artifactId = this.#extractAttribute(artifactTag, "id") || "artifact";

              state.insideArtifact = true;
              const currentArtifact: BoltArtifactData = {
                id: artifactId,
                title: artifactTitle,
              };
              state.currentArtifact = currentArtifact;

              this.#options.callbacks?.onArtifactOpen?.({
                messageId,
                ...currentArtifact,
              });

              i = openTagEnd + 1;
            } else {
              earlyBreak = true;
            }
            break;
          } else if (!ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
            output += input.slice(i, j + 1);
            i = j + 1;
            break;
          }

          j++;
        }

        if (j === input.length && ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
          break; // Need more data to decide
        }

        if (earlyBreak) break;
      } else {
        output += input[i];
        i++;
      }
    }

    state.position = i;
    return output;
  }

  reset() {
    this.#messages.clear();
  }

  #parseActionTag(
    input: string,
    actionOpenIndex: number,
    actionEndIndex: number
  ): { type?: ActionType; filePath?: string; content: string } {
    const actionTag = input.slice(actionOpenIndex, actionEndIndex + 1);
    const actionType = this.#extractAttribute(actionTag, "type") as ActionType | undefined;

    const attrs: { type?: ActionType; filePath?: string; content: string } = {
      type: actionType,
      content: "",
    };

    if (actionType === "file") {
      const filePath = this.#extractAttribute(actionTag, "filePath");
      if (filePath) {
        attrs.filePath = filePath;
      }
    }

    return attrs;
  }

  #extractAttribute(tag: string, attributeName: string): string | undefined {
    const match = tag.match(new RegExp(`${attributeName}="([^"]*)"`, "i"));
    return match ? match[1] : undefined;
  }
}
