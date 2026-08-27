/**
 * IndexedDB storage utility for large audio files & media blobs (images/audio).
 * Bypasses 5MB localStorage limits and 1MB Firestore document limits.
 * Supports up to hundreds of MBs of local media storage.
 */

const DB_NAME = 'QBStudyMediaDB';
const DB_VERSION = 2;
const STORE_NAME = 'audio_files';
const MEDIA_STORE_NAME = 'media_files';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
        db.createObjectStore(MEDIA_STORE_NAME);
      }
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Save media DataURL / Blob by ID to IndexedDB
 */
export async function saveMediaToIDB(id, data) {
  if (!id || !data) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
      const store = tx.objectStore(MEDIA_STORE_NAME);
      const req = store.put(data, id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Error saving media to IndexedDB:', err);
  }
}

/**
 * Get media DataURL / Blob by ID from IndexedDB
 */
export async function getMediaFromIDB(id) {
  if (!id) return null;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readonly');
      const store = tx.objectStore(MEDIA_STORE_NAME);
      const req = store.get(id);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Error getting media from IndexedDB:', err);
    return null;
  }
}

/**
 * Delete media by ID from IndexedDB
 */
export async function deleteMediaFromIDB(id) {
  if (!id) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
      const store = tx.objectStore(MEDIA_STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Error deleting media from IndexedDB:', err);
  }
}

// Backward compatibility exports for Audio
export const saveAudioToIDB = saveMediaToIDB;
export const getAudioFromIDB = getMediaFromIDB;
export const deleteAudioFromIDB = deleteMediaFromIDB;
