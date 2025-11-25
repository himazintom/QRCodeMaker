// ========================================
// バーコード生成サービス
// ========================================

import { getBarcodeSize, validateBarcodeFormat } from './utils.js';

export class BarcodeGenerator {
    /**
     * バーコードを生成
     * @param {string} text - エンコードするテキスト
     * @param {string} format - CODE128/EAN13/JAN/CODE39/ITF
     * @returns {Object|null} - {svg, size, validation} または null
     */
    static generate(text, format = 'CODE128') {
        try {
            if (typeof JsBarcode === 'undefined') {
                throw new Error('バーコードライブラリが読み込まれていません');
            }

            // フォーマット検証
            const validation = validateBarcodeFormat(text, format);
            if (!validation.valid) {
                return {
                    svg: null,
                    size: getBarcodeSize(text.length),
                    validation
                };
            }

            // SVG要素作成
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

            // フォーマット別設定
            const config = this.getFormatConfig(format);

            // バーコード生成
            JsBarcode(svg, text, {
                format: config.format,
                width: config.width,
                height: config.height,
                displayValue: false,
                margin: 0
            });

            // SVGサイズ設定
            svg.setAttribute('width', '160');
            svg.setAttribute('height', '60');
            svg.setAttribute('viewBox', `0 0 ${svg.getAttribute('width') || 160} 60`);
            svg.style.width = '160px';
            svg.style.height = '60px';

            return {
                svg,
                size: getBarcodeSize(text.length),
                validation: { valid: true }
            };
        } catch (error) {
            console.error('バーコード生成エラー:', error);
            return {
                svg: null,
                size: 'medium',
                validation: { valid: false, error: error.message }
            };
        }
    }

    /**
     * フォーマット別設定を取得
     */
    static getFormatConfig(format) {
        const configs = {
            CODE128: { format: 'CODE128', width: 2, height: 40 },
            EAN13: { format: 'EAN13', width: 2, height: 40 },
            JAN: { format: 'EAN13', width: 2, height: 40 }, // JANはEAN13と同じ
            CODE39: { format: 'CODE39', width: 2, height: 40 },
            ITF: { format: 'ITF', width: 2, height: 40 }
        };

        return configs[format] || configs.CODE128;
    }

    /**
     * バーコードのHTML要素を作成
     */
    static createBarcodeElement(barcodeData) {
        const container = document.createElement('div');
        container.className = 'barcode-container';

        if (!barcodeData.svg) {
            container.innerHTML = `<div class="error">${barcodeData.validation.error || 'バーコード生成エラー'}</div>`;
            return container;
        }

        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'center';
        wrapper.style.alignItems = 'center';
        wrapper.style.height = '100%';
        wrapper.appendChild(barcodeData.svg);

        container.appendChild(wrapper);
        return container;
    }
}
