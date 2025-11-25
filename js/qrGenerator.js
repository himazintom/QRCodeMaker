// ========================================
// QRコード生成サービス
// ========================================

import { getQRSize, parseCssNumber } from './utils.js';

export class QRGenerator {
    /**
     * QRコードを生成
     * @param {string} text - エンコードするテキスト
     * @param {string} errorCorrectionLevel - L/M/Q/H
     * @returns {Object|null} - {svgString, moduleCount, size} または null
     */
    static generate(text, errorCorrectionLevel = 'M') {
        try {
            if (typeof qrcode === 'undefined') {
                throw new Error('QRコードライブラリが読み込まれていません');
            }

            // QRコードオブジェクト作成
            const qr = qrcode(0, errorCorrectionLevel);
            qr.addData(text);
            qr.make();

            const moduleCount = qr.getModuleCount();
            const size = getQRSize(moduleCount);

            // SVGタグを生成
            const svgString = qr.createSvgTag(1, 0);

            return {
                svgString,
                moduleCount,
                size
            };
        } catch (error) {
            console.error('QRコード生成エラー:', error);
            return null;
        }
    }

    /**
     * QRコードのHTML要素を作成
     * @param {Object} qrData - generate()の戻り値
     * @param {number} targetSize - 目標サイズ（ピクセル）
     * @returns {HTMLElement}
     */
    static createQRElement(qrData, targetSize = 190) {
        const container = document.createElement('div');
        container.className = 'qr-inner';
        container.style.width = `${targetSize}px`;
        container.style.height = `${targetSize}px`;

        try {
            container.innerHTML = qrData.svgString;
            const svg = container.querySelector('svg');

            if (svg) {
                svg.removeAttribute('width');
                svg.removeAttribute('height');
                svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                svg.style.width = '100%';
                svg.style.height = '100%';
                svg.style.display = 'block';
            }
        } catch (error) {
            console.error('QR SVG生成エラー:', error);
            container.innerHTML = '<div class="error">QRコード生成エラー</div>';
        }

        return container;
    }

    /**
     * QRコードの適切なサイズを計算
     * @param {string} sizeClass - 'small' | 'medium' | 'large'
     * @returns {number} - ピクセル値
     */
    static getQRSidePx(sizeClass) {
        const rootStyle = getComputedStyle(document.documentElement);
        const width = parseCssNumber(rootStyle.getPropertyValue(`--code-width-${sizeClass}`));
        const framePadding = parseCssNumber(rootStyle.getPropertyValue('--qr-frame-padding'));
        const effectiveWidth = (width ?? 180) - 2 * (framePadding ?? 18);
        return Math.max(60, effectiveWidth);
    }
}
