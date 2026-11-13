import { EventEmitter } from "events";
import crypto from "crypto";
import fs from "fs";
import fsPromises from "fs/promises";
import { Scanner } from "./scanner.js";

export class DuplicateFinder extends EventEmitter {
    constructor() {
        super();
        this.scanner = new Scanner();
    }

    calculateHash(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash("sha256");
            const stream = fs.createReadStream(filePath);

            stream.on("data", (chunk) => hash.update(chunk));
            stream.on("end", () => resolve(hash.digest("hex")));
            stream.on("error", reject);
        });
    }

    async findDuplicates(directory) {
        this.emit("search-start", { directory });

        const filePaths = await this.scanner.getAllFiles(directory);
        const totalFiles = filePaths.length;
        const hashMap = new Map();

        for (let i = 0; i < totalFiles; i++) {
            const filePath = filePaths[i];

            try {
                const stats = await fsPromises.stat(filePath);
                const hash = await this.calculateHash(filePath);

                const group = hashMap.get(hash) || {
                    size: stats.size,
                    paths: [],
                };
                group.paths.push(filePath);
                hashMap.set(hash, group);

                this.emit("file-processed", {
                    filePath,
                    hash,
                    current: i + 1,
                    total: totalFiles,
                });
            } catch (error) {
                this.scanner.handleFsError(error, filePath);
            }
        }

        const duplicateGroups = [];
        let totalWastedSpace = 0;

        for (const [hash, data] of hashMap.entries()) {
            if (data.paths.length > 1) {
                const copiesCount = data.paths.length;
                const wastedSpace = data.size * (copiesCount - 1);
                totalWastedSpace += wastedSpace;

                duplicateGroups.push({
                    hash,
                    fileSize: data.size,
                    copiesCount,
                    paths: data.paths,
                    wastedSpace,
                });
            }
        }

        duplicateGroups.sort((a, b) => b.wastedSpace - a.wastedSpace);

        const results = {
            totalFiles,
            duplicateGroups,
            totalWastedSpace,
        };

        this.emit("duplicates-found", results);
        return results;
    }
}
