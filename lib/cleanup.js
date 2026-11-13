import { EventEmitter } from "events";
import fsPromises from "fs/promises";
import path from "path";
import { Scanner } from "./scanner.js";

export class Cleanup extends EventEmitter {
    constructor() {
        super();
        this.scanner = new Scanner();
    }

    async cleanup(directory, thresholdDays, confirm = false) {
        this.emit("cleanup-start", { directory, thresholdDays, confirm });

        const filePaths = await this.scanner.getAllFiles(directory);
        const filesToDelete = [];
        let totalSize = 0;

        const now = Date.now();
        const MS_PER_DAY = 1000 * 60 * 60 * 24;

        for (const filePath of filePaths) {
            try {
                const stats = await fsPromises.stat(filePath);
                const fileAge = now - stats.mtime.getTime();
                const daysOld = fileAge / MS_PER_DAY;

                if (daysOld > thresholdDays) {
                    const fileInfo = {
                        name: path.basename(filePath),
                        path: filePath,
                        size: stats.size,
                        daysOld: Math.floor(daysOld),
                        modifiedDate: stats.mtime.toISOString().split("T")[0], // Формат YYYY-MM-DD
                    };

                    filesToDelete.push(fileInfo);
                    totalSize += stats.size;

                    this.emit("file-found", fileInfo);
                }
            } catch (error) {
                this.scanner.handleFsError(error, filePath);
            }
        }

        this.emit("candidates-ready", {
            files: filesToDelete,
            totalSize,
            confirm,
        });

        let deletedCount = 0;
        let freedSpace = 0;

        if (confirm && filesToDelete.length > 0) {
            for (let i = 0; i < filesToDelete.length; i++) {
                const file = filesToDelete[i];

                try {
                    await fsPromises.unlink(file.path);
                    deletedCount += 1;
                    freedSpace += file.size;

                    this.emit("file-deleted", {
                        ...file,
                        current: i + 1,
                        total: filesToDelete.length,
                    });
                } catch (error) {
                    this.scanner.handleFsError(error, file.path);
                }
            }
        }

        const result = {
            filesFound: filesToDelete.length,
            totalSize,
            deletedCount,
            freedSpace,
            confirm,
        };

        this.emit("cleanup-complete", result);
        return result;
    }
}
