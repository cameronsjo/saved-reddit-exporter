# Changelog

## [1.3.0-beta.32+5b369fd](https://github.com/cameronsjo/saved-reddit-exporter/compare/v1.2.0-beta.32+5b369fd...v1.3.0-beta.32+5b369fd) (2026-04-01)


### Features

* add enhanced progress tracking and Obsidian integration ([8bb714e](https://github.com/cameronsjo/saved-reddit-exporter/commit/8bb714e3c4b697879fbb4fc67f62336dcaf185ce))
* **main:** rewire entry points to Sync Manager ([ae6cdfd](https://github.com/cameronsjo/saved-reddit-exporter/commit/ae6cdfd8d951c2773fab92d031a5bab5c33e4226))
* settings reorganization and sync manager UX improvements ([f29d139](https://github.com/cameronsjo/saved-reddit-exporter/commit/f29d139b7ca06992966a8721338856ba07e1a701))
* **settings:** add collapsible section utility with persisted state ([441c645](https://github.com/cameronsjo/saved-reddit-exporter/commit/441c64568d6e2385bfe0490be1bdd1562d4bad3f))
* **settings:** add comment limit, sort, and depth options ([656dccd](https://github.com/cameronsjo/saved-reddit-exporter/commit/656dccd652a3bb91b12ec7f542aa12d51f2af18c))
* **settings:** reorganize into 5 tabs with extracted render functions ([2799084](https://github.com/cameronsjo/saved-reddit-exporter/commit/27990846623d243044b7aab20c4f50336fea51a3))
* **sync-manager:** add cache methods for instant modal open ([c97040f](https://github.com/cameronsjo/saved-reddit-exporter/commit/c97040f078124b1a2f1289402abe44a98c4d95a7))
* **sync-modal:** add checkpoint resume banner ([dca3272](https://github.com/cameronsjo/saved-reddit-exporter/commit/dca3272960a0e2624f7d90330e12d7a0090bc2c8))
* **sync-modal:** add refresh button, timestamp, and empty state ([c98aa94](https://github.com/cameronsjo/saved-reddit-exporter/commit/c98aa94196961a7a38b5d2a165d53a2058a47619))
* **sync:** improve sync manager UX with better labels and controls ([34c64c1](https://github.com/cameronsjo/saved-reddit-exporter/commit/34c64c168f967863c88c12d04ff46cc115ec1220))
* **types:** add SyncCache interface for instant sync manager open ([3a54da3](https://github.com/cameronsjo/saved-reddit-exporter/commit/3a54da3012b772428d1f3dbda45824021b221113))


### Bug Fixes

* address CodeRabbit review feedback ([533225f](https://github.com/cameronsjo/saved-reddit-exporter/commit/533225f3883d1e6c6837feb1319078946c12909e))
* address pre-existing issues flagged by CodeRabbit ([fb8ec9b](https://github.com/cameronsjo/saved-reddit-exporter/commit/fb8ec9bb955bd969ac6eba2f250755e50a4c86d4))
* **security:** address XSS vulnerabilities and resource leaks ([323fbff](https://github.com/cameronsjo/saved-reddit-exporter/commit/323fbffa7165eb9e8a19f2ec77724a8db5390012))
* **sync:** remove duplicate CSS and dead styles from sync modal ([a9497de](https://github.com/cameronsjo/saved-reddit-exporter/commit/a9497defa2eedd023d0ee8040b2f099ab328e312))

## [1.2.0-beta.32+5b369fd](https://github.com/cameronsjo/saved-reddit-exporter/compare/v1.1.1-beta.32+5b369fd...v1.2.0-beta.32+5b369fd) (2026-01-02)


### Features

* **auth:** add full mobile OAuth support [beta] ([3516758](https://github.com/cameronsjo/saved-reddit-exporter/commit/35167583a42e35b04415595a3190820772032c6b))
* **settings:** add credential backup/restore for safe OAuth testing [beta] ([e95dd4b](https://github.com/cameronsjo/saved-reddit-exporter/commit/e95dd4b05e2259355a63682800b02f51c1042d64))


### Bug Fixes

* apply Obsidian plugin review sentence-case requirements ([93f6571](https://github.com/cameronsjo/saved-reddit-exporter/commit/93f6571ab978bee2eef575d916693db335cf7e9f))
* **ci:** extract base version before building prerelease tags ([cade63f](https://github.com/cameronsjo/saved-reddit-exporter/commit/cade63f08f9b01a875c3e9a80d64431755ac9d99))
* resolve quick presets overflow and improve mobile styles ([e41d32b](https://github.com/cameronsjo/saved-reddit-exporter/commit/e41d32b8ca7f0cd74f086aa342f71352aaf1f13a))
* resolve quick presets overflow and improve mobile styles ([3f4b1a0](https://github.com/cameronsjo/saved-reddit-exporter/commit/3f4b1a0e9b180beba3b5406050fa79393631f266))

## [1.1.1-beta.32+5b369fd](https://github.com/cameronsjo/saved-reddit-exporter/compare/1.1.0-beta.32+5b369fd...v1.1.1-beta.32+5b369fd) (2025-11-30)


### Bug Fixes

* make Sync Manager modal wider and responsive [beta] ([f54c0a1](https://github.com/cameronsjo/saved-reddit-exporter/commit/f54c0a1db984d9fae79b3a9cf953b60c8bcac887))
