// Mock Obsidian API for testing
export class App {
  vault = new Vault();
  metadataCache = new MetadataCache();
}

export class Vault {
  getMarkdownFiles() {
    return [];
  }

  getAbstractFileByPath(_path: string) {
    return null;
  }

  createFolder(_path: string) {
    return Promise.resolve();
  }

  create(_path: string, _content: string) {
    return Promise.resolve();
  }

  createBinary(_path: string, _data: ArrayBuffer) {
    return Promise.resolve();
  }
}

export class MetadataCache {
  getFileCache(_file: unknown) {
    return null;
  }
}

export class Plugin {
  app: App;
  settings: unknown;

  constructor(app: App, _manifest: unknown) {
    this.app = app;
  }

  loadData() {
    return Promise.resolve({});
  }

  saveData(_data: unknown) {
    return Promise.resolve();
  }

  addRibbonIcon(_icon: string, _title: string, _callback: () => void) {
    return {};
  }

  addCommand(_command: unknown) {
    return {};
  }

  addSettingTab(_tab: unknown) {
    return {};
  }
}

export class PluginSettingTab {
  constructor(_app: App, _plugin: Plugin) {}

  display() {}
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}

  setName(_name: string) {
    return this;
  }

  setDesc(_desc: string) {
    return this;
  }

  addText(callback: (text: unknown) => void) {
    const mockText = {
      setPlaceholder: () => mockText,
      setValue: () => mockText,
      onChange: () => mockText,
    };
    callback(mockText);
    return this;
  }

  addToggle(callback: (toggle: unknown) => void) {
    const mockToggle = {
      setValue: () => mockToggle,
      onChange: () => mockToggle,
    };
    callback(mockToggle);
    return this;
  }

  addButton(callback: (button: unknown) => void) {
    const mockButton = {
      setButtonText: () => mockButton,
      setCta: () => mockButton,
      onClick: () => mockButton,
    };
    callback(mockButton);
    return this;
  }

  addDropdown(callback: (dropdown: unknown) => void) {
    const mockDropdown = {
      addOption: () => mockDropdown,
      setValue: () => mockDropdown,
      onChange: () => mockDropdown,
    };
    callback(mockDropdown);
    return this;
  }

  setHeading() {
    return this;
  }
}

export class Notice {
  constructor(message: string) {
    console.log(`Notice: ${message}`);
  }
}

// Helper to create mock HTML element with Obsidian's extensions
function createMockElement(tag = 'div'): HTMLElement {
  const el = document.createElement(tag);
  (el as HTMLElement & { empty: () => void }).empty = function () {
    this.innerHTML = '';
  };
  (el as HTMLElement & { createEl: typeof createMockElement }).createEl = function (
    tagName: string,
    options?: { text?: string; type?: string; value?: string; placeholder?: string }
  ) {
    const child = createMockElement(tagName);
    if (options?.text) child.textContent = options.text;
    if (options?.type) (child as HTMLInputElement).type = options.type;
    if (options?.value) (child as HTMLInputElement).value = options.value;
    if (options?.placeholder) (child as HTMLInputElement).placeholder = options.placeholder;
    this.appendChild(child);
    return child;
  };
  (el as HTMLElement & { createDiv: () => HTMLElement }).createDiv = function () {
    return this.createEl('div');
  };
  (el as HTMLElement & { addClass: (cls: string) => void }).addClass = function (cls: string) {
    this.classList.add(cls);
  };
  (el as HTMLElement & { setCssProps: (props: Record<string, string>) => void }).setCssProps =
    function (props: Record<string, string>) {
      Object.assign(this.style, props);
    };
  return el;
}

export class Modal {
  app: App;
  contentEl = createMockElement('div');
  scope = {
    register: jest.fn(),
  };

  constructor(app: App) {
    this.app = app;
  }

  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export class TextComponent {
  inputEl = document.createElement('input');

  constructor(_containerEl: HTMLElement) {}

  getValue() {
    return '';
  }

  setValue(_value: string) {
    return this;
  }
}

export function requestUrl(_params: unknown) {
  return Promise.resolve({
    status: 200,
    json: {},
    arrayBuffer: new ArrayBuffer(0),
    headers: {},
  });
}

export function normalizePath(path: string) {
  return path.replace(/\\/g, '/');
}
