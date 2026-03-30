// @ts-check
/**
 * Process an uploaded image to ensure it fits within the editor's content area
 * @category Helper
 * @param {string|File} fileData - Base64 string or File object
 * @param {Function} getMaxContentSize - Function returning max width/height constraints
 * @returns {Promise<string|Object>} Processed image data
 * @example
 * const processed = await processUploadedImage(file, () => editor.getMaxContentSize());
 * // Returns resized image maintaining aspect ratio
 * @note Uses multi-step Hermite resize for high quality
 * @note Respects device pixel ratio for crisp display
 */
export const processUploadedImage = (fileData, getMaxContentSize) => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const { width: logicalWidth, height: logicalHeight } = getAllowedImageDimensions(
        img.width,
        img.height,
        getMaxContentSize,
      );

      // Set canvas to original image size first
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');

      // Ensure the highest quality if the browser ever needs to resample.
      // `imageSmoothingQuality` is not supported in every browser, so we wrap it in a try/catch.
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        try {
          ctx.imageSmoothingQuality = 'high';
        } catch {}
      }

      // Draw original image at full size
      ctx.drawImage(img, 0, 0, img.width, img.height);

      // We generate an image that has `devicePixelRatio` × the CSS size
      // in real pixels, but we still tell the editor to draw it at the
      // logical (CSS) width/height.  This keeps the image crisp while
      // avoiding the browser's secondary up-scaling that causes blur.
      const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
      const targetPixelWidth = Math.round(logicalWidth * dpr);
      const targetPixelHeight = Math.round(logicalHeight * dpr);

      const finalTargetWidth = Math.min(targetPixelWidth, img.width);
      const finalTargetHeight = Math.min(targetPixelHeight, img.height);

      // Use multi-step Hermite resize algorithm if dimensions need to be changed
      const resizeNeeded = finalTargetWidth !== img.width || finalTargetHeight !== img.height;
      if (resizeNeeded) {
        multiStepResize(canvas, finalTargetWidth, finalTargetHeight);
      }

      if (typeof fileData === 'string') {
        const resizedBase64 = canvas.toDataURL();
        resolve(resizedBase64);
      } else {
        canvas.toBlob((blob) => {
          const updatedFile = new File([blob], fileData.name, {
            type: fileData.type,
            lastModified: Date.now(),
          });
          resolve({ file: updatedFile, width: logicalWidth, height: logicalHeight });
        });
      }
    };
    img.onerror = (error) => reject(error);
    img.src = typeof fileData === 'string' ? fileData : URL.createObjectURL(fileData);
  });
};

/**
 * Calculate allowed image dimensions based on editor constraints
 * @category Helper
 * @param {number} width - Original image width
 * @param {number} height - Original image height
 * @param {Function} getMaxContentSize - Function returning max width/height constraints
 * @returns {Object} Object with adjusted width and height
 * @example
 * const { width, height } = getAllowedImageDimensions(1920, 1080, () => editor.getMaxContentSize());
 * @note Maintains aspect ratio while fitting within max dimensions
 */
export const getAllowedImageDimensions = (width, height, getMaxContentSize) => {
  const { width: maxWidth, height: maxHeight } = getMaxContentSize();
  if (!maxWidth || !maxHeight) return { width, height };

  let adjustedWidth = width;
  let adjustedHeight = height;
  const aspectRatio = width / height;

  if (height > maxHeight) {
    adjustedHeight = maxHeight;
    adjustedWidth = Math.round(maxHeight * aspectRatio);
  }

  if (adjustedWidth > maxWidth) {
    adjustedWidth = maxWidth;
    adjustedHeight = Math.round(maxWidth / aspectRatio);
  }

  return { width: adjustedWidth, height: adjustedHeight };
};

/**
 * @private
 * Hermite resize - fast image resize/resample using Hermite filter. 1 cpu version!
 * see: https://github.com/viliusle/Hermite-resize
 * @param {HTMLCanvasElement} canvas - Canvas to resize
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @param {boolean} resize_canvas - Whether to resize the canvas element
 */
function resample_high_quality(canvas, width, height, resize_canvas) {
  var width_source = canvas.width;
  var height_source = canvas.height;
  width = Math.round(width);
  height = Math.round(height);

  var ratio_w = width_source / width;
  var ratio_h = height_source / height;
  var ratio_w_half = Math.ceil(ratio_w / 2);
  var ratio_h_half = Math.ceil(ratio_h / 2);

  var ctx = canvas.getContext('2d');
  var img = ctx.getImageData(0, 0, width_source, height_source);
  var img2 = ctx.createImageData(width, height);
  var data = img.data;
  var data2 = img2.data;

  for (var j = 0; j < height; j++) {
    for (var i = 0; i < width; i++) {
      var x2 = (i + j * width) * 4;
      var weight = 0;
      var weights = 0;
      var weights_alpha = 0;
      var gx_r = 0;
      var gx_g = 0;
      var gx_b = 0;
      var gx_a = 0;
      var center_y = (j + 0.5) * ratio_h;
      var yy_start = Math.floor(j * ratio_h);
      var yy_stop = Math.ceil((j + 1) * ratio_h);
      for (var yy = yy_start; yy < yy_stop; yy++) {
        var dy = Math.abs(center_y - (yy + 0.5)) / ratio_h_half;
        var center_x = (i + 0.5) * ratio_w;
        var w0 = dy * dy; //pre-calc part of w
        var xx_start = Math.floor(i * ratio_w);
        var xx_stop = Math.ceil((i + 1) * ratio_w);
        for (var xx = xx_start; xx < xx_stop; xx++) {
          var dx = Math.abs(center_x - (xx + 0.5)) / ratio_w_half;
          var w = Math.sqrt(w0 + dx * dx);
          if (w >= 1) {
            //pixel too far
            continue;
          }
          //hermite filter
          weight = 2 * w * w * w - 3 * w * w + 1;
          var pos_x = 4 * (xx + yy * width_source);
          //alpha
          gx_a += weight * data[pos_x + 3];
          weights_alpha += weight;
          //colors
          if (data[pos_x + 3] < 255) weight = (weight * data[pos_x + 3]) / 250;
          gx_r += weight * data[pos_x];
          gx_g += weight * data[pos_x + 1];
          gx_b += weight * data[pos_x + 2];
          weights += weight;
        }
      }
      data2[x2] = gx_r / weights;
      data2[x2 + 1] = gx_g / weights;
      data2[x2 + 2] = gx_b / weights;
      data2[x2 + 3] = gx_a / weights_alpha;
    }
  }
  //clear and resize canvas
  if (resize_canvas === true) {
    canvas.width = width;
    canvas.height = height;
  } else {
    ctx.clearRect(0, 0, width_source, height_source);
  }

  //draw
  ctx.putImageData(img2, 0, 0);
}

/**
 * Multi step image resize for better quality
 * @param {HTMLCanvasElement} canvas - Canvas to resize
 * @param {number} width - Target width
 * @param {number} height - Target height
 */
function multiStepResize(canvas, width, height) {
  let oc = document.createElement('canvas');
  let octx = oc.getContext('2d');
  let ctx = canvas.getContext('2d');

  let steps = Math.ceil(Math.log(canvas.width / width) / Math.log(2));
  steps = Math.max(steps, 1);

  let stepWidth = width * Math.pow(2, steps - 1);
  let stepHeight = height * Math.pow(2, steps - 1);
  let currentWidth = canvas.width;
  let currentHeight = canvas.height;

  oc.width = currentWidth;
  oc.height = currentHeight;
  octx.drawImage(canvas, 0, 0);

  while (steps > 0) {
    stepWidth = Math.max(stepWidth, width);
    stepHeight = Math.max(stepHeight, height);

    canvas.width = stepWidth;
    canvas.height = stepHeight;

    ctx.drawImage(oc, 0, 0, currentWidth, currentHeight, 0, 0, stepWidth, stepHeight);

    currentWidth = stepWidth;
    currentHeight = stepHeight;

    oc.width = currentWidth;
    oc.height = currentHeight;
    octx.drawImage(canvas, 0, 0);

    stepWidth = Math.round(stepWidth / 2);
    stepHeight = Math.round(stepHeight / 2);
    steps--;
  }

  // Ensure final resize to exact dimensions
  resample_high_quality(canvas, width, height, true);
}
