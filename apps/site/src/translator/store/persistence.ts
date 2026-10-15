import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { ModProject } from '@mlf/core';

const DB_NAME = 'modlangforge';
const DB_VERSION = 1;
const STORE = 'projects';

interface Schema extends DBSchema {
  projects: { key: string; value: ModProject };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        database.createObjectStore(STORE, { keyPath: 'id' });
      },
    }).catch((err: unknown) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function loadAll(): Promise<ModProject[]> {
  return (await db()).getAll(STORE);
}

export async function saveProject(p: ModProject): Promise<void> {
  await (await db()).put(STORE, p);
}

export async function deleteProject(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
}

export async function clearAll(): Promise<void> {
  await (await db()).clear(STORE);
}
