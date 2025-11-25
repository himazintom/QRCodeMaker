// ========================================
// 状態管理クラス（Storeパターン）
// ========================================

import { CONSTANTS } from './types.js';
import { createNewBlock, createDefaultSettings, deepClone } from './utils.js';

export class AppStore {
    constructor() {
        this.state = {
            blocks: [createNewBlock()],
            settings: createDefaultSettings(),
            generatedCodes: [],
            errors: [],
            mode: 'edit', // 'edit' | 'preview'
            isGenerating: false,
            progress: { current: 0, total: 0 }
        };

        this.history = [];
        this.historyIndex = -1;
        this.listeners = [];
    }

    // ========================================
    // 状態取得
    // ========================================

    getState() {
        return this.state;
    }

    getBlocks() {
        return this.state.blocks;
    }

    getSettings() {
        return this.state.settings;
    }

    getGeneratedCodes() {
        return this.state.generatedCodes;
    }

    getErrors() {
        return this.state.errors;
    }

    getMode() {
        return this.state.mode;
    }

    // ========================================
    // 状態変更（履歴記録付き）
    // ========================================

    setState(newState, recordHistory = true) {
        if (recordHistory) {
            this.recordHistory();
        }

        this.state = { ...this.state, ...newState };
        this.notify();
    }

    // ========================================
    // ブロック操作
    // ========================================

    addBlock() {
        const newBlock = createNewBlock();
        this.setState({
            blocks: [...this.state.blocks, newBlock]
        });
        return newBlock.id;
    }

    removeBlock(id) {
        if (this.state.blocks.length <= 1) return;

        this.setState({
            blocks: this.state.blocks.filter(b => b.id !== id)
        });
    }

    updateBlock(id, updates) {
        this.setState({
            blocks: this.state.blocks.map(b =>
                b.id === id ? { ...b, ...updates } : b
            )
        });
    }

    duplicateBlock(id) {
        const block = this.state.blocks.find(b => b.id === id);
        if (!block) return;

        const newBlock = {
            ...deepClone(block),
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()
        };

        const index = this.state.blocks.findIndex(b => b.id === id);
        const newBlocks = [...this.state.blocks];
        newBlocks.splice(index + 1, 0, newBlock);

        this.setState({ blocks: newBlocks });
        return newBlock.id;
    }

    reorderBlocks(fromIndex, toIndex) {
        const blocks = [...this.state.blocks];
        const [removed] = blocks.splice(fromIndex, 1);
        blocks.splice(toIndex, 0, removed);

        this.setState({ blocks });
    }

    // ========================================
    // 設定操作
    // ========================================

    updateSettings(updates) {
        this.setState({
            settings: { ...this.state.settings, ...updates }
        });
    }

    // ========================================
    // コード生成
    // ========================================

    setGeneratedCodes(codes) {
        this.setState({
            generatedCodes: codes
        }, false); // 生成結果は履歴に記録しない
    }

    setErrors(errors) {
        this.setState({
            errors
        }, false);
    }

    setGenerating(isGenerating) {
        this.setState({
            isGenerating
        }, false);
    }

    setProgress(current, total) {
        this.setState({
            progress: { current, total }
        }, false);
    }

    // ========================================
    // モード切り替え
    // ========================================

    setMode(mode) {
        this.setState({
            mode
        }, false);
    }

    // ========================================
    // リセット
    // ========================================

    reset() {
        this.setState({
            blocks: [createNewBlock()],
            settings: createDefaultSettings(),
            generatedCodes: [],
            errors: [],
            mode: 'edit',
            isGenerating: false,
            progress: { current: 0, total: 0 }
        });
        this.history = [];
        this.historyIndex = -1;
    }

    // ========================================
    // アンドゥ・リドゥ
    // ========================================

    recordHistory() {
        // 現在の位置以降の履歴を削除
        this.history = this.history.slice(0, this.historyIndex + 1);

        // 新しい状態を記録
        this.history.push(deepClone({
            blocks: this.state.blocks,
            settings: this.state.settings
        }));

        // 履歴の上限を維持
        if (this.history.length > CONSTANTS.MAX_HISTORY) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
    }

    canUndo() {
        return this.historyIndex > 0;
    }

    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    undo() {
        if (!this.canUndo()) return;

        this.historyIndex--;
        const previousState = this.history[this.historyIndex];

        this.state = {
            ...this.state,
            blocks: deepClone(previousState.blocks),
            settings: deepClone(previousState.settings)
        };

        this.notify();
    }

    redo() {
        if (!this.canRedo()) return;

        this.historyIndex++;
        const nextState = this.history[this.historyIndex];

        this.state = {
            ...this.state,
            blocks: deepClone(nextState.blocks),
            settings: deepClone(nextState.settings)
        };

        this.notify();
    }

    // ========================================
    // リスナー管理
    // ========================================

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    // ========================================
    // 永続化
    // ========================================

    toJSON() {
        return {
            version: CONSTANTS.VERSION,
            createdAt: new Date().toISOString(),
            savedAt: new Date().toISOString(),
            globalSettings: this.state.settings,
            blocks: this.state.blocks
        };
    }

    fromJSON(data) {
        this.setState({
            blocks: data.blocks || [createNewBlock()],
            settings: { ...createDefaultSettings(), ...(data.globalSettings || {}) }
        });
    }

    saveToLocalStorage() {
        try {
            const data = this.toJSON();
            localStorage.setItem(CONSTANTS.STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('localStorage保存エラー:', error);
        }
    }

    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem(CONSTANTS.STORAGE_KEY);
            if (!saved) return false;

            const data = JSON.parse(saved);
            const savedTime = new Date(data.savedAt);
            const now = new Date();
            const hoursDiff = (now - savedTime) / (1000 * 60 * 60);

            // 24時間以内のデータのみ復元
            if (hoursDiff < 24) {
                return data;
            } else {
                localStorage.removeItem(CONSTANTS.STORAGE_KEY);
                return false;
            }
        } catch (error) {
            console.error('localStorage読み込みエラー:', error);
            localStorage.removeItem(CONSTANTS.STORAGE_KEY);
            return false;
        }
    }
}
