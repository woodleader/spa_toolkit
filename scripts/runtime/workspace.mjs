function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function createWorkspace({ key, version, adapter = globalThis.localStorage, fallback, validate = () => true, migrations = {} }) {
  if (!key || !Number.isInteger(version) || version < 1) throw new TypeError('Workspace requires a key and positive integer version.');

  function load() {
    try {
      const raw = adapter?.getItem(key);
      if (!raw) return clone(fallback);
      const envelope = JSON.parse(raw);
      const isVersioned = Number.isInteger(envelope?.version) && Object.hasOwn(envelope, 'data');
      let data = isVersioned ? envelope.data : envelope;
      let storedVersion = isVersioned ? Number(envelope.version) : 0;
      if (!Number.isInteger(storedVersion) || storedVersion < 0 || storedVersion > version) return clone(fallback);
      while (storedVersion < version) {
        const migrate = migrations[storedVersion];
        if (typeof migrate !== 'function') return clone(fallback);
        data = migrate(data);
        storedVersion += 1;
      }
      if (!validate(data)) return clone(fallback);
      if (storedVersion !== envelope.version) save(data);
      return clone(data);
    } catch {
      return clone(fallback);
    }
  }

  function save(data) {
    if (!validate(data)) throw new TypeError(`Invalid workspace data for ${key}.`);
    try {
      adapter?.setItem(key, JSON.stringify({ version, data }));
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({ load, save, key, version });
}
