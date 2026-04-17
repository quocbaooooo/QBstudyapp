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
 * @returns {[Array, Function]} - [items, setItems] similar to useState
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
  const [firestoreReady, setFirestoreReady] = useState(false);
  const isUpdatingFromFirestore = useRef(false);
  const pendingWrites = useRef(false);

  // Get Firestore collection reference for current user
  const getCollectionRef = useCallback(() => {
    if (!user) return null;
    return collection(db, 'users', user.uid, collectionName);
  }, [user, collectionName]);

  // Listen to Firestore changes (real-time sync)
  useEffect(() => {
    if (!user) {
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
      setItemsState(firestoreItems);
      setFirestoreReady(true);
      
      // Also update localStorage as cache
      try {
        window.localStorage.setItem(localStorageKey, JSON.stringify(firestoreItems));
      } catch (e) {
        console.warn('Failed to cache to localStorage', e);
      }

      setTimeout(() => {
        isUpdatingFromFirestore.current = false;
      }, 100);
    }, (error) => {
      console.error(`Firestore listen error for ${collectionName}:`, error);
      setFirestoreReady(true); // still mark ready so app works with localStorage data
    });

    return unsubscribe;
  }, [user, collectionName, getCollectionRef, localStorageKey]);

  // Migrate localStorage data to Firestore on first login
  useEffect(() => {
    if (!user || !firestoreReady) return;

    const migrationKey = `migrated_${collectionName}_${user.uid}`;
    if (localStorage.getItem(migrationKey)) return;

    // Check if Firestore is empty and localStorage has data
    const localData = (() => {
      try {
        const stored = window.localStorage.getItem(localStorageKey);
        return stored ? JSON.parse(stored) : [];
      } catch { return []; }
    })();

    if (localData.length > 0) {
      // Migrate to Firestore
      const colRef = getCollectionRef();
      if (!colRef) return;

      const batch = writeBatch(db);
      localData.forEach(item => {
        const docRef = doc(colRef, item.id);
        batch.set(docRef, { ...item }, { merge: true });
      });

      batch.commit().then(() => {
        localStorage.setItem(migrationKey, 'true');
        console.log(`✅ Migrated ${localData.length} ${collectionName} to Firestore`);
      }).catch(err => {
        console.error(`Migration error for ${collectionName}:`, err);
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
      try {
        window.localStorage.setItem(localStorageKey, JSON.stringify(newItems));
      } catch (e) {
        console.warn('localStorage write failed', e);
      }

      // Write to Firestore if logged in (and this isn't triggered by Firestore listener)
      if (user && !isUpdatingFromFirestore.current) {
        const colRef = getCollectionRef();
        if (colRef) {
          pendingWrites.current = true;
          syncToFirestore(colRef, prev, newItems).finally(() => {
            pendingWrites.current = false;
          });
        }
      }

      return newItems;
    });
  }, [user, localStorageKey, getCollectionRef]);

  return [items, setItems];
}

/**
 * Efficiently sync local state changes to Firestore using batch writes.
 * Only writes changed/new/deleted documents.
 */
async function syncToFirestore(colRef, oldItems, newItems) {
  try {
    const batch = writeBatch(db);
    const oldMap = new Map(oldItems.map(item => [item.id, item]));
    const newMap = new Map(newItems.map(item => [item.id, item]));

    // Add or update items
    for (const item of newItems) {
      const oldItem = oldMap.get(item.id);
      if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
        const docRef = doc(colRef, item.id);
        batch.set(docRef, { ...item }, { merge: true });
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
  } catch (error) {
    console.error('Firestore sync error:', error);
  }
}
