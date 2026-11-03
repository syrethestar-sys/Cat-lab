// Light check (no TensorFlow.js) for "is there a trained model saved in this browser?".
// TensorFlow.js keeps models in the IndexedDB database "tensorflowjs", store "models_store".
export async function hasSavedModel(): Promise<boolean> {
  try {
    // Opening a database that does not exist would create an empty one, which breaks
    // TensorFlow.js later. So check that it exists first.
    const dbs = await indexedDB.databases();
    if (!dbs.some((d) => d.name === "tensorflowjs")) return false;

    return await new Promise<boolean>((resolve) => {
      const req = indexedDB.open("tensorflowjs");
      req.onupgradeneeded = () => req.transaction?.abort(); // never create it here
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("models_store")) {
          db.close();
          resolve(false);
          return;
        }
        const get = db
          .transaction("models_store", "readonly")
          .objectStore("models_store")
          .getKey("cat-lab-model");
        get.onsuccess = () => {
          db.close();
          resolve(get.result !== undefined);
        };
        get.onerror = () => {
          db.close();
          resolve(false);
        };
      };
    });
  } catch {
    return false;
  }
}
