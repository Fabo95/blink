import type { SyncPacket, SyncRecord } from '@blink/contract/wire';
import type { NewRecordRow, RecordRow } from '@blink/db/schema';
import type { RecordsModelService } from '@/services/model/recordsModelService.js';

interface SyncServiceDeps {
  recordsModelService: RecordsModelService;
}

/**
 * Bidirectional sync orchestration. Maps between the client wire format
 * ({@link SyncPacket}) and DB rows. The server only ever moves ciphertext — it
 * never decrypts `cipher`.
 */
export class SyncService {
  private deps: SyncServiceDeps;

  constructor(deps: SyncServiceDeps) {
    this.deps = deps;
  }

  async push(userId: string, packets: SyncPacket[]): Promise<number> {
    const rows = packets.map((packet) => packetToRow(userId, packet));
    await this.deps.recordsModelService.upsertMany(userId, rows);
    return packets.length;
  }

  async pull(userId: string, sinceSeq: number): Promise<SyncRecord[]> {
    const rows = await this.deps.recordsModelService.listSince(userId, sinceSeq);
    return rows.map(rowToRecord);
  }
}

function packetToRow(userId: string, packet: SyncPacket): NewRecordRow {
  return {
    id: packet.id,
    ownerId: userId,
    cipher: packet.cipher,
    hlcPhysical: packet.clock.physical,
    hlcCounter: packet.clock.counter,
    hlcNodeId: packet.clock.nodeId,
  };
}

function rowToRecord(row: RecordRow): SyncRecord {
  return {
    id: row.id,
    clock: { physical: row.hlcPhysical, counter: row.hlcCounter, nodeId: row.hlcNodeId },
    cipher: row.cipher,
    seq: row.seq,
  };
}
