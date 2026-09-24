import type { Lesson } from "@/data/subjects";

const DB_NAME = "vidya-learning-hub";
const DB_VERSION = 2;
const PACKAGES_STORE = "packages";
const ATTEMPTS_STORE = "quizAttempts";
const PROGRESS_STORE = "progress";
const GAME_STORE = "gamePackages";
const GAME_SESSIONS_STORE = "gameSessions";

export type OfflineQuizQuestion = {
  id: string;
  lessonId: string;
  topic: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export type OfflinePackage = {
  lesson: Lesson;
  questions: OfflineQuizQuestion[];
  downloadedAt: string;
  version: 1;
};

export type OfflineQuizAttempt = {
  id: string;
  lessonId: string;
  answers: Record<string, string>;
  score: number;
  total: number;
  completedAt: string;
  synced: boolean;
};

export type OfflineGameChallenge = OfflineQuizQuestion & {
  quickLearn: string;
  hint: string;
  difficulty: 1 | 2 | 3;
  concept: string;
};

export type OfflineGamePackage = {
  id: "learning-quest-v1";
  challenges: OfflineGameChallenge[];
  downloadedAt: string;
  version: 1;
};

export type OfflineGameSession = {
  id: string;
  packageId: OfflineGamePackage["id"];
  topic: string;
  challengeIds: string[];
  correct: number;
  completed: number;
  xp: number;
  mistakes: string[];
  concepts: string[];
  startedAt: string;
  completedAt: string;
  synced: boolean;
};

export type OfflineProgress = {
  lessonId: string;
  position: number;
  completed: boolean;
  updatedAt: string;
  synced: boolean;
};

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("Offline storage is unavailable in this browser."));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open offline storage."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PACKAGES_STORE)) {
        db.createObjectStore(PACKAGES_STORE, { keyPath: "lesson.id" });
      }
      if (!db.objectStoreNames.contains(ATTEMPTS_STORE)) {
        const store = db.createObjectStore(ATTEMPTS_STORE, { keyPath: "id" });
        store.createIndex("lessonId", "lessonId", { unique: false });
      }
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
        db.createObjectStore(PROGRESS_STORE, { keyPath: "lessonId" });
      }
      if (!db.objectStoreNames.contains(GAME_STORE)) {
        db.createObjectStore(GAME_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(GAME_SESSIONS_STORE)) {
        const store = db.createObjectStore(GAME_SESSIONS_STORE, { keyPath: "id" });
        store.createIndex("packageId", "packageId", { unique: false });
      }
    };
  });
}

async function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = operation(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage operation failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Offline storage transaction failed."));
    tx.oncomplete = () => db.close();
  });
}

export const offlineLearningService = {
  isAvailable: canUseIndexedDb,

  async listPackages(): Promise<OfflinePackage[]> {
    const packages = await transaction<OfflinePackage[]>(PACKAGES_STORE, "readonly", (store) =>
      store.getAll(),
    );
    return packages.sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
  },

  async getPackage(lessonId: string): Promise<OfflinePackage | undefined> {
    return transaction<OfflinePackage | undefined>(PACKAGES_STORE, "readonly", (store) =>
      store.get(lessonId),
    );
  },

  async savePackage(lesson: Lesson, questions: OfflineQuizQuestion[]): Promise<OfflinePackage> {
    const offlinePackage: OfflinePackage = {
      lesson,
      questions,
      downloadedAt: new Date().toISOString(),
      version: 1,
    };
    await transaction(PACKAGES_STORE, "readwrite", (store) => store.put(offlinePackage));
    return offlinePackage;
  },

  async removePackage(lessonId: string): Promise<void> {
    await transaction(PACKAGES_STORE, "readwrite", (store) => store.delete(lessonId));
  },

  async saveAttempt(attempt: OfflineQuizAttempt): Promise<void> {
    await transaction(ATTEMPTS_STORE, "readwrite", (store) => store.put(attempt));
  },

  async listAttempts(lessonId?: string): Promise<OfflineQuizAttempt[]> {
    const attempts = lessonId
      ? await transaction<OfflineQuizAttempt[]>(ATTEMPTS_STORE, "readonly", (store) =>
          store.index("lessonId").getAll(lessonId),
        )
      : await transaction<OfflineQuizAttempt[]>(ATTEMPTS_STORE, "readonly", (store) =>
          store.getAll(),
        );
    return attempts.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  },

  async saveProgress(progress: OfflineProgress): Promise<void> {
    await transaction(PROGRESS_STORE, "readwrite", (store) => store.put(progress));
  },

  async getProgress(lessonId: string): Promise<OfflineProgress | undefined> {
    return transaction<OfflineProgress | undefined>(PROGRESS_STORE, "readonly", (store) =>
      store.get(lessonId),
    );
  },

  async listProgress(): Promise<OfflineProgress[]> {
    return transaction<OfflineProgress[]>(PROGRESS_STORE, "readonly", (store) =>
      store.getAll(),
    );
  },

  async getGamePackage(): Promise<OfflineGamePackage | undefined> {
    return transaction<OfflineGamePackage | undefined>(GAME_STORE, "readonly", (store) =>
      store.get("learning-quest-v1"),
    );
  },

  async saveGamePackage(challenges: OfflineGameChallenge[]): Promise<OfflineGamePackage> {
    const gamePackage: OfflineGamePackage = {
      id: "learning-quest-v1",
      challenges,
      downloadedAt: new Date().toISOString(),
      version: 1,
    };
    await transaction(GAME_STORE, "readwrite", (store) => store.put(gamePackage));
    return gamePackage;
  },

  async saveGameSession(session: OfflineGameSession): Promise<void> {
    await transaction(GAME_SESSIONS_STORE, "readwrite", (store) => store.put(session));
  },

  async listGameSessions(): Promise<OfflineGameSession[]> {
    const sessions = await transaction<OfflineGameSession[]>(GAME_SESSIONS_STORE, "readonly", (store) =>
      store.getAll(),
    );
    return sessions.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  },
};
