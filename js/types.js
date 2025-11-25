// ========================================
// 型定義と定数
// ========================================

/**
 * @typedef {'qr' | 'barcode'} CodeType
 * @typedef {'L' | 'M' | 'Q' | 'H'} QRErrorCorrectionLevel
 * @typedef {'CODE128' | 'EAN13' | 'JAN' | 'CODE39' | 'ITF'} BarcodeFormat
 * @typedef {'auto' | 'small' | 'medium' | 'large'} SizeOverride
 * @typedef {'newline' | 'comma' | 'semicolon' | 'tab' | 'custom'} DelimiterType
 * @typedef {'light' | 'dark' | 'auto'} ThemeType
 * @typedef {'a4' | 'a5' | 'letter'} PaperSize
 * @typedef {'portrait' | 'landscape'} PaperOrientation
 */

/**
 * @typedef {Object} Block
 * @property {string} id
 * @property {string} subtitle
 * @property {CodeType} codeType
 * @property {QRErrorCorrectionLevel} qrErrorCorrection
 * @property {BarcodeFormat} barcodeFormat
 * @property {SizeOverride} sizeOverride
 * @property {string} content
 */

/**
 * @typedef {Object} GlobalSettings
 * @property {string} printTitle
 * @property {DelimiterType} delimiter
 * @property {string} customDelimiter
 * @property {ThemeType} theme
 * @property {PaperSize} paperSize
 * @property {PaperOrientation} paperOrientation
 */

/**
 * @typedef {Object} GeneratedCode
 * @property {string} blockId
 * @property {number} index
 * @property {string} text
 * @property {CodeType} type
 * @property {string} imageData
 * @property {'small' | 'medium' | 'large'} size
 */

/**
 * @typedef {Object} ValidationError
 * @property {string} blockId
 * @property {number} lineNumber
 * @property {string} text
 * @property {string} errorType
 * @property {string} message
 */

// 定数
export const CONSTANTS = {
    VERSION: '2.0',
    MAX_HISTORY: 20,
    AUTO_SAVE_DELAY: 1000,
    STORAGE_KEY: 'qr-barcode-data-v2',
    PROGRESS_THRESHOLD: 50,

    QR_ERROR_LEVELS: {
        L: 'L',
        M: 'M',
        Q: 'Q',
        H: 'H'
    },

    BARCODE_FORMATS: {
        CODE128: 'CODE128',
        EAN13: 'EAN13',
        JAN: 'JAN',
        CODE39: 'CODE39',
        ITF: 'ITF'
    },

    DELIMITERS: {
        newline: '\n',
        comma: ',',
        semicolon: ';',
        tab: '\t'
    },

    PAPER_SIZES: {
        a4: { width: 210, height: 297, unit: 'mm' },
        a5: { width: 148, height: 210, unit: 'mm' },
        letter: { width: 8.5, height: 11, unit: 'in' }
    },

    KEYBOARD_SHORTCUTS: {
        NEW_BLOCK: 'ctrl+n',
        EXPORT: 'ctrl+s',
        IMPORT: 'ctrl+o',
        GENERATE: 'ctrl+enter',
        PREVIEW: 'ctrl+p',
        UNDO: 'ctrl+z',
        REDO: 'ctrl+shift+z',
        REDO_ALT: 'ctrl+y'
    }
};

// デフォルト値
export const DEFAULTS = {
    globalSettings: {
        printTitle: '',
        delimiter: 'newline',
        customDelimiter: '',
        theme: 'auto',
        paperSize: 'a4',
        paperOrientation: 'portrait'
    },

    block: {
        subtitle: '',
        codeType: 'qr',
        qrErrorCorrection: 'M',
        barcodeFormat: 'CODE128',
        sizeOverride: 'auto',
        content: ''
    }
};
