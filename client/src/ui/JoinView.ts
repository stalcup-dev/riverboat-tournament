import { LOCKED_NAME_POOL, pickRandomLockedName } from "../game/identity";

export interface CreateMatchValue {
  name: string;
  serverUrlOverride?: string;
}

export interface JoinMatchValue extends CreateMatchValue {
  code: string;
}

interface JoinViewOptions {
  defaultServerUrl: string;
  allowHostOverride: boolean;
}

type CreateMatchHandler = (value: CreateMatchValue) => Promise<{ code: string } | void> | { code: string } | void;
type JoinMatchHandler = (value: JoinMatchValue) => Promise<void> | void;
type WakeServerHandler = (value: CreateMatchValue) => Promise<void> | void;

export class JoinView {
  private readonly root: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly subtitle: HTMLParagraphElement;
  private readonly nameRow: HTMLDivElement;
  private readonly nameValue: HTMLSpanElement;
  private readonly randomNameButton: HTMLButtonElement;
  private readonly hostInput?: HTMLInputElement;
  private readonly createButton: HTMLButtonElement;
  private readonly wakeButton: HTMLButtonElement;
  private readonly joinButton: HTMLButtonElement;
  private readonly joinCodeInput: HTMLInputElement;
  private readonly copyCodeButton: HTMLButtonElement;
  private readonly matchCodeValue: HTMLSpanElement;
  private readonly createdCodeRow: HTMLDivElement;
  private readonly statusText: HTMLParagraphElement;
  private readonly toastText: HTMLDivElement;
  private createHandler?: CreateMatchHandler;
  private joinHandler?: JoinMatchHandler;
  private wakeHandler?: WakeServerHandler;
  private readonly usedNames = new Set<string>();
  private currentName = "Player";
  private currentMatchCode = "";
  private toastHideTimer: number | undefined;

  constructor(options: JoinViewOptions) {
    this.root = document.createElement("div");
    this.root.className = "join-overlay";

    this.card = document.createElement("div");
    this.card.className = "join-card";
    this.root.appendChild(this.card);

    this.title = document.createElement("h1");
    this.title.textContent = "Riverboat Tournament";
    this.card.appendChild(this.title);

    this.subtitle = document.createElement("p");
    this.subtitle.className = "join-subtitle";
    this.subtitle.textContent = "Dedicated server mode - create or join by code";
    this.card.appendChild(this.subtitle);

    const form = document.createElement("form");
    form.className = "join-form";
    this.card.appendChild(form);

    this.nameRow = document.createElement("div");
    this.nameRow.className = "name-row";
    form.appendChild(this.nameRow);

    const nameLabel = document.createElement("span");
    nameLabel.className = "name-label";
    nameLabel.textContent = "Name";
    this.nameRow.appendChild(nameLabel);

    this.nameValue = document.createElement("span");
    this.nameValue.className = "name-value";
    this.nameRow.appendChild(this.nameValue);

    this.randomNameButton = document.createElement("button");
    this.randomNameButton.type = "button";
    this.randomNameButton.textContent = "Random Name";
    this.randomNameButton.addEventListener("click", () => {
      this.rollName();
    });
    form.appendChild(this.randomNameButton);

    if (options.allowHostOverride) {
      this.hostInput = document.createElement("input");
      this.hostInput.name = "host_override";
      this.hostInput.placeholder = "Server URL Override (dev only)";
      this.hostInput.value = options.defaultServerUrl;
      form.appendChild(this.hostInput);
    }

    this.createButton = document.createElement("button");
    this.createButton.type = "button";
    this.createButton.textContent = "Create Match";
    form.appendChild(this.createButton);

    this.wakeButton = document.createElement("button");
    this.wakeButton.type = "button";
    this.wakeButton.textContent = "Wake Server";
    form.appendChild(this.wakeButton);

    this.createdCodeRow = document.createElement("div");
    this.createdCodeRow.className = "code-row";
    this.createdCodeRow.style.display = "none";
    form.appendChild(this.createdCodeRow);

    const codeLabel = document.createElement("span");
    codeLabel.className = "code-label";
    codeLabel.textContent = "Code";
    this.createdCodeRow.appendChild(codeLabel);

    this.matchCodeValue = document.createElement("span");
    this.matchCodeValue.className = "code-value";
    this.matchCodeValue.textContent = "-----";
    this.createdCodeRow.appendChild(this.matchCodeValue);

    this.copyCodeButton = document.createElement("button");
    this.copyCodeButton.type = "button";
    this.copyCodeButton.textContent = "Copy";
    this.copyCodeButton.disabled = true;
    this.createdCodeRow.appendChild(this.copyCodeButton);

    this.joinCodeInput = document.createElement("input");
    this.joinCodeInput.name = "join_code";
    this.joinCodeInput.placeholder = "Enter Code (ABCDE)";
    this.joinCodeInput.maxLength = 5;
    form.appendChild(this.joinCodeInput);

    this.joinButton = document.createElement("button");
    this.joinButton.type = "button";
    this.joinButton.textContent = "Join Match";
    form.appendChild(this.joinButton);

    this.statusText = document.createElement("p");
    this.statusText.className = "join-status";
    this.statusText.textContent = "";
    this.card.appendChild(this.statusText);

    this.toastText = document.createElement("div");
    this.toastText.className = "join-toast";
    this.toastText.style.display = "none";
    this.card.appendChild(this.toastText);

    this.createButton.addEventListener("click", async () => {
      if (!this.createHandler) {
        return;
      }

      this.setLoading(true);
      this.setStatus("Creating match...");
      try {
        const result = await this.createHandler({
          name: this.currentName,
          serverUrlOverride: this.hostInput?.value
        });
        if (result?.code) {
          this.setCode(result.code);
        }
      } catch (error) {
        this.setStatus(error instanceof Error ? error.message : "Create failed.");
      } finally {
        this.setLoading(false);
      }
    });

    this.joinButton.addEventListener("click", async () => {
      if (!this.joinHandler) {
        return;
      }

      const code = this.joinCodeInput.value.trim().toUpperCase();
      if (!code) {
        this.setStatus("Enter a match code.");
        return;
      }

      this.setLoading(true);
      this.setStatus("Joining match...");
      try {
        await this.joinHandler({
          name: this.currentName,
          code,
          serverUrlOverride: this.hostInput?.value
        });
      } catch (error) {
        this.setStatus(error instanceof Error ? error.message : "Join failed.");
      } finally {
        this.setLoading(false);
      }
    });
    this.wakeButton.addEventListener("click", async () => {
      if (!this.wakeHandler) {
        return;
      }

      this.setLoading(true);
      this.setStatus("Waking server...");
      try {
        await this.wakeHandler({
          name: this.currentName,
          serverUrlOverride: this.hostInput?.value
        });
        this.showToast("Server is awake.", "info");
      } catch (error) {
        this.showToast(error instanceof Error ? error.message : "Wake failed.", "error");
      } finally {
        this.setLoading(false);
      }
    });

    this.joinCodeInput.addEventListener("input", () => {
      this.joinCodeInput.value = this.joinCodeInput.value.toUpperCase().replace(/[^A-Z2-9]/g, "");
    });
    this.copyCodeButton.addEventListener("click", async () => {
      await this.copyCurrentCode();
    });

    this.rollName();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  hide(): void {
    this.root.classList.remove("join-overlay--dock");
    this.root.style.display = "none";
  }

  setStatus(text: string): void {
    this.statusText.textContent = text;
  }

  showToast(message: string, type: "info" | "error" = "info", ttlMs = 2500): void {
    this.setStatus(message);
    this.toastText.textContent = message;
    this.toastText.className = `join-toast join-toast--${type}`;
    this.toastText.style.display = "block";

    if (this.toastHideTimer !== undefined) {
      window.clearTimeout(this.toastHideTimer);
      this.toastHideTimer = undefined;
    }

    this.toastHideTimer = window.setTimeout(() => {
      this.toastText.style.display = "none";
      this.toastHideTimer = undefined;
    }, ttlMs);
  }

  setCode(code: string): void {
    this.currentMatchCode = code;
    this.matchCodeValue.textContent = code;
    this.createdCodeRow.style.display = "";
    this.copyCodeButton.disabled = false;
  }

  async copyCurrentCode(): Promise<boolean> {
    if (!this.currentMatchCode) {
      this.showToast("No code to copy.", "error");
      return false;
    }

    try {
      await navigator.clipboard.writeText(this.currentMatchCode);
      this.showToast("Code copied!", "info");
      return true;
    } catch {
      this.showToast("Copy failed - select manually.", "error");
      return false;
    }
  }

  showCodeDock(): void {
    this.root.style.display = "flex";
    this.root.classList.add("join-overlay--dock");
    this.title.style.display = "none";
    this.subtitle.style.display = "none";
    this.nameRow.style.display = "none";
    this.randomNameButton.style.display = "none";
    this.createButton.style.display = "none";
    this.wakeButton.style.display = "none";
    this.joinCodeInput.style.display = "none";
    this.joinButton.style.display = "none";
    if (this.hostInput) {
      this.hostInput.style.display = "none";
    }
  }

  setLoading(isLoading: boolean): void {
    this.randomNameButton.disabled = isLoading;
    if (this.hostInput) {
      this.hostInput.disabled = isLoading;
    }
    this.joinCodeInput.disabled = isLoading;
    this.createButton.disabled = isLoading;
    this.wakeButton.disabled = isLoading;
    this.joinButton.disabled = isLoading;
    this.copyCodeButton.disabled = isLoading || !this.currentMatchCode;
    this.createButton.textContent = isLoading ? "Working..." : "Create Match";
    this.wakeButton.textContent = isLoading ? "Waking..." : "Wake Server";
    this.joinButton.textContent = isLoading ? "Working..." : "Join Match";
  }

  onCreateMatch(handler: CreateMatchHandler): void {
    this.createHandler = handler;
  }

  onJoinMatch(handler: JoinMatchHandler): void {
    this.joinHandler = handler;
  }

  onWakeServer(handler: WakeServerHandler): void {
    this.wakeHandler = handler;
  }

  rollDifferentName(excludedNames?: ReadonlySet<string>): string | null {
    const blocked = new Set<string>(excludedNames ?? []);
    blocked.add(this.currentName);

    const candidates = LOCKED_NAME_POOL.filter((name) => !blocked.has(name));
    if (candidates.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * candidates.length);
    const selected = candidates[randomIndex] ?? null;
    if (!selected) {
      return null;
    }

    this.currentName = selected;
    this.usedNames.add(selected);
    this.nameValue.textContent = selected;
    return selected;
  }

  private rollName(): void {
    const selected = pickRandomLockedName(this.usedNames);
    this.currentName = selected;
    this.usedNames.add(selected);
    this.nameValue.textContent = selected;
  }
}
