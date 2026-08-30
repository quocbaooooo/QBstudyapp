import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../firebase';
import { compressBase64Image } from './imageCompressor';

/**
 * Uploads an image (Base64 data URL or File) to Firebase Storage or returns a compressed Base64 string.
 * @param {string} dataUrl - Base64 image string (data:image/...)
 * @param {string} filename - Preferred filename / ID
 * @returns {Promise<string>} - Firebase Storage HTTPS URL or compressed Base64 URL
 */
export async function uploadImageToStorage(dataUrl, filename = 'image') {
  if (!dataUrl || typeof dataUrl !== 'string') return dataUrl;
  if (dataUrl.startsWith('http://') || dataUrl.startsWith('https://') || dataUrl === '[STORED_IN_INDEXEDDB]') {
    return dataUrl;
  }

  const user = auth.currentUser;
  if (!user || !storage) {
    return dataUrl;
  }

  try {
    const cleanFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9_-]/g, '')}.jpg`;
    const storagePath = `users/${user.uid}/quiz_images/${cleanFilename}`;
    const storageRef = ref(storage, storagePath);

    // Timeout after 2.5 seconds if network or CORS hangs so UI never waits
    const uploadPromise = uploadString(storageRef, dataUrl, 'data_url').then(() => getDownloadURL(storageRef));
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Storage timeout')), 2500));

    const downloadUrl = await Promise.race([uploadPromise, timeoutPromise]);
    return downloadUrl;
  } catch (err) {
    console.warn('Firebase Storage upload skipped (using local storage):', err?.message || err);
    return dataUrl;
  }
}
