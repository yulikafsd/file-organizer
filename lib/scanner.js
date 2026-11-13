import { EventEmitter } from "events";
import fs from "fs/promises";
import path from "path";

export class Scanner extends EventEmitter {
    async getAllFiles(directory) {
        try {
            const entries = await fs.readdir(directory, {
                recursive: true,
                withFileTypes: true,
            });

            return entries
                .filter((entry) => entry.isFile())
                .map((entry) => {
                    const parent = entry.parentPath || entry.path;
                    return path.join(parent, entry.name);
                });
        } catch (error) {
            this.handleFsError(error, directory);
        }
    }

    async scan(directory) {
        this.emit("scan-start", { directory });

        const filePaths = await this.getAllFiles(directory);
        const totalFiles = filePaths.length;

        let totalSize = 0;
        const byType = new Map();
        const byAge = {
            last7Days: 0,
            last30Days: 0,
            olderThan90Days: 0,
        };

        const allFilesInfo = [];
        const now = Date.now();
        const MS_PER_DAY = 1000 * 60 * 60 * 24;

        for (let i = 0; i < totalFiles; i++) {
            const filePath = filePaths[i];

            try {
                const stats = await fs.stat(filePath);
                const size = stats.size;
                const mtime = stats.mtime;
                const daysOld = Math.floor(
                    (now - mtime.getTime()) / MS_PER_DAY,
                );
                const ext =
                    path.extname(filePath).toLowerCase() || "(no extension)";

                totalSize += size;

                const typeStats = byType.get(ext) || { count: 0, totalSize: 0 };
                typeStats.count += 1;
                typeStats.totalSize += size;
                byType.set(ext, typeStats);

                if (daysOld <= 7) byAge.last7Days += 1;
                if (daysOld <= 30) byAge.last30Days += 1;
                if (daysOld > 90) byAge.olderThan90Days += 1;

                const fileData = {
                    name: path.basename(filePath),
                    path: filePath,
                    size,
                    mtime,
                    daysOld,
                    ext,
                };

                allFilesInfo.push(fileData);

                this.emit("file-found", {
                    ...fileData,
                    current: i + 1,
                    total: totalFiles,
                });
            } catch (error) {
                this.handleFsError(error, filePath);
            }
        }

        const largestFiles = [...allFilesInfo]
            .sort((a, b) => b.size - a.size)
            .slice(0, 3);

        const oldestFile =
            [...allFilesInfo].sort(
                (a, b) => a.mtime.getTime() - b.mtime.getTime(),
            )[0] || null;

        const statistics = {
            totalFiles,
            totalSize,
            byType,
            byAge,
            largestFiles,
            oldestFile,
        };

        this.emit("scan-complete", statistics);
        return statistics;
    }

    handleFsError(error, targetPath) {
        if (error.code === "ENOENT") {
            console.error(`\n❌ Error: Path not found: ${targetPath}`);
        } else if (error.code === "EACCES") {
            console.error(`\n❌ Error: Permission denied: ${targetPath}`);
        } else {
            console.error(
                `\n Unexpected error (${targetPath}): ${error.message}`,
            );
        }
        process.exit(1);
    }
}
