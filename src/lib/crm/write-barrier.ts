const barriers = new Map<string, () => Promise<void>>();

// Test seam. Production never registers a barrier, so this is a no-op.
export function setWriteBarrier(name: string, fn: (() => Promise<void>) | null) {
  if (fn) barriers.set(name, fn);
  else barriers.delete(name);
}

export function clearWriteBarriers() {
  barriers.clear();
}

export async function writeBarrier(name: string) {
  const fn = barriers.get(name);
  if (fn) await fn();
}
