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

  // Always compress the image first to ensure ultra-fast upload & minimal size
  const compressedDataUrl = await compressBase64Image(dataUrl);

  const user = auth.currentUser;
  // If user is not logged in or storage is not initialized, return compressed data URL
  if (!user || !storage) {
    return compressedDataUrl;
  }

  try {
    const cleanFilename = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9_-]/g, '')}.jpg`;
    const storagePath = `users/${user.uid}/quiz_images/${cleanFilename}`;
    const storageRef = ref(storage, storagePath);

    // Upload base64 data URL to Firebase Storage
    await uploadString(storageRef, compressedDataUrl, 'data_url');
    const downloadUrl = await getDownloadURL(storageRef);
    return downloadUrl;
  } catch (err) {
    console.warn('Firebase Storage upload warning (falling back to compressed base64):', err);
    return compressedDataUrl;
  }
}
