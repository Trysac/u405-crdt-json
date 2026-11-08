/**
 * Lamport ID identifying an operation or node.
 */
export interface LamportId {
  readonly clock: number;
  readonly client: string;
}

/**
 * Operation types supported by the CRDT engine.
 */
export enum OpType {
  MapSet = 1,
  MapDelete = 2,
  TextInsert = 3,
  TextDelete = 4,
  CounterAdd = 5,
  ListInsert = 6,
  ListDelete = 7,
}

/**
 * Internal operation structure.
 */
export interface Operation {
  readonly id: LamportId;
  readonly type: OpType;
  readonly rootKey: string;
  readonly key?: string;
  readonly value?: unknown;
  readonly prevId?: LamportId | null;
  readonly targetId?: LamportId;
  readonly amount?: number;
}

/**
 * State vector mapping client IDs to maximum known Lamport clock.
 */
export type StateVector = Map<string, number>;

/**
 * Node in RGA sequence (Text or List).
 */
export interface RgaNode<T> {
  readonly id: LamportId;
  readonly prevId: LamportId | null;
  value: T;
  deleted: boolean;
}
