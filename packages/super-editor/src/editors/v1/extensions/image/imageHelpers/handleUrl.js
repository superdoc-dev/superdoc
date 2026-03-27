/**
 * Handles URL to File conversion with comprehensive CORS error handling
 */

/**
 * Converts a URL to a File object with proper CORS error handling
 * @param {string} url - The image URL to fetch
 * @param {string} [filename] - Optional filename for the resulting file
 * @param {string} [mimeType] - Optional MIME type for the resulting file
 * @returns {Promise<File|null>} File object or null if CORS prevents access
 */
export const urlToFile = async (url, filename, mimeType) => {
  try {
    // Try to fetch the image with credentials mode set to 'omit' to avoid CORS preflight
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      headers: {
        // Add common headers that might help with CORS
        Accept: 'image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch image from ${url}: ${response.status} ${response.statusText}`);
      return null;
    }

    const blob = await response.blob();

    // Extract filename from URL if not provided
    const finalFilename = filename || extractFilenameFromUrl(url);

    // Determine MIME type from response if not provided
    const finalMimeType = mimeType || response.headers.get('content-type') || blob.type || 'image/jpeg';

    return new File([blob], finalFilename, { type: finalMimeType });
  } catch (error) {
    if (isCorsError(error)) {
      console.warn(`CORS policy prevents accessing image from ${url}:`, error.message);
      return null;
    }

    console.error(`Error fetching image from ${url}:`, error);
    return null;
  }
};

/**
 * Checks if an error is likely a CORS-related error
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error appears to be CORS-related
 */
const isCorsError = (error) => {
  const errorMessage = error.message.toLowerCase();
  const errorName = error.name.toLowerCase();

  return (
    errorName.includes('cors') ||
    errorMessage.includes('cors') ||
    errorMessage.includes('cross-origin') ||
    errorMessage.includes('access-control') ||
    errorMessage.includes('network error') || // Often indicates CORS in browsers
    errorMessage.includes('failed to fetch') // Common CORS error message
  );
};

/**
 * Extracts a filename from a URL
 * @param {string} url - The URL to extract filename from
 * @returns {string} The extracted filename
 */
const extractFilenameFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.split('/').pop();

    // If no extension, add a default one
    if (filename && !filename.includes('.')) {
      return `${filename}.jpg`;
    }

    return filename || 'image.jpg';
  } catch {
    return 'image.jpg';
  }
};

/**
 * Validates if a URL can be accessed without CORS issues
 * @param {string} url - The URL to validate
 * @returns {Promise<boolean>} True if the URL is accessible without CORS issues
 */
export const validateUrlAccessibility = async (url) => {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      credentials: 'omit',
    });
    return response.ok;
  } catch {
    return false;
  }
};
