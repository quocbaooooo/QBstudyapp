import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  collection, 
  doc,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/useAuth';

/**
 * Hook that syncs a Firestore collection with local state.
 * Each item in the array becomes a document in: users/{userId}/{collectionName}/{item.id}
 * Falls back to localStorage if user is not logged in.
 * 
 * @param {string} collectionName - Name of the sub-collection (e.g., 'notes', 'decks', 'quizzes')
 * @param {string} localStorageKey - localStorage key for fallback/migration
 * @param {Array} defaultValue - Default empty value
 * @returns {[Array, Function, Object]} - [items, setItems, syncState]
 */
export function useFirestore(collectionName, localStorageKey, defaultValue = []) {
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

  const [syncState, setSyncState] = useState({
    status: 'synced', // 'synced' | 'saving' | 'local_only' | 'error'
    error: null,
    lastSaved: Date.now()
  });

  const [firestoreReady, setFirestoreReady] = useState(false);
  const isUpdatingFromFirestore = useRef(false);
  const pendingWrites = useRef(false);
  const isFirestoreEmptyRef = useRef(true);

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
      
      const firestoreItems = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        };
      });

      // Merge local audio data if firestore stripped it due to 1MB limit
      const localDataMap = new Map((items || []).map(i => [i.id, i]));
      const mergedItems = firestoreItems.map(fsItem => {
        const localItem = localDataMap.get(fsItem.id);
        if (localItem && localItem.listeningPassages && fsItem.listeningPassages) {
          const mergedPassages = fsItem.listeningPassages.map((p, pIdx) => {
            const localP = localItem.listeningPassages[pIdx];
            if (localP && localP.audioUrl && (p.audioUrl === '[STORED_LOCALLY]' || !p.audioUrl)) {
              return { ...p, audioUrl: localP.audioUrl, isLocalAudio: true };
            }
            return p;
          });
          return { ...fsItem, listeningPassages: mergedPassages };
        }
        return fsItem;
      });

      // Sort by updatedAt descending (newest first)
      mergedItems.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      isUpdatingFromFirestore.current = true;
      
      const migrationKey = `migrated_${collectionName}_${user.uid}`;
      const isMigrated = localStorage.getItem(migrationKey);
      
      const localHasRealData = initialLocalDataRef.current.length > 0 && initialLocalDataRef.current[0].id !== defaultValue[0]?.id;

      if (!isMigrated && localHasRealData) {
        // Keep local state for migration
      } else if (mergedItems.length === 0 && !isMigrated) {
        // migration effect will handle pushing default/local data
      } else {
        setItemsState(mergedItems);
        try {
          window.localStorage.setItem(localStorageKey, JSON.stringify(mergedItems));
        } catch (e) {
          console.warn('Failed to cache to localStorage', e);
        }
      }
      
      isFirestoreEmptyRef.current = mergedItems.length === 0;
      setFirestoreReady(true);
      setSyncState({ status: 'synced', error: null, lastSaved: Date.now() });
      
      setTimeout(() => {
        isUpdatingFromFirestore.current = false;
      }, 100);
    }, (error) => {
      console.error(`Firestore listen error for ${collectionName}:`, error);
      setFirestoreReady(true);
      setSyncState({ status: 'error', error: `Lỗi kết nối Firestore: ${error.message}`, lastSaved: Date.now() });
    });

    return unsubscribe;
  }, [user, collectionName, getCollectionRef, localStorageKey]);

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

  // Wrapper setItems that writes to both Firestore and localStorage
  const setItems = useCallback((newValueOrFn) => {
    setItemsState(prev => {
      const newItems = typeof newValueOrFn === 'function' ? newValueOrFn(prev) : newValueOrFn;

      // Always save to localStorage as backup
      let localSaveOk = true;
      try {
        window.localStorage.setItem(localStorageKey, JSON.stringify(newItems));
      } catch (e) {
        console.warn('localStorage write failed (Quota limit):', e);
        localSaveOk = false;
      }

      // Write to Firestore if logged in (and this isn't triggered by Firestore listener)
      if (user && !isUpdatingFromFirestore.current) {
        const colRef = getCollectionRef();
        if (colRef) {
          pendingWrites.current = true;
          setSyncState({ status: 'saving', error: null, lastSaved: Date.now() });
          syncToFirestore(colRef, prev, newItems, setSyncState).finally(() => {
            pendingWrites.current = false;
          });
        }
      } else if (!user) {
        setSyncState({
          status: localSaveOk ? 'local_only' : 'error',
          error: localSaveOk ? 'Chưa đăng nhập (Đã lưu tại máy)' : 'Bộ nhớ trình duyệt đầy, không thể lưu!',
          lastSaved: Date.now()
        });
      }

      return newItems;
    });
  }, [user, localStorageKey, getCollectionRef]);

  return [items, setItems, syncState];
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
              if (p.audioUrl && p.audioUrl.length > 300000) {
                return { ...p, audioUrl: '[STORED_LOCALLY]', isLocalAudio: true };
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
        error: 'File âm thanh bài nghe >1MB. Đã lưu nội dung chữ lên Cloud và lưu file âm thanh an toàn tại máy (Local Storage).',
        lastSaved: Date.now()
      });
    } else {
      setSyncState({ status: 'synced', error: null, lastSaved: Date.now() });
    }
  } catch (error) {
    console.error('Firestore sync error:', error);
    setSyncState({
      status: 'error',
      error: `Lỗi lưu Cloud: ${error.message}. Dữ liệu đã lưu an toàn tại máy (Local Storage).`,
      lastSaved: Date.now()
    });
  }
}
