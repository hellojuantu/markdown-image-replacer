import {createCanvas, loadImage} from 'canvas';
import fetch from 'node-fetch';

const config = {
    imageOffset: {value: 24},
    shadowOffset: {value: 5},
    shadowBlur: {value: 8},
    shadowColorAlpha: {value: 3},
    shadowColor: {value: "#000000"},
    borderLength: {value: 1},
    borderColor: {value: "#000000"},
};

export async function processImageWithBorder(inputBuffer, enableCompression = false, apiKey = '', log) {
    log('[🔧] Starting image processing...');
    const img = await loadImage(inputBuffer);
    log(`[🎨] Image width: ${img.width}, height:${img.height}`);
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

    log('[🔧] Starting image processing...');
    const buffer = canvas.toBuffer('image/png');

    if (enableCompression && apiKey) {
        log('[📦] Preparing for TinyPNG compression...');
        const compressedBuffer = await compressWithTinyPNG(buffer, apiKey);
        log(`[✅] TinyPNG compression completed, original size: ${buffer.length} bytes`);
        log(`[✅] Compressed size: ${compressedBuffer.length} bytes`);
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
    return Buffer.from(await finalRes.arrayBuffer());
}
