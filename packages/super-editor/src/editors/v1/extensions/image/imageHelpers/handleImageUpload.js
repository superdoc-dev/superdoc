// @ts-check

/**
 * Converts an image file to base64 data URL
 * @category Helper
 * @param {File} file - Image file to convert
 * @returns {Promise<string>} Base64 data URL of the image
 * @example
 * const dataUrl = await handleImageUpload(file);
 * // Returns: "data:image/png;base64,..."
 * @note Adds 250ms delay before reading to ensure file is ready
 */
export const handleImageUpload = (file) => {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = (event) => {
      // @ts-expect-error - readAsDataURL always returns string, not ArrayBuffer
      resolve(event.target.result);
    };
    reader.onerror = reject;
    setTimeout(() => reader.readAsDataURL(file), 250);
  });
};
