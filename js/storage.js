class TapeLibrary {
    constructor() {
        this.dbName = 'r1_reel_db';
        this.storeName = 'recordings';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = (event) => {
                console.error("Database error: " + event.target.errorCode);
                reject(event.target.errorCode);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: "id", autoIncrement: true });
                }
            };
        });
    }

    async saveRecording(blob, duration) {
        if (!this.db) await this.init();
        
        const transaction = this.db.transaction([this.storeName], "readwrite");
        const store = transaction.objectStore(this.storeName);
        
        const record = {
            date: new Date(),
            blob: blob,
            duration: duration,
            name: `Tape ${new Date().toLocaleTimeString()}`
        };

        return new Promise((resolve, reject) => {
            const request = store.add(record);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllRecordings() {
        if (!this.db) await this.init();

        const transaction = this.db.transaction([this.storeName], "readonly");
        const store = transaction.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteRecording(id) {
        if (!this.db) await this.init();
        const transaction = this.db.transaction([this.storeName], "readwrite");
        const store = transaction.objectStore(this.storeName);
        store.delete(id);
    }
}