import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection, 
  doc,
  getDocs,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../firebase';
import { useAuth } from '../contexts/useAuth';
import { saveAudioToIDB, saveMediaToIDB } from '../utils/audioStorage';
import { compressHtmlImages, compressBase64Image } from '../utils/imageCompressor';

/**
 * Helper to preserve local in-memory image data & edited content when Firestore snapshot updates
 */
function mergeLocalMediaWithFirestore(firestoreItems, localItems) {
  if (!Array.isArray(firestoreItems) || !Array.isArray(localItems)) return firestoreItems;
  const localMap = new Map(localItems.map(item => [item.id, item]));

  return firestoreItems.map(fItem => {
    const lItem = localMap.get(fItem.id);
    if (!lItem) return fItem;

    // Prefer local item for text/content, but take Firestore ID & updatedAt
    let merged = { ...fItem, ...lItem };

    // Restore or hydrate readingPassages
    if (Array.isArray(lItem.readingPassages)) {
      const fPassagesMap = new Map((fItem.readingPassages || []).map(p => [p.id, p]));
      merged.readingPassages = lItem.readingPassages.map(lPassage => {
        const fPassage = fPassagesMap.get(lPassage.id);
        if (!fPassage) return lPassage;

        const fImgMap = new Map((fPassage.images || []).map(img => [img.id, img]));
        const lImgMap = new Map((lPassage.images || []).map(img => [img.id, img]));

        const allImgIds = new Set([...lImgMap.keys(), ...fImgMap.keys()]);
        const mergedImages = Array.from(allImgIds).map(id => {
          const lImg = lImgMap.get(id);
          const fImg = fImgMap.get(id);
          if (lImg && lImg.data && lImg.data !== '[STORED_IN_INDEXEDDB]') {
            return lImg;
          }
          return fImg || lImg;
        }).filter(Boolean);

        return {
          ...fPassage,
          ...lPassage,
          images: mergedImages
        };
      });
    }

    // Restore or hydrate listeningPassages
    if (Array.isArray(lItem.listeningPassages)) {
      const fPassagesMap = new Map((fItem.listeningPassages || []).map(p => [p.id, p]));
      merged.listeningPassages = lItem.listeningPassages.map(lPassage => {
        const fPassage = fPassagesMap.get(lPassage.id);
        if (!fPassage) return lPassage;

        const fImgMap = new Map((fPassage.images || []).map(img => [img.id, img]));
        const lImgMap = new Map((lPassage.images || []).map(img => [img.id, img]));

        const allImgIds = new Set([...lImgMap.keys(), ...fImgMap.keys()]);
        const mergedImages = Array.from(allImgIds).map(id => {
          const lImg = lImgMap.get(id);
          const fImg = fImgMap.get(id);
          if (lImg && lImg.data && lImg.data !== '[STORED_IN_INDEXEDDB]') {
            return lImg;
          }
          return fImg || lImg;
        }).filter(Boolean);

        return {
          ...fPassage,
          ...lPassage,
          audioUrl: (lPassage.audioUrl && lPassage.audioUrl !== '[STORED_IN_INDEXEDDB]') ? lPassage.audioUrl : fPassage.audioUrl,
          images: mergedImages
        };
      });
    }

    // Restore local questions if present
    if (Array.isArray(lItem.questions)) {
      const fQMap = new Map((fItem.questions || []).map(q => [q.id, q]));
      merged.questions = lItem.questions.map(lQ => {
        const fQ = fQMap.get(lQ.id);
        return fQ ? { ...fQ, ...lQ } : lQ;
      });
    }

    return merged;
  });
}

/**
 * Helper to recursively sanitize and compress all Base64 images & audio refs in an item before Firestore sync
 */
async function sanitizeItemForFirestore(item) {
  if (!item || typeof item !== 'object') return item;
  let sanitized = JSON.parse(JSON.stringify(item));

  // 1. Compress HTML content images (NotesView / Tiptap)
  if (sanitized.content && typeof sanitized.content === 'string' && sanitized.content.includes('data:image/')) {
    sanitized.content = await compressHtmlImages(sanitized.content);
  }

  // Helper to process & sanitize passage images
  const processPassageImages = async (passages) => {
    if (!Array.isArray(passages)) return;
    for (let p of passages) {
      if (Array.isArray(p.images)) {
        for (let img of p.images) {
          if (!img) continue;
          if (!img.id) img.id = uuidv4();
          const rawData = img.data || img.url;
          if (rawData && rawData.length > 100) {
            // Save to IndexedDB (awaited)
            await saveMediaToIDB(img.id, rawData);

            if (typeof rawData === 'string' && rawData.startsWith('data:image/')) {
              const compressed = await compressBase64Image(rawData, 900, 900, 0.65);
              await saveMediaToIDB(img.id, compressed);

              if (compressed.length > 120000) {
                img.data = '[STORED_IN_INDEXEDDB]';
                if (img.url && img.url.startsWith('data:image/')) {
                  img.url = '[STORED_IN_INDEXEDDB]';
                }
              } else {
                img.data = compressed;
                if (img.url && img.url.startsWith('data:image/')) {
                  img.url = compressed;
                }
              }
            }
          }
        }
      }
    }
  };

  // 2. Compress images & sanitize audio in listeningPassages
  if (Array.isArray(sanitized.listeningPassages)) {
    for (let p of sanitized.listeningPassages) {
      if (p.audioUrl && p.audioUrl.length > 200000) {
        saveAudioToIDB(p.id, p.audioUrl);
        p.audioUrl = '[STORED_IN_INDEXEDDB]';
        p.isLocalAudio = true;
      }
    }
    await processPassageImages(sanitized.listeningPassages);
  }

  // 3. Compress images in readingPassages
  if (Array.isArray(sanitized.readingPassages)) {
    await processPassageImages(sanitized.readingPassages);
  }

  // 4. Compress images in questions
  if (Array.isArray(sanitized.questions)) {
    for (let q of sanitized.questions) {
      if (q.image && typeof q.image === 'string' && q.image.startsWith('data:image/')) {
        q.image = await compressBase64Image(q.image);
        if (q.id) saveMediaToIDB(q.id, q.image);
      }
      if (Array.isArray(q.images)) {
        for (let img of q.images) {
          if (img && img.id && img.data && typeof img.data === 'string' && img.data.startsWith('data:image/')) {
            img.data = await compressBase64Image(img.data);
            if (img.url && img.url.startsWith('data:image/')) {
              img.url = img.data;
            }
            saveMediaToIDB(img.id, img.data);
          }
        }
      }
    }
  }

  // 5. Compress root images array
  if (Array.isArray(sanitized.images)) {
    for (let img of sanitized.images) {
      if (img && img.id && img.data && typeof img.data === 'string' && img.data.startsWith('data:image/')) {
        img.data = await compressBase64Image(img.data);
        if (img.url && img.url.startsWith('data:image/')) {
          img.url = img.data;
        }
        saveMediaToIDB(img.id, img.data);
      }
    }
  }

  return sanitized;
}

/**
 * Hook that syncs a Firestore collection with local state.
 * Each item in the array becomes a document in: users/{userId}/{collectionName}/{item.id}
 * Falls back to localStorage if user is not logged in.
 * Audio and image files are stored in IndexedDB to bypass 5MB localStorage and 1MB Firestore limits.
 */
export function useFirestore(collectionName, localStorageKey, defaultValue = [], options = {}) {
  const { autoSync = false } = options;
  const { user } = useAuth();
  const [items, setItemsState] = useState(() => {
    // Initialize from localStorage
    try {
      const stored = window.localStorage.getItem(localStorageKey);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [syncState, setSyncState] = useState({
    status: 'synced', // 'synced' | 'has_unsaved' | 'saving' | 'local_only' | 'error'
    error: null,
    lastSaved: Date.now()
  });

  const [firestoreReady, setFirestoreReady] = useState(false);
  const isUpdatingFromFirestore = useRef(false);
  const pendingWrites = useRef(false);
  const isFirestoreEmptyRef = useRef(true);
  const currentItemsRef = useRef(items);
  const lastSyncedItemsRef = useRef(items);

  useEffect(() => {
    currentItemsRef.current = items;
  }, [items]);

  // Get Firestore collection reference for current user
  const getCollectionRef = useCallback(() => {
    if (!user) return null;
    return collection(db, 'users', user.uid, collectionName);
  }, [user, collectionName]);

  const initialLocalDataRef = useRef(items);

  // Listen to Firestore changes (real-time sync)
  useEffect(() => {
    if (!user) {
      setSyncState({ status: 'local_only', error: 'Chưa đăng nhập (Dữ liệu lưu tại máy)', lastSaved: Date.now() });
      return;
    }

    const colRef = getCollectionRef();
    if (!colRef) return;

    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      if (pendingWrites.current || snapshot.metadata.hasPendingWrites) return; // Skip if writing or local pending echo write
      
      const firestoreItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort by updatedAt descending (newest first)
      firestoreItems.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      lastSyncedItemsRef.current = firestoreItems;
      isUpdatingFromFirestore.current = true;
      
      const migrationKey = `migrated_${collectionName}_${user.uid}`;
      const isMigrated = localStorage.getItem(migrationKey);
      
      const localHasRealData = initialLocalDataRef.current.length > 0 && initialLocalDataRef.current[0].id !== defaultValue[0]?.id;

      if (!isMigrated && localHasRealData) {
        // Keep local state for migration
      } else if (firestoreItems.length === 0 && !isMigrated) {
        // migration effect will handle pushing default/local data
      } else {
        if (!hasUnsavedChanges) {
          const mergedItems = mergeLocalMediaWithFirestore(firestoreItems, currentItemsRef.current);
          setItemsState(mergedItems);
          
          // Save clean version to localStorage (sanitize large audio & image Base64)
          try {
            const sanitizedForLocalStorage = firestoreItems.map(item => {
              let sanitized = { ...item };
              if (sanitized.listeningPassages) {
                sanitized.listeningPassages = sanitized.listeningPassages.map(p => ({
                  ...p,
                  audioUrl: (p.audioUrl && p.audioUrl.length > 200000) ? '[STORED_IN_INDEXEDDB]' : p.audioUrl,
                  images: Array.isArray(p.images) ? p.images.map(img => ({
                    ...img,
                    data: (img.data && img.data.length > 80000) ? '[STORED_IN_INDEXEDDB]' : img.data,
                    url: (img.url && img.url.length > 80000) ? '[STORED_IN_INDEXEDDB]' : img.url
                  })) : []
                }));
              }
              if (sanitized.readingPassages) {
                sanitized.readingPassages = sanitized.readingPassages.map(p => ({
                  ...p,
                  images: Array.isArray(p.images) ? p.images.map(img => ({
                    ...img,
                    data: (img.data && img.data.length > 80000) ? '[STORED_IN_INDEXEDDB]' : img.data,
                    url: (img.url && img.url.length > 80000) ? '[STORED_IN_INDEXEDDB]' : img.url
                  })) : []
                }));
              }
              return sanitized;
            });
            window.localStorage.setItem(localStorageKey, JSON.stringify(sanitizedForLocalStorage));
          } catch (e) {
            console.warn('Failed to cache to localStorage:', e);
          }
        }
      }
      
      isFirestoreEmptyRef.current = firestoreItems.length === 0;
      setFirestoreReady(true);
      if (!hasUnsavedChanges) {
        setSyncState({ status: 'synced', error: null, lastSaved: Date.now() });
      }
      
      setTimeout(() => {
        isUpdatingFromFirestore.current = false;
      }, 100);
    }, (error) => {
      console.error(`Firestore listen error for ${collectionName}:`, error);
      setFirestoreReady(true);
      setSyncState({ status: 'error', error: `Lỗi kết nối Firestore: ${error.message}`, lastSaved: Date.now() });
    });

    return unsubscribe;
  }, [user, collectionName, getCollectionRef, localStorageKey, hasUnsavedChanges]);

  // Migrate localStorage data to Firestore on first login
  useEffect(() => {
    if (!user || !firestoreReady) return;

    const migrationKey = `migrated_${collectionName}_${user.uid}`;
    if (localStorage.getItem(migrationKey)) return;

    const localData = initialLocalDataRef.current;
    const hasLocalData = localData && localData.length > 0;
    const localHasRealData = hasLocalData && localData[0].id !== defaultValue[0]?.id;

    if (!isFirestoreEmptyRef.current && !localHasRealData) {
      localStorage.setItem(migrationKey, 'true');
      return;
    }

    if (hasLocalData) {
      const colRef = getCollectionRef();
      if (!colRef) return;

      setSyncState({ status: 'saving', error: null, lastSaved: Date.now() });
      syncToFirestore(colRef, [], localData, setSyncState).then(() => {
        localStorage.setItem(migrationKey, 'true');
        console.log(`✅ Migrated ${localData.length} ${collectionName} to Firestore`);
      });
    } else {
      localStorage.setItem(migrationKey, 'true');
    }
  }, [user, firestoreReady, collectionName, localStorageKey, getCollectionRef]);

  // Manual save function to push current state to Firestore
  const saveToCloud = useCallback(async (customItems = null) => {
    const itemsToSave = customItems || currentItemsRef.current;
    if (!user) {
      setSyncState({ status: 'local_only', error: 'Chưa đăng nhập (Đã lưu tại máy IndexedDB)', lastSaved: Date.now() });
      return;
    }

    const colRef = getCollectionRef();
    if (!colRef) return;

    pendingWrites.current = true;
    setSyncState({ status: 'saving', error: null, lastSaved: Date.now() });

    try {
      // Get all current documents in Firestore to detect deletions reliably
      let oldItems = lastSyncedItemsRef.current || [];
      try {
        const snapshot = await getDocs(colRef);
        oldItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn('Could not fetch existing docs from Firestore before sync, using lastSyncedItemsRef:', e);
      }

      await syncToFirestore(colRef, oldItems, itemsToSave, setSyncState);
      lastSyncedItemsRef.current = itemsToSave;
      setHasUnsavedChanges(false);
      setSyncState({ status: 'synced', error: null, lastSaved: Date.now() });
    } catch (err) {
      console.error('Firestore save error:', err);
      setSyncState({ status: 'error', error: `Lỗi lưu Cloud: ${err.message}`, lastSaved: Date.now() });
    } finally {
      setTimeout(() => {
        pendingWrites.current = false;
      }, 1500);
    }
  }, [user, getCollectionRef]);

  // Wrapper setItems that writes to localStorage and IndexedDB immediately, and flags unsaved changes for Cloud
  const setItems = useCallback((newValueOrFn) => {
    setItemsState(prev => {
      const newItems = typeof newValueOrFn === 'function' ? newValueOrFn(prev) : newValueOrFn;

      // Extract and save audio & image files to IndexedDB (unlimited storage)
      newItems.forEach(item => {
        if (item.listeningPassages) {
          item.listeningPassages.forEach(p => {
            if (p.id && p.audioUrl && p.audioUrl.length > 200 && p.audioUrl !== '[STORED_IN_INDEXEDDB]' && p.audioUrl !== '[STORED_LOCALLY]') {
              saveAudioToIDB(p.id, p.audioUrl);
            }
            if (Array.isArray(p.images)) {
              p.images.forEach(img => {
                if (img.id && (img.data || img.url) && img.data !== '[STORED_IN_INDEXEDDB]') {
                  saveMediaToIDB(img.id, img.data || img.url);
                }
              });
            }
          });
        }
        if (item.readingPassages) {
          item.readingPassages.forEach(p => {
            if (Array.isArray(p.images)) {
              p.images.forEach(img => {
                if (img.id && (img.data || img.url) && img.data !== '[STORED_IN_INDEXEDDB]') {
                  saveMediaToIDB(img.id, img.data || img.url);
                }
              });
            }
          });
        }
      });

      // Save to localStorage as backup
      let localSaveOk = true;
      try {
        const sanitizedForLocalStorage = newItems.map(item => {
          let sanitized = { ...item };
          if (sanitized.listeningPassages) {
            sanitized.listeningPassages = sanitized.listeningPassages.map(p => ({
              ...p,
              audioUrl: (p.audioUrl && p.audioUrl.length > 200000) ? '[STORED_IN_INDEXEDDB]' : p.audioUrl,
              images: Array.isArray(p.images) ? p.images.map(img => ({
                ...img,
                data: (img.data && img.data.length > 80000) ? '[STORED_IN_INDEXEDDB]' : img.data,
                url: (img.url && img.url.length > 80000) ? '[STORED_IN_INDEXEDDB]' : img.url
              })) : []
            }));
          }
          if (sanitized.readingPassages) {
            sanitized.readingPassages = sanitized.readingPassages.map(p => ({
              ...p,
              images: Array.isArray(p.images) ? p.images.map(img => ({
                ...img,
                data: (img.data && img.data.length > 80000) ? '[STORED_IN_INDEXEDDB]' : img.data,
                url: (img.url && img.url.length > 80000) ? '[STORED_IN_INDEXEDDB]' : img.url
              })) : []
            }));
          }
          return sanitized;
        });
        window.localStorage.setItem(localStorageKey, JSON.stringify(sanitizedForLocalStorage));
      } catch (e) {
        console.warn('localStorage write failed (Quota limit):', e);
        localSaveOk = false;
      }

      if (!isUpdatingFromFirestore.current) {
        setHasUnsavedChanges(true);
        if (user) {
          if (autoSync) {
            pendingWrites.current = true;
            setSyncState({ status: 'saving', error: null, lastSaved: Date.now() });
            syncToFirestore(getCollectionRef(), prev, newItems, setSyncState).finally(() => {
              pendingWrites.current = false;
              setHasUnsavedChanges(false);
            });
          } else {
            setSyncState({ status: 'has_unsaved', error: null, lastSaved: Date.now() });
          }
        } else {
          setSyncState({
            status: localSaveOk ? 'local_only' : 'error',
            error: localSaveOk ? 'Chưa đăng nhập (Đã lưu tại máy IndexedDB)' : 'Bộ nhớ trình duyệt đầy!',
            lastSaved: Date.now()
          });
        }
      }

      return newItems;
    });
  }, [user, localStorageKey, getCollectionRef, autoSync]);

  return [items, setItems, syncState, saveToCloud, hasUnsavedChanges];
}

/**
 * Efficiently sync local state changes to Firestore using batch writes.
 * Sanitizes items > 850KB (e.g. large audio Base64 strings, uncompressed images) so Firestore 1MB doc limit is never broken.
 */
async function syncToFirestore(colRef, oldItems, newItems, setSyncState) {
  try {
    const batch = writeBatch(db);
    const oldMap = new Map(oldItems.map(item => [item.id, item]));
    const newMap = new Map(newItems.map(item => [item.id, item]));
    let hasOversizedDoc = false;

    // Add or update items
    for (const item of newItems) {
      const oldItem = oldMap.get(item.id);
      if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
        const docRef = doc(colRef, item.id);
        const sanitizedItem = await sanitizeItemForFirestore(item);
        const itemJson = JSON.stringify(sanitizedItem);

        if (itemJson.length > 850000) {
          hasOversizedDoc = true;
        }
        batch.set(docRef, sanitizedItem, { merge: true });
      }
    }

    // Delete removed items
    for (const oldItem of oldItems) {
      if (!newMap.has(oldItem.id)) {
        const docRef = doc(colRef, oldItem.id);
        batch.delete(docRef);
      }
    }

    await batch.commit();

    if (hasOversizedDoc) {
      setSyncState({
        status: 'synced',
        error: 'Đã nén ảnh & lưu bài nghe lên Cloud thành công! (Dữ liệu âm thanh lớn được giữ an toàn tại IndexedDB)',
        lastSaved: Date.now()
      });
    } else {
      setSyncState({ status: 'synced', error: null, lastSaved: Date.now() });
    }
  } catch (error) {
    console.error('Firestore sync error:', error);
    setSyncState({
      status: 'error',
      error: `Lỗi lưu Cloud: ${error.message}. Dữ liệu đã lưu an toàn tại máy (IndexedDB).`,
      lastSaved: Date.now()
    });
  }
}

