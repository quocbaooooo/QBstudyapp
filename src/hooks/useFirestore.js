import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection, 
  doc,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/useAuth';
import { saveAudioToIDB } from '../utils/audioStorage';

/**
 * Hook that syncs a Firestore collection with local state.
 * Each item in the array becomes a document in: users/{userId}/{collectionName}/{item.id}
 * Falls back to localStorage if user is not logged in.
 * Audio files are stored in IndexedDB to bypass 5MB localStorage and 1MB Firestore limits.
 * 
 * @param {string} collectionName - Name of the sub-collection (e.g., 'notes', 'decks', 'quizzes')
 * @param {string} localStorageKey - localStorage key for fallback/migration
 * @param {Array} defaultValue - Default empty value
 * @returns {[Array, Function, Object]} - [items, setItems, syncState]
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
      if (pendingWrites.current) return; // Skip if we're writing
      
      const firestoreItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort by updatedAt descending (newest first)
      firestoreItems.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

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
          setItemsState(firestoreItems);
          
          // Save clean version to localStorage (sanitize large audio Base64)
          try {
            const sanitizedForLocalStorage = firestoreItems.map(item => {
              if (!item.listeningPassages) return item;
              return {
                ...item,
                listeningPassages: item.listeningPassages.map(p => {
                  if (p.audioUrl && p.audioUrl.length > 200000) {
                    return { ...p, audioUrl: '[STORED_IN_INDEXEDDB]' };
                  }
                  return p;
                })
              };
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
      await syncToFirestore(colRef, [], itemsToSave, setSyncState);
      setHasUnsavedChanges(false);
      setSyncState({ status: 'synced', error: null, lastSaved: Date.now() });
    } catch (err) {
      setSyncState({ status: 'error', error: `Lỗi lưu Cloud: ${err.message}`, lastSaved: Date.now() });
    } finally {
      pendingWrites.current = false;
    }
  }, [user, getCollectionRef]);

  // Wrapper setItems that writes to localStorage and IndexedDB immediately, and flags unsaved changes for Cloud
  const setItems = useCallback((newValueOrFn) => {
    setItemsState(prev => {
      const newItems = typeof newValueOrFn === 'function' ? newValueOrFn(prev) : newValueOrFn;

      // Extract and save audio files to IndexedDB (unlimited storage)
      newItems.forEach(item => {
        if (item.listeningPassages) {
          item.listeningPassages.forEach(p => {
            if (p.id && p.audioUrl && p.audioUrl.length > 200 && p.audioUrl !== '[STORED_IN_INDEXEDDB]' && p.audioUrl !== '[STORED_LOCALLY]') {
              saveAudioToIDB(p.id, p.audioUrl);
            }
          });
        }
      });

      // Save to localStorage as backup
      let localSaveOk = true;
      try {
        const sanitizedForLocalStorage = newItems.map(item => {
          if (!item.listeningPassages) return item;
          return {
            ...item,
            listeningPassages: item.listeningPassages.map(p => {
              if (p.audioUrl && p.audioUrl.length > 200000) {
                return { ...p, audioUrl: '[STORED_IN_INDEXEDDB]' };
              }
              return p;
            })
          };
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
 * Sanitizes items > 850KB (e.g. large audio Base64 strings) so Firestore 1MB doc limit is never broken.
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
        const itemJson = JSON.stringify(item);

        if (itemJson.length > 850000) {
          hasOversizedDoc = true;
          // Sanitize item for Firestore document limit (<1MB)
          const sanitizedItem = JSON.parse(itemJson);
          if (sanitizedItem.listeningPassages) {
            sanitizedItem.listeningPassages = sanitizedItem.listeningPassages.map(p => {
              if (p.audioUrl && p.audioUrl.length > 200000) {
                return { ...p, audioUrl: '[STORED_IN_INDEXEDDB]', isLocalAudio: true };
              }
              return p;
            });
          }
          batch.set(docRef, sanitizedItem, { merge: true });
        } else {
          batch.set(docRef, { ...item }, { merge: true });
        }
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
        status: 'local_only',
        error: 'File âm thanh bài nghe >1MB. Đã lưu câu hỏi & kịch bản lên Cloud, lưu file âm thanh an toàn tại máy (IndexedDB).',
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
