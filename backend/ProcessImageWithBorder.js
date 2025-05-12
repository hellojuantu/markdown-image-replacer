import {createCanvas, loadImage} from 'canvas';
import fetch from 'node-fetch';

const config = {
    imageOffset: { value: 24 },
    shadowOffset: { value: 5 },
    shadowBlur: { value: 8 },
    shadowColorAlpha: { value: 3 },
    shadowColor: { value: "#000000" },
    borderLength: { value: 1 },
    borderColor: { value: "#000000" },
};

export async function processImageWithBorder(inputBuffer, enableCompression = false, apiKey = '', log) {
    log('[🔧] 开始处理图片...');
    const img = await loadImage(inputBuffer);
    log('[🎨] 图像尺寸:', img.width, 'x', img.height);
    const offset = config.imageOffset.value;
    const shadowOffset = config.shadowOffset.value;

    const canvasWidth = img.width + offset;
    const canvasHeight = img.height + offset;

    const pixelRatio = 2;
    const canvas = createCanvas(canvasWidth * pixelRatio, canvasHeight * pixelRatio);
    const ctx = canvas.getContext('2d');
    ctx.scale(pixelRatio, pixelRatio);

    const c_w = canvasWidth;
    const c_h = canvasHeight;
    const centerOffsetX = (c_w - img.width - shadowOffset) / 2;
    const centerOffsetY = (c_h - img.height - shadowOffset) / 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(centerOffsetX, centerOffsetY, img.width, img.height);

    ctx.save();
    ctx.globalAlpha = config.shadowColorAlpha.value / 10;
    ctx.shadowOffsetX = shadowOffset;
    ctx.shadowOffsetY = shadowOffset;
    ctx.shadowColor = config.shadowColor.value;
    ctx.shadowBlur = config.shadowBlur.value;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(centerOffsetX, centerOffsetY, img.width, img.height);
    ctx.restore();

    ctx.drawImage(img, centerOffsetX, centerOffsetY, img.width, img.height);

    ctx.lineWidth = config.borderLength.value;
    ctx.strokeStyle = config.borderColor.value;
    ctx.strokeRect(centerOffsetX, centerOffsetY, img.width, img.height);

    log('[🔧] 开始处理图片...');
    const buffer = canvas.toBuffer('image/png');

    if (enableCompression && apiKey) {
        log('[📦] 准备进行 TinyPNG 压缩...');
        const compressedBuffer = await compressWithTinyPNG(buffer, apiKey);
        log(`[✅] TinyPNG 压缩完成，原始大小: ${buffer.length} bytes`);
        log(`[✅] 压缩后大小: ${compressedBuffer.length} bytes`);
        return compressedBuffer;
    } else {
        return buffer;
    }
}

async function compressWithTinyPNG(imageBuffer, apiKey) {
    const auth = 'Basic ' + Buffer.from(`api:${apiKey}`).toString('base64');
    const response = await fetch('https://api.tinify.com/shrink', {
        method: 'POST',
        headers: {
            'Authorization': auth,
            'Content-Type': 'application/octet-stream',
        },
        body: imageBuffer,
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`TinyPNG error: ${response.status} ${err}`);
    }

    const result = await response.json();
    const finalRes = await fetch(result.output.url);
    return await finalRes.buffer();
}