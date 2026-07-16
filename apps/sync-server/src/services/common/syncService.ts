import type { NewTaskRow, TaskRow } from '@blink/db';
import type { TasksModelService } from '@/services/model/tasksModelService.js';
import type { SyncPacket } from '@/utils/schemas/index.js';

interface SyncServiceDeps {
  tasksModelService: TasksModelService;
}

/**
 * Bidirectional sync orchestration. Maps between the client wire format
 * ({@link SyncPacket}) and DB rows. The server only ever moves ciphertext — it
 * never decrypts `encrypted.*`.
 */
export class SyncService {
  private deps: SyncServiceDeps;

  constructor(deps: SyncServiceDeps) {
    this.deps = deps;
  }

  async push(userId: string, packets: SyncPacket[]): Promise<number> {
    const rows = packets.map((packet) => packetToRow(userId, packet));
    await this.deps.tasksModelService.upsertMany(userId, rows);
    return packets.length;
  }

  async pull(userId: string, sincePhysical: number): Promise<SyncPacket[]> {
    const rows = await this.deps.tasksModelService.listSince(userId, sincePhysical);
    return rows.map(rowToPacket);
  }
}

function packetToRow(userId: string, packet: SyncPacket): NewTaskRow {
  return {
    id: packet.taskId,
    ownerId: userId,
    status: packet.status,
    titleCipher: packet.encrypted.title,
    bodyCipher: packet.encrypted.body,
    hlcPhysical: packet.clock.physical,
    hlcCounter: packet.clock.counter,
    hlcNodeId: packet.clock.nodeId,
  };
}

function rowToPacket(row: TaskRow): SyncPacket {
  return {
    taskId: row.id,
    clock: { physical: row.hlcPhysical, counter: row.hlcCounter, nodeId: row.hlcNodeId },
    status: row.status,
    encrypted: { title: row.titleCipher, body: row.bodyCipher },
  };
}
