/**
 * Image compression utility
 * Ensures images don't exceed 10MB
 */

const MAX_SIZE_MB = 10;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

/**
 * Compress image to ensure it's under 10MB
 * @param {File} file - Image file
 * @param {number} maxWidth - Max width (default: 2048)
 * @param {number} maxHeight - Max height (default: 2048)
 * @returns {Promise<string>} Base64 data URL
 */
export async function compressImage(file, maxWidth = 2048, maxHeight = 2048) {
  // Check if file is too large
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(`Файл слишком большой. Максимум ${MAX_SIZE_MB}MB`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }
        
        // Create canvas and compress
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Try different quality levels to stay under 10MB
        let quality = 0.9;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        // Reduce quality if still too large
        while (dataUrl.length > MAX_SIZE_BYTES && quality > 0.1) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        
        // Final check
        if (dataUrl.length > MAX_SIZE_BYTES) {
          reject(new Error(`Не удалось сжать изображение до ${MAX_SIZE_MB}MB`));
        } else {
          resolve(dataUrl);
        }
      };
      
      img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
      img.src = e.target.result;
    };
    
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
}

/**
 * Validate file size before upload
 * @param {File} file - File to validate
 * @returns {boolean} True if valid
 */
export function validateFileSize(file) {
  if (!file) return false;
  if (file.size > MAX_SIZE_BYTES) {
    alert(`Файл слишком большой. Максимум ${MAX_SIZE_MB}MB`);
    return false;
  }
  return true;
}

/**
 * Get human-readable file size
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
