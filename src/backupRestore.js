const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { openDb } = require("./db");

function databasePath(cwd, env) {
  const configured = env && env.DATABASE_PATH ? env.DATABASE_PATH : "./data/logyazicam.sqlite";
  return path.resolve(cwd, configured);
}

function stamp(now) {
  return new Date(now)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace("T", "-");
}

function uniquePath(base) {
  if (!fs.existsSync(base)) return base;
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`could not find an available backup path for ${base}`);
}

function requireFile(file, label) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new Error(`${label} does not exist: ${file}`);
  }
  if (!stat.isFile()) throw new Error(`${label} is not a file: ${file}`);
}

function sameFile(first, second) {
  try {
    return fs.realpathSync(first) === fs.realpathSync(second);
  } catch {
    return path.resolve(first) === path.resolve(second);
  }
}

function verifySqlite(file, DatabaseImpl = Database) {
  const db = new DatabaseImpl(file, { readonly: true, fileMustExist: true });
  try {
    const result = db.pragma("integrity_check", { simple: true });
    if (result !== "ok") {
      const detail = String(result).split("\n")[0];
      throw new Error(`integrity_check failed: ${detail}`);
    }
  } finally {
    db.close();
  }
}

async function atomicReplace(source, target) {
  const directory = path.dirname(target);
  await fs.promises.mkdir(directory, { recursive: true });
  const temp = path.join(
    directory,
    `.${path.basename(target)}.restore-${process.pid}-${Date.now()}.tmp`,
  );

  try {
    await fs.promises.copyFile(source, temp);
    const handle = await fs.promises.open(temp, "r+");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(temp, target);
  } catch (error) {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
    throw error;
  }

  // A renamed standalone snapshot must not inherit an old WAL/SHM pair.
  await fs.promises.rm(`${target}-wal`, { force: true }).catch(() => {});
  await fs.promises.rm(`${target}-shm`, { force: true }).catch(() => {});
}

async function backupDatabase({ cwd = process.cwd(), env = process.env, out, now = Date.now() } = {}) {
  const source = databasePath(cwd, env);
  requireFile(source, "database");

  const destination = out
    ? path.resolve(cwd, out)
    : uniquePath(path.join(path.dirname(source), `logyazicam-backup-${stamp(now)}.sqlite`));

  if (sameFile(source, destination)) {
    throw new Error("backup destination must differ from the live database");
  }

  const db = openDb(source);
  try {
    await db.backupTo(destination);
  } finally {
    db.raw.close();
  }
  return { source, destination };
}

async function restoreDatabase({
  cwd = process.cwd(),
  env = process.env,
  file,
  force = false,
  now = Date.now(),
} = {}) {
  if (!file) throw new Error("restore file is required");

  const target = databasePath(cwd, env);
  const source = path.resolve(cwd, file);
  requireFile(source, "restore file");

  if (sameFile(source, target)) {
    throw new Error("restore file must differ from the live database");
  }

  // Validate the snapshot before touching the target or writing an auto-backup.
  verifySqlite(source);

  let autoBackup = null;
  if (fs.existsSync(target)) {
    requireFile(target, "target database");
    if (!force) {
      throw new Error(`target database already exists: ${target}; pass --force to replace it`);
    }
    autoBackup = uniquePath(`${target}.bak-${stamp(now)}`);
    const db = openDb(target);
    try {
      await db.backupTo(autoBackup);
    } finally {
      db.raw.close();
    }
  }

  await atomicReplace(source, target);
  return { source, target, autoBackup };
}

module.exports = {
  databasePath,
  backupDatabase,
  restoreDatabase,
  verifySqlite,
  atomicReplace,
  stamp,
};
