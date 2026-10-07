// Optimistic transactions deliberately overlap reads; conflicts retry the entire callback.
// A serial queue would hide bugs in concurrent quota reservations.
export class TransactionFixture {
  data = new Map();
  versions = new Map();
  conflicts = 0;
  async run(operation) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const reads = new Map(), writes = new Map();
      const result = await operation({
        get: async path => { reads.set(path, this.versions.get(path) || 0); const value = this.data.get(path); await Promise.resolve(); return value ? structuredClone(value) : null; },
        set: (path, value) => writes.set(path, structuredClone(value)),
        delete: path => writes.set(path, null),
      });
      if ([...reads].some(([path, version]) => version !== (this.versions.get(path) || 0))) { this.conflicts++; continue; }
      for (const [path, value] of writes) {
        if (value === null) this.data.delete(path); else this.data.set(path, value);
        this.versions.set(path, (this.versions.get(path) || 0) + 1);
      }
      return result;
    }
    throw new Error("Too many fixture conflicts");
  }
  seed(path, value) { this.data.set(path, structuredClone(value)); this.versions.set(path, (this.versions.get(path) || 0) + 1); }
}
