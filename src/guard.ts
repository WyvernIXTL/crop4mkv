import { Database, Statement } from "bun:sqlite";

export const GUARD_DB_NAME = "crop4mkv.sqlite3";

enum FileStatus {
    NotProcessed = 0,
    Processed = 1,
    Errored = 2,
}

export class DB {
    private db: Database;

    private checkProcessedQuery: Statement<
        { processed: FileStatus },
        [{ path: string }]
    >;
    private insertOrUpdateQuery: Statement<
        undefined,
        [{ path: string; processed: FileStatus }]
    >;

    constructor(dbPath: string) {
        const db = new Database(dbPath, { strict: true });
        db.exec("PRAGMA journal_mode = WAL;");
        db.exec(
            `
            CREATE TABLE IF NOT EXISTS processed_files (
                file_path TEXT PRIMARY KEY NOT NULL,
                processed INTEGER NOT NULL
            );
        `
        );

        this.db = db;

        this.checkProcessedQuery = db.query(
            "SELECT processed FROM processed_files WHERE file_path = $path;"
        );
        this.insertOrUpdateQuery = db.query(
            `
            INSERT INTO processed_files (file_path, processed)
            VALUES ($path, $processed)
            ON CONFLICT(file_path) DO UPDATE
            SET processed = $processed
            ;`
        );
    }

    addEntry(path: string) {
        this.insertOrUpdateQuery.run({
            path: path,
            processed: FileStatus.NotProcessed,
        });
    }

    public fileProcessed(path: string): boolean {
        const result = this.checkProcessedQuery.get({ path: path });

        if (result === null) {
            this.addEntry(path);
            return false;
        }

        return (
            result.processed === FileStatus.Processed ||
            result.processed === FileStatus.Errored
        );
    }

    public setProcessed(path: string) {
        this.insertOrUpdateQuery.run({
            path: path,
            processed: FileStatus.Processed,
        });
    }

    public setError(path: string) {
        this.insertOrUpdateQuery.run({
            path: path,
            processed: FileStatus.Errored,
        });
    }

    public close() {
        this.db.close();
    }
}
