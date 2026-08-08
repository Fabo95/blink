import type { Keyset } from '@blink/contract/wire';
import type { KeysetsModelService } from '@/services/model/keysetsModelService.js';

interface KeysetServiceDeps {
  keysetsModelService: KeysetsModelService;
}

/**
 * The per-user 2SKD account keyset (wrapped VMK + KDF params). Pure passthrough
 * between the wire {@link Keyset} and the DB row — the server never derives the
 * KEK or unwraps the VMK, it only stores and returns opaque material.
 */
export class KeysetService {
  private deps: KeysetServiceDeps;

  constructor(deps: KeysetServiceDeps) {
    this.deps = deps;
  }

  async get(userId: string): Promise<Keyset | null> {
    const row = await this.deps.keysetsModelService.get(userId);
    if (!row) return null;
    return { wrappedVmk: row.wrappedVmk, kdfSalt: row.kdfSalt, kdfIterations: row.kdfIterations };
  }

  async put(userId: string, keyset: Keyset): Promise<void> {
    await this.deps.keysetsModelService.upsert(userId, {
      ownerId: userId,
      wrappedVmk: keyset.wrappedVmk,
      kdfSalt: keyset.kdfSalt,
      kdfIterations: keyset.kdfIterations,
    });
  }
}
