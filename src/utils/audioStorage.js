/**
 * IndexedDB storage utility for large audio files & media blobs.
 * Bypasses 5MB localStorage limits and 1MB Firestore document limits.
 * Supports up to hundreds of MBs of local media storage.
 */

const DB_NAME = 'QBStudyAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'audio_files';

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
    };

    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Save audio or image DataURL / Blob by ID to IndexedDB
 */
export async function saveAudioToIDB(id, audioData) {
  if (!id || !audioData) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(audioData, id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Error saving audio to IndexedDB:', err);
  }
}

export const saveMediaToIDB = saveAudioToIDB;

/**
 * Get audio or image DataURL / Blob by ID from IndexedDB
 */
export async function getAudioFromIDB(id) {
  if (!id) return null;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Error getting audio from IndexedDB:', err);
    return null;
  }
}

export const getMediaFromIDB = getAudioFromIDB;

/**
 * Delete audio or image by ID from IndexedDB
 */
export async function deleteAudioFromIDB(id) {
  if (!id) return;
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error('Error deleting audio from IndexedDB:', err);
  }
}

export const deleteMediaFromIDB = deleteAudioFromIDB;

