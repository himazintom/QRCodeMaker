// ========================================
// Web Worker - バックグラウンドコード生成
// ========================================

// Note: Web Workerではimport不可のため、必要な関数を再定義

self.addEventListener('message', function(e) {
    const { type, data } = e.data;

    if (type === 'GENERATE_CODES') {
        try {
            const { blocks, settings } = data;
            const results = [];
            let totalItems = 0;
            let processedItems = 0;

            // 総アイテム数を計算
            blocks.forEach(block => {
                if (block.content.trim()) {
                    const items = parseContent(block.content, settings);
                    totalItems += items.length;
                }
            });

            // ブロックごとに処理
            blocks.forEach((block, blockIndex) => {
                if (block.content.trim()) {
                    const items = parseContent(block.content, settings);

                    items.forEach((item, itemIndex) => {
                        results.push({
                            blockId: block.id,
                            blockIndex,
                            itemIndex,
                            text: item,
                            codeType: block.codeType,
                            qrErrorCorrection: block.qrErrorCorrection,
                            barcodeFormat: block.barcodeFormat,
                            sizeOverride: block.sizeOverride
                        });

                        processedItems++;

                        // 進捗を報告（10件ごと）
                        if (processedItems % 10 === 0 || processedItems === totalItems) {
                            self.postMessage({
                                type: 'PROGRESS',
                                current: processedItems,
                                total: totalItems
                            });
                        }
                    });
                }
            });

            // 完了
            self.postMessage({
                type: 'COMPLETE',
                results
            });

        } catch (error) {
            self.postMessage({
                type: 'ERROR',
                error: error.message
            });
        }
    }
});

function parseContent(content, settings) {
    const delimiter = getDelimiter(settings.delimiter, settings.customDelimiter);
    return content.split(delimiter)
        .map(item => item.trim())
        .filter(item => item.length > 0);
}

function getDelimiter(delimiterType, customDelimiter) {
    const delimiters = {
        'newline': '\n',
        'comma': ',',
        'semicolon': ';',
        'tab': '\t',
        'custom': customDelimiter || '\n'
    };
    return delimiters[delimiterType] || '\n';
}
