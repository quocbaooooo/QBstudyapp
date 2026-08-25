/**
 * Utility to compress Base64 data URLs and HTML inline images.
 * Reduces 2MB-10MB screenshots down to ~60KB-150KB while preserving visual clarity.
 * Prevents localStorage quota errors and Firestore 1MB document limit errors.
 */

/**
 * Compress a single Base64 image data URL using HTML5 Canvas.
 * @param {string} dataUrl - Image data URL (e.g. data:image/png;base64,...)
 * @param {number} maxWidth - Max width in pixels (default: 1200)
 * @param {number} maxHeight - Max height in pixels (default: 1200)
 * @param {number} quality - Quality compression factor 0.0 - 1.0 (default: 0.75)
 * @returns {Promise<string>} - Compressed JPEG/WebP data URL
 */
export function compressBase64Image(dataUrl, maxWidth = 1200, maxHeight = 1200, quality = 0.75) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      resolve(dataUrl);
      return;
    }

    // Skip if already small (< 100KB)
    if (dataUrl.length < 130000) {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Use smooth scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Fill white background for transparent PNGs converted to JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(img, 0, 0, width, height);

      // Export as compressed JPEG
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };

    img.onerror = () => {
      console.warn('Canvas image compression failed, returning original image data.');
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

/**
 * Scans an HTML string, finds all large <img src="data:image/..."> elements,
 * compresses them, and returns the updated HTML string.
 * @param {string} html - HTML string from editor
 * @returns {Promise<string>} - HTML string with compressed image data URLs
 */
export async function compressHtmlImages(html) {
  if (!html || typeof html !== 'string' || !html.includes('data:image/')) {
    return html;
  }

  // Regex to match data:image URLs in src attributes
  const imgRegex = /src=["'](data:image\/[^"']+)["']/g;
  let match;
  const matches = [];

  while ((match = imgRegex.exec(html)) !== null) {
    const originalSrc = match[1];
    if (originalSrc.length > 130000) {
      matches.push(originalSrc);
    }
  }

  if (matches.length === 0) return html;

  let updatedHtml = html;
  for (const src of matches) {
    const compressed = await compressBase64Image(src);
    updatedHtml = updatedHtml.replaceAll(src, compressed);
  }

  return updatedHtml;
}
