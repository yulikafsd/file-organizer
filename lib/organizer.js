import { EventEmitter } from "events";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { Scanner } from "./scanner.js";

const categories = {
    Documents: [".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".pptx"],
    Images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"],
    Archives: [".zip", ".rar", ".tar", ".gz", ".7z"],
    Code: [".js", ".py", ".java", ".cpp", ".html", ".css", ".json"],
    Videos: [".mp4", ".avi", ".mkv", ".mov", ".webm"],
    Other: [],
};

const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

export class Organizer extends EventEmitter {
    constructor() {
        super();
        this.scanner = new Scanner();
    }

    getCategory(filePath) {
        const ext = path.extname(filePath).toLowerCase();

        for (const [category, extensions] of Object.entries(categories)) {
            if (extensions.includes(ext)) {
                return category;
            }
        }

        return "Other";
    }

    async getUniqueTargetPath(targetDir, fileName) {
        const ext = path.extname(fileName);
        const baseName = path.basename(fileName, ext);

        let candidatePath = path.join(targetDir, fileName);
        let counter = 1;

        while (true) {
            try {
                await fsPromises.access(candidatePath);
                candidatePath = path.join(
                    targetDir,
                    `${baseName}(${counter})${ext}`,
                );
                counter++;
            } catch (error) {
                if (error.code === "ENOENT") {
                    return candidatePath;
                }
                throw error;
            }
        }
    }

    async copySingleFile(sourcePath, targetPath, size) {
        if (size >= LARGE_FILE_THRESHOLD) {
            await pipeline(
                fs.createReadStream(sourcePath),
                fs.createWriteStream(targetPath),
            );
        } else {
            await fsPromises.copyFile(sourcePath, targetPath);
        }
    }

    async organize(sourceDir, targetDir) {
        this.emit("organize-start", { sourceDir, targetDir });

        const categoryNames = Object.keys(categories);
        for (const category of categoryNames) {
            const categoryPath = path.join(targetDir, category);
            try {
                await fsPromises.mkdir(categoryPath, { recursive: true });
                this.emit("folder-created", { category, path: categoryPath });
            } catch (error) {
                this.scanner.handleFsError(error, categoryPath);
            }
        }

        const filePaths = await this.scanner.getAllFiles(sourceDir);
        const totalFiles = filePaths.length;

        const summary = {};
        for (const category of categoryNames) {
            summary[category] = 0;
        }

        let totalCopied = 0;
        let totalSize = 0;

        for (let i = 0; i < totalFiles; i++) {
            const sourcePath = filePaths[i];
            const fileName = path.basename(sourcePath);
            const category = this.getCategory(sourcePath);
            const categoryFolder = path.join(targetDir, category);

            try {
                const stats = await fsPromises.stat(sourcePath);
                const targetPath = await this.getUniqueTargetPath(
                    categoryFolder,
                    fileName,
                );

                this.emit("copy-start", {
                    sourcePath,
                    targetPath,
                    category,
                    current: i + 1,
                    total: totalFiles,
                });

                await this.copySingleFile(sourcePath, targetPath, stats.size);

                summary[category] += 1;
                totalCopied += 1;
                totalSize += stats.size;

                this.emit("copy-complete", {
                    sourcePath,
                    targetPath,
                    category,
                    size: stats.size,
                    current: i + 1,
                    total: totalFiles,
                });
            } catch (error) {
                this.emit("copy-error", { sourcePath, error });
                this.scanner.handleFsError(error, sourcePath);
            }
        }

        const result = {
            sourceDir,
            targetDir,
            summary,
            totalCopied,
            totalSize,
        };

        this.emit("organize-complete", result);
        return result;
    }
}
