// Mock Obsidian API for testing
export class App {
  vault = new Vault();
  metadataCache = new MetadataCache();
}

export class Vault {
  getMarkdownFiles() {
    return [];
  }

  getAbstractFileByPath(path: string) {
    return null;
  }

  createFolder(path: string) {
    return Promise.resolve();
  }

  create(path: string, content: string) {
    return Promise.resolve();
  }

  createBinary(path: string, data: ArrayBuffer) {
    return Promise.resolve();
  }
}

export class MetadataCache {
  getFileCache(file: any) {
    return null;
  }
}

export class Plugin {
  app: App;
  settings: any;

  constructor(app: App, manifest: any) {
    this.app = app;
  }

  loadData() {
    return Promise.resolve({});
  }

  saveData(data: any) {
    return Promise.resolve();
  }

  addRibbonIcon(icon: string, title: string, callback: () => void) {
    return {};
  }

  addCommand(command: any) {
    return {};
  }

  addSettingTab(tab: any) {
    return {};
  }
}

export class PluginSettingTab {
  constructor(app: App, plugin: Plugin) {}

  display() {}
}

export class Setting {
  constructor(containerEl: HTMLElement) {}

  setName(name: string) {
    return this;
  }

  setDesc(desc: string) {
    return this;
  }

  addText(callback: (text: any) => void) {
    const mockText = {
      setPlaceholder: () => mockText,
      setValue: () => mockText,
      onChange: () => mockText,
    };
    callback(mockText);
    return this;
  }

  addToggle(callback: (toggle: any) => void) {
    const mockToggle = {
      setValue: () => mockToggle,
      onChange: () => mockToggle,
    };
    callback(mockToggle);
    return this;
  }

  addButton(callback: (button: any) => void) {
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

  constructor(containerEl: HTMLElement) {}

  getValue() {
    return '';
  }

  setValue(value: string) {
    return this;
  }
}

export function requestUrl(params: any) {
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
