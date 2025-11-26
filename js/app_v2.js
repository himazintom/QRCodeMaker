// ========================================
// メインアプリケーション v2
// ========================================

import { CONSTANTS } from './types.js';
import { AppStore } from './store.js';
import { QRGenerator } from './qrGenerator.js';
import { BarcodeGenerator } from './barcodeGenerator.js';
import {
    getDelimiter,
    parseContent,
    matchesShortcut,
    downloadFile,
    readFile,
    formatDateTime,
    migrateV1ToV2,
    validateBarcodeFormat,
    toCSV,
    parseCSV,
    createNewBlock
} from './utils.js';

export class QRBarcodeApp {
    constructor() {
        this.store = new AppStore();
        this.worker = null;
        this.autoSaveTimer = null;

        this.init();
    }

    // ========================================
    // 初期化
    // ========================================

    init() {
        this.checkLibraries();
        this.setupEventListeners();
        this.loadFromStorage();
        this.render();
        this.initWorker();
    }

    checkLibraries() {
        if (typeof qrcode === 'undefined') {
            alert('QRコードライブラリの読み込みに失敗しました。ページを再読み込みしてください。');
        }
        if (typeof JsBarcode === 'undefined') {
            alert('バーコードライブラリの読み込みに失敗しました。ページを再読み込みしてください。');
        }
    }

    initWorker() {
        try {
            this.worker = new Worker('worker.js');
            this.worker.addEventListener('message', (e) => this.handleWorkerMessage(e));
        } catch (error) {
            console.warn('Web Worker初期化失敗。メインスレッドで処理します。', error);
        }
    }

    // ========================================
    // イベントリスナー設定
    // ========================================

    setupEventListeners() {
        // グローバル設定
        document.getElementById('print-title')?.addEventListener('input', (e) => {
            this.store.updateSettings({ printTitle: e.target.value });
            this.scheduleAutoSave();
        });

        document.querySelectorAll('input[name="delimiter"]').forEach(radio => {
            radio.addEventListener('change', () => {
                const value = document.querySelector('input[name="delimiter"]:checked')?.value;
                this.store.updateSettings({ delimiter: value });
                this.handleDelimiterChange();
                this.scheduleAutoSave();
            });
        });

        document.getElementById('custom-delimiter')?.addEventListener('input', (e) => {
            this.store.updateSettings({ customDelimiter: e.target.value });
            this.scheduleAutoSave();
        });

        document.getElementById('paper-size')?.addEventListener('change', (e) => {
            this.store.updateSettings({ paperSize: e.target.value });
            this.scheduleAutoSave();
        });

        document.getElementById('paper-orientation')?.addEventListener('change', (e) => {
            this.store.updateSettings({ paperOrientation: e.target.value });
            this.scheduleAutoSave();
        });

        // ボタン
        document.getElementById('add-block-btn')?.addEventListener('click', () => this.addBlock());
        document.getElementById('export-btn')?.addEventListener('click', () => this.exportData());
        document.getElementById('import-btn')?.addEventListener('click', () => this.triggerImport());
        document.getElementById('reset-btn')?.addEventListener('click', () => this.reset());
        document.getElementById('generate-btn')?.addEventListener('click', () => this.generateCodes());
        document.getElementById('preview-btn')?.addEventListener('click', () => this.togglePreview());
        document.getElementById('print-btn')?.addEventListener('click', () => this.print());
        document.getElementById('pdf-btn')?.addEventListener('click', () => this.saveAsPDF());
        document.getElementById('undo-btn')?.addEventListener('click', () => this.undo());
        document.getElementById('redo-btn')?.addEventListener('click', () => this.redo());

        // インポートファイル
        document.getElementById('import-file')?.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.importData(e.target.files[0]);
            }
        });

        // キーボードショートカット
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // ブロック削除・複製のイベントデリゲーション
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) {
                const blockId = e.target.getAttribute('data-block-id');
                this.removeBlock(blockId);
            }
            if (e.target.classList.contains('duplicate-btn')) {
                const blockId = e.target.getAttribute('data-block-id');
                this.duplicateBlock(blockId);
            }
        });

        // 印刷前処理
        window.addEventListener('beforeprint', () => this.preparePrint());

        // ページ離脱前の保存
        window.addEventListener('beforeunload', () => this.store.saveToLocalStorage());

        // Store更新監視
        this.store.subscribe((state) => this.onStateChange(state));
    }

    // ========================================
    // キーボードショートカット
    // ========================================

    handleKeyboard(e) {
        if (matchesShortcut(e, CONSTANTS.KEYBOARD_SHORTCUTS.NEW_BLOCK)) {
            e.preventDefault();
            this.addBlock();
        } else if (matchesShortcut(e, CONSTANTS.KEYBOARD_SHORTCUTS.EXPORT)) {
            e.preventDefault();
            this.exportData();
        } else if (matchesShortcut(e, CONSTANTS.KEYBOARD_SHORTCUTS.IMPORT)) {
            e.preventDefault();
            this.triggerImport();
        } else if (matchesShortcut(e, CONSTANTS.KEYBOARD_SHORTCUTS.GENERATE)) {
            e.preventDefault();
            this.generateCodes();
        } else if (matchesShortcut(e, CONSTANTS.KEYBOARD_SHORTCUTS.PREVIEW)) {
            e.preventDefault();
            if (this.store.getMode() === 'preview') {
                this.print();
            } else {
                this.togglePreview();
            }
        } else if (matchesShortcut(e, CONSTANTS.KEYBOARD_SHORTCUTS.UNDO)) {
            e.preventDefault();
            this.undo();
        } else if (matchesShortcut(e, CONSTANTS.KEYBOARD_SHORTCUTS.REDO) ||
            matchesShortcut(e, CONSTANTS.KEYBOARD_SHORTCUTS.REDO_ALT)) {
            e.preventDefault();
            this.redo();
        } else if (e.key === 'Escape' && this.store.getMode() === 'preview') {
            this.togglePreview();
        }
    }

    // ========================================
    // UI描画
    // ========================================

    render() {
        const state = this.store.getState();
        this.renderBlocks(state.blocks);
        this.renderSettings(state.settings);
        this.renderToolbar(state);
        this.updatePreviewCount();
    }

    renderBlocks(blocks) {
        const container = document.getElementById('blocks-container');
        if (!container) return;

        container.innerHTML = '';

        blocks.forEach((block, index) => {
            const blockElement = this.createBlockElement(block, index);
            container.appendChild(blockElement);
        });
    }

    createBlockElement(block, index) {
        const div = document.createElement('div');
        div.className = 'input-block';
        div.id = `block-${block.id}`;
        div.setAttribute('data-block-id', block.id);
        div.setAttribute('draggable', 'true');

        const canDelete = this.store.getBlocks().length > 1;
        const deleteButton = canDelete ?
            `<button class="delete-btn" data-block-id="${block.id}" title="ブロック削除">🗑️</button>` : '';

        const duplicateButton = `<button class="duplicate-btn" data-block-id="${block.id}" title="ブロック複製">📋</button>`;

        div.innerHTML = `
            <div class="block-header">
                <div class="drag-handle" title="ドラッグして並び替え">⋮⋮</div>
                <span class="block-title">入力ブロック ${index + 1}</span>
                <div class="block-actions">
                    ${duplicateButton}
                    ${deleteButton}
                </div>
            </div>
            <div class="block-content">
                <input type="text" class="subtitle-input"
                    placeholder="サブタイトル（任意）"
                    value="${block.subtitle || ''}"
                    data-block-id="${block.id}">

                <div class="code-type-row">
                    <div class="code-type-selector">
                        <label>
                            <input type="radio" name="codeType-${block.id}" value="qr"
                                ${block.codeType === 'qr' ? 'checked' : ''}
                                data-block-id="${block.id}">
                            QRコード
                        </label>
                        <label>
                            <input type="radio" name="codeType-${block.id}" value="barcode"
                                ${block.codeType === 'barcode' ? 'checked' : ''}
                                data-block-id="${block.id}">
                            バーコード
                        </label>
                    </div>

                    <div class="code-options">
                        ${block.codeType === 'qr' ? `
                            <select class="qr-error-level" data-block-id="${block.id}">
                                <option value="L" ${block.qrErrorCorrection === 'L' ? 'selected' : ''}>誤り訂正 L (7%)</option>
                                <option value="M" ${block.qrErrorCorrection === 'M' ? 'selected' : ''}>誤り訂正 M (15%)</option>
                                <option value="Q" ${block.qrErrorCorrection === 'Q' ? 'selected' : ''}>誤り訂正 Q (25%)</option>
                                <option value="H" ${block.qrErrorCorrection === 'H' ? 'selected' : ''}>誤り訂正 H (30%)</option>
                            </select>
                        ` : `
                            <select class="barcode-format" data-block-id="${block.id}">
                                <option value="CODE128" ${block.barcodeFormat === 'CODE128' ? 'selected' : ''}>CODE128</option>
                                <option value="EAN13" ${block.barcodeFormat === 'EAN13' ? 'selected' : ''}>EAN-13</option>
                                <option value="JAN" ${block.barcodeFormat === 'JAN' ? 'selected' : ''}>JAN</option>
                                <option value="CODE39" ${block.barcodeFormat === 'CODE39' ? 'selected' : ''}>CODE39</option>
                                <option value="ITF" ${block.barcodeFormat === 'ITF' ? 'selected' : ''}>ITF</option>
                            </select>
                        `}
                    </div>
                </div>

                <div class="size-override-row">
                    <label>サイズ:</label>
                    <select class="size-override" data-block-id="${block.id}">
                        <option value="auto" ${block.sizeOverride === 'auto' ? 'selected' : ''}>自動</option>
                        <option value="small" ${block.sizeOverride === 'small' ? 'selected' : ''}>小</option>
                        <option value="medium" ${block.sizeOverride === 'medium' ? 'selected' : ''}>中</option>
                        <option value="large" ${block.sizeOverride === 'large' ? 'selected' : ''}>大</option>
                    </select>
                </div>

                <textarea class="content-input"
                    placeholder="コードにしたい文字列を入力&#10;（選択した区切り文字で分割されます）"
                    rows="6"
                    data-block-id="${block.id}">${block.content || ''}</textarea>

                <div class="preview-count" data-block-id="${block.id}"></div>
            </div>
        `;

        // イベントリスナー設定
        this.attachBlockEventListeners(div, block.id);

        return div;
    }

    attachBlockEventListeners(blockElement, blockId) {
        // サブタイトル
        const subtitleInput = blockElement.querySelector('.subtitle-input');
        subtitleInput?.addEventListener('input', (e) => {
            this.store.updateBlock(blockId, { subtitle: e.target.value });
            this.scheduleAutoSave();
        });

        // コードタイプ
        blockElement.querySelectorAll(`input[name="codeType-${blockId}"]`).forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.store.updateBlock(blockId, { codeType: e.target.value });
                this.render(); // オプション表示を更新
                this.scheduleAutoSave();
            });
        });

        // QR誤り訂正レベル
        const qrErrorLevel = blockElement.querySelector('.qr-error-level');
        qrErrorLevel?.addEventListener('change', (e) => {
            this.store.updateBlock(blockId, { qrErrorCorrection: e.target.value });
            this.scheduleAutoSave();
        });

        // バーコード形式
        const barcodeFormat = blockElement.querySelector('.barcode-format');
        barcodeFormat?.addEventListener('change', (e) => {
            this.store.updateBlock(blockId, { barcodeFormat: e.target.value });
            this.scheduleAutoSave();
        });

        // サイズ指定
        const sizeOverride = blockElement.querySelector('.size-override');
        sizeOverride?.addEventListener('change', (e) => {
            this.store.updateBlock(blockId, { sizeOverride: e.target.value });
            this.scheduleAutoSave();
        });

        // コンテンツ
        const contentInput = blockElement.querySelector('.content-input');
        contentInput?.addEventListener('input', (e) => {
            this.store.updateBlock(blockId, { content: e.target.value });
            this.updatePreviewCount(blockId);
            this.scheduleAutoSave();
        });

        // ドラッグアンドドロップ
        // ドラッグハンドル以外からのドラッグを防ぐ
        blockElement.addEventListener('mousedown', (e) => {
            const dragHandle = blockElement.querySelector('.drag-handle');
            if (!dragHandle?.contains(e.target)) {
                blockElement.draggable = false;
            } else {
                blockElement.draggable = true;
            }
        });

        blockElement.addEventListener('dragstart', (e) => {
            // データ設定
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', blockId);

            blockElement.classList.add('dragging');
        });

        blockElement.addEventListener('dragend', () => {
            blockElement.classList.remove('dragging');
            document.querySelectorAll('.input-block').forEach(block => {
                block.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
            });
        });

        blockElement.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            // ドラッグ中のブロックのY座標位置を判定
            const rect = blockElement.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const isTopHalf = e.clientY < midpoint;

            // 既存のクラスをリセット
            blockElement.classList.remove('drag-over-top', 'drag-over-bottom');

            // ドロップ位置を示すクラスを追加
            if (isTopHalf) {
                blockElement.classList.add('drag-over-top', 'drag-over');
            } else {
                blockElement.classList.add('drag-over-bottom', 'drag-over');
            }
        });

        blockElement.addEventListener('dragleave', () => {
            blockElement.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
        });

        blockElement.addEventListener('drop', (e) => {
            e.preventDefault();
            const sourceBlockId = e.dataTransfer.getData('text/plain');

            if (sourceBlockId !== blockId) {
                const blocks = this.store.getBlocks();
                const fromIndex = blocks.findIndex(b => b.id === sourceBlockId);
                const toIndex = blocks.findIndex(b => b.id === blockId);

                if (fromIndex !== -1 && toIndex !== -1) {
                    // ドラッグ位置に応じて挿入位置を調整
                    const rect = blockElement.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    const isTopHalf = e.clientY < midpoint;

                    let finalIndex = toIndex;
                    if (!isTopHalf && fromIndex < toIndex) {
                        // 下半分にドロップ且つ下方へ移動する場合は調整不要
                        finalIndex = toIndex;
                    } else if (isTopHalf && fromIndex > toIndex) {
                        // 上半分にドロップ且つ上方へ移動する場合は調整不要
                        finalIndex = toIndex;
                    } else if (!isTopHalf && fromIndex > toIndex) {
                        // 下半分にドロップ且つ上方へ移動する場合は1つ下に調整
                        finalIndex = toIndex + 1;
                    }

                    this.store.reorderBlocks(fromIndex, finalIndex);
                    this.render();
                }
            }

            blockElement.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
        });
    }

    // プレビューカウント更新
    updatePreviewCount(blockId = null) {
        const settings = this.store.getSettings();
        const delimiter = getDelimiter(settings.delimiter, settings.customDelimiter);

        const blocks = blockId ?
            this.store.getBlocks().filter(b => b.id === blockId) :
            this.store.getBlocks();

        blocks.forEach(block => {
            const previewEl = document.querySelector(`.preview-count[data-block-id="${block.id}"]`);
            if (!previewEl) return;

            if (block.content.trim()) {
                const items = parseContent(block.content, delimiter);
                const count = items.length;
                previewEl.textContent = `💡 ${count}個のコードが生成されます`;
                previewEl.style.display = 'block';

                if (count > 100) {
                    previewEl.innerHTML = `⚠️ ${count}個のコードが生成されます（大量）`;
                }
            } else {
                previewEl.style.display = 'none';
            }
        });
    }

    renderSettings(settings) {
        const printTitle = document.getElementById('print-title');
        if (printTitle) printTitle.value = settings.printTitle || '';

        const delimiterRadio = document.querySelector(`input[name="delimiter"][value="${settings.delimiter}"]`);
        if (delimiterRadio) delimiterRadio.checked = true;

        const customDelimiter = document.getElementById('custom-delimiter');
        if (customDelimiter) customDelimiter.value = settings.customDelimiter || '';

        const paperSize = document.getElementById('paper-size');
        if (paperSize) paperSize.value = settings.paperSize || 'a4';

        const paperOrientation = document.getElementById('paper-orientation');
        if (paperOrientation) paperOrientation.value = settings.paperOrientation || 'portrait';

        this.handleDelimiterChange();
    }

    renderToolbar(state) {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        if (undoBtn) undoBtn.disabled = !this.store.canUndo();
        if (redoBtn) redoBtn.disabled = !this.store.canRedo();
    }

    // ========================================
    // ブロック操作
    // ========================================

    addBlock() {
        this.store.addBlock();
        this.render();
    }

    removeBlock(blockId) {
        if (confirm('このブロックを削除しますか？')) {
            this.store.removeBlock(blockId);
            this.render();
        }
    }

    duplicateBlock(blockId) {
        this.store.duplicateBlock(blockId);
        this.render();
    }

    handleDelimiterChange() {
        const customRadio = document.querySelector('input[name="delimiter"][value="custom"]');
        const customInput = document.getElementById('custom-delimiter');

        if (customRadio?.checked) {
            customInput.style.display = 'inline-block';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
        }
    }

    // ========================================
    // コード生成
    // ========================================

    async generateCodes() {
        const blocks = this.store.getBlocks();
        const settings = this.store.getSettings();
        const delimiter = getDelimiter(settings.delimiter, settings.customDelimiter);

        const codes = [];
        const errors = [];

        // アイテム数をカウント
        let totalCount = 0;
        blocks.forEach(block => {
            if (block.content.trim()) {
                const items = parseContent(block.content, delimiter);
                totalCount += items.length;
            }
        });

        // プログレス表示判定
        if (totalCount >= CONSTANTS.PROGRESS_THRESHOLD && this.worker) {
            this.generateWithWorker(blocks, settings);
            return;
        }

        // メインスレッドで生成
        this.store.setGenerating(true);

        blocks.forEach((block, blockIndex) => {
            if (!block.content.trim()) return;

            const items = parseContent(block.content, delimiter);
            let itemIndex = 1;

            items.forEach((text) => {
                if (block.codeType === 'qr') {
                    const qrData = QRGenerator.generate(text, block.qrErrorCorrection);
                    if (qrData) {
                        const size = block.sizeOverride === 'auto' ? qrData.size : block.sizeOverride;
                        codes.push({
                            blockId: block.id,
                            blockIndex,
                            index: itemIndex++,
                            text,
                            type: 'qr',
                            qrData,
                            size,
                            subtitle: block.subtitle
                        });
                    } else {
                        errors.push({
                            blockId: block.id,
                            lineNumber: itemIndex++,
                            text,
                            errorType: 'generation_failed',
                            message: 'QRコード生成に失敗しました'
                        });
                    }
                } else {
                    const validation = validateBarcodeFormat(text, block.barcodeFormat);
                    if (!validation.valid) {
                        errors.push({
                            blockId: block.id,
                            lineNumber: itemIndex++,
                            text,
                            errorType: 'validation_failed',
                            message: validation.error
                        });
                        return;
                    }

                    const barcodeData = BarcodeGenerator.generate(text, block.barcodeFormat);
                    if (barcodeData.svg) {
                        const size = block.sizeOverride === 'auto' ? barcodeData.size : block.sizeOverride;
                        codes.push({
                            blockId: block.id,
                            blockIndex,
                            index: itemIndex++,
                            text,
                            type: 'barcode',
                            barcodeData,
                            size,
                            subtitle: block.subtitle
                        });
                    } else {
                        errors.push({
                            blockId: block.id,
                            lineNumber: itemIndex++,
                            text,
                            errorType: 'generation_failed',
                            message: barcodeData.validation.error || 'バーコード生成に失敗しました'
                        });
                    }
                }
            });
        });

        this.store.setGenerating(false);
        this.store.setGeneratedCodes(codes);
        this.store.setErrors(errors);

        this.renderCodes(codes);

        if (errors.length > 0) {
            this.showErrors(errors);
        } else {
            document.getElementById('error-list').style.display = 'none';
        }

        // 印刷ボタン・PDFボタン・プレビューボタン有効化
        const hasCodes = codes.length > 0;
        document.getElementById('print-btn').disabled = !hasCodes;
        document.getElementById('pdf-btn').disabled = !hasCodes;
        document.getElementById('preview-btn').disabled = !hasCodes;
    }

    generateWithWorker(blocks, settings) {
        this.store.setGenerating(true);
        this.worker.postMessage({
            type: 'GENERATE_CODES',
            data: { blocks, settings }
        });
    }

    handleWorkerMessage(e) {
        const { type, current, total, results, error } = e.data;

        if (type === 'PROGRESS') {
            this.store.setProgress(current, total);
            this.renderProgress(current, total);
        } else if (type === 'COMPLETE') {
            this.store.setGenerating(false);
            // Workerからの結果を元に実際のコード生成
            this.finalizeCodesFromWorker(results);
        } else if (type === 'ERROR') {
            this.store.setGenerating(false);
            alert(`エラー: ${error}`);
        }
    }

    finalizeCodesFromWorker(results) {
        const codes = [];
        const errors = [];

        results.forEach(item => {
            if (item.codeType === 'qr') {
                const qrData = QRGenerator.generate(item.text, item.qrErrorCorrection);
                if (qrData) {
                    const size = item.sizeOverride === 'auto' ? qrData.size : item.sizeOverride;
                    codes.push({
                        blockId: item.blockId,
                        blockIndex: item.blockIndex,
                        index: item.itemIndex + 1,
                        text: item.text,
                        type: 'qr',
                        qrData,
                        size
                    });
                }
            } else {
                const barcodeData = BarcodeGenerator.generate(item.text, item.barcodeFormat);
                if (barcodeData.svg) {
                    const size = item.sizeOverride === 'auto' ? barcodeData.size : item.sizeOverride;
                    codes.push({
                        blockId: item.blockId,
                        blockIndex: item.blockIndex,
                        index: item.itemIndex + 1,
                        text: item.text,
                        type: 'barcode',
                        barcodeData,
                        size
                    });
                }
            }
        });

        this.store.setGeneratedCodes(codes);
        this.renderCodes(codes);
    }

    renderProgress(current, total) {
        const progressEl = document.getElementById('progress-indicator');
        if (!progressEl) return;

        const percentage = Math.round((current / total) * 100);
        progressEl.textContent = `生成中... ${current}/${total} (${percentage}%)`;
        progressEl.style.display = 'block';

        if (current === total) {
            setTimeout(() => {
                progressEl.style.display = 'none';
            }, 1000);
        }
    }

    renderCodes(codes) {
        const container = document.getElementById('code-display');
        if (!container) return;

        container.innerHTML = '';

        // ブロックごとにグループ化
        const grouped = {};
        codes.forEach(code => {
            if (!grouped[code.blockId]) {
                grouped[code.blockId] = [];
            }
            grouped[code.blockId].push(code);
        });

        // セクションごとに表示
        Object.keys(grouped).forEach(blockId => {
            const blockCodes = grouped[blockId];
            if (blockCodes.length === 0) return;

            const section = document.createElement('div');
            section.className = 'code-section';

            // サブタイトル
            if (blockCodes[0].subtitle) {
                const title = document.createElement('h3');
                title.className = 'section-title';
                title.textContent = blockCodes[0].subtitle;
                section.appendChild(title);
            }

            // グリッド
            const grid = document.createElement('div');
            grid.className = 'code-grid';

            blockCodes.forEach(code => {
                const item = this.createCodeItem(code);
                grid.appendChild(item);
            });

            section.appendChild(grid);
            container.appendChild(section);
        });
    }

    createCodeItem(code) {
        const item = document.createElement('div');
        item.className = `code-item code-size-${code.size}`;

        // インデックス
        const index = document.createElement('span');
        index.className = 'code-index';
        index.textContent = `[QR${code.blockIndex + 1}-${code.index}]`;
        item.appendChild(index);

        // テキスト
        const text = document.createElement('div');
        text.className = 'code-text';
        text.textContent = code.text;
        item.appendChild(text);

        // コード画像
        if (code.type === 'qr') {
            const visual = document.createElement('div');
            visual.className = 'code-visual';
            const frame = document.createElement('div');
            frame.className = 'qr-frame';

            const targetSize = QRGenerator.getQRSidePx(code.size);
            const qrElement = QRGenerator.createQRElement(code.qrData, targetSize);

            frame.appendChild(qrElement);
            visual.appendChild(frame);
            item.appendChild(visual);
        } else {
            const barcodeElement = BarcodeGenerator.createBarcodeElement(code.barcodeData);
            item.appendChild(barcodeElement);
        }

        return item;
    }

    showErrors(errors) {
        const errorContainer = document.getElementById('error-list');
        if (!errorContainer) return;

        errorContainer.innerHTML = `
            <div class="error-header">
                <h3>❌ エラーが見つかりました（${errors.length}件）</h3>
                <button class="close-errors">閉じる</button>
            </div>
            <div class="error-items">
                ${errors.map(err => `
                    <div class="error-item">
                        <div class="error-location">📍 ブロック - 行${err.lineNumber}</div>
                        <div class="error-message">エラー: ${err.message}</div>
                        <div class="error-text">内容: "${err.text}"</div>
                    </div>
                `).join('')}
            </div>
        `;

        errorContainer.style.display = 'block';

        errorContainer.querySelector('.close-errors')?.addEventListener('click', () => {
            errorContainer.style.display = 'none';
        });
    }

    // ========================================
    // モード切り替え
    // ========================================

    togglePreview() {
        const mode = this.store.getMode();
        const newMode = mode === 'edit' ? 'preview' : 'edit';
        this.store.setMode(newMode);

        document.body.classList.toggle('preview-mode', newMode === 'preview');

        // プレビューモードに入るときにタイトルを更新
        if (newMode === 'preview') {
            const settings = this.store.getSettings();
            const titleElement = document.querySelector('.print-title');
            if (titleElement) {
                titleElement.textContent = settings.printTitle || '';
            }
        }
    }

    // ========================================
    // 印刷・PDF
    // ========================================

    print() {
        window.print();
    }

    async saveAsPDF() {
        if (typeof html2pdf === 'undefined') {
            alert('PDF生成ライブラリの読み込みに失敗しました。');
            return;
        }

        const element = document.getElementById('code-display');
        const settings = this.store.getSettings();
        const filename = settings.printTitle?.trim() || `qr-codes-${formatDateTime()}`;

        // PDF生成モード用のクラスを追加
        document.body.classList.add('pdf-export-mode');

        // タイトルを表示
        const titleEl = document.querySelector('.print-title');
        if (settings.printTitle) {
            titleEl.textContent = settings.printTitle;
            titleEl.style.display = 'block';
        }

        const opt = {
            margin: [10, 5, 10, 5], // top, left, bottom, right
            filename: `${filename}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        this.store.setGenerating(true);

        try {
            await html2pdf().set(opt).from(element).save();
        } catch (error) {
            console.error(error);
            alert('PDF保存中にエラーが発生しました。');
        } finally {
            this.store.setGenerating(false);
            document.body.classList.remove('pdf-export-mode');
            if (titleEl) titleEl.style.display = 'none';
        }
    }

    preparePrint() {
        const settings = this.store.getSettings();
        const titleElement = document.querySelector('.print-title');

        if (titleElement) {
            if (settings.printTitle) {
                titleElement.textContent = settings.printTitle;
                titleElement.style.display = 'block';
            } else {
                titleElement.style.display = 'none';
            }
        }
    }

    // ========================================
    // データ管理
    // ========================================

    scheduleAutoSave() {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = setTimeout(() => {
            this.store.saveToLocalStorage();
        }, CONSTANTS.AUTO_SAVE_DELAY);
    }

    loadFromStorage() {
        const data = this.store.loadFromLocalStorage();
        if (data) {
            if (confirm(`${new Date(data.savedAt).toLocaleString()}に保存されたデータがあります。復元しますか？`)) {
                const migratedData = migrateV1ToV2(data);
                this.store.fromJSON(migratedData);
                this.render();
            }
        }
    }

    async exportData() {
        // CSVエクスポートをデフォルトにする
        const blocks = this.store.getBlocks();
        const settings = this.store.getSettings();

        // 新しい形式（列指向）でデータを作成
        const rows = [];

        // 1. メタデータ行
        rows.push(['Subtitle', ...blocks.map(b => b.subtitle || '')]);
        rows.push(['CodeType', ...blocks.map(b => b.codeType)]);
        rows.push(['QRErrorCorrection', ...blocks.map(b => b.qrErrorCorrection)]);
        rows.push(['BarcodeFormat', ...blocks.map(b => b.barcodeFormat)]);
        rows.push(['SizeOverride', ...blocks.map(b => b.sizeOverride)]);

        // 2. コンテンツ行
        // 各ブロックのコンテンツを行単位に分割
        const blockContents = blocks.map(b => {
            // コンテンツがない場合は空配列
            if (!b.content) return [];
            // 改行で分割
            return b.content.split(/\r?\n/);
        });

        // 最大行数を取得
        const maxLines = Math.max(...blockContents.map(lines => lines.length), 0);

        // コンテンツ行を追加
        for (let i = 0; i < maxLines; i++) {
            const row = [];
            // 最初の列は 'Content' (最初の行のみ)
            row.push(i === 0 ? 'Content' : '');

            // 各ブロックのi行目を追加
            blocks.forEach((_, blockIndex) => {
                const lines = blockContents[blockIndex];
                row.push(lines[i] || '');
            });

            rows.push(row);
        }

        const csvString = toCSV(rows);

        // 印刷用タイトルがあればそれを使用、なければデフォルト名
        const baseFilename = settings.printTitle?.trim() || `qr-barcode-data-v2-${formatDateTime()}`;
        const filename = `${baseFilename}.csv`;

        await downloadFile(csvString, filename, 'text/csv');
    }

    triggerImport() {
        document.getElementById('import-file')?.click();
    }

    async importData(file) {
        try {
            const text = await readFile(file);
            let data;

            // ファイル拡張子または内容で判定
            if (file.name.toLowerCase().endsWith('.csv')) {
                const csvData = parseCSV(text);

                if (csvData.length === 0) {
                    throw new Error('データが空です');
                }

                // 形式判定
                // 旧形式: 1行目がヘッダーで 'CodeType', 'Content' などを含む
                const headerRow = csvData[0];
                const isOldFormat = headerRow.includes('CodeType') && headerRow.includes('Content');

                // 新形式: 1列目がキーで 'CodeType' という行が存在する
                // (旧形式でない、かつ 1列目に 'CodeType' を持つ行がある)
                const isNewFormat = !isOldFormat && csvData.some(row => row[0] === 'CodeType');

                const newBlocks = [];

                if (isNewFormat) {
                    // 新形式のインポート
                    const numBlocks = csvData[0].length - 1;
                    if (numBlocks < 1) throw new Error('有効なデータ列が見つかりません');

                    // 各ブロックのデータを構築
                    for (let col = 1; col <= numBlocks; col++) {
                        const block = createNewBlock();

                        // メタデータ読み込み
                        const findRow = (key) => csvData.find(row => row[0] === key);

                        const subtitleRow = findRow('Subtitle');
                        const codeTypeRow = findRow('CodeType');
                        const qrErrorRow = findRow('QRErrorCorrection');
                        const barcodeFormatRow = findRow('BarcodeFormat');
                        const sizeOverrideRow = findRow('SizeOverride');

                        if (subtitleRow) block.subtitle = subtitleRow[col] || '';
                        if (codeTypeRow) block.codeType = (codeTypeRow[col] === 'barcode') ? 'barcode' : 'qr';
                        if (qrErrorRow) block.qrErrorCorrection = qrErrorRow[col] || 'M';
                        if (barcodeFormatRow) block.barcodeFormat = barcodeFormatRow[col] || 'CODE128';
                        if (sizeOverrideRow) block.sizeOverride = sizeOverrideRow[col] || 'auto';

                        // コンテンツ読み込み
                        const contentRowIndex = csvData.findIndex(row => row[0] === 'Content');
                        if (contentRowIndex !== -1) {
                            const contentLines = [];
                            // 定義済みのキーリスト（これらに遭遇したらコンテンツ読み込みを停止）
                            const knownKeys = ['Subtitle', 'CodeType', 'QRErrorCorrection', 'BarcodeFormat', 'SizeOverride'];

                            for (let i = contentRowIndex; i < csvData.length; i++) {
                                // コンテンツ行以降で、別のプロパティ行に遭遇したら中断
                                if (i > contentRowIndex && csvData[i][0] && knownKeys.includes(csvData[i][0])) {
                                    break;
                                }

                                const cell = csvData[i][col];
                                // undefinedの場合は空文字扱い
                                const val = cell === undefined ? '' : cell;
                                contentLines.push(val);
                            }

                            // 末尾の空行を削除
                            while (contentLines.length > 0 && contentLines[contentLines.length - 1] === '') {
                                contentLines.pop();
                            }
                            block.content = contentLines.join('\n');
                        }

                        newBlocks.push(block);
                    }

                } else {
                    // 旧形式（行指向）のインポート
                    // ヘッダー行をスキップ（もしあれば）
                    const startRow = (csvData.length > 0 && csvData[0][0] === 'Subtitle') ? 1 : 0;

                    for (let i = startRow; i < csvData.length; i++) {
                        const row = csvData[i];
                        if (row.length < 3) continue; // 最低限必要なカラム数

                        const block = createNewBlock();
                        block.subtitle = row[0] || '';
                        block.codeType = (row[1] === 'barcode') ? 'barcode' : 'qr';
                        block.content = row[2] || '';
                        if (row[3]) block.qrErrorCorrection = row[3];
                        if (row[4]) block.barcodeFormat = row[4];
                        if (row[5]) block.sizeOverride = row[5];

                        newBlocks.push(block);
                    }
                }

                if (newBlocks.length === 0) {
                    throw new Error('有効なデータが見つかりませんでした');
                }

                if (confirm('現在の入力内容が上書きされます。続行しますか？')) {
                    this.store.setState({ blocks: newBlocks });
                    this.render();
                    alert('CSVデータをインポートしました');
                }

            } else {
                // JSONとして処理
                data = JSON.parse(text);

                if (!data.globalSettings || !data.blocks) {
                    throw new Error('ファイル形式が正しくありません');
                }

                if (confirm('現在の入力内容が上書きされます。続行しますか？')) {
                    const migratedData = migrateV1ToV2(data);
                    this.store.fromJSON(migratedData);
                    this.render();
                    alert('データをインポートしました');
                }
            }
        } catch (error) {
            alert(`インポートエラー: ${error.message}`);
        }

        // ファイル入力をリセット
        document.getElementById('import-file').value = '';
    }

    reset() {
        if (confirm('すべての入力内容がクリアされます。よろしいですか？')) {
            this.store.reset();
            this.render();
            document.getElementById('code-display').innerHTML = '';
            document.getElementById('print-btn').disabled = true;
            document.getElementById('pdf-btn').disabled = true;
            document.getElementById('preview-btn').disabled = true;
            localStorage.removeItem(CONSTANTS.STORAGE_KEY);
        }
    }

    // ========================================
    // アンドゥ・リドゥ
    // ========================================

    undo() {
        this.store.undo();
        this.render();
    }

    redo() {
        this.store.redo();
        this.render();
    }

    // ========================================
    // 状態変更ハンドラ
    // ========================================

    onStateChange(state) {
        // 必要に応じて追加の処理
    }
}

// ========================================
// アプリケーション初期化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    new QRBarcodeApp();
});
