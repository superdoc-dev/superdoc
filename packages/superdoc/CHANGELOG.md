# [1.14.0](https://github.com/superdoc-dev/superdoc/compare/v1.13.1...v1.14.0) (2026-02-17)


### Bug Fixes

* **build:** remove dead vite-plugin-node-polyfills from UMD externals ([91de1fc](https://github.com/superdoc-dev/superdoc/commit/91de1fc2e47b0061d088db5d46b0da4cc07dc837))
* **converter:** handle empty rPrChange run properties without dropping tracked-style runs ([c25d24d](https://github.com/superdoc-dev/superdoc/commit/c25d24d35534c39836c3251ee9baf1b908a6c78c))
* correctly pass table info when deriving inline run properties (SD-1865) ([#2007](https://github.com/superdoc-dev/superdoc/issues/2007)) ([d752aff](https://github.com/superdoc-dev/superdoc/commit/d752afff9dc11041798ea2a28d487cc190e13383))
* replace Node.js Buffer APIs with browser-native alternatives ([#2028](https://github.com/superdoc-dev/superdoc/issues/2028)) ([b17774a](https://github.com/superdoc-dev/superdoc/commit/b17774a566750c4cca084415f9b2c2b4c4386668)), closes [#exportProcessMediaFiles](https://github.com/superdoc-dev/superdoc/issues/exportProcessMediaFiles)
* **tracked-changes:** colors should be restored when format rejected ([#1970](https://github.com/superdoc-dev/superdoc/issues/1970)) ([01ea504](https://github.com/superdoc-dev/superdoc/commit/01ea504737e38815c8ed7e5e585308ca5600e169))


### Features

* add pdf infra, migrate layers ([#2078](https://github.com/superdoc-dev/superdoc/issues/2078)) ([7d416e9](https://github.com/superdoc-dev/superdoc/commit/7d416e9b8d8bce2fbd914684a4d3e0f10ab5eff1))
* layout snapshot testing ([#2035](https://github.com/superdoc-dev/superdoc/issues/2035)) ([b070cd7](https://github.com/superdoc-dev/superdoc/commit/b070cd79d376c528fdc4efdb3371c55a1a3cf908))

## [1.13.1](https://github.com/superdoc-dev/superdoc/compare/v1.13.0...v1.13.1) (2026-02-14)


### Bug Fixes

* **build:** remove dead vite-plugin-node-polyfills from UMD externals ([91de1fc](https://github.com/superdoc-dev/superdoc/commit/91de1fc2e47b0061d088db5d46b0da4cc07dc837))

# [1.13.0](https://github.com/superdoc-dev/superdoc/compare/v1.12.0...v1.13.0) (2026-02-14)


### Bug Fixes

* anchor table overlaps text ([#1995](https://github.com/superdoc-dev/superdoc/issues/1995)) ([fc05e29](https://github.com/superdoc-dev/superdoc/commit/fc05e295efef9e02db9d7cccafc771d3d00da3e6))
* collaboration cursor styles fix ([fd6db10](https://github.com/superdoc-dev/superdoc/commit/fd6db10558caa4136da262ad10b751dbb4bdac2c))
* ensure we do not duplicate bubble text ([#1934](https://github.com/superdoc-dev/superdoc/issues/1934)) ([c41cf9e](https://github.com/superdoc-dev/superdoc/commit/c41cf9e21d763aa08546eb3445c54a078bf66d33))
* ignore sdBlockId when pasting content ([#2010](https://github.com/superdoc-dev/superdoc/issues/2010)) ([1b08572](https://github.com/superdoc-dev/superdoc/commit/1b08572ef696dfe9fb45cd079c4381bd86c3b2d3))
* normalize bookmarks in tables ([#1892](https://github.com/superdoc-dev/superdoc/issues/1892)) ([369b7e1](https://github.com/superdoc-dev/superdoc/commit/369b7e1bfc1e2777916aba77f076de718735a612))
* replace Node.js Buffer APIs with browser-native alternatives ([#2028](https://github.com/superdoc-dev/superdoc/issues/2028)) ([b17774a](https://github.com/superdoc-dev/superdoc/commit/b17774a566750c4cca084415f9b2c2b4c4386668)), closes [#exportProcessMediaFiles](https://github.com/superdoc-dev/superdoc/issues/exportProcessMediaFiles)
* use correct template syntax for GitHub release URL in PR comments ([9d1bca2](https://github.com/superdoc-dev/superdoc/commit/9d1bca2cd9aa0d99e42b836ad093b07c6b5a513f))


### Features

* enabled telemetry by default and added documentation ([#2001](https://github.com/superdoc-dev/superdoc/issues/2001)) ([8598ef7](https://github.com/superdoc-dev/superdoc/commit/8598ef7d200e666911c68c6c116996ef47fa9261))
* enhance telemetry handling for sub-editors ([#2017](https://github.com/superdoc-dev/superdoc/issues/2017)) ([37bc030](https://github.com/superdoc-dev/superdoc/commit/37bc030bb30a999cb73de0b1a8cd96cc588780dd))
* update telemetry configuration to prioritize root licenseKey ([#2016](https://github.com/superdoc-dev/superdoc/issues/2016)) ([3b4ff6b](https://github.com/superdoc-dev/superdoc/commit/3b4ff6bb43cc70549397ec8d4d9d69eb7a84b90c))

# [1.12.0](https://github.com/superdoc-dev/superdoc/compare/v1.11.0...v1.12.0) (2026-02-12)


### Bug Fixes

* allow paste from context menu ([#1910](https://github.com/superdoc-dev/superdoc/issues/1910)) ([b6666bf](https://github.com/superdoc-dev/superdoc/commit/b6666bf94a3bc6a4f8a71a49e95136e2e5e9e2ae))
* **ci:** include sub-package commits in superdoc release filter ([a2c237b](https://github.com/superdoc-dev/superdoc/commit/a2c237bb631130de5ae345209ca109f1ff645519))
* **ci:** move superdoc releaserc to package dir for proper commit filtering ([688f8e0](https://github.com/superdoc-dev/superdoc/commit/688f8e09df258d7279e7364c03d08e217c742c3d))
* context menu clicks would change selection position ([#1889](https://github.com/superdoc-dev/superdoc/issues/1889)) ([ace0daf](https://github.com/superdoc-dev/superdoc/commit/ace0dafcf58535ec0ba6ff48efcd7ee113b021ce))
* **converter:** handle absolute paths in header/footer relationship targets ([#1945](https://github.com/superdoc-dev/superdoc/issues/1945)) ([9d82632](https://github.com/superdoc-dev/superdoc/commit/9d82632c62a70cc6cb19015f9fca89b3f28a4323))
* cursor drift during vertical arrow navigation (SD-1689) ([#1918](https://github.com/superdoc-dev/superdoc/issues/1918)) ([982118d](https://github.com/superdoc-dev/superdoc/commit/982118df475b3178351713f0c00f6fe447853c61))
* disable footnotes typing ([#1974](https://github.com/superdoc-dev/superdoc/issues/1974)) ([92b4d62](https://github.com/superdoc-dev/superdoc/commit/92b4d6288a48275435660ae2a848b064506390f6))
* headless yjs ([#1913](https://github.com/superdoc-dev/superdoc/issues/1913)) ([4cdecf7](https://github.com/superdoc-dev/superdoc/commit/4cdecf7c592f8fbf23655b05200c36b9edfb6d7e))
* image z-index and overlaps ([#1950](https://github.com/superdoc-dev/superdoc/issues/1950)) ([39875ac](https://github.com/superdoc-dev/superdoc/commit/39875acda1a1799f52d433d463739926e73eea61))
* issue updating paragraph properties (SD-1778) ([#1944](https://github.com/superdoc-dev/superdoc/issues/1944)) ([a9076ed](https://github.com/superdoc-dev/superdoc/commit/a9076eda595e0e64b57add6d3809fed587e62f7d))
* **layout-bridge:** defer table fragment click mapping to geometry fallback ([#1968](https://github.com/superdoc-dev/superdoc/issues/1968)) ([0eac43c](https://github.com/superdoc-dev/superdoc/commit/0eac43c2880c39767407279db585bd2568a758d9))
* load alternative style definitions when main one is missing ([#1922](https://github.com/superdoc-dev/superdoc/issues/1922)) ([bb4083f](https://github.com/superdoc-dev/superdoc/commit/bb4083fbbabe61078e71af5c06a251a4e60670fd))
* mount Vue on wrapper element to prevent host framework conflicts (SD-1832) ([#1971](https://github.com/superdoc-dev/superdoc/issues/1971)) ([0c4bdda](https://github.com/superdoc-dev/superdoc/commit/0c4bddab0fd1c47e9530860492480748497ad51d))
* performance ([#1914](https://github.com/superdoc-dev/superdoc/issues/1914)) ([0747b03](https://github.com/superdoc-dev/superdoc/commit/0747b03e81231917c7c2cb5d69f90dbaf0646932))
* persist comments on reload in collab mode ([#1949](https://github.com/superdoc-dev/superdoc/issues/1949)) ([2b2e56e](https://github.com/superdoc-dev/superdoc/commit/2b2e56ea85acd8f70e300ad89e0a536a4f974bf7))
* preserve text selection highlight on right-click ([#1994](https://github.com/superdoc-dev/superdoc/issues/1994)) ([db5466a](https://github.com/superdoc-dev/superdoc/commit/db5466a6bf4efce8f1057552182702dd6a4a57d1))
* return null instead of blank num definition when not found ([#1990](https://github.com/superdoc-dev/superdoc/issues/1990)) ([3acac3b](https://github.com/superdoc-dev/superdoc/commit/3acac3b0e071ca940b27434c1e54c9d89d35d028))
* **super-converter:** add tableHeader export handler to fix corrupted docx ([#1900](https://github.com/superdoc-dev/superdoc/issues/1900)) ([010799b](https://github.com/superdoc-dev/superdoc/commit/010799b87ee133134a61272e47cc1d77fe08d937))
* **super-converter:** resolve table style conditional shading on cell import (SD-1833) ([#1985](https://github.com/superdoc-dev/superdoc/issues/1985)) ([5e206f4](https://github.com/superdoc-dev/superdoc/commit/5e206f45ea7139bf9193912726b21af03d70c86e))
* **super-editor:** allow Backspace to delete empty paragraphs in suggesting mode ([#1966](https://github.com/superdoc-dev/superdoc/issues/1966)) ([820c73c](https://github.com/superdoc-dev/superdoc/commit/820c73c297ff97156316470cc53a4e28f5daaf3c))
* **super-editor:** prevent invalid paragraph updates for nested runs in headless import ([8c11718](https://github.com/superdoc-dev/superdoc/commit/8c117188219b554fe5c55fd376172804b623015e))
* **super-editor:** prevent invalid paragraph updates for nested runs in headless import ([c5ee6e3](https://github.com/superdoc-dev/superdoc/commit/c5ee6e3a606e8f8e8284ffc5c38833af9ecaf29d))
* **super-editor:** restore marks correctly after clear format + undo (SD-1771) ([#1967](https://github.com/superdoc-dev/superdoc/issues/1967)) ([bc9dc76](https://github.com/superdoc-dev/superdoc/commit/bc9dc76c5cf93143ed26353ffc2b84a018f71a2e))
* **superdoc:** enhance comment input focus handling and edit init ([#1935](https://github.com/superdoc-dev/superdoc/issues/1935)) ([0e9112c](https://github.com/superdoc-dev/superdoc/commit/0e9112c44ce6a89672c2a52d09fbd96d4a1f6bd2))
* **superdoc:** update comment text ([b5ff644](https://github.com/superdoc-dev/superdoc/commit/b5ff64496cb962ffde32c15a3d249a6540a804d0))
* **superdoc:** update entry point comment ([#1926](https://github.com/superdoc-dev/superdoc/issues/1926)) ([0dde298](https://github.com/superdoc-dev/superdoc/commit/0dde29868dde357bebf0c7c0363355ea855fa39a))
* **table:** resolve column resize only working on first page (SD-1772) ([#1959](https://github.com/superdoc-dev/superdoc/issues/1959)) ([df43867](https://github.com/superdoc-dev/superdoc/commit/df43867b3119ee605225794becf66dc2bd327342))
* **tracked-changes:** fix suggested insertions from paste failures ([#1969](https://github.com/superdoc-dev/superdoc/issues/1969)) ([e74c14a](https://github.com/superdoc-dev/superdoc/commit/e74c14a76c9bbad994d9bde3699e0d8c911c061a))
* trigger patch release ([7bc1b74](https://github.com/superdoc-dev/superdoc/commit/7bc1b747b8f265e2b7d70118e425d442736a0f92))
* trigger patch release ([32ced9c](https://github.com/superdoc-dev/superdoc/commit/32ced9c4822cdaf51fafa4b7c54993ea8ea89f9d))
* trigger patch release ([da7f484](https://github.com/superdoc-dev/superdoc/commit/da7f484027c90cad9d3c5fd1c3ef61d0e39c3996))
* trigger release ([8367dd6](https://github.com/superdoc-dev/superdoc/commit/8367dd6760dc2d0bf61c1b445c3daceb0b522c63))
* use DEFLATE compression for docx export instead of STORE ([#1933](https://github.com/superdoc-dev/superdoc/issues/1933)) ([ebcd986](https://github.com/superdoc-dev/superdoc/commit/ebcd98644ff7859cf297da79c549257e6c241523))
* zIndex updates ([#1973](https://github.com/superdoc-dev/superdoc/issues/1973)) ([3ca7aa3](https://github.com/superdoc-dev/superdoc/commit/3ca7aa390abf12838a88ca36d96bd5667ed83225))


### Features

* **super-editor:** add w:lock support for StructuredContent nodes (SD-1616) ([#1939](https://github.com/superdoc-dev/superdoc/issues/1939)) ([2c16f1c](https://github.com/superdoc-dev/superdoc/commit/2c16f1c906ae522e1dd9fb1604d9d7b19d941eef))
* telemetry ([#1932](https://github.com/superdoc-dev/superdoc/issues/1932)) ([fab3ce9](https://github.com/superdoc-dev/superdoc/commit/fab3ce959dc5d3a21bfeffa5283c01f491d2b4c4))
* **template-builder:** add cspNonce support ([#1911](https://github.com/superdoc-dev/superdoc/issues/1911)) ([bcb9d28](https://github.com/superdoc-dev/superdoc/commit/bcb9d285a196c998cf45c760ba7bfa3b94c95d25))
* whiteboard ([#1954](https://github.com/superdoc-dev/superdoc/issues/1954)) ([c9d1484](https://github.com/superdoc-dev/superdoc/commit/c9d14847269d439f053ad35cdc9caacbf6a2a06f))


### Performance Improvements

* **build:** remove redundant steps and add fast dev build (SD-1886) ([#1999](https://github.com/superdoc-dev/superdoc/issues/1999)) ([db46bf8](https://github.com/superdoc-dev/superdoc/commit/db46bf81028361d8c56ff6787f40501d8f1c7a3b))

# [1.11.0](https://github.com/superdoc-dev/superdoc/compare/v1.10.0...v1.11.0) (2026-02-06)


### Bug Fixes

* cli package public ([7dad84d](https://github.com/superdoc-dev/superdoc/commit/7dad84da35c78f45072907dfde94ec782b362a8f))
* cli skill uses latest ([b74d9ba](https://github.com/superdoc-dev/superdoc/commit/b74d9bae4682f64bd11cf17f8cfff7c22965e415))
* **cli:** document -h flag in help text ([020c4a0](https://github.com/superdoc-dev/superdoc/commit/020c4a0d58e079e1912c0773c095806bbc51eafa))
* **cli:** document -h flag in help text ([68fa42f](https://github.com/superdoc-dev/superdoc/commit/68fa42fabbbc44b41d644b9010a12fa2573e7e8c))
* **cli:** move bundled deps to devDependencies ([6a362ed](https://github.com/superdoc-dev/superdoc/commit/6a362ed87baad3d08cec2298980290ea2183c1ac))
* **cli:** remove bundled deps from package.json ([f90d4af](https://github.com/superdoc-dev/superdoc/commit/f90d4af095a8e4cf5fca34774855a28559dec5de))
* console log ([4b64109](https://github.com/superdoc-dev/superdoc/commit/4b64109b92623cfb7582774c45f96cac47a8280f))
* document dropdown resets ([#1883](https://github.com/superdoc-dev/superdoc/issues/1883)) ([b552d2e](https://github.com/superdoc-dev/superdoc/commit/b552d2e272d7f8b19e1bf2400c58fec9fed30f16))
* lock file ([1edf741](https://github.com/superdoc-dev/superdoc/commit/1edf7419fc5c17dc5ff6a0e7097214aee1e8d2bc))
* make Ctrl-a select all content, and fix select all when there are tables in doc ([#1886](https://github.com/superdoc-dev/superdoc/issues/1886)) ([c87c1ab](https://github.com/superdoc-dev/superdoc/commit/c87c1ab1d122482a6c65d77decb6374e97f9d45e))
* package lock ([11f47fa](https://github.com/superdoc-dev/superdoc/commit/11f47fabe45b5341f0873895ff50d9e791781718))
* paragraph autospacing calculation (SD-1653) ([#1877](https://github.com/superdoc-dev/superdoc/issues/1877)) ([b7dec3c](https://github.com/superdoc-dev/superdoc/commit/b7dec3cda82840c62bfe815a636b76f5f949424c))
* run color overwrite in applyInlineRunProperties (SD-1585) ([#1885](https://github.com/superdoc-dev/superdoc/issues/1885)) ([6051dd4](https://github.com/superdoc-dev/superdoc/commit/6051dd4de2225217b6cd426cbb2ae657998d72a2))
* selection across pages with drag ([#1884](https://github.com/superdoc-dev/superdoc/issues/1884)) ([bb44999](https://github.com/superdoc-dev/superdoc/commit/bb449995bf0537d9471c88b7c1ddca948ea0b070))
* **super-converter:** handle ECMA-376 percentage strings in table widths (SD-1633) ([#1844](https://github.com/superdoc-dev/superdoc/issues/1844)) ([fb9fd52](https://github.com/superdoc-dev/superdoc/commit/fb9fd5235eea1f3913da29195f682416ad60ced4))
* **super-converter:** return transparent instead of blue for shapes ([#1854](https://github.com/superdoc-dev/superdoc/issues/1854)) ([6ac29d7](https://github.com/superdoc-dev/superdoc/commit/6ac29d79b4cb986dc52f79db16966d413c07111e)), closes [#5b9bd5](https://github.com/superdoc-dev/superdoc/issues/5b9bd5)


### Features

* add esign package to monorepo ([#1895](https://github.com/superdoc-dev/superdoc/issues/1895)) ([532e2b5](https://github.com/superdoc-dev/superdoc/commit/532e2b5fbd23406eb17e5a1125eda1aaec4496c0))
* add template-builder package to monorepo ([#1888](https://github.com/superdoc-dev/superdoc/issues/1888)) ([0aec624](https://github.com/superdoc-dev/superdoc/commit/0aec6243dfbcc6552783f610b6469ae6ee2b6d2a))
* **cli:** add claude code skill ([#1903](https://github.com/superdoc-dev/superdoc/issues/1903)) ([e55ce56](https://github.com/superdoc-dev/superdoc/commit/e55ce561c07bf6f103fb31657b2b928f44cd718c))
* new cli app ([#1902](https://github.com/superdoc-dev/superdoc/issues/1902)) ([0c6aeb0](https://github.com/superdoc-dev/superdoc/commit/0c6aeb06f5a32de3b58dfe68dc38ec63b8ff2cf6))
* **template-builder:** add cspNonce support ([#1911](https://github.com/superdoc-dev/superdoc/issues/1911)) ([5b7b34e](https://github.com/superdoc-dev/superdoc/commit/5b7b34ea3971f98078e5314fc5dd1ef23550afd6))
* **vscode-ext:** sync from main ([47c50f7](https://github.com/superdoc-dev/superdoc/commit/47c50f74ed3fa0371acd15947d2105142fd312fd))
* **vscode-ext:** sync from main ([226bcf1](https://github.com/superdoc-dev/superdoc/commit/226bcf12f76b7dea2aa0cd425d6116bb1f7b7ea5))
* **vscode-ext:** sync from main ([eced1f3](https://github.com/superdoc-dev/superdoc/commit/eced1f369e527064984dc9de107bc1e670bade90))
* **vscode-ext:** sync from main ([36b48a6](https://github.com/superdoc-dev/superdoc/commit/36b48a6195097dc539436e13218c38f6ac1aa8e4))
* **vscode-ext:** sync from main ([cdc00df](https://github.com/superdoc-dev/superdoc/commit/cdc00dfab9857613ae5562de8eff61eaa44fceaa))

## [1.10.1-next.4](https://github.com/superdoc-dev/superdoc/compare/v1.10.1-next.3...v1.10.1-next.4) (2026-01-30)


### Bug Fixes

* make Ctrl-a select all content, and fix select all when there are tables in doc ([#1886](https://github.com/superdoc-dev/superdoc/issues/1886)) ([c87c1ab](https://github.com/superdoc-dev/superdoc/commit/c87c1ab1d122482a6c65d77decb6374e97f9d45e))

## [1.10.1-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.10.1-next.2...v1.10.1-next.3) (2026-01-30)


### Bug Fixes

* run color overwrite in applyInlineRunProperties (SD-1585) ([#1885](https://github.com/superdoc-dev/superdoc/issues/1885)) ([6051dd4](https://github.com/superdoc-dev/superdoc/commit/6051dd4de2225217b6cd426cbb2ae657998d72a2))

## [1.10.1-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.10.1-next.1...v1.10.1-next.2) (2026-01-30)


### Bug Fixes

* document dropdown resets ([#1883](https://github.com/superdoc-dev/superdoc/issues/1883)) ([b552d2e](https://github.com/superdoc-dev/superdoc/commit/b552d2e272d7f8b19e1bf2400c58fec9fed30f16))
* selection across pages with drag ([#1884](https://github.com/superdoc-dev/superdoc/issues/1884)) ([bb44999](https://github.com/superdoc-dev/superdoc/commit/bb449995bf0537d9471c88b7c1ddca948ea0b070))

## [1.10.1-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.10.0...v1.10.1-next.1) (2026-01-30)


### Bug Fixes

* **super-converter:** return transparent instead of blue for shapes ([#1854](https://github.com/superdoc-dev/superdoc/issues/1854)) ([6ac29d7](https://github.com/superdoc-dev/superdoc/commit/6ac29d79b4cb986dc52f79db16966d413c07111e)), closes [#5b9bd5](https://github.com/superdoc-dev/superdoc/issues/5b9bd5)

# [1.10.0](https://github.com/superdoc-dev/superdoc/compare/v1.9.0...v1.10.0) (2026-01-30)


### Bug Fixes

* **collaboration:** add debouncing to header/footer Y.Doc updates ([#1861](https://github.com/superdoc-dev/superdoc/issues/1861)) ([90d0f65](https://github.com/superdoc-dev/superdoc/commit/90d0f6549e9c207e127da72466a41c63035c7c85))
* comment text after enter break is dropped on render and export ([#1853](https://github.com/superdoc-dev/superdoc/issues/1853)) ([ce7f553](https://github.com/superdoc-dev/superdoc/commit/ce7f5534afaa8e46cb4d4e41fb6478575dea26e3))
* **comments:** pass superdoc instance when canceling pending comment ([#1862](https://github.com/superdoc-dev/superdoc/issues/1862)) ([4982bac](https://github.com/superdoc-dev/superdoc/commit/4982bac97c5f7e141d7029b9ba7b832ee509e165))
* horizontal rule ([#1875](https://github.com/superdoc-dev/superdoc/issues/1875)) ([4b3b92e](https://github.com/superdoc-dev/superdoc/commit/4b3b92ee168adcc06c7c4c927716ebcfec94311e))
* selection/caret issues ([#1865](https://github.com/superdoc-dev/superdoc/issues/1865)) ([3f627fb](https://github.com/superdoc-dev/superdoc/commit/3f627fbe83e715bb9b5b01f6711d6d84b57e2ed6))
* **super-editor:** preserve toolbar style marks when wrapping runs ([9dbcdd2](https://github.com/superdoc-dev/superdoc/commit/9dbcdd21023f0467ca689bb6d21bb79431bf4370))
* table width ([#1876](https://github.com/superdoc-dev/superdoc/issues/1876)) ([46a635c](https://github.com/superdoc-dev/superdoc/commit/46a635cc946900beebccd284f6ab9d750365b4bf))
* use stable comment ids for imported comments ([#1863](https://github.com/superdoc-dev/superdoc/issues/1863)) ([0c330d0](https://github.com/superdoc-dev/superdoc/commit/0c330d0394e6b18d942a7a3ed6f090a5b9f036e4))


### Features

* add CLAUDE.md/AGENTS.md navigation files for AI tools ([#1878](https://github.com/superdoc-dev/superdoc/issues/1878)) ([db98d62](https://github.com/superdoc-dev/superdoc/commit/db98d62dde6d6ccb28142af46c0abff8bee3d469))
* **track-changes:** add emitCommentEvent option to suppress sidebar bubbles ([#1880](https://github.com/superdoc-dev/superdoc/issues/1880)) ([87a2f24](https://github.com/superdoc-dev/superdoc/commit/87a2f2417322665f9f041f1a7d28642e95b5ea83))

# [1.10.0-next.5](https://github.com/superdoc-dev/superdoc/compare/v1.10.0-next.4...v1.10.0-next.5) (2026-01-30)


### Bug Fixes

* comment text after enter break is dropped on render and export ([#1853](https://github.com/superdoc-dev/superdoc/issues/1853)) ([ce7f553](https://github.com/superdoc-dev/superdoc/commit/ce7f5534afaa8e46cb4d4e41fb6478575dea26e3))

# [1.10.0-next.4](https://github.com/superdoc-dev/superdoc/compare/v1.10.0-next.3...v1.10.0-next.4) (2026-01-29)


### Bug Fixes

* **collaboration:** add debouncing to header/footer Y.Doc updates ([#1861](https://github.com/superdoc-dev/superdoc/issues/1861)) ([90d0f65](https://github.com/superdoc-dev/superdoc/commit/90d0f6549e9c207e127da72466a41c63035c7c85))

# [1.10.0-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.10.0-next.2...v1.10.0-next.3) (2026-01-29)


### Bug Fixes

* horizontal rule ([#1875](https://github.com/superdoc-dev/superdoc/issues/1875)) ([4b3b92e](https://github.com/superdoc-dev/superdoc/commit/4b3b92ee168adcc06c7c4c927716ebcfec94311e))


### Features

* **track-changes:** add emitCommentEvent option to suppress sidebar bubbles ([#1880](https://github.com/superdoc-dev/superdoc/issues/1880)) ([87a2f24](https://github.com/superdoc-dev/superdoc/commit/87a2f2417322665f9f041f1a7d28642e95b5ea83))

# [1.10.0-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.10.0-next.1...v1.10.0-next.2) (2026-01-29)


### Bug Fixes

* **super-editor:** preserve toolbar style marks when wrapping runs ([9dbcdd2](https://github.com/superdoc-dev/superdoc/commit/9dbcdd21023f0467ca689bb6d21bb79431bf4370))

# [1.10.0-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.9.1-next.1...v1.10.0-next.1) (2026-01-29)


### Bug Fixes

* table width ([#1876](https://github.com/superdoc-dev/superdoc/issues/1876)) ([46a635c](https://github.com/superdoc-dev/superdoc/commit/46a635cc946900beebccd284f6ab9d750365b4bf))


### Features

* add CLAUDE.md/AGENTS.md navigation files for AI tools ([#1878](https://github.com/superdoc-dev/superdoc/issues/1878)) ([db98d62](https://github.com/superdoc-dev/superdoc/commit/db98d62dde6d6ccb28142af46c0abff8bee3d469))

## [1.9.1-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.9.0...v1.9.1-next.1) (2026-01-29)


### Bug Fixes

* **comments:** pass superdoc instance when canceling pending comment ([#1862](https://github.com/superdoc-dev/superdoc/issues/1862)) ([4982bac](https://github.com/superdoc-dev/superdoc/commit/4982bac97c5f7e141d7029b9ba7b832ee509e165))
* selection/caret issues ([#1865](https://github.com/superdoc-dev/superdoc/issues/1865)) ([3f627fb](https://github.com/superdoc-dev/superdoc/commit/3f627fbe83e715bb9b5b01f6711d6d84b57e2ed6))
* use stable comment ids for imported comments ([#1863](https://github.com/superdoc-dev/superdoc/issues/1863)) ([0c330d0](https://github.com/superdoc-dev/superdoc/commit/0c330d0394e6b18d942a7a3ed6f090a5b9f036e4))

# [1.9.0](https://github.com/superdoc-dev/superdoc/compare/v1.8.3...v1.9.0) (2026-01-29)


### Bug Fixes

* add typesVersions for TypeScript subpath exports ([#1851](https://github.com/superdoc-dev/superdoc/issues/1851)) ([923ab29](https://github.com/superdoc-dev/superdoc/commit/923ab293329f94a04df43cc337bab4e29149e518))
* annotation and interaction issues ([#1847](https://github.com/superdoc-dev/superdoc/issues/1847)) ([ffb1055](https://github.com/superdoc-dev/superdoc/commit/ffb1055dcf21916a23b221655a9eff8828d49fa0))
* annotation formatting ([0ac67b2](https://github.com/superdoc-dev/superdoc/commit/0ac67b20e6dca1aebe077eaf5e7e116ad61b2135))
* apply correct style to inserted links ([#1871](https://github.com/superdoc-dev/superdoc/issues/1871)) ([36e3c4b](https://github.com/superdoc-dev/superdoc/commit/36e3c4b066a02fbcac4e53cc3df2c3cefaf207fb))
* block ID collisions and missing positions in paragraph converter ([3e75a98](https://github.com/superdoc-dev/superdoc/commit/3e75a9827fdb8b1847632e6a5b7f8f5dcabcabd1))
* correct cursor position when typing after fully track-deleted content ([#1828](https://github.com/superdoc-dev/superdoc/issues/1828)) ([8de1c5f](https://github.com/superdoc-dev/superdoc/commit/8de1c5f142fae6b2362d3640b698fe6277ab45d7))
* **export:** prefix Relationship IDs with rId for valid xsd:ID ([#1855](https://github.com/superdoc-dev/superdoc/issues/1855)) ([11e67e1](https://github.com/superdoc-dev/superdoc/commit/11e67e1e4332976df279edf62f1aa33177004f9e))
* incorrect list counter calculation (SD-1658) ([#1867](https://github.com/superdoc-dev/superdoc/issues/1867)) ([a960a65](https://github.com/superdoc-dev/superdoc/commit/a960a656235d2c4daa7b5f169e79bfba5f057ff6))
* list numbering sync for cloned defs and zero start overrides ([c21301b](https://github.com/superdoc-dev/superdoc/commit/c21301b64168edb4feedebc31aeba17e08ebaed2))
* make test:slow script find the slow test file ([5a6b6d6](https://github.com/superdoc-dev/superdoc/commit/5a6b6d6d0d16caff9e8851b6a44ad827a001d993))
* patch broken numbering definitions ([#1848](https://github.com/superdoc-dev/superdoc/issues/1848)) ([f34b121](https://github.com/superdoc-dev/superdoc/commit/f34b1217eb7afc01f49da8db54d63e6e3126185a))
* preserve style on row insertion ([#1553](https://github.com/superdoc-dev/superdoc/issues/1553)) ([92f67dc](https://github.com/superdoc-dev/superdoc/commit/92f67dcf17456bd1ead0dc0a993fc6ae24eead5a))
* preserve text selection on right-click in Firefox ([#1826](https://github.com/superdoc-dev/superdoc/issues/1826)) ([0a23338](https://github.com/superdoc-dev/superdoc/commit/0a2333815608581c5766467aa122f5753431525f))
* remove redundant parameters in pm-adapter (SD-1587) ([#1823](https://github.com/superdoc-dev/superdoc/issues/1823)) ([e315ad4](https://github.com/superdoc-dev/superdoc/commit/e315ad4e8ecfe15542a9042503048909a2f7cdb5))
* table resize ([#1821](https://github.com/superdoc-dev/superdoc/issues/1821)) ([e7e1eb8](https://github.com/superdoc-dev/superdoc/commit/e7e1eb8a42317cc63f02a51fa7955a2ac1614a0e))
* text in new paragraph doesn't inherit styles (SD-1657) ([#1869](https://github.com/superdoc-dev/superdoc/issues/1869)) ([275fef2](https://github.com/superdoc-dev/superdoc/commit/275fef25f4ccd4ab511e66cca557abcebe79f4ef))


### Features

* dev collab mode ([#1860](https://github.com/superdoc-dev/superdoc/issues/1860)) ([469477b](https://github.com/superdoc-dev/superdoc/commit/469477bb816e98811f3986517d0541d1b4d4ac5e))
* fix node types export, add introspection ([#1815](https://github.com/superdoc-dev/superdoc/issues/1815)) ([9b8d0d4](https://github.com/superdoc-dev/superdoc/commit/9b8d0d491dd9a9422ca44505471a34bc79894b80))

# [1.9.0-next.13](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.12...v1.9.0-next.13) (2026-01-29)


### Bug Fixes

* incorrect list counter calculation (SD-1658) ([#1867](https://github.com/superdoc-dev/superdoc/issues/1867)) ([a960a65](https://github.com/superdoc-dev/superdoc/commit/a960a656235d2c4daa7b5f169e79bfba5f057ff6))
* list numbering sync for cloned defs and zero start overrides ([c21301b](https://github.com/superdoc-dev/superdoc/commit/c21301b64168edb4feedebc31aeba17e08ebaed2))

# [1.9.0-next.12](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.11...v1.9.0-next.12) (2026-01-28)


### Bug Fixes

* text in new paragraph doesn't inherit styles (SD-1657) ([#1869](https://github.com/superdoc-dev/superdoc/issues/1869)) ([275fef2](https://github.com/superdoc-dev/superdoc/commit/275fef25f4ccd4ab511e66cca557abcebe79f4ef))

# [1.9.0-next.11](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.10...v1.9.0-next.11) (2026-01-28)


### Bug Fixes

* apply correct style to inserted links ([#1871](https://github.com/superdoc-dev/superdoc/issues/1871)) ([36e3c4b](https://github.com/superdoc-dev/superdoc/commit/36e3c4b066a02fbcac4e53cc3df2c3cefaf207fb))

# [1.9.0-next.10](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.9...v1.9.0-next.10) (2026-01-28)


### Bug Fixes

* block ID collisions and missing positions in paragraph converter ([3e75a98](https://github.com/superdoc-dev/superdoc/commit/3e75a9827fdb8b1847632e6a5b7f8f5dcabcabd1))
* make test:slow script find the slow test file ([5a6b6d6](https://github.com/superdoc-dev/superdoc/commit/5a6b6d6d0d16caff9e8851b6a44ad827a001d993))


### Features

* dev collab mode ([#1860](https://github.com/superdoc-dev/superdoc/issues/1860)) ([469477b](https://github.com/superdoc-dev/superdoc/commit/469477bb816e98811f3986517d0541d1b4d4ac5e))

# [1.9.0-next.9](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.8...v1.9.0-next.9) (2026-01-28)


### Bug Fixes

* patch broken numbering definitions ([#1848](https://github.com/superdoc-dev/superdoc/issues/1848)) ([f34b121](https://github.com/superdoc-dev/superdoc/commit/f34b1217eb7afc01f49da8db54d63e6e3126185a))

# [1.9.0-next.8](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.7...v1.9.0-next.8) (2026-01-28)


### Bug Fixes

* annotation and interaction issues ([#1847](https://github.com/superdoc-dev/superdoc/issues/1847)) ([ffb1055](https://github.com/superdoc-dev/superdoc/commit/ffb1055dcf21916a23b221655a9eff8828d49fa0))

# [1.9.0-next.7](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.6...v1.9.0-next.7) (2026-01-27)


### Bug Fixes

* **export:** prefix Relationship IDs with rId for valid xsd:ID ([#1855](https://github.com/superdoc-dev/superdoc/issues/1855)) ([11e67e1](https://github.com/superdoc-dev/superdoc/commit/11e67e1e4332976df279edf62f1aa33177004f9e))

# [1.9.0-next.5](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.4...v1.9.0-next.5) (2026-01-24)


### Bug Fixes

* preserve text selection on right-click in Firefox ([#1826](https://github.com/superdoc-dev/superdoc/issues/1826)) ([0a23338](https://github.com/superdoc-dev/superdoc/commit/0a2333815608581c5766467aa122f5753431525f))

# [1.9.0-next.4](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.3...v1.9.0-next.4) (2026-01-24)


### Bug Fixes

* correct cursor position when typing after fully track-deleted content ([#1828](https://github.com/superdoc-dev/superdoc/issues/1828)) ([8de1c5f](https://github.com/superdoc-dev/superdoc/commit/8de1c5f142fae6b2362d3640b698fe6277ab45d7))

# [1.9.0-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.2...v1.9.0-next.3) (2026-01-24)


### Bug Fixes

* annotation formatting ([0ac67b2](https://github.com/superdoc-dev/superdoc/commit/0ac67b20e6dca1aebe077eaf5e7e116ad61b2135))

# [1.9.0-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.9.0-next.1...v1.9.0-next.2) (2026-01-24)


### Bug Fixes

* remove redundant parameters in pm-adapter (SD-1587) ([#1823](https://github.com/superdoc-dev/superdoc/issues/1823)) ([e315ad4](https://github.com/superdoc-dev/superdoc/commit/e315ad4e8ecfe15542a9042503048909a2f7cdb5))

# [1.9.0-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.8.3...v1.9.0-next.1) (2026-01-23)


### Bug Fixes

* preserve style on row insertion ([#1553](https://github.com/superdoc-dev/superdoc/issues/1553)) ([92f67dc](https://github.com/superdoc-dev/superdoc/commit/92f67dcf17456bd1ead0dc0a993fc6ae24eead5a))
* table resize ([#1821](https://github.com/superdoc-dev/superdoc/issues/1821)) ([e7e1eb8](https://github.com/superdoc-dev/superdoc/commit/e7e1eb8a42317cc63f02a51fa7955a2ac1614a0e))


### Features

* fix node types export, add introspection ([#1815](https://github.com/superdoc-dev/superdoc/issues/1815)) ([9b8d0d4](https://github.com/superdoc-dev/superdoc/commit/9b8d0d491dd9a9422ca44505471a34bc79894b80))

## [1.8.3](https://github.com/superdoc-dev/superdoc/compare/v1.8.2...v1.8.3) (2026-01-23)


### Bug Fixes

* add double click event for annotation ([#1803](https://github.com/superdoc-dev/superdoc/issues/1803)) ([509c882](https://github.com/superdoc-dev/superdoc/commit/509c8821d4222130c68d99ef65f22aaf4796159b))
* cursor delay when dragging over a document ([#1802](https://github.com/superdoc-dev/superdoc/issues/1802)) ([58691f1](https://github.com/superdoc-dev/superdoc/commit/58691f1f1573fb18ad724a78db454d33d3c3e99f))
* handling absolute paths for relationships ([#1811](https://github.com/superdoc-dev/superdoc/issues/1811)) ([8647358](https://github.com/superdoc-dev/superdoc/commit/864735874e93a8570e83372213f6d7ae96557a32))
* header/footer double click to edit ([#1814](https://github.com/superdoc-dev/superdoc/issues/1814)) ([b4041d5](https://github.com/superdoc-dev/superdoc/commit/b4041d55773d39feba3f3bb606f3723e63495a60))
* issue indenting list items (SD-1594) ([#1816](https://github.com/superdoc-dev/superdoc/issues/1816)) ([3f84beb](https://github.com/superdoc-dev/superdoc/commit/3f84beb06b0daa47a613fe256f625d3157b6fbc0))
* preserve original document namespace declarations during export ([#1812](https://github.com/superdoc-dev/superdoc/issues/1812)) ([4a3da75](https://github.com/superdoc-dev/superdoc/commit/4a3da7572bb37aadc9373cd4438a9fbc5add88e7))
* table background/width and marker color fixes ([#1795](https://github.com/superdoc-dev/superdoc/issues/1795)) ([50fc3ad](https://github.com/superdoc-dev/superdoc/commit/50fc3ad9f4b5d7069673cee84b21570331eca374))
* table indent ([#1794](https://github.com/superdoc-dev/superdoc/issues/1794)) ([fb0563e](https://github.com/superdoc-dev/superdoc/commit/fb0563eab536288c51ad2d3961570dad25aa09e1))

## [1.8.2](https://github.com/superdoc-dev/superdoc/compare/v1.8.1...v1.8.2) (2026-01-22)


### Bug Fixes

* simplify paragraph and table converters in pm-adapter (SD-1587) ([#1806](https://github.com/superdoc-dev/superdoc/issues/1806)) ([fa009bb](https://github.com/superdoc-dev/superdoc/commit/fa009bbab0deab9853bc9fa70c0f5ce16a3ce0e1))

## [1.8.2-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.8.1...v1.8.2-next.1) (2026-01-22)


### Bug Fixes

* simplify paragraph and table converters in pm-adapter (SD-1587) ([#1806](https://github.com/superdoc-dev/superdoc/issues/1806)) ([fa009bb](https://github.com/superdoc-dev/superdoc/commit/fa009bbab0deab9853bc9fa70c0f5ce16a3ce0e1))

## [1.8.1](https://github.com/superdoc-dev/superdoc/compare/v1.8.0...v1.8.1) (2026-01-22)


### Bug Fixes

* **importer:** wrap root-level inline nodes in paragraphs and disallow marks on passthroughInline ([#1804](https://github.com/superdoc-dev/superdoc/issues/1804)) ([7d0a752](https://github.com/superdoc-dev/superdoc/commit/7d0a7528493c2c7cea96ac72632db1f14f1f7fbc))
* include doc default fonts and stabilize linked-style run properties ([b2d9fc9](https://github.com/superdoc-dev/superdoc/commit/b2d9fc977198ee3c131659ec312e0fdb4309af2e))
* list indicators are not visible when list item is empty ([#1807](https://github.com/superdoc-dev/superdoc/issues/1807)) ([9197e85](https://github.com/superdoc-dev/superdoc/commit/9197e8558331d11b0c052a28f2fb8ff045e3c40f))

## [1.8.1-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.8.1-next.2...v1.8.1-next.3) (2026-01-22)


### Bug Fixes

* include doc default fonts and stabilize linked-style run properties ([b2d9fc9](https://github.com/superdoc-dev/superdoc/commit/b2d9fc977198ee3c131659ec312e0fdb4309af2e))

## [1.8.1-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.8.1-next.1...v1.8.1-next.2) (2026-01-22)


### Bug Fixes

* list indicators are not visible when list item is empty ([#1807](https://github.com/superdoc-dev/superdoc/issues/1807)) ([9197e85](https://github.com/superdoc-dev/superdoc/commit/9197e8558331d11b0c052a28f2fb8ff045e3c40f))

## [1.8.1-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.8.0...v1.8.1-next.1) (2026-01-22)


### Bug Fixes

* **importer:** wrap root-level inline nodes in paragraphs and disallow marks on passthroughInline ([#1804](https://github.com/superdoc-dev/superdoc/issues/1804)) ([7d0a752](https://github.com/superdoc-dev/superdoc/commit/7d0a7528493c2c7cea96ac72632db1f14f1f7fbc))

# [1.8.0](https://github.com/superdoc-dev/superdoc/compare/v1.7.0...v1.8.0) (2026-01-21)


### Bug Fixes

* add addToHistory to new insertTrackedChange command ([#1767](https://github.com/superdoc-dev/superdoc/issues/1767)) ([e5081be](https://github.com/superdoc-dev/superdoc/commit/e5081be4abdc108f348ea91b95092ae643567c91))
* annotation drop ([#1789](https://github.com/superdoc-dev/superdoc/issues/1789)) ([f384213](https://github.com/superdoc-dev/superdoc/commit/f3842134ab2648fc46752688350dbebb88f58f5a))
* annotation selection ([#1762](https://github.com/superdoc-dev/superdoc/issues/1762)) ([1c831cc](https://github.com/superdoc-dev/superdoc/commit/1c831cca106584d094f9d07c00f22fd51374ef1e))
* annotation selection, applying formatting ([#1784](https://github.com/superdoc-dev/superdoc/issues/1784)) ([924af4b](https://github.com/superdoc-dev/superdoc/commit/924af4be941717c202821ba10d9372dbe78a1954))
* guard against null editor ref in telemetry handler ([#1763](https://github.com/superdoc-dev/superdoc/issues/1763)) ([16b3a9a](https://github.com/superdoc-dev/superdoc/commit/16b3a9a2d4f5155ea967b4bbe6c2aadb996daef0))
* **layout:** default missing lineRule to auto for OOXML line spacing ([d0fd582](https://github.com/superdoc-dev/superdoc/commit/d0fd582451e586b8423bf988b8fb9099b924c872))
* preserve nested comment ranges on export (SD-1518) ([#1765](https://github.com/superdoc-dev/superdoc/issues/1765)) ([9b81f9a](https://github.com/superdoc-dev/superdoc/commit/9b81f9a3c265e3a22d6286fec7557d489287c798))
* reorganize style resolution in the layout engine (SD-1411) ([#1786](https://github.com/superdoc-dev/superdoc/issues/1786)) ([1845b76](https://github.com/superdoc-dev/superdoc/commit/1845b76a2c1f8a00aa3aa2b1ca855dd7185d7aaa))
* **search:** preserve leading/trailing whitespace in flexible matches ([#1788](https://github.com/superdoc-dev/superdoc/issues/1788)) ([c5d6751](https://github.com/superdoc-dev/superdoc/commit/c5d6751b6c37a7e01f86d97aec5a9e854c4d0cc9))
* trigger release ([f826636](https://github.com/superdoc-dev/superdoc/commit/f826636a7e5fab8c1c5dadfb8509003690cca8b4))


### Features

* add insertTrackedChange programmatic shortcut ([#1761](https://github.com/superdoc-dev/superdoc/issues/1761)) ([cd0628e](https://github.com/superdoc-dev/superdoc/commit/cd0628e82c2a15de41895c3e073d2d516a88532c))
* add visual indication for tracked change, comments and nested comments ([#1770](https://github.com/superdoc-dev/superdoc/issues/1770)) ([8eb07e4](https://github.com/superdoc-dev/superdoc/commit/8eb07e43a1a17a9c41d50ff24937832d4e191aa5))
* comment anchor helpers ([#1796](https://github.com/superdoc-dev/superdoc/issues/1796)) ([595bdc6](https://github.com/superdoc-dev/superdoc/commit/595bdc68660a508dede2d1f58c8a29f609db7cac))
* comment highlight config ([#1798](https://github.com/superdoc-dev/superdoc/issues/1798)) ([aa7e957](https://github.com/superdoc-dev/superdoc/commit/aa7e957dabbe8a6bec9f5e30801a3bafb8369b11))
* **comments:** add position-ordered comments getter ([#1774](https://github.com/superdoc-dev/superdoc/issues/1774)) ([bdac914](https://github.com/superdoc-dev/superdoc/commit/bdac914cdb1a0d399b70ef46c13a7e6155372f01))
* include non-breaking spaces in search ([#1768](https://github.com/superdoc-dev/superdoc/issues/1768)) ([d2784b9](https://github.com/superdoc-dev/superdoc/commit/d2784b941336037a63df8aa554318df22b653498))
* search cross block anchor ([#1799](https://github.com/superdoc-dev/superdoc/issues/1799)) ([09efa63](https://github.com/superdoc-dev/superdoc/commit/09efa634bbbdcd821f3841fe6382c1d7a41b8cb7))
* view options print and web ([#1793](https://github.com/superdoc-dev/superdoc/issues/1793)) ([82adcb1](https://github.com/superdoc-dev/superdoc/commit/82adcb1912c7703399b0aac394248bf23da4ce41))

# [1.8.0-next.11](https://github.com/superdoc-dev/superdoc/compare/v1.8.0-next.10...v1.8.0-next.11) (2026-01-21)


### Features

* add visual indication for tracked change, comments and nested comments ([#1770](https://github.com/superdoc-dev/superdoc/issues/1770)) ([8eb07e4](https://github.com/superdoc-dev/superdoc/commit/8eb07e43a1a17a9c41d50ff24937832d4e191aa5))

# [1.8.0-next.10](https://github.com/superdoc-dev/superdoc/compare/v1.8.0-next.9...v1.8.0-next.10) (2026-01-21)


### Bug Fixes

* reorganize style resolution in the layout engine (SD-1411) ([#1786](https://github.com/superdoc-dev/superdoc/issues/1786)) ([1845b76](https://github.com/superdoc-dev/superdoc/commit/1845b76a2c1f8a00aa3aa2b1ca855dd7185d7aaa))

# [1.8.0-next.9](https://github.com/superdoc-dev/superdoc/compare/v1.8.0-next.8...v1.8.0-next.9) (2026-01-21)


### Features

* view options print and web ([#1793](https://github.com/superdoc-dev/superdoc/issues/1793)) ([82adcb1](https://github.com/superdoc-dev/superdoc/commit/82adcb1912c7703399b0aac394248bf23da4ce41))

# [1.8.0-next.8](https://github.com/superdoc-dev/superdoc/compare/v1.8.0-next.7...v1.8.0-next.8) (2026-01-21)


### Features

* search cross block anchor ([#1799](https://github.com/superdoc-dev/superdoc/issues/1799)) ([09efa63](https://github.com/superdoc-dev/superdoc/commit/09efa634bbbdcd821f3841fe6382c1d7a41b8cb7))

# [1.8.0-next.7](https://github.com/superdoc-dev/superdoc/compare/v1.8.0-next.6...v1.8.0-next.7) (2026-01-21)


### Bug Fixes

* **search:** preserve leading/trailing whitespace in flexible matches ([#1788](https://github.com/superdoc-dev/superdoc/issues/1788)) ([c5d6751](https://github.com/superdoc-dev/superdoc/commit/c5d6751b6c37a7e01f86d97aec5a9e854c4d0cc9))


### Features

* comment anchor helpers ([#1796](https://github.com/superdoc-dev/superdoc/issues/1796)) ([595bdc6](https://github.com/superdoc-dev/superdoc/commit/595bdc68660a508dede2d1f58c8a29f609db7cac))
* comment highlight config ([#1798](https://github.com/superdoc-dev/superdoc/issues/1798)) ([aa7e957](https://github.com/superdoc-dev/superdoc/commit/aa7e957dabbe8a6bec9f5e30801a3bafb8369b11))
* **comments:** add position-ordered comments getter ([#1774](https://github.com/superdoc-dev/superdoc/issues/1774)) ([bdac914](https://github.com/superdoc-dev/superdoc/commit/bdac914cdb1a0d399b70ef46c13a7e6155372f01))

# [1.8.0-next.6](https://github.com/superdoc-dev/superdoc/compare/v1.8.0-next.5...v1.8.0-next.6) (2026-01-20)


### Bug Fixes

* annotation drop ([#1789](https://github.com/superdoc-dev/superdoc/issues/1789)) ([f384213](https://github.com/superdoc-dev/superdoc/commit/f3842134ab2648fc46752688350dbebb88f58f5a))
* annotation selection, applying formatting ([#1784](https://github.com/superdoc-dev/superdoc/issues/1784)) ([924af4b](https://github.com/superdoc-dev/superdoc/commit/924af4be941717c202821ba10d9372dbe78a1954))

# [1.8.0-next.4](https://github.com/superdoc-dev/superdoc/compare/v1.8.0-next.3...v1.8.0-next.4) (2026-01-17)


### Bug Fixes

* **layout:** default missing lineRule to auto for OOXML line spacing ([d0fd582](https://github.com/superdoc-dev/superdoc/commit/d0fd582451e586b8423bf988b8fb9099b924c872))

# [1.8.0-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.8.0-next.2...v1.8.0-next.3) (2026-01-16)


### Features

* include non-breaking spaces in search ([#1768](https://github.com/superdoc-dev/superdoc/issues/1768)) ([d2784b9](https://github.com/superdoc-dev/superdoc/commit/d2784b941336037a63df8aa554318df22b653498))

# [1.8.0-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.8.0-next.1...v1.8.0-next.2) (2026-01-16)


### Bug Fixes

* add addToHistory to new insertTrackedChange command ([#1767](https://github.com/superdoc-dev/superdoc/issues/1767)) ([e5081be](https://github.com/superdoc-dev/superdoc/commit/e5081be4abdc108f348ea91b95092ae643567c91))
* annotation selection ([#1762](https://github.com/superdoc-dev/superdoc/issues/1762)) ([1c831cc](https://github.com/superdoc-dev/superdoc/commit/1c831cca106584d094f9d07c00f22fd51374ef1e))
* guard against null editor ref in telemetry handler ([#1763](https://github.com/superdoc-dev/superdoc/issues/1763)) ([16b3a9a](https://github.com/superdoc-dev/superdoc/commit/16b3a9a2d4f5155ea967b4bbe6c2aadb996daef0))
* preserve nested comment ranges on export (SD-1518) ([#1765](https://github.com/superdoc-dev/superdoc/issues/1765)) ([9b81f9a](https://github.com/superdoc-dev/superdoc/commit/9b81f9a3c265e3a22d6286fec7557d489287c798))

# [1.8.0-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.7.0...v1.8.0-next.1) (2026-01-16)


### Features

* add insertTrackedChange programmatic shortcut ([#1761](https://github.com/superdoc-dev/superdoc/issues/1761)) ([cd0628e](https://github.com/superdoc-dev/superdoc/commit/cd0628e82c2a15de41895c3e073d2d516a88532c))

# [1.7.0](https://github.com/superdoc-dev/superdoc/compare/v1.6.1...v1.7.0) (2026-01-16)


### Bug Fixes

* add column balancing and INDEX field support ([#1753](https://github.com/superdoc-dev/superdoc/issues/1753)) ([b2a6f6b](https://github.com/superdoc-dev/superdoc/commit/b2a6f6b931c505751f54ff0fe6cc1b8f7071fbbf))
* add dispatch method type and mark view as optional for headless mode ([#1728](https://github.com/superdoc-dev/superdoc/issues/1728)) ([45195d7](https://github.com/superdoc-dev/superdoc/commit/45195d78b4eb5b7b879ce4837393ce83f03ba595))
* add type declaration for Editor.loadXmlData and Editor.open ([#1727](https://github.com/superdoc-dev/superdoc/issues/1727)) ([ae452a9](https://github.com/superdoc-dev/superdoc/commit/ae452a98409e6c34c9d08b1ba12e2c21e0f9f0ab))
* anchor images in table cells ([#1742](https://github.com/superdoc-dev/superdoc/issues/1742)) ([f77e7bd](https://github.com/superdoc-dev/superdoc/commit/f77e7bd538fc013d7de0bfc66c1c4880761c61b7))
* annotation issues ([#1752](https://github.com/superdoc-dev/superdoc/issues/1752)) ([9b13ce0](https://github.com/superdoc-dev/superdoc/commit/9b13ce0141f9f526bdaa6cfc5ea18616290b0688))
* bug watermarks render darker than they should [SD-1469] ([#1737](https://github.com/superdoc-dev/superdoc/issues/1737)) ([7ce423d](https://github.com/superdoc-dev/superdoc/commit/7ce423d445366c0e400b4143bec3cdd9d8b28e88))
* **comments:** create dynamic comment export system based on document origin type ([#1733](https://github.com/superdoc-dev/superdoc/issues/1733)) ([b55fddf](https://github.com/superdoc-dev/superdoc/commit/b55fddf429549f462e1b61747c89e2ab85ad4d45)), closes [#1618](https://github.com/superdoc-dev/superdoc/issues/1618)
* correct indentation for table cells with explicit tab positioning ([#1743](https://github.com/superdoc-dev/superdoc/issues/1743)) ([1fd6b74](https://github.com/superdoc-dev/superdoc/commit/1fd6b74a95c0eae8b1b23c27e7046ae529c95fc3))
* empty line heights ([#1748](https://github.com/superdoc-dev/superdoc/issues/1748)) ([31ce45c](https://github.com/superdoc-dev/superdoc/commit/31ce45c9fbcc7c7e630f48a877791ea94a63c960))
* guarding against component init when ref is null ([#1746](https://github.com/superdoc-dev/superdoc/issues/1746)) ([253eeea](https://github.com/superdoc-dev/superdoc/commit/253eeeab9a28d5c2b771385d0d812e501f20ac55))
* handle fldSimple syntax for page number fields ([#1755](https://github.com/superdoc-dev/superdoc/issues/1755)) ([8325783](https://github.com/superdoc-dev/superdoc/commit/83257837cc3123e6696a8fd231e96a4b31411c1b))
* keepNext rules for paragraphs ([#1758](https://github.com/superdoc-dev/superdoc/issues/1758)) ([7862892](https://github.com/superdoc-dev/superdoc/commit/7862892c85235fdf67bafe562070f0780888b356))
* respect keepLines and contextual spacing in page break calculations ([#1747](https://github.com/superdoc-dev/superdoc/issues/1747)) ([189c054](https://github.com/superdoc-dev/superdoc/commit/189c05453bcdff0688a84f81a014462d12aceeb8))
* try different yaml format for label ([0484c89](https://github.com/superdoc-dev/superdoc/commit/0484c8982241a21ba39b3c202f01eae90a4d7ee3))
* vector text box with content rendering ([#1741](https://github.com/superdoc-dev/superdoc/issues/1741)) ([b14e88e](https://github.com/superdoc-dev/superdoc/commit/b14e88e873455f93eac2005443f1782df9d29ce0))
* vertical align bug in sections ([#1745](https://github.com/superdoc-dev/superdoc/issues/1745)) ([b53fb6a](https://github.com/superdoc-dev/superdoc/commit/b53fb6a4a54ceaba7283b688e75279b07f3fc051))


### Features

* annotation rendering ([#1738](https://github.com/superdoc-dev/superdoc/issues/1738)) ([317b1c4](https://github.com/superdoc-dev/superdoc/commit/317b1c4239f6eb1e52446f1745915e9da138b5a1))

# [1.7.0-next.10](https://github.com/superdoc-dev/superdoc/compare/v1.7.0-next.9...v1.7.0-next.10) (2026-01-16)


### Bug Fixes

* keepNext rules for paragraphs ([#1758](https://github.com/superdoc-dev/superdoc/issues/1758)) ([7862892](https://github.com/superdoc-dev/superdoc/commit/7862892c85235fdf67bafe562070f0780888b356))

# [1.7.0-next.9](https://github.com/superdoc-dev/superdoc/compare/v1.7.0-next.8...v1.7.0-next.9) (2026-01-16)


### Bug Fixes

* **comments:** create dynamic comment export system based on document origin type ([#1733](https://github.com/superdoc-dev/superdoc/issues/1733)) ([b55fddf](https://github.com/superdoc-dev/superdoc/commit/b55fddf429549f462e1b61747c89e2ab85ad4d45)), closes [#1618](https://github.com/superdoc-dev/superdoc/issues/1618)

# [1.7.0-next.8](https://github.com/superdoc-dev/superdoc/compare/v1.7.0-next.7...v1.7.0-next.8) (2026-01-15)


### Bug Fixes

* add column balancing and INDEX field support ([#1753](https://github.com/superdoc-dev/superdoc/issues/1753)) ([b2a6f6b](https://github.com/superdoc-dev/superdoc/commit/b2a6f6b931c505751f54ff0fe6cc1b8f7071fbbf))

# [1.7.0-next.7](https://github.com/superdoc-dev/superdoc/compare/v1.7.0-next.6...v1.7.0-next.7) (2026-01-15)


### Bug Fixes

* annotation issues ([#1752](https://github.com/superdoc-dev/superdoc/issues/1752)) ([9b13ce0](https://github.com/superdoc-dev/superdoc/commit/9b13ce0141f9f526bdaa6cfc5ea18616290b0688))
* handle fldSimple syntax for page number fields ([#1755](https://github.com/superdoc-dev/superdoc/issues/1755)) ([8325783](https://github.com/superdoc-dev/superdoc/commit/83257837cc3123e6696a8fd231e96a4b31411c1b))
* try different yaml format for label ([0484c89](https://github.com/superdoc-dev/superdoc/commit/0484c8982241a21ba39b3c202f01eae90a4d7ee3))

# [1.7.0-next.6](https://github.com/superdoc-dev/superdoc/compare/v1.7.0-next.5...v1.7.0-next.6) (2026-01-15)


### Bug Fixes

* empty line heights ([#1748](https://github.com/superdoc-dev/superdoc/issues/1748)) ([31ce45c](https://github.com/superdoc-dev/superdoc/commit/31ce45c9fbcc7c7e630f48a877791ea94a63c960))

# [1.7.0-next.5](https://github.com/superdoc-dev/superdoc/compare/v1.7.0-next.4...v1.7.0-next.5) (2026-01-15)


### Bug Fixes

* guarding against component init when ref is null ([#1746](https://github.com/superdoc-dev/superdoc/issues/1746)) ([253eeea](https://github.com/superdoc-dev/superdoc/commit/253eeeab9a28d5c2b771385d0d812e501f20ac55))
* respect keepLines and contextual spacing in page break calculations ([#1747](https://github.com/superdoc-dev/superdoc/issues/1747)) ([189c054](https://github.com/superdoc-dev/superdoc/commit/189c05453bcdff0688a84f81a014462d12aceeb8))

# [1.7.0-next.4](https://github.com/superdoc-dev/superdoc/compare/v1.7.0-next.3...v1.7.0-next.4) (2026-01-15)


### Bug Fixes

* anchor images in table cells ([#1742](https://github.com/superdoc-dev/superdoc/issues/1742)) ([f77e7bd](https://github.com/superdoc-dev/superdoc/commit/f77e7bd538fc013d7de0bfc66c1c4880761c61b7))
* vertical align bug in sections ([#1745](https://github.com/superdoc-dev/superdoc/issues/1745)) ([b53fb6a](https://github.com/superdoc-dev/superdoc/commit/b53fb6a4a54ceaba7283b688e75279b07f3fc051))

# [1.7.0-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.7.0-next.2...v1.7.0-next.3) (2026-01-14)


### Bug Fixes

* correct indentation for table cells with explicit tab positioning ([#1743](https://github.com/superdoc-dev/superdoc/issues/1743)) ([1fd6b74](https://github.com/superdoc-dev/superdoc/commit/1fd6b74a95c0eae8b1b23c27e7046ae529c95fc3))

# [1.7.0-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.7.0-next.1...v1.7.0-next.2) (2026-01-14)


### Reverts

* Revert "chore(release): 1.7.0-next.1 [skip ci]" ([3e0afa8](https://github.com/superdoc-dev/superdoc/commit/3e0afa8b5237520a44315cf6ddc635de58f6f6a6))

## [1.6.2-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.6.2-next.1...v1.6.2-next.2) (2026-01-14)


### Bug Fixes

* bug watermarks render darker than they should [SD-1469] ([#1737](https://github.com/superdoc-dev/superdoc/issues/1737)) ([7ce423d](https://github.com/superdoc-dev/superdoc/commit/7ce423d445366c0e400b4143bec3cdd9d8b28e88))

## [1.6.2-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.6.1...v1.6.2-next.1) (2026-01-14)


### Bug Fixes

* add dispatch method type and mark view as optional for headless mode ([#1728](https://github.com/superdoc-dev/superdoc/issues/1728)) ([45195d7](https://github.com/superdoc-dev/superdoc/commit/45195d78b4eb5b7b879ce4837393ce83f03ba595))
* add type declaration for Editor.loadXmlData and Editor.open ([#1727](https://github.com/superdoc-dev/superdoc/issues/1727)) ([ae452a9](https://github.com/superdoc-dev/superdoc/commit/ae452a98409e6c34c9d08b1ba12e2c21e0f9f0ab))

## [1.6.1](https://github.com/superdoc-dev/superdoc/compare/v1.6.0...v1.6.1) (2026-01-14)


### Bug Fixes

* section mismatch footer numbering ([#1732](https://github.com/superdoc-dev/superdoc/issues/1732)) ([96880ba](https://github.com/superdoc-dev/superdoc/commit/96880ba779f069001d5de125c6fb703c008bcd5d))

## [1.6.1-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.6.0...v1.6.1-next.1) (2026-01-14)


### Bug Fixes

* section mismatch footer numbering ([#1732](https://github.com/superdoc-dev/superdoc/issues/1732)) ([96880ba](https://github.com/superdoc-dev/superdoc/commit/96880ba779f069001d5de125c6fb703c008bcd5d))

# [1.6.0](https://github.com/superdoc-dev/superdoc/compare/v1.5.0...v1.6.0) (2026-01-14)


### Features

* **comments:** add public addComment command with simplified API ([#1731](https://github.com/superdoc-dev/superdoc/issues/1731)) ([850ee46](https://github.com/superdoc-dev/superdoc/commit/850ee469bc2cf39e807ecb0ba96ea9043f668288))
* footnotes render ([#1686](https://github.com/superdoc-dev/superdoc/issues/1686)) ([f6c38d4](https://github.com/superdoc-dev/superdoc/commit/f6c38d4d102772984a5a63ddd327ebe204b776cf))
* handling large footnotes, multi-column footnotes ([#1729](https://github.com/superdoc-dev/superdoc/issues/1729)) ([e4a41a3](https://github.com/superdoc-dev/superdoc/commit/e4a41a3d96db88ca59436db130f3a62440bf5577))
* search improvements, position tracking  ([#1730](https://github.com/superdoc-dev/superdoc/issues/1730)) ([d1b736d](https://github.com/superdoc-dev/superdoc/commit/d1b736d3b295e0ebc1454b5ce483a1174c5305f8))

# [1.6.0-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.6.0-next.2...v1.6.0-next.3) (2026-01-14)


### Features

* **comments:** add public addComment command with simplified API ([#1731](https://github.com/superdoc-dev/superdoc/issues/1731)) ([850ee46](https://github.com/superdoc-dev/superdoc/commit/850ee469bc2cf39e807ecb0ba96ea9043f668288))

# [1.6.0-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.6.0-next.1...v1.6.0-next.2) (2026-01-14)


### Features

* search improvements, position tracking  ([#1730](https://github.com/superdoc-dev/superdoc/issues/1730)) ([d1b736d](https://github.com/superdoc-dev/superdoc/commit/d1b736d3b295e0ebc1454b5ce483a1174c5305f8))

# [1.6.0-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.5.0...v1.6.0-next.1) (2026-01-14)


### Features

* footnotes render ([#1686](https://github.com/superdoc-dev/superdoc/issues/1686)) ([f6c38d4](https://github.com/superdoc-dev/superdoc/commit/f6c38d4d102772984a5a63ddd327ebe204b776cf))
* handling large footnotes, multi-column footnotes ([#1729](https://github.com/superdoc-dev/superdoc/issues/1729)) ([e4a41a3](https://github.com/superdoc-dev/superdoc/commit/e4a41a3d96db88ca59436db130f3a62440bf5577))

# [1.5.0](https://github.com/superdoc-dev/superdoc/compare/v1.4.0...v1.5.0) (2026-01-13)


### Bug Fixes

* add missing DrawingML namespaces ([#1719](https://github.com/superdoc-dev/superdoc/issues/1719)) ([9bfd977](https://github.com/superdoc-dev/superdoc/commit/9bfd977837fa2c6137eed3149794292580ddb2ac))
* adding table to sdt ([#1709](https://github.com/superdoc-dev/superdoc/issues/1709)) ([260b987](https://github.com/superdoc-dev/superdoc/commit/260b987e1a20ff3405f41b16d02ef936db023578))
* annotation events in layout engine ([#1685](https://github.com/superdoc-dev/superdoc/issues/1685)) ([db24ff8](https://github.com/superdoc-dev/superdoc/commit/db24ff80afb9c048899060e3121e6b4d3e2edfac))
* **comments:** improve comments on tracked changes imported from google docs and word [SD-1033] ([#1631](https://github.com/superdoc-dev/superdoc/issues/1631)) ([1d8873a](https://github.com/superdoc-dev/superdoc/commit/1d8873ae372a65d16c5f46c4dee9980e8159c6e2))
* deleting tracked change in suggestion to match word ([#1710](https://github.com/superdoc-dev/superdoc/issues/1710)) ([d6e780f](https://github.com/superdoc-dev/superdoc/commit/d6e780f8fc753cb6cd94d4317f482c997b9bc9a5))
* editor type ([#1702](https://github.com/superdoc-dev/superdoc/issues/1702)) ([902e745](https://github.com/superdoc-dev/superdoc/commit/902e7456c3b8ac957d19c0b7d65fd3451ce48bd6))
* handle table cell borders from styles ([#1722](https://github.com/superdoc-dev/superdoc/issues/1722)) ([6ef1a11](https://github.com/superdoc-dev/superdoc/commit/6ef1a1138adf23e9873a642aa63327f20724396b))
* latent styles crash ([#1711](https://github.com/superdoc-dev/superdoc/issues/1711)) ([f96bced](https://github.com/superdoc-dev/superdoc/commit/f96bced48f6b3932fd3573ed612d2d815c701efd))
* new lines in sdts rendering incorrectly ([#1705](https://github.com/superdoc-dev/superdoc/issues/1705)) ([777bc33](https://github.com/superdoc-dev/superdoc/commit/777bc333fd55a64079be6fe4f620397d310ad979))
* propagate SDT metadata to nested tables in cells ([#1704](https://github.com/superdoc-dev/superdoc/issues/1704)) ([b5b74a1](https://github.com/superdoc-dev/superdoc/commit/b5b74a1fca8d65c98c5d85363a90897271fe3efa))
* remove pm position on hover ([#1726](https://github.com/superdoc-dev/superdoc/issues/1726)) ([8bdacc3](https://github.com/superdoc-dev/superdoc/commit/8bdacc326dc5883533ec155e7e2b2794a19278de))
* sectPr handling of next page ([#1701](https://github.com/superdoc-dev/superdoc/issues/1701)) ([7c96ae5](https://github.com/superdoc-dev/superdoc/commit/7c96ae50da6dfa1bfc95d8aa6bf2dd2335700a88))
* shapes ([#1708](https://github.com/superdoc-dev/superdoc/issues/1708)) ([c1dd983](https://github.com/superdoc-dev/superdoc/commit/c1dd9832bf86a77e57d258eb09782f3e3a4f3b11))
* some block sdts with nesting not displaying ([#1703](https://github.com/superdoc-dev/superdoc/issues/1703)) ([e09d9d8](https://github.com/superdoc-dev/superdoc/commit/e09d9d8fabb004645ad54fa13bbe4fbc2bc6e1c7))
* table grid import/export ([#1712](https://github.com/superdoc-dev/superdoc/issues/1712)) ([efe09fa](https://github.com/superdoc-dev/superdoc/commit/efe09faf426f142b0371e0ff221decd488b7b295))


### Features

* add getElementAtPos utility fn ([#1706](https://github.com/superdoc-dev/superdoc/issues/1706)) ([0e34762](https://github.com/superdoc-dev/superdoc/commit/0e34762e6cd2cc67b06d897c46bd6276714ff132))
* editable ranges part 2 ([#1618](https://github.com/superdoc-dev/superdoc/issues/1618)) ([e9a5396](https://github.com/superdoc-dev/superdoc/commit/e9a539695ff12c2cb3d7cd4c972a9414b764bad1))

# [1.5.0-next.9](https://github.com/superdoc-dev/superdoc/compare/v1.5.0-next.8...v1.5.0-next.9) (2026-01-13)


### Bug Fixes

* remove pm position on hover ([#1726](https://github.com/superdoc-dev/superdoc/issues/1726)) ([8bdacc3](https://github.com/superdoc-dev/superdoc/commit/8bdacc326dc5883533ec155e7e2b2794a19278de))

# [1.5.0-next.8](https://github.com/superdoc-dev/superdoc/compare/v1.5.0-next.7...v1.5.0-next.8) (2026-01-13)


### Bug Fixes

* handle table cell borders from styles ([#1722](https://github.com/superdoc-dev/superdoc/issues/1722)) ([6ef1a11](https://github.com/superdoc-dev/superdoc/commit/6ef1a1138adf23e9873a642aa63327f20724396b))


### Features

* editable ranges part 2 ([#1618](https://github.com/superdoc-dev/superdoc/issues/1618)) ([e9a5396](https://github.com/superdoc-dev/superdoc/commit/e9a539695ff12c2cb3d7cd4c972a9414b764bad1))

# [1.5.0-next.7](https://github.com/superdoc-dev/superdoc/compare/v1.5.0-next.6...v1.5.0-next.7) (2026-01-12)


### Bug Fixes

* add missing DrawingML namespaces ([#1719](https://github.com/superdoc-dev/superdoc/issues/1719)) ([9bfd977](https://github.com/superdoc-dev/superdoc/commit/9bfd977837fa2c6137eed3149794292580ddb2ac))

# [1.5.0-next.6](https://github.com-Harbour-Enterprises/superdoc-dev/superdoc/compare/v1.5.0-next.5...v1.5.0-next.6) (2026-01-12)


### Bug Fixes

* table grid import/export ([#1712](https://github.com-Harbour-Enterprises/superdoc-dev/superdoc/issues/1712)) ([efe09fa](https://github.com-Harbour-Enterprises/superdoc-dev/superdoc/commit/efe09faf426f142b0371e0ff221decd488b7b295))

# [1.5.0-next.6](https://github.com/superdoc-dev/superdoc/compare/v1.5.0-next.5...v1.5.0-next.6) (2026-01-12)


### Bug Fixes

* table grid import/export ([#1712](https://github.com/superdoc-dev/superdoc/issues/1712)) ([efe09fa](https://github.com/superdoc-dev/superdoc/commit/efe09faf426f142b0371e0ff221decd488b7b295))

# [1.5.0-next.5](https://github.com/superdoc-dev/superdoc/compare/v1.5.0-next.4...v1.5.0-next.5) (2026-01-11)


### Bug Fixes

* latent styles crash ([#1711](https://github.com/superdoc-dev/superdoc/issues/1711)) ([f96bced](https://github.com/superdoc-dev/superdoc/commit/f96bced48f6b3932fd3573ed612d2d815c701efd))

# [1.5.0-next.4](https://github.com/superdoc-dev/superdoc/compare/v1.5.0-next.3...v1.5.0-next.4) (2026-01-10)


### Bug Fixes

* deleting tracked change in suggestion to match word ([#1710](https://github.com/superdoc-dev/superdoc/issues/1710)) ([d6e780f](https://github.com/superdoc-dev/superdoc/commit/d6e780f8fc753cb6cd94d4317f482c997b9bc9a5))

# [1.5.0-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.5.0-next.2...v1.5.0-next.3) (2026-01-10)


### Bug Fixes

* adding table to sdt ([#1709](https://github.com/superdoc-dev/superdoc/issues/1709)) ([260b987](https://github.com/superdoc-dev/superdoc/commit/260b987e1a20ff3405f41b16d02ef936db023578))

# [1.5.0-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.5.0-next.1...v1.5.0-next.2) (2026-01-10)


### Bug Fixes

* shapes ([#1708](https://github.com/superdoc-dev/superdoc/issues/1708)) ([c1dd983](https://github.com/superdoc-dev/superdoc/commit/c1dd9832bf86a77e57d258eb09782f3e3a4f3b11))

# [1.5.0-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.4.1-next.3...v1.5.0-next.1) (2026-01-10)


### Bug Fixes

* editor type ([#1702](https://github.com/superdoc-dev/superdoc/issues/1702)) ([902e745](https://github.com/superdoc-dev/superdoc/commit/902e7456c3b8ac957d19c0b7d65fd3451ce48bd6))
* new lines in sdts rendering incorrectly ([#1705](https://github.com/superdoc-dev/superdoc/issues/1705)) ([777bc33](https://github.com/superdoc-dev/superdoc/commit/777bc333fd55a64079be6fe4f620397d310ad979))
* propagate SDT metadata to nested tables in cells ([#1704](https://github.com/superdoc-dev/superdoc/issues/1704)) ([b5b74a1](https://github.com/superdoc-dev/superdoc/commit/b5b74a1fca8d65c98c5d85363a90897271fe3efa))
* some block sdts with nesting not displaying ([#1703](https://github.com/superdoc-dev/superdoc/issues/1703)) ([e09d9d8](https://github.com/superdoc-dev/superdoc/commit/e09d9d8fabb004645ad54fa13bbe4fbc2bc6e1c7))


### Features

* add getElementAtPos utility fn ([#1706](https://github.com/superdoc-dev/superdoc/issues/1706)) ([0e34762](https://github.com/superdoc-dev/superdoc/commit/0e34762e6cd2cc67b06d897c46bd6276714ff132))

## [1.4.1-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.4.1-next.2...v1.4.1-next.3) (2026-01-10)


### Bug Fixes

* sectPr handling of next page ([#1701](https://github.com/superdoc-dev/superdoc/issues/1701)) ([7c96ae5](https://github.com/superdoc-dev/superdoc/commit/7c96ae50da6dfa1bfc95d8aa6bf2dd2335700a88))

## [1.4.1-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.4.1-next.1...v1.4.1-next.2) (2026-01-09)


### Bug Fixes

* annotation events in layout engine ([#1685](https://github.com/superdoc-dev/superdoc/issues/1685)) ([db24ff8](https://github.com/superdoc-dev/superdoc/commit/db24ff80afb9c048899060e3121e6b4d3e2edfac))

## [1.4.1-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.4.0...v1.4.1-next.1) (2026-01-09)


### Bug Fixes

* **comments:** improve comments on tracked changes imported from google docs and word [SD-1033] ([#1631](https://github.com/superdoc-dev/superdoc/issues/1631)) ([1d8873a](https://github.com/superdoc-dev/superdoc/commit/1d8873ae372a65d16c5f46c4dee9980e8159c6e2))

# [1.4.0](https://github.com/superdoc-dev/superdoc/compare/v1.3.0...v1.4.0) (2026-01-09)


### Bug Fixes

* **ai:** use semver range for superdoc peer dependency ([#1684](https://github.com/superdoc-dev/superdoc/issues/1684)) ([f9f9e20](https://github.com/superdoc-dev/superdoc/commit/f9f9e20ed0c340b3bf009aa3598f98640a4971eb))
* caret in lists ([#1683](https://github.com/superdoc-dev/superdoc/issues/1683)) ([c7b9847](https://github.com/superdoc-dev/superdoc/commit/c7b984783eee79698d74617e26c5f6eeb76d4a6d))
* **comments:** preserve resolved comment status and range on export ([#1674](https://github.com/superdoc-dev/superdoc/issues/1674)) ([390e40a](https://github.com/superdoc-dev/superdoc/commit/390e40afc2358e7ad4f1f90e9c6ea3044f94ec73))
* correctly position vector shape relative to paragraph ([#1687](https://github.com/superdoc-dev/superdoc/issues/1687)) ([4c38cb9](https://github.com/superdoc-dev/superdoc/commit/4c38cb9145c2256f2ff289338fb5cf58ecf3a4c7))
* examples screenshots ([2867e4d](https://github.com/superdoc-dev/superdoc/commit/2867e4d044b14f6cc5222cc757bfa9ec17859220))
* examples tests ([#1691](https://github.com/superdoc-dev/superdoc/issues/1691)) ([8abcdc1](https://github.com/superdoc-dev/superdoc/commit/8abcdc106e00a85faa51063d8f68c362201a3730))
* **layout:** treat auto line spacing as 240ths multipliers ([#1690](https://github.com/superdoc-dev/superdoc/issues/1690)) ([1673543](https://github.com/superdoc-dev/superdoc/commit/1673543580467a27af57791243999b77d1756a63))
* pass w:vanish through to layout engine ([#1696](https://github.com/superdoc-dev/superdoc/issues/1696)) ([2c0ba9c](https://github.com/superdoc-dev/superdoc/commit/2c0ba9ceb783226ffe966547b39b1ea8a5a8da10))
* performance - exclude pmStart/pmEnd from fragment change detection ([#1651](https://github.com/superdoc-dev/superdoc/issues/1651)) ([4502422](https://github.com/superdoc-dev/superdoc/commit/45024222ef98fe8bc808bce4cdfad7f0464df1cc))
* tab spacing for toc ([#1695](https://github.com/superdoc-dev/superdoc/issues/1695)) ([7e24eaa](https://github.com/superdoc-dev/superdoc/commit/7e24eaa90f12ac08b57e75ee4901bac8ef7e4ec4))


### Features

* **comments:** add ability to view comments and tc in viewing mode ([#1688](https://github.com/superdoc-dev/superdoc/issues/1688)) ([86d44f5](https://github.com/superdoc-dev/superdoc/commit/86d44f5abdff5c9183c40a227471aae62e632b50))
* render watermarks ([#1694](https://github.com/superdoc-dev/superdoc/issues/1694)) ([01a25af](https://github.com/superdoc-dev/superdoc/commit/01a25af9b0abb31d94ce9887d708a2d9dc4f11f8))

# [1.4.0-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.4.0-next.2...v1.4.0-next.3) (2026-01-09)


### Bug Fixes

* pass w:vanish through to layout engine ([#1696](https://github.com/superdoc-dev/superdoc/issues/1696)) ([2c0ba9c](https://github.com/superdoc-dev/superdoc/commit/2c0ba9ceb783226ffe966547b39b1ea8a5a8da10))
* tab spacing for toc ([#1695](https://github.com/superdoc-dev/superdoc/issues/1695)) ([7e24eaa](https://github.com/superdoc-dev/superdoc/commit/7e24eaa90f12ac08b57e75ee4901bac8ef7e4ec4))

# [1.4.0-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.4.0-next.1...v1.4.0-next.2) (2026-01-09)


### Features

* render watermarks ([#1694](https://github.com/superdoc-dev/superdoc/issues/1694)) ([01a25af](https://github.com/superdoc-dev/superdoc/commit/01a25af9b0abb31d94ce9887d708a2d9dc4f11f8))

# [1.4.0-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.3.1-next.3...v1.4.0-next.1) (2026-01-09)


### Bug Fixes

* **ai:** use semver range for superdoc peer dependency ([#1684](https://github.com/superdoc-dev/superdoc/issues/1684)) ([f9f9e20](https://github.com/superdoc-dev/superdoc/commit/f9f9e20ed0c340b3bf009aa3598f98640a4971eb))
* examples screenshots ([2867e4d](https://github.com/superdoc-dev/superdoc/commit/2867e4d044b14f6cc5222cc757bfa9ec17859220))
* examples tests ([#1691](https://github.com/superdoc-dev/superdoc/issues/1691)) ([8abcdc1](https://github.com/superdoc-dev/superdoc/commit/8abcdc106e00a85faa51063d8f68c362201a3730))
* **layout:** treat auto line spacing as 240ths multipliers ([#1690](https://github.com/superdoc-dev/superdoc/issues/1690)) ([1673543](https://github.com/superdoc-dev/superdoc/commit/1673543580467a27af57791243999b77d1756a63))


### Features

* **comments:** add ability to view comments and tc in viewing mode ([#1688](https://github.com/superdoc-dev/superdoc/issues/1688)) ([86d44f5](https://github.com/superdoc-dev/superdoc/commit/86d44f5abdff5c9183c40a227471aae62e632b50))

## [1.3.1-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.3.1-next.2...v1.3.1-next.3) (2026-01-08)


### Bug Fixes

* **comments:** preserve resolved comment status and range on export ([#1674](https://github.com/superdoc-dev/superdoc/issues/1674)) ([390e40a](https://github.com/superdoc-dev/superdoc/commit/390e40afc2358e7ad4f1f90e9c6ea3044f94ec73))
* correctly position vector shape relative to paragraph ([#1687](https://github.com/superdoc-dev/superdoc/issues/1687)) ([4c38cb9](https://github.com/superdoc-dev/superdoc/commit/4c38cb9145c2256f2ff289338fb5cf58ecf3a4c7))

## [1.3.1-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.3.1-next.1...v1.3.1-next.2) (2026-01-08)


### Bug Fixes

* performance - exclude pmStart/pmEnd from fragment change detection ([#1651](https://github.com/superdoc-dev/superdoc/issues/1651)) ([4502422](https://github.com/superdoc-dev/superdoc/commit/45024222ef98fe8bc808bce4cdfad7f0464df1cc))

## [1.3.1-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.3.0...v1.3.1-next.1) (2026-01-08)


### Bug Fixes

* caret in lists ([#1683](https://github.com/superdoc-dev/superdoc/issues/1683)) ([c7b9847](https://github.com/superdoc-dev/superdoc/commit/c7b984783eee79698d74617e26c5f6eeb76d4a6d))

# [1.3.0](https://github.com/superdoc-dev/superdoc/compare/v1.2.1...v1.3.0) (2026-01-08)


### Bug Fixes

* account for indentation when drawing paragraph borders ([#1655](https://github.com/superdoc-dev/superdoc/issues/1655)) ([01a8d39](https://github.com/superdoc-dev/superdoc/commit/01a8d394784d714c539963430abc712dc360a0cd))
* additional fixes for view mode ([#1676](https://github.com/superdoc-dev/superdoc/issues/1676)) ([fc2b7d6](https://github.com/superdoc-dev/superdoc/commit/fc2b7d6436229b88453ddf7589fdfca333957c74))
* adjusted row height not preserved when table doesn't fit current page ([#1642](https://github.com/superdoc-dev/superdoc/issues/1642)) ([edcab55](https://github.com/superdoc-dev/superdoc/commit/edcab5507ee92d56ab25079b7345928c8dd7839a))
* allow override row borders ([#1672](https://github.com/superdoc-dev/superdoc/issues/1672)) ([a4bb109](https://github.com/superdoc-dev/superdoc/commit/a4bb109fde65f02442c4ee5e1930fe90877bc107))
* auto color in tables with dark cells ([#1644](https://github.com/superdoc-dev/superdoc/issues/1644)) ([f498a03](https://github.com/superdoc-dev/superdoc/commit/f498a03dff563e7e24aaed78cbbb3b93bedf23a8))
* bug - page number format from first section overrides number ([#1654](https://github.com/superdoc-dev/superdoc/issues/1654)) ([c45ecfa](https://github.com/superdoc-dev/superdoc/commit/c45ecfae71be17953e88662e8e646dab173b4c61))
* **comments:** use last paragraph paraId for threading ([#1671](https://github.com/superdoc-dev/superdoc/issues/1671)) ([50ffea6](https://github.com/superdoc-dev/superdoc/commit/50ffea69cfe167f895b65d0b36f0d9d41e15e6f7))
* effective gap ([580b52b](https://github.com/superdoc-dev/superdoc/commit/580b52b1996088cdf0bc8005ec079f909a55b840))
* empty display label and default label ([#1621](https://github.com/superdoc-dev/superdoc/issues/1621)) ([e29e14f](https://github.com/superdoc-dev/superdoc/commit/e29e14f37c27fbad19c87c3571fa26f901d8ced4))
* field annotation drag and drop ([#1668](https://github.com/superdoc-dev/superdoc/issues/1668)) ([659d152](https://github.com/superdoc-dev/superdoc/commit/659d152fa5349cde16800016680d3bef92ae548e))
* hanging indent in tables ([#1647](https://github.com/superdoc-dev/superdoc/issues/1647)) ([ee8a206](https://github.com/superdoc-dev/superdoc/commit/ee8a206378f0941fb2fa4ea02842fd3629f43350))
* header images that extend past area should be behind content ([#1669](https://github.com/superdoc-dev/superdoc/issues/1669)) ([bf7d679](https://github.com/superdoc-dev/superdoc/commit/bf7d6798c7698b884734b32b70993acb0bfa0cd0))
* header/footer sizes ([#1666](https://github.com/superdoc-dev/superdoc/issues/1666)) ([9cd0cce](https://github.com/superdoc-dev/superdoc/commit/9cd0ccebe0b07dbdace54a8a2c7fb06fdd225b01))
* hide tools bubble on cursor change ([#1678](https://github.com/superdoc-dev/superdoc/issues/1678)) ([1fb865d](https://github.com/superdoc-dev/superdoc/commit/1fb865d48d40045ed5be2dcd0692334a8aa5bdc7))
* indents from linked styles ([#1679](https://github.com/superdoc-dev/superdoc/issues/1679)) ([70bc68c](https://github.com/superdoc-dev/superdoc/commit/70bc68c07f7603f6f4845febe562f5fd6b72b5a1))
* layout engine not correctly supporting view mode ([#1673](https://github.com/superdoc-dev/superdoc/issues/1673)) ([b24d64e](https://github.com/superdoc-dev/superdoc/commit/b24d64e44db723245b8f76224f11cb20b9e60ea0))
* line wrap with right-align page numbers, page number font inheritance ([#1665](https://github.com/superdoc-dev/superdoc/issues/1665)) ([6a996f0](https://github.com/superdoc-dev/superdoc/commit/6a996f0eaaaf64299d11a5258319907ef349a112))
* list marker position when item contains tab ([#1658](https://github.com/superdoc-dev/superdoc/issues/1658)) ([e2148bb](https://github.com/superdoc-dev/superdoc/commit/e2148bb3a9fd0f6cbcc7d6cf9c0779a6756b6052))
* no comment bubbles in viewing mode ([#1680](https://github.com/superdoc-dev/superdoc/issues/1680)) ([653706e](https://github.com/superdoc-dev/superdoc/commit/653706e247c89d8b8858d87b8d185f928a48d65f))
* paragraph borders inside table cells ([#1646](https://github.com/superdoc-dev/superdoc/issues/1646)) ([13a3797](https://github.com/superdoc-dev/superdoc/commit/13a3797c3706ad75a55bb09a055f7fddd0662609))
* partial row height computation ([#1652](https://github.com/superdoc-dev/superdoc/issues/1652)) ([0ccd3c8](https://github.com/superdoc-dev/superdoc/commit/0ccd3c8c9924cc2a5d35cd9d09ff45dc1a964496))
* prevent crash when deleting tracked changes with empty nodes ([#1663](https://github.com/superdoc-dev/superdoc/issues/1663)) ([e8a02d7](https://github.com/superdoc-dev/superdoc/commit/e8a02d72c0e333fb323991ed493913845f12f1a1))
* ruler when comments are present ([#1681](https://github.com/superdoc-dev/superdoc/issues/1681)) ([90458a5](https://github.com/superdoc-dev/superdoc/commit/90458a5bd80dae60379547aa108ed5403ad1a072))
* screenshots ([39c9392](https://github.com/superdoc-dev/superdoc/commit/39c9392ecabe1447d41eabad7bdbf73c84b66e6e))
* section-aware ruler adjustments ([#1677](https://github.com/superdoc-dev/superdoc/issues/1677)) ([32b5bad](https://github.com/superdoc-dev/superdoc/commit/32b5badfbd94d5ff02a1424e3d18862a9191db8a))
* sync header/footer changes to ydoc ([#1623](https://github.com/superdoc-dev/superdoc/issues/1623)) ([0b581a5](https://github.com/superdoc-dev/superdoc/commit/0b581a5999d3b3e4a2319297d47acb798cfc9826))
* tab widths mid line ([#1682](https://github.com/superdoc-dev/superdoc/issues/1682)) ([92dabbe](https://github.com/superdoc-dev/superdoc/commit/92dabbe5ba63bb5333062044db37e5bbdf1437e3))
* table borders additional fixes ([ca034fc](https://github.com/superdoc-dev/superdoc/commit/ca034fc7baeaf92d74ad39b54518cfd530de2d5e))
* table widths with percents ([#1645](https://github.com/superdoc-dev/superdoc/issues/1645)) ([a64a7b7](https://github.com/superdoc-dev/superdoc/commit/a64a7b743279326bc5a0e72a6553d2f0e400a5ee))
* tabs extending past line width ([#1659](https://github.com/superdoc-dev/superdoc/issues/1659)) ([0f9c053](https://github.com/superdoc-dev/superdoc/commit/0f9c053476f86156cdd787f29481eab73656a702))
* take letter spacing into account when measuring text ([#1670](https://github.com/superdoc-dev/superdoc/issues/1670)) ([47c6bf7](https://github.com/superdoc-dev/superdoc/commit/47c6bf7ccf731928a9065caba92e0a8749578ae8))
* unify run styles and fix new list item runs ([#1650](https://github.com/superdoc-dev/superdoc/issues/1650)) ([65447ca](https://github.com/superdoc-dev/superdoc/commit/65447cad6f1b4227ec011aaf30b69c9650202dd5))


### Features

* add support for subscript and superscript rendering ([#1649](https://github.com/superdoc-dev/superdoc/issues/1649)) ([1e3019c](https://github.com/superdoc-dev/superdoc/commit/1e3019cbc8d28d6cf9bd1720c56926b6fc300e8d))

# [1.3.0-next.14](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.13...v1.3.0-next.14) (2026-01-08)


### Bug Fixes

* ruler when comments are present ([#1681](https://github.com/superdoc-dev/superdoc/issues/1681)) ([90458a5](https://github.com/superdoc-dev/superdoc/commit/90458a5bd80dae60379547aa108ed5403ad1a072))
* tab widths mid line ([#1682](https://github.com/superdoc-dev/superdoc/issues/1682)) ([92dabbe](https://github.com/superdoc-dev/superdoc/commit/92dabbe5ba63bb5333062044db37e5bbdf1437e3))

# [1.3.0-next.13](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.12...v1.3.0-next.13) (2026-01-08)


### Bug Fixes

* effective gap ([580b52b](https://github.com/superdoc-dev/superdoc/commit/580b52b1996088cdf0bc8005ec079f909a55b840))
* hide tools bubble on cursor change ([#1678](https://github.com/superdoc-dev/superdoc/issues/1678)) ([1fb865d](https://github.com/superdoc-dev/superdoc/commit/1fb865d48d40045ed5be2dcd0692334a8aa5bdc7))
* no comment bubbles in viewing mode ([#1680](https://github.com/superdoc-dev/superdoc/issues/1680)) ([653706e](https://github.com/superdoc-dev/superdoc/commit/653706e247c89d8b8858d87b8d185f928a48d65f))

# [1.3.0-next.12](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.11...v1.3.0-next.12) (2026-01-07)


### Bug Fixes

* indents from linked styles ([#1679](https://github.com/superdoc-dev/superdoc/issues/1679)) ([70bc68c](https://github.com/superdoc-dev/superdoc/commit/70bc68c07f7603f6f4845febe562f5fd6b72b5a1))
* section-aware ruler adjustments ([#1677](https://github.com/superdoc-dev/superdoc/issues/1677)) ([32b5bad](https://github.com/superdoc-dev/superdoc/commit/32b5badfbd94d5ff02a1424e3d18862a9191db8a))

# [1.3.0-next.11](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.10...v1.3.0-next.11) (2026-01-07)


### Bug Fixes

* additional fixes for view mode ([#1676](https://github.com/superdoc-dev/superdoc/issues/1676)) ([fc2b7d6](https://github.com/superdoc-dev/superdoc/commit/fc2b7d6436229b88453ddf7589fdfca333957c74))

# [1.3.0-next.10](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.9...v1.3.0-next.10) (2026-01-07)


### Bug Fixes

* screenshots ([39c9392](https://github.com/superdoc-dev/superdoc/commit/39c9392ecabe1447d41eabad7bdbf73c84b66e6e))

# [1.3.0-next.9](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.8...v1.3.0-next.9) (2026-01-07)


### Bug Fixes

* layout engine not correctly supporting view mode ([#1673](https://github.com/superdoc-dev/superdoc/issues/1673)) ([b24d64e](https://github.com/superdoc-dev/superdoc/commit/b24d64e44db723245b8f76224f11cb20b9e60ea0))

# [1.3.0-next.8](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.7...v1.3.0-next.8) (2026-01-07)


### Bug Fixes

* allow override row borders ([#1672](https://github.com/superdoc-dev/superdoc/issues/1672)) ([a4bb109](https://github.com/superdoc-dev/superdoc/commit/a4bb109fde65f02442c4ee5e1930fe90877bc107))
* **comments:** use last paragraph paraId for threading ([#1671](https://github.com/superdoc-dev/superdoc/issues/1671)) ([50ffea6](https://github.com/superdoc-dev/superdoc/commit/50ffea69cfe167f895b65d0b36f0d9d41e15e6f7))
* field annotation drag and drop ([#1668](https://github.com/superdoc-dev/superdoc/issues/1668)) ([659d152](https://github.com/superdoc-dev/superdoc/commit/659d152fa5349cde16800016680d3bef92ae548e))
* table borders additional fixes ([ca034fc](https://github.com/superdoc-dev/superdoc/commit/ca034fc7baeaf92d74ad39b54518cfd530de2d5e))
* take letter spacing into account when measuring text ([#1670](https://github.com/superdoc-dev/superdoc/issues/1670)) ([47c6bf7](https://github.com/superdoc-dev/superdoc/commit/47c6bf7ccf731928a9065caba92e0a8749578ae8))

# [1.3.0-next.7](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.6...v1.3.0-next.7) (2026-01-07)


### Bug Fixes

* header images that extend past area should be behind content ([#1669](https://github.com/superdoc-dev/superdoc/issues/1669)) ([bf7d679](https://github.com/superdoc-dev/superdoc/commit/bf7d6798c7698b884734b32b70993acb0bfa0cd0))

# [1.3.0-next.6](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.5...v1.3.0-next.6) (2026-01-07)


### Bug Fixes

* header/footer sizes ([#1666](https://github.com/superdoc-dev/superdoc/issues/1666)) ([9cd0cce](https://github.com/superdoc-dev/superdoc/commit/9cd0ccebe0b07dbdace54a8a2c7fb06fdd225b01))

# [1.3.0-next.5](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.4...v1.3.0-next.5) (2026-01-07)


### Bug Fixes

* line wrap with right-align page numbers, page number font inheritance ([#1665](https://github.com/superdoc-dev/superdoc/issues/1665)) ([6a996f0](https://github.com/superdoc-dev/superdoc/commit/6a996f0eaaaf64299d11a5258319907ef349a112))

# [1.3.0-next.4](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.3...v1.3.0-next.4) (2026-01-07)


### Bug Fixes

* empty display label and default label ([#1621](https://github.com/superdoc-dev/superdoc/issues/1621)) ([e29e14f](https://github.com/superdoc-dev/superdoc/commit/e29e14f37c27fbad19c87c3571fa26f901d8ced4))
* list marker position when item contains tab ([#1658](https://github.com/superdoc-dev/superdoc/issues/1658)) ([e2148bb](https://github.com/superdoc-dev/superdoc/commit/e2148bb3a9fd0f6cbcc7d6cf9c0779a6756b6052))
* prevent crash when deleting tracked changes with empty nodes ([#1663](https://github.com/superdoc-dev/superdoc/issues/1663)) ([e8a02d7](https://github.com/superdoc-dev/superdoc/commit/e8a02d72c0e333fb323991ed493913845f12f1a1))
* sync header/footer changes to ydoc ([#1623](https://github.com/superdoc-dev/superdoc/issues/1623)) ([0b581a5](https://github.com/superdoc-dev/superdoc/commit/0b581a5999d3b3e4a2319297d47acb798cfc9826))

# [1.3.0-next.3](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.2...v1.3.0-next.3) (2026-01-06)


### Bug Fixes

* tabs extending past line width ([#1659](https://github.com/superdoc-dev/superdoc/issues/1659)) ([0f9c053](https://github.com/superdoc-dev/superdoc/commit/0f9c053476f86156cdd787f29481eab73656a702))
* unify run styles and fix new list item runs ([#1650](https://github.com/superdoc-dev/superdoc/issues/1650)) ([65447ca](https://github.com/superdoc-dev/superdoc/commit/65447cad6f1b4227ec011aaf30b69c9650202dd5))

# [1.3.0-next.2](https://github.com/superdoc-dev/superdoc/compare/v1.3.0-next.1...v1.3.0-next.2) (2026-01-06)


### Bug Fixes

* account for indentation when drawing paragraph borders ([#1655](https://github.com/superdoc-dev/superdoc/issues/1655)) ([01a8d39](https://github.com/superdoc-dev/superdoc/commit/01a8d394784d714c539963430abc712dc360a0cd))
* bug - page number format from first section overrides number ([#1654](https://github.com/superdoc-dev/superdoc/issues/1654)) ([c45ecfa](https://github.com/superdoc-dev/superdoc/commit/c45ecfae71be17953e88662e8e646dab173b4c61))
* partial row height computation ([#1652](https://github.com/superdoc-dev/superdoc/issues/1652)) ([0ccd3c8](https://github.com/superdoc-dev/superdoc/commit/0ccd3c8c9924cc2a5d35cd9d09ff45dc1a964496))

# [1.3.0-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.2.2-next.1...v1.3.0-next.1) (2026-01-06)


### Features

* add support for subscript and superscript rendering ([#1649](https://github.com/superdoc-dev/superdoc/issues/1649)) ([1e3019c](https://github.com/superdoc-dev/superdoc/commit/1e3019cbc8d28d6cf9bd1720c56926b6fc300e8d))

## [1.2.2-next.1](https://github.com/superdoc-dev/superdoc/compare/v1.2.1...v1.2.2-next.1) (2026-01-06)


### Bug Fixes

* adjusted row height not preserved when table doesn't fit current page ([#1642](https://github.com/superdoc-dev/superdoc/issues/1642)) ([edcab55](https://github.com/superdoc-dev/superdoc/commit/edcab5507ee92d56ab25079b7345928c8dd7839a))
* auto color in tables with dark cells ([#1644](https://github.com/superdoc-dev/superdoc/issues/1644)) ([f498a03](https://github.com/superdoc-dev/superdoc/commit/f498a03dff563e7e24aaed78cbbb3b93bedf23a8))
* hanging indent in tables ([#1647](https://github.com/superdoc-dev/superdoc/issues/1647)) ([ee8a206](https://github.com/superdoc-dev/superdoc/commit/ee8a206378f0941fb2fa4ea02842fd3629f43350))
* paragraph borders inside table cells ([#1646](https://github.com/superdoc-dev/superdoc/issues/1646)) ([13a3797](https://github.com/superdoc-dev/superdoc/commit/13a3797c3706ad75a55bb09a055f7fddd0662609))
* table widths with percents ([#1645](https://github.com/superdoc-dev/superdoc/issues/1645)) ([a64a7b7](https://github.com/superdoc-dev/superdoc/commit/a64a7b743279326bc5a0e72a6553d2f0e400a5ee))

## [1.2.1](https://github.com/superdoc-dev/superdoc/compare/v1.2.0...v1.2.1) (2026-01-05)


### Bug Fixes

* fallback to converter titlePg if no metadata ([#1612](https://github.com/superdoc-dev/superdoc/issues/1612)) ([d5d16e9](https://github.com/superdoc-dev/superdoc/commit/d5d16e96fab02a43a9828f7332bcdbf38c1cedbe)), closes [#1639](https://github.com/superdoc-dev/superdoc/issues/1639)
* first page multi section logic, other numbering ([#1641](https://github.com/superdoc-dev/superdoc/issues/1641)) ([48856ea](https://github.com/superdoc-dev/superdoc/commit/48856ea536d5f73e25b8f20a7c4476e388d2156d))
* section start page ([#1639](https://github.com/superdoc-dev/superdoc/issues/1639)) ([fbd71c7](https://github.com/superdoc-dev/superdoc/commit/fbd71c755936653ae976c61d4bd6ffe110424925))
* take justification into account when laying out tables ([#1640](https://github.com/superdoc-dev/superdoc/issues/1640)) ([b0a4b7d](https://github.com/superdoc-dev/superdoc/commit/b0a4b7de0e96076856b06c9e5dd388b8b3924127))

## [1.1.4](https://github.com/superdoc-dev/superdoc/compare/v1.1.3...v1.1.4) (2026-01-05)


### Bug Fixes

* missing comment text on export ([#1582](https://github.com/superdoc-dev/superdoc/issues/1582)) ([#1637](https://github.com/superdoc-dev/superdoc/issues/1637)) ([5ec87a0](https://github.com/superdoc-dev/superdoc/commit/5ec87a032cbcd8aca802ca9495a4ae54c7bef398))

## [1.1.3](https://github.com/superdoc-dev/superdoc/compare/v1.1.2...v1.1.3) (2026-01-02)


### Bug Fixes

* sd type export ([68a4362](https://github.com/superdoc-dev/superdoc/commit/68a43624037a1968db9aae370560dd475cf0e1df))

## [1.1.2](https://github.com/superdoc-dev/superdoc/compare/v1.1.1...v1.1.2) (2025-12-31)


### Bug Fixes

* add destroyed to flag to abort init [stable] ([#1617](https://github.com/superdoc-dev/superdoc/issues/1617)) ([337b452](https://github.com/superdoc-dev/superdoc/commit/337b4520d0e6e68da50855e6e5dd6f476df2ebd0))

## [1.1.1](https://github.com/superdoc-dev/superdoc/compare/v1.1.0...v1.1.1) (2025-12-29)


### Bug Fixes

* infinite loop when paginating if top margin = header margin, zero margins ([84f7623](https://github.com/superdoc-dev/superdoc/commit/84f7623c57234385f2c7d47bc3ee96ee93c1e9a5))

# [1.1.0](https://github.com/superdoc-dev/superdoc/compare/v1.0.5...v1.1.0) (2025-12-29)


### Features

* enhance presentation editor viewing mode styles and functionality ([#1596](https://github.com/superdoc-dev/superdoc/issues/1596)) ([88ac831](https://github.com/superdoc-dev/superdoc/commit/88ac831e249d2abef7a6f578ebfbd7bb67ceaac9))

## [1.0.5](https://github.com/superdoc-dev/superdoc/compare/v1.0.4...v1.0.5) (2025-12-29)


### Bug Fixes

* receives media from storage image media ([#1609](https://github.com/superdoc-dev/superdoc/issues/1609)) ([bee06ec](https://github.com/superdoc-dev/superdoc/commit/bee06ecffd28d89c178aab185e73730b91805e98))

## [1.0.4](https://github.com/superdoc-dev/superdoc/compare/v1.0.3...v1.0.4) (2025-12-23)


### Bug Fixes

* underline off ([#1584](https://github.com/superdoc-dev/superdoc/issues/1584)) ([535add9](https://github.com/superdoc-dev/superdoc/commit/535add901ef138097c8d88d7ebf301c8bc007fe6))

## [1.0.3](https://github.com/superdoc-dev/superdoc/compare/v1.0.2...v1.0.3) (2025-12-23)


### Bug Fixes

* header/footer collapsing from image placement ([#1575](https://github.com/superdoc-dev/superdoc/issues/1575)) ([1ca9165](https://github.com/superdoc-dev/superdoc/commit/1ca91659205b3cfd200f8b11c8a4ade143a452d7))
* margins with multi column sections, text wrapping in sections ([#1571](https://github.com/superdoc-dev/superdoc/issues/1571)) ([d3ee276](https://github.com/superdoc-dev/superdoc/commit/d3ee276301ee92bed4f2d9434e5f0163ea840a28))
* right click ([#1574](https://github.com/superdoc-dev/superdoc/issues/1574)) ([cf870c4](https://github.com/superdoc-dev/superdoc/commit/cf870c48db9bd5a662850ed0bf1d2c7e87ab9a90))
* right click context ([#1572](https://github.com/superdoc-dev/superdoc/issues/1572)) ([9afaba9](https://github.com/superdoc-dev/superdoc/commit/9afaba9301fb27d2411707eacd6aee44d3b52809))
* selections in tables ([#1573](https://github.com/superdoc-dev/superdoc/issues/1573)) ([888ea49](https://github.com/superdoc-dev/superdoc/commit/888ea4967fd6e4ac3bfa378ba6ce87bcc5f1ba48))

## [1.0.2](https://github.com/superdoc-dev/superdoc/compare/v1.0.1...v1.0.2) (2025-12-19)


### Reverts

* Revert "fix: guard groupChanges against empty input" ([9789861](https://github.com/superdoc-dev/superdoc/commit/97898616093baff0af04581f17efc72b5e6768f4))

## [1.0.1](https://github.com/superdoc-dev/superdoc/compare/v1.0.0...v1.0.1) (2025-12-19)


### Bug Fixes

* guard groupChanges against empty input ([69c59b2](https://github.com/superdoc-dev/superdoc/commit/69c59b27826fe6acc0f8192aff2d8540af2d2a4b))

## [0.31.3](https://github.com/superdoc-dev/superdoc/compare/v0.31.2...v0.31.3) (2025-11-24)

### Bug Fixes

- content not editable on safari ([#1304](https://github.com/superdoc-dev/superdoc/issues/1304)) ([9972b1f](https://github.com/superdoc-dev/superdoc/commit/9972b1f9da7a4a7d090488aab159a85fb1c81a96))

## [0.31.2](https://github.com/superdoc-dev/superdoc/compare/v0.31.1...v0.31.2) (2025-11-21)

### Reverts

- Revert "fix: import and export tagUtils for enhanced structured content management ([#1300](https://github.com/superdoc-dev/superdoc/issues/1300))" ([d937827](https://github.com/superdoc-dev/superdoc/commit/d9378272260bc363c165ccc0ac4ba4c10d3991a9))

## [0.31.1](https://github.com/superdoc-dev/superdoc/compare/v0.31.0...v0.31.1) (2025-11-21)

### Bug Fixes

- import and export tagUtils for enhanced structured content management ([#1300](https://github.com/superdoc-dev/superdoc/issues/1300)) ([7b8551d](https://github.com/superdoc-dev/superdoc/commit/7b8551d46cfac7a1b9f77bb448cedf26544392ff))

# [0.31.0](https://github.com/superdoc-dev/superdoc/compare/v0.30.0...v0.31.0) (2025-11-21)

### Features

- add tag-based operations for structured content management ([#1296](https://github.com/superdoc-dev/superdoc/issues/1296)) ([af80442](https://github.com/superdoc-dev/superdoc/commit/af80442b451739dc1a0a08270edc9c317c53c127))

# [0.31.0](https://github.com/superdoc-dev/superdoc/compare/v0.30.0...v0.31.0) (2025-11-21)

### Features

- add tag-based operations for structured content management ([#1296](https://github.com/superdoc-dev/superdoc/issues/1296)) ([af80442](https://github.com/superdoc-dev/superdoc/commit/af80442b451739dc1a0a08270edc9c317c53c127))

# [0.30.0](https://github.com/superdoc-dev/superdoc/compare/v0.29.0...v0.30.0) (2025-11-19)

### Bug Fixes

- css style isolation after shape groups ([c428122](https://github.com/superdoc-dev/superdoc/commit/c428122218187c70ad54e9e8a870898993b40354))
- improve index mapping for text nodes and handle transparent inline nodes ([#1216](https://github.com/superdoc-dev/superdoc/issues/1216)) ([2ed5d3a](https://github.com/superdoc-dev/superdoc/commit/2ed5d3a7401c90e0a4fd02294c66b34bc7da9af2))
- update highlight method to accept optional color parameter ([#1253](https://github.com/superdoc-dev/superdoc/issues/1253)) ([900b9be](https://github.com/superdoc-dev/superdoc/commit/900b9be4064eabb4bf5706bca3947d09ba8e3f4c))
- update locks ([658cadb](https://github.com/superdoc-dev/superdoc/commit/658cadb2465a72bf1d6753fdc1c19a18b68c2fbd))
- update package-lock.json for latest collab package intellisense ([#1252](https://github.com/superdoc-dev/superdoc/issues/1252)) ([e4cdae7](https://github.com/superdoc-dev/superdoc/commit/e4cdae7529a660e7ae419d9e406d0477de28e420))
- update toolbar item label when linked style selected ([#1245](https://github.com/superdoc-dev/superdoc/issues/1245)) ([22ebb62](https://github.com/superdoc-dev/superdoc/commit/22ebb62c1e8ce7578fd712d44913b043f2049fb6))

### Features

- shape groups ([#1236](https://github.com/superdoc-dev/superdoc/issues/1236)) ([ca05ba2](https://github.com/superdoc-dev/superdoc/commit/ca05ba2e099ca59073b0c59c33ca579ddcaa9f1d))

### Performance Improvements

- **pagination:** optimize for headless mode ([#1239](https://github.com/superdoc-dev/superdoc/issues/1239)) ([28272f7](https://github.com/superdoc-dev/superdoc/commit/28272f7c58c5b1114f35f68b2481ce4441f58cd3))
