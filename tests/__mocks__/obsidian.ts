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
}

export class Notice {
  constructor(message: string) {
    console.log(`Notice: ${message}`);
  }
}

export class Modal {
  app: App;
  contentEl = document.createElement('div');

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
