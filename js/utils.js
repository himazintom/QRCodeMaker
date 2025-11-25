// ========================================
// ユーティリティ関数
// ========================================

import { CONSTANTS, DEFAULTS } from './types.js';

/**
 * UUID v4生成（crypto.randomUUID()のpolyfill対応）
 */
export function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Fallback implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 新しいブロックを作成
 */
export function createNewBlock() {
    return {
        id: generateUUID(),
        ...DEFAULTS.block
    };
}

/**
 * デフォルト設定を作成
 */
export function createDefaultSettings() {
    return { ...DEFAULTS.globalSettings };
}

/**
 * 区切り文字を取得
 */
export function getDelimiter(delimiterType, customDelimiter = '') {
    if (delimiterType === 'custom') {
        return customDelimiter || '\n';
    }
    return CONSTANTS.DELIMITERS[delimiterType] || '\n';
}

/**
 * コンテンツを解析して配列に分割
 */
export function parseContent(content, delimiter) {
    return content.split(delimiter)
        .map(item => item.trim())
        .filter(item => item.length > 0);
}

/**
 * ASCII文字チェック
 */
export function isAscii(str) {
    return /^[\x20-\x7E]*$/.test(str);
}

/**
 * 数字のみチェック
 */
export function isNumeric(str) {
    return /^\d+$/.test(str);
}

/**
 * CODE39対応文字チェック
 */
export function isCode39Compatible(str) {
    return /^[A-Z0-9\-. $/+%]*$/.test(str);
}

/**
 * QRコードサイズ分類
 */
export function getQRSize(moduleCount) {
    if (moduleCount <= 33) return 'small';
    return 'medium';  // largeを廃止し、最大mediumに制限
}

/**
 * バーコードサイズ分類
 */
export function getBarcodeSize(textLength) {
    if (textLength <= 16) return 'small';
    return 'medium';  // largeを廃止し、最大mediumに制限
}

/**
 * バーコードフォーマット検証
 */
export function validateBarcodeFormat(text, format) {
    switch (format) {
        case 'CODE128':
            if (!isAscii(text)) {
                return { valid: false, error: '非ASCII文字を含む（CODE128はASCII文字のみ対応）' };
            }
            break;

        case 'EAN13':
        case 'JAN':
            if (!isNumeric(text)) {
                return { valid: false, error: '数字のみ入力してください' };
            }
            if (text.length !== 12 && text.length !== 13) {
                return { valid: false, error: '12桁または13桁の数字を入力してください' };
            }
            break;

        case 'CODE39':
            if (!isCode39Compatible(text.toUpperCase())) {
                return { valid: false, error: 'CODE39は英大文字、数字、記号(-. $/+%)のみ対応' };
            }
            break;

        case 'ITF':
            if (!isNumeric(text)) {
                return { valid: false, error: '数字のみ入力してください' };
            }
            if (text.length % 2 !== 0) {
                return { valid: false, error: 'ITFは偶数桁のみ対応' };
            }
            break;

        default:
            return { valid: false, error: '不明なバーコード形式' };
    }

    return { valid: true };
}

/**
 * CSS数値をパース
 */
export function parseCssNumber(raw) {
    if (!raw) return null;
    const value = raw.trim();
    if (!value) return null;
    const number = parseFloat(value);
    if (Number.isNaN(number)) return null;
    if (value.endsWith('mm')) {
        return (number * 96) / 25.4;
    }
    if (value.endsWith('cm')) {
        return (number * 96) / 2.54;
    }
    if (value.endsWith('in')) {
        return number * 96;
    }
    return number;
}

/**
 * 日時フォーマット
 */
export function formatDateTime(date = new Date()) {
    return date.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
}

/**
 * JSONデータをv1からv2に変換
 */
export function migrateV1ToV2(data) {
    if (data.version === '2.0') {
        return data;
    }

    // v1からv2への変換
    const migratedBlocks = (data.blocks || []).map(block => ({
        id: generateUUID(),
        subtitle: block.subtitle || '',
        codeType: block.codeType || 'qr',
        qrErrorCorrection: 'M',
        barcodeFormat: 'CODE128',
        sizeOverride: 'auto',
        content: block.content || ''
    }));

    return {
        version: '2.0',
        createdAt: data.createdAt || new Date().toISOString(),
        savedAt: data.savedAt,
        globalSettings: {
            ...createDefaultSettings(),
            ...(data.globalSettings || {})
        },
        blocks: migratedBlocks
    };
}

/**
 * キーボードショートカット判定
 */
export function matchesShortcut(event, shortcut) {
    const isMac = /Mac/.test(navigator.platform);
    const parts = shortcut.toLowerCase().split('+');

    const ctrl = parts.includes('ctrl');
    const shift = parts.includes('shift');
    const key = parts[parts.length - 1];

    const ctrlMatch = isMac ? event.metaKey : event.ctrlKey;

    return ctrlMatch === ctrl &&
        event.shiftKey === shift &&
        event.key.toLowerCase() === key;
}

/**
 * Deep clone（簡易版）
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * CSVパース
 * ダブルクォートで囲まれたフィールド、改行を含むフィールドに対応
 */
export function parseCSV(text) {
    const result = [];
    let row = [];
    let current = '';
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuote) {
            if (char === '"') {
                if (nextChar === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuote = false;
                }
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuote = true;
            } else if (char === ',') {
                row.push(current);
                current = '';
            } else if (char === '\n' || char === '\r') {
                if (char === '\r' && nextChar === '\n') i++;
                row.push(current);
                result.push(row);
                row = [];
                current = '';
            } else {
                current += char;
            }
        }
    }

    if (current || row.length > 0) {
        row.push(current);
        result.push(row);
    }

    return result;
}

/**
 * CSV生成
 */
export function toCSV(data) {
    return data.map(row =>
        row.map(field => {
            const stringField = String(field || '');
            if (stringField.includes('"') || stringField.includes(',') || stringField.includes('\n')) {
                return `"${stringField.replace(/"/g, '""')}"`;
            }
            return stringField;
        }).join(',')
    ).join('\n');
}

/**
 * ファイルをダウンロード（名前を付けて保存ダイアログ表示）
 */
export async function downloadFile(content, defaultFilename, mimeType = 'application/json') {
    const blob = new Blob([content], { type: mimeType });

    // File System Access API対応ブラウザの場合
    if ('showSaveFilePicker' in window) {
        try {
            const isCSV = mimeType === 'text/csv';
            const handle = await window.showSaveFilePicker({
                suggestedName: defaultFilename,
                types: [{
                    description: isCSV ? 'CSV Files' : 'JSON Files',
                    accept: isCSV ? { 'text/csv': ['.csv'] } : { 'application/json': ['.json'] }
                }]
            });

            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return;
        } catch (error) {
            // ユーザーがキャンセルした場合は何もしない
            if (error.name === 'AbortError') {
                return;
            }
            // その他のエラーの場合はフォールバック
            console.warn('File System Access API failed, falling back to download:', error);
        }
    }

    // フォールバック: 従来の方法
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * ファイルを読み込み
 */
export function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}
