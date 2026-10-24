# Changelog

## [1.3.2](https://github.com/cameronsjo/saved-reddit-exporter/compare/v1.3.1...v1.3.2) (2026-10-24)


### Features

* add automatic OAuth redirect server for seamless authentication ([ef27d54](https://github.com/cameronsjo/saved-reddit-exporter/commit/ef27d54951e4a47acd19450c06b80b9c347883df))
* add automatic semantic versioning with release-please ([#20](https://github.com/cameronsjo/saved-reddit-exporter/issues/20)) ([8425d4f](https://github.com/cameronsjo/saved-reddit-exporter/commit/8425d4f3898c9eaf1bca13cf89059b1401d5c3ff))
* add comprehensive development workflow with automated versioning ([b5ee2ad](https://github.com/cameronsjo/saved-reddit-exporter/commit/b5ee2ad4a3cf5d6f66669494678071e8eb8b5b6b))
* add comprehensive filtering options for Reddit imports ([#16](https://github.com/cameronsjo/saved-reddit-exporter/issues/16)) ([df60f7c](https://github.com/cameronsjo/saved-reddit-exporter/commit/df60f7c3f55565ae1d1938675846fc8c30a47ac7))
* add comprehensive testing, code quality, and GitHub templates ([2e1fd5f](https://github.com/cameronsjo/saved-reddit-exporter/commit/2e1fd5f5b90bb5a1185c7a59afc892efb3d34d44))
* add custom folder and filename templates [beta] ([3cc28e2](https://github.com/cameronsjo/saved-reddit-exporter/commit/3cc28e2d01d0309c8e25f9ec28589de0e45ec4ce))
* add enhanced progress tracking and Obsidian integration ([8bb714e](https://github.com/cameronsjo/saved-reddit-exporter/commit/8bb714e3c4b697879fbb4fc67f62336dcaf185ce))
* add enhanced Reddit API coverage with multiple content types ([#18](https://github.com/cameronsjo/saved-reddit-exporter/issues/18)) ([886b059](https://github.com/cameronsjo/saved-reddit-exporter/commit/886b0598f9367ad1718bd18b168e8a921bde28cc))
* add export to JSON and CSV [beta] ([3b52ff4](https://github.com/cameronsjo/saved-reddit-exporter/commit/3b52ff46f661f25aca653d45252ad9fbd85ec12a))
* add foolproof release automation ([d5dd79e](https://github.com/cameronsjo/saved-reddit-exporter/commit/d5dd79ee2c366a4c6d3c98437e5df96224f988d1))
* add gallery, poll, awards, and link preservation support [beta] ([7704260](https://github.com/cameronsjo/saved-reddit-exporter/commit/7704260a80163de18c23b8d0b53694debbb2bb51))
* add performance and reliability improvements for large imports ([0910fc5](https://github.com/cameronsjo/saved-reddit-exporter/commit/0910fc59425363115256f11ee8317784aa548713))
* add performance and reliability improvements for large imports ([0a84896](https://github.com/cameronsjo/saved-reddit-exporter/commit/0a84896a8282dc9bd2623bf07cbc2b2f9c6231af)), closes [#12](https://github.com/cameronsjo/saved-reddit-exporter/issues/12)
* add saved comments export and subreddit folder organization ([#17](https://github.com/cameronsjo/saved-reddit-exporter/issues/17)) ([f4d510f](https://github.com/cameronsjo/saved-reddit-exporter/commit/f4d510f7acc48528fd15ae2568a08379ca892bf7))
* add Sync Manager for vault/Reddit synchronization [beta] ([5b369fd](https://github.com/cameronsjo/saved-reddit-exporter/commit/5b369fdfeff000265630c49454a90a25627e156e))
* add Templater integration and comment tree support [beta] ([2085e85](https://github.com/cameronsjo/saved-reddit-exporter/commit/2085e857d889b076e7bdbb97cc3a291239da5e90))
* **auth:** add full mobile OAuth support [beta] ([3516758](https://github.com/cameronsjo/saved-reddit-exporter/commit/35167583a42e35b04415595a3190820772032c6b))
* automagic beta releases for BRAT on every releasable commit ([1fa9b9d](https://github.com/cameronsjo/saved-reddit-exporter/commit/1fa9b9d6c13e16e83c23daa65f40a34056c6e540))
* fix auto-unsave functionality for imported posts ([#19](https://github.com/cameronsjo/saved-reddit-exporter/issues/19)) ([ec72318](https://github.com/cameronsjo/saved-reddit-exporter/commit/ec723187c8d944257f58b1beedccb7ae03da54c9))
* implement Beta → RC → Stable release pipeline ([a784631](https://github.com/cameronsjo/saved-reddit-exporter/commit/a784631561e694530ea899afcf872736f7af3c81))
* improve media handling with wiki links and gallery URL support ([c70b608](https://github.com/cameronsjo/saved-reddit-exporter/commit/c70b608e54e092e781784fd7c6d9eac556cb9f1c))
* improve release workflow and add BRAT support ([5c1e84b](https://github.com/cameronsjo/saved-reddit-exporter/commit/5c1e84b75a91261fecf40a298693519ebf3d9e25))
* **main:** rewire entry points to Sync Manager ([ae6cdfd](https://github.com/cameronsjo/saved-reddit-exporter/commit/ae6cdfd8d951c2773fab92d031a5bab5c33e4226))
* sanitize filenames to remove emojis and problematic Unicode ([4852f30](https://github.com/cameronsjo/saved-reddit-exporter/commit/4852f30e7c839d970631c5782c7e85f33ec4cbd7))
* sanitize filenames to remove emojis and problematic Unicode ([fc44bbf](https://github.com/cameronsjo/saved-reddit-exporter/commit/fc44bbf9f9d0db95dc5cde4ebfee437c00bf32e8))
* settings reorganization and sync manager UX improvements ([f29d139](https://github.com/cameronsjo/saved-reddit-exporter/commit/f29d139b7ca06992966a8721338856ba07e1a701))
* **settings:** add collapsible section utility with persisted state ([441c645](https://github.com/cameronsjo/saved-reddit-exporter/commit/441c64568d6e2385bfe0490be1bdd1562d4bad3f))
* **settings:** add comment limit, sort, and depth options ([656dccd](https://github.com/cameronsjo/saved-reddit-exporter/commit/656dccd652a3bb91b12ec7f542aa12d51f2af18c))
* **settings:** add credential backup/restore for safe OAuth testing [beta] ([e95dd4b](https://github.com/cameronsjo/saved-reddit-exporter/commit/e95dd4b05e2259355a63682800b02f51c1042d64))
* **settings:** reorganize into 5 tabs with extracted render functions ([2799084](https://github.com/cameronsjo/saved-reddit-exporter/commit/27990846623d243044b7aab20c4f50336fea51a3))
* significantly improve test coverage and add comprehensive tests ([1744b70](https://github.com/cameronsjo/saved-reddit-exporter/commit/1744b70844745ee2a1bb753599b9e5bc6e4787e1))
* support multi-ID frontmatter for merged files [beta] ([4bbd672](https://github.com/cameronsjo/saved-reddit-exporter/commit/4bbd672f605a248f0ebf2ed8b3a0b593c728bbd6))
* **sync-manager:** add cache methods for instant modal open ([c97040f](https://github.com/cameronsjo/saved-reddit-exporter/commit/c97040f078124b1a2f1289402abe44a98c4d95a7))
* **sync-modal:** add checkpoint resume banner ([dca3272](https://github.com/cameronsjo/saved-reddit-exporter/commit/dca3272960a0e2624f7d90330e12d7a0090bc2c8))
* **sync-modal:** add refresh button, timestamp, and empty state ([c98aa94](https://github.com/cameronsjo/saved-reddit-exporter/commit/c98aa94196961a7a38b5d2a165d53a2058a47619))
* **sync:** improve sync manager UX with better labels and controls ([34c64c1](https://github.com/cameronsjo/saved-reddit-exporter/commit/34c64c168f967863c88c12d04ff46cc115ec1220))
* **types:** add SyncCache interface for instant sync manager open ([3a54da3](https://github.com/cameronsjo/saved-reddit-exporter/commit/3a54da3012b772428d1f3dbda45824021b221113))


### Bug Fixes

* add missing eslint ([cbb004a](https://github.com/cameronsjo/saved-reddit-exporter/commit/cbb004a2945b931fd91d2733fc2517cd87c8fc84))
* add progress indicator for reprocess operations ([01b752c](https://github.com/cameronsjo/saved-reddit-exporter/commit/01b752c06a4072afb72101606a1088e5bfc134d3))
* address CodeRabbit review feedback ([533225f](https://github.com/cameronsjo/saved-reddit-exporter/commit/533225f3883d1e6c6837feb1319078946c12909e))
* address Obsidian plugin submission requirements ([6621558](https://github.com/cameronsjo/saved-reddit-exporter/commit/6621558d16a6d97918ed4bba8c30e4f34f8a3e80))
* address pre-existing issues flagged by CodeRabbit ([fb8ec9b](https://github.com/cameronsjo/saved-reddit-exporter/commit/fb8ec9bb955bd969ac6eba2f250755e50a4c86d4))
* apply Obsidian plugin review sentence-case requirements ([93f6571](https://github.com/cameronsjo/saved-reddit-exporter/commit/93f6571ab978bee2eef575d916693db335cf7e9f))
* **auth:** use kebab-case keys in setCssProps ([b223ef9](https://github.com/cameronsjo/saved-reddit-exporter/commit/b223ef98c40e50f6e7ac6696bc4049922d05760f))
* camelCase setCssProps keys and manifest.json version bump ([#40](https://github.com/cameronsjo/saved-reddit-exporter/issues/40)) ([7fc4ae9](https://github.com/cameronsjo/saved-reddit-exporter/commit/7fc4ae9c15243b3cae0154d955391968b79c17cb))
* **ci:** extract base version before building prerelease tags ([cade63f](https://github.com/cameronsjo/saved-reddit-exporter/commit/cade63f08f9b01a875c3e9a80d64431755ac9d99))
* **ci:** let release-please read its config so manifest.json is bumped ([239aab4](https://github.com/cameronsjo/saved-reddit-exporter/commit/239aab45e592b76895337962ee7814691fca2961))
* **deps:** clear high and critical npm audit findings ([f129216](https://github.com/cameronsjo/saved-reddit-exporter/commit/f1292160e261799cff67de2a228c41f3664508f1))
* **deps:** clear high and critical npm audit findings ([162a83a](https://github.com/cameronsjo/saved-reddit-exporter/commit/162a83a3c715061c353b89b4f9acf9dab95ab788))
* enrich comment data during reprocess [beta] ([5c97d06](https://github.com/cameronsjo/saved-reddit-exporter/commit/5c97d06d2541b19504e31a4a2bed6c15d2c67501))
* ensure compliance with Obsidian plugin guidelines ([bd3fb44](https://github.com/cameronsjo/saved-reddit-exporter/commit/bd3fb44aed7a43a328bceed12cf9e8031f3b26ce))
* expand sync manager modal for better usability ([8d70390](https://github.com/cameronsjo/saved-reddit-exporter/commit/8d7039061cfe3adcb4a67b0fcce5dfeb8a36edff))
* improve test coverage and fix Jest configuration ([824752b](https://github.com/cameronsjo/saved-reddit-exporter/commit/824752b284c65f5879f73ad195124c5aa52a1800))
* make Sync Manager modal wider and responsive [beta] ([f54c0a1](https://github.com/cameronsjo/saved-reddit-exporter/commit/f54c0a1db984d9fae79b3a9cf953b60c8bcac887))
* **release:** reset version files to clean 1.3.1 and fix tag matching ([8ca2f10](https://github.com/cameronsjo/saved-reddit-exporter/commit/8ca2f10214eb7371202ff5711d1d17bdbe413bda))
* remove paths-ignore to allow empty beta commits [beta] ([dcdd209](https://github.com/cameronsjo/saved-reddit-exporter/commit/dcdd20977d6bf626e2805333713665a654978cd9))
* resolve all ESLint errors and improve type safety ([cf5b051](https://github.com/cameronsjo/saved-reddit-exporter/commit/cf5b0511a5fcefe9bd93de56c711406e57ec30c4))
* resolve all Obsidian plugin review ESLint errors ([68921ec](https://github.com/cameronsjo/saved-reddit-exporter/commit/68921ece2850a12719196193aaeef96bde37c8c7))
* resolve all remaining test failures and achieve 100% pass rate ([86455d9](https://github.com/cameronsjo/saved-reddit-exporter/commit/86455d930f024847f1063b1be49d23a2a33b9aef))
* resolve quick presets overflow and improve mobile styles ([e41d32b](https://github.com/cameronsjo/saved-reddit-exporter/commit/e41d32b8ca7f0cd74f086aa342f71352aaf1f13a))
* resolve quick presets overflow and improve mobile styles ([3f4b1a0](https://github.com/cameronsjo/saved-reddit-exporter/commit/3f4b1a0e9b180beba3b5406050fa79393631f266))
* resolve test failures and improve media detection logic ([da13945](https://github.com/cameronsjo/saved-reddit-exporter/commit/da1394572342523b6e6511ec0ef2cb4746be19c0))
* resolve TypeScript compilation errors and dependency issues ([417bc52](https://github.com/cameronsjo/saved-reddit-exporter/commit/417bc52fc02cb9398ddfe4ec800d38c8afabeffa))
* **security:** address XSS vulnerabilities and resource leaks ([323fbff](https://github.com/cameronsjo/saved-reddit-exporter/commit/323fbffa7165eb9e8a19f2ec77724a8db5390012))
* **sync:** remove duplicate CSS and dead styles from sync modal ([a9497de](https://github.com/cameronsjo/saved-reddit-exporter/commit/a9497defa2eedd023d0ee8040b2f099ab328e312))
* update GitHub Actions workflow to use modern actions ([01dd5de](https://github.com/cameronsjo/saved-reddit-exporter/commit/01dd5dedb92a9f974a42198d64c72019552cf6c1))
* update versions.json to match manifest minAppVersion ([30737b0](https://github.com/cameronsjo/saved-reddit-exporter/commit/30737b0dfb12e0e582e9436d31e6ea5929e44504))
* use [beta] keyword to trigger beta releases ([1833462](https://github.com/cameronsjo/saved-reddit-exporter/commit/1833462da270b82a5780f5fde1ea961aa115c516))
* use correct release-please output for PR condition ([4be9062](https://github.com/cameronsjo/saved-reddit-exporter/commit/4be906243c0bcd3e82a66c562087a5fff389db58))
* use simple branch naming for release-please ([81f952f](https://github.com/cameronsjo/saved-reddit-exporter/commit/81f952f60ccf9ba52cbd0a3f71b01fab1d55bccf))

## [1.3.1-beta.32+5b369fd](https://github.com/cameronsjo/saved-reddit-exporter/compare/v1.3.0-beta.32+5b369fd...v1.3.1-beta.32+5b369fd) (2026-10-17)


### Bug Fixes

* **deps:** clear high and critical npm audit findings ([f129216](https://github.com/cameronsjo/saved-reddit-exporter/commit/f1292160e261799cff67de2a228c41f3664508f1))
* **deps:** clear high and critical npm audit findings ([162a83a](https://github.com/cameronsjo/saved-reddit-exporter/commit/162a83a3c715061c353b89b4f9acf9dab95ab788))

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
