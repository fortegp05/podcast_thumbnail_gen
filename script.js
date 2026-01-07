class PodcastThumbnailGenerator {
    constructor() {
        this.canvas = document.getElementById('thumbnailCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.backgroundImage = null;
        this.qrCodeDataUrl = null;
        
        this.loadFromLocalStorage();
        this.initializeEventListeners();
        this.initializeModal();
        this.loadDefaultBackground();
    }

    initializeEventListeners() {
        const generateBtn = document.getElementById('generateBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        const resetBtn = document.getElementById('resetBtn');
        const backgroundImageInput = document.getElementById('backgroundImage');
        const episodeUrlInput = document.getElementById('episodeUrl');
        const fetchRssBtn = document.getElementById('fetchRssBtn');

        generateBtn.addEventListener('click', () => this.generateThumbnail());
        downloadBtn.addEventListener('click', () => this.downloadThumbnail());
        resetBtn.addEventListener('click', () => this.resetForm());
        backgroundImageInput.addEventListener('change', (e) => this.handleBackgroundImageChange(e));
        episodeUrlInput.addEventListener('input', (e) => this.handleUrlChange(e));
        fetchRssBtn.addEventListener('click', () => this.fetchRssFeed());

        // リアルタイムプレビュー（オプション）
        const inputs = document.querySelectorAll('#thumbnailForm input, #thumbnailForm textarea, #thumbnailForm select');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                this.saveToLocalStorage();
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => this.generateThumbnail(), 500);
            });
        });
    }

    initializeModal() {
        const helpBtn = document.getElementById('helpBtn');
        const modal = document.getElementById('helpModal');
        const closeBtn = document.getElementById('closeModal');

        helpBtn.addEventListener('click', () => {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
        });

        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        });

        // モーダル外クリックで閉じる
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });

        // ESCキーで閉じる
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'block') {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    }

    loadDefaultBackground() {
        // デフォルトの背景色を設定
        this.ctx.fillStyle = '#4a5568';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    handleBackgroundImageChange(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.backgroundImage = img;
                    this.generateThumbnail();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    handleUrlChange(event) {
        const url = event.target.value;
        if (url) {
            this.generateQRCode(url);
        } else {
            this.qrCodeDataUrl = null;
        }
    }

    async fetchRssFeed() {
        const rssUrlInput = document.getElementById('rssUrl');
        const rssUrl = rssUrlInput.value.trim();
        const fetchBtn = document.getElementById('fetchRssBtn');

        if (!rssUrl) {
            this.showNotification('RSS URLを入力してください', 'error');
            return;
        }

        // ボタンを無効化
        fetchBtn.disabled = true;
        fetchBtn.textContent = '取得中...';

        try {
            const response = await fetch(rssUrl);

            if (!response.ok) {
                throw new Error(`HTTPエラー: ${response.status}`);
            }

            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

            // パースエラーチェック
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                throw new Error('XMLのパースに失敗しました');
            }

            // RSSフィードからデータを抽出
            const feedData = this.parseRssFeed(xmlDoc);

            if (feedData) {
                // フォームに反映
                this.fillFormWithFeedData(feedData);
                this.showNotification('最新エピソードを取得しました！', 'success');
            } else {
                throw new Error('エピソードが見つかりませんでした');
            }

        } catch (error) {
            console.error('RSS取得エラー:', error);
            let errorMessage = 'RSSフィードの取得に失敗しました';

            if (error.message.includes('CORS')) {
                errorMessage += '（CORS制限）';
            } else if (error.message.includes('Failed to fetch')) {
                errorMessage += '（ネットワークエラー）';
            } else {
                errorMessage += `: ${error.message}`;
            }

            this.showNotification(errorMessage, 'error', 5000);
        } finally {
            // ボタンを再有効化
            fetchBtn.disabled = false;
            fetchBtn.textContent = '取得';
        }
    }

    parseRssFeed(xmlDoc) {
        // チャンネルタイトルを取得
        const channelTitle = xmlDoc.querySelector('channel > title')?.textContent || '';

        // 最新のitem（エピソード）を取得
        const latestItem = xmlDoc.querySelector('channel > item');

        if (!latestItem) {
            return null;
        }

        // エピソード情報を抽出
        const episodeTitle = latestItem.querySelector('title')?.textContent || '';
        const episodeLink = latestItem.querySelector('link')?.textContent || '';

        // itunes:subtitleから概要を取得（名前空間を考慮）
        let episodeDescription = '';
        const itunesSubtitle = latestItem.querySelector('subtitle');
        if (itunesSubtitle) {
            episodeDescription = itunesSubtitle.textContent.trim();
        }

        return {
            podcastTitle: channelTitle,
            episodeTitle: episodeTitle,
            episodeDescription: episodeDescription,
            episodeUrl: episodeLink
        };
    }

    fillFormWithFeedData(feedData) {
        // エピソードタイトル
        if (feedData.episodeTitle) {
            document.getElementById('episodeTitle').value = feedData.episodeTitle;
        }

        // エピソード概要
        if (feedData.episodeDescription) {
            document.getElementById('episodeDescription').value = feedData.episodeDescription;
        }

        // エピソードURL
        if (feedData.episodeUrl) {
            document.getElementById('episodeUrl').value = feedData.episodeUrl;
            // QRコードも生成
            this.generateQRCode(feedData.episodeUrl);
        }

        // LocalStorageに保存
        this.saveToLocalStorage();

        // プレビューを自動生成
        setTimeout(() => {
            this.generateThumbnail();
        }, 300);
    }

    generateQRCode(url) {
        try {
            const qr = new QRious({
                value: url,
                size: 150,
                background: 'white',
                foreground: 'black',
                level: 'M'
            });
            this.qrCodeDataUrl = qr.toDataURL();
        } catch (error) {
            console.error('QRコード生成エラー:', error);
            this.qrCodeDataUrl = null;
        }
    }

    getFormData() {
        return {
            podcastTitle: document.getElementById('podcastTitle').value || 'ポッドキャストタイトル',
            episodeTitle: document.getElementById('episodeTitle').value || 'エピソードタイトル',
            episodeDescription: document.getElementById('episodeDescription').value || 'エピソードの説明',
            episodeUrl: document.getElementById('episodeUrl').value,
            hashtags: document.getElementById('hashtags').value,
            watermark: document.getElementById('watermark').value || '@username'
        };
    }

    getColors() {
        return {
            bg: '#4a5568',
            text: '#ffffff',
            accent: '#cbd5e0'
        };
    }

    getFontSizes() {
        return {
            title: 56,
            episode: 42,
            description: 28,
            hashtags: 20,
            url: 22,
            watermark: 24
        };
    }

    generateThumbnail() {
        const data = this.getFormData();
        const colors = this.getColors();
        const fonts = this.getFontSizes();

        // キャンバスをクリア
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 背景を描画
        this.drawBackground(colors);

        // テキストを描画
        this.drawText(data, colors, fonts);

        // QRコードを描画
        if (this.qrCodeDataUrl && data.episodeUrl) {
            this.drawQRCode();
        }

        // ウォーターマークを描画
        this.drawWatermark(data.watermark, colors, fonts);

        // canvasの内容をimgタグに反映
        this.updateImagePreview();

        // ダウンロードボタンを有効化
        document.getElementById('downloadBtn').disabled = false;
    }

    drawBackground(colors) {
        if (this.backgroundImage) {
            // 背景画像がある場合 - アスペクト比を維持して中央に配置
            const imgAspect = this.backgroundImage.width / this.backgroundImage.height;
            const canvasAspect = this.canvas.width / this.canvas.height;
            
            let drawWidth, drawHeight, drawX, drawY;
            
            if (imgAspect > canvasAspect) {
                // 画像が横長の場合、高さを合わせて中央に配置
                drawHeight = this.canvas.height;
                drawWidth = drawHeight * imgAspect;
                drawX = (this.canvas.width - drawWidth) / 2;
                drawY = 0;
            } else {
                // 画像が縦長の場合、幅を合わせて中央に配置
                drawWidth = this.canvas.width;
                drawHeight = drawWidth / imgAspect;
                drawX = 0;
                drawY = (this.canvas.height - drawHeight) / 2;
            }
            
            // 背景色で塗りつぶし（画像がカバーしない部分用）
            this.ctx.fillStyle = colors.bg;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            // 画像を描画
            this.ctx.drawImage(this.backgroundImage, drawX, drawY, drawWidth, drawHeight);
            
            // 半透明のオーバーレイを追加
            this.ctx.fillStyle = colors.bg + '80'; // 50%透明度
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            // 背景画像がない場合は単色
            this.ctx.fillStyle = colors.bg;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    drawText(data, colors, fonts) {
        this.ctx.fillStyle = colors.text;
        this.ctx.textAlign = 'left';

        // ポッドキャストタイトル
        this.ctx.font = `bold ${fonts.title}px Arial, sans-serif`;
        this.wrapText(data.podcastTitle, 50, 100, this.canvas.width - 200, fonts.title * 1.2);

        // エピソードタイトル
        this.ctx.font = `bold ${fonts.episode}px Arial, sans-serif`;
        this.ctx.fillStyle = colors.accent;
        this.wrapText(data.episodeTitle, 50, 200, this.canvas.width - 200, fonts.episode * 1.2);

        // エピソード説明
        this.ctx.font = `${fonts.description}px Arial, sans-serif`;
        this.ctx.fillStyle = colors.text;
        this.wrapText(data.episodeDescription, 50, 320, this.canvas.width - 200, fonts.description * 1.4);

        // ハッシュタグ（文字列として表示）
        if (data.hashtags) {
            this.ctx.font = `${fonts.hashtags}px Arial, sans-serif`;
            this.ctx.fillStyle = colors.accent;
            this.ctx.fillText(data.hashtags, 50, this.canvas.height - 200);
        }

        // エピソードURL（文字列として表示）
        if (data.episodeUrl) {
            this.ctx.font = `${fonts.url}px Arial, sans-serif`;
            this.ctx.fillStyle = colors.accent;
            this.ctx.fillText(data.episodeUrl, 50, this.canvas.height - 160);
        }
    }

    wrapText(text, x, y, maxWidth, lineHeight) {
        const lines = text.split('\n');
        let currentY = y;

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const lineText = lines[lineIndex];
            const words = lineText.split(' ');
            let line = '';

            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = this.ctx.measureText(testLine);
                const testWidth = metrics.width;

                if (testWidth > maxWidth && n > 0) {
                    this.ctx.fillText(line, x, currentY);
                    line = words[n] + ' ';
                    currentY += lineHeight;
                } else {
                    line = testLine;
                }
            }
            this.ctx.fillText(line, x, currentY);
            currentY += lineHeight;
        }
        return currentY;
    }

    drawQRCode() {
        if (!this.qrCodeDataUrl) return;

        const qrImg = new Image();
        qrImg.onload = () => {
            const qrSize = 120;
            const qrX = this.canvas.width - qrSize - 30;
            const qrY = this.canvas.height - qrSize - 30;

            // QRコードの背景（白）
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20);

            // QRコードを描画
            this.ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

            // QRコード描画後にimgタグを更新
            this.updateImagePreview();
        };
        qrImg.src = this.qrCodeDataUrl;
    }

    updateImagePreview() {
        const thumbnailImage = document.getElementById('thumbnailImage');
        if (thumbnailImage) {
            thumbnailImage.src = this.canvas.toDataURL('image/png');
        }
    }

    drawWatermark(watermark, colors, fonts) {
        this.ctx.font = `${fonts.watermark}px Arial, sans-serif`;
        this.ctx.fillStyle = colors.text + '80'; // 50%透明度
        this.ctx.textAlign = 'right';
        this.ctx.fillText(watermark, this.canvas.width - 30, 50);
    }

    downloadThumbnail() {
        const link = document.createElement('a');
        link.download = `podcast-thumbnail-${Date.now()}.png`;
        link.href = this.canvas.toDataURL();
        link.click();
    }

    loadFromLocalStorage() {
        const savedData = localStorage.getItem('podcastThumbnailData');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);

                // データが空でない場合のみ復元
                const hasData = data.podcastTitle || data.episodeTitle || data.episodeDescription || data.episodeUrl || data.hashtags || (data.watermark && data.watermark !== '@') || data.rssUrl;

                if (hasData) {
                    document.getElementById('rssUrl').value = data.rssUrl || '';
                    document.getElementById('podcastTitle').value = data.podcastTitle || '';
                    document.getElementById('episodeTitle').value = data.episodeTitle || '';
                    document.getElementById('episodeDescription').value = data.episodeDescription || '';
                    document.getElementById('episodeUrl').value = data.episodeUrl || '';
                    document.getElementById('hashtags').value = data.hashtags || '';
                    document.getElementById('watermark').value = data.watermark || '@';

                    // URLがある場合はQRコードも生成
                    if (data.episodeUrl) {
                        this.generateQRCode(data.episodeUrl);
                    }

                    // 通知を表示
                    this.showNotification('前回の入力内容を復元しました', 'info');

                    // サムネイルのプレビューを自動実行
                    setTimeout(() => {
                        this.generateThumbnail();
                    }, 500);
                }
            } catch (error) {
                console.error('LocalStorage読み込みエラー:', error);
            }
        }
    }

    saveToLocalStorage() {
        const data = {
            rssUrl: document.getElementById('rssUrl').value,
            podcastTitle: document.getElementById('podcastTitle').value,
            episodeTitle: document.getElementById('episodeTitle').value,
            episodeDescription: document.getElementById('episodeDescription').value,
            episodeUrl: document.getElementById('episodeUrl').value,
            hashtags: document.getElementById('hashtags').value,
            watermark: document.getElementById('watermark').value
        };

        try {
            localStorage.setItem('podcastThumbnailData', JSON.stringify(data));
        } catch (error) {
            console.error('LocalStorage保存エラー:', error);
        }
    }

    showNotification(message, type = 'info', duration = 3000) {
        // 既存の通知があれば削除
        const existingNotification = document.querySelector('.notification');
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // 通知要素を作成
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // ページに追加
        document.body.appendChild(notification);
        
        // アニメーション表示
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // 自動非表示
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }

    resetForm() {
        document.getElementById('thumbnailForm').reset();
        document.getElementById('watermark').value = '@';
        this.backgroundImage = null;
        this.qrCodeDataUrl = null;
        this.loadDefaultBackground();
        document.getElementById('downloadBtn').disabled = true;

        // imgタグもクリア
        const thumbnailImage = document.getElementById('thumbnailImage');
        if (thumbnailImage) {
            thumbnailImage.src = '';
        }

        // LocalStorageもクリア
        localStorage.removeItem('podcastThumbnailData');

        // リセット通知
        this.showNotification('フォームをリセットしました', 'success');
    }
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', () => {
    new PodcastThumbnailGenerator();
});