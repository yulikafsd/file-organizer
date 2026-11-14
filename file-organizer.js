import path from "path";
import { Command } from "commander";
import { Scanner } from "./lib/scanner.js";
import { DuplicateFinder } from "./lib/duplicates.js";
import { Organizer } from "./lib/organizer.js";
import { Cleanup } from "./lib/cleanup.js";

function formatSize(bytes) {
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    } else if (bytes < 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
}

function drawProgressBar(current, total, width = 20) {
    const percentage = current / total;
    const filled = Math.round(percentage * width);
    const bar = "█".repeat(filled) + "░".repeat(width - filled);
    return `${bar} ${current}/${total}`;
}

async function runScan(directory) {
    const scanner = new Scanner();

    scanner.on("scan-start", (data) => {
        console.log(`📂 Scanning: ${data.directory}`);
    });

    scanner.on("file-found", (data) => {
        process.stdout.write(
            `\rProcessing... ${drawProgressBar(data.current, data.total)}`,
        );
    });

    scanner.on("scan-complete", (stats) => {
        if (stats.totalFiles > 0) {
            console.log("");
        }

        console.log("\n📊 Scan Results:");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`Total files: ${stats.totalFiles}`);
        console.log(`Total size: ${formatSize(stats.totalSize)}`);

        console.log("\nBy File Type:");
        if (stats.byType.size === 0) {
            console.log("  No files found");
        } else {
            const sortedTypes = [...stats.byType.entries()].sort(
                (a, b) => b[1].totalSize - a[1].totalSize,
            );
            for (const [ext, info] of sortedTypes) {
                const extCol = ext.padEnd(8);
                const countCol = `${info.count} files`.padEnd(10);
                console.log(
                    `  ${extCol}${countCol}${formatSize(info.totalSize)}`,
                );
            }
        }

        console.log("\nFile Age:");
        console.log(`  Last 7 days:    ${stats.byAge.last7Days} files`);
        console.log(`  Last 30 days:   ${stats.byAge.last30Days} files`);
        console.log(`  Older than 90:  ${stats.byAge.olderThan90Days} files`);

        console.log("\nLargest files:");
        if (stats.largestFiles.length === 0) {
            console.log("  None");
        } else {
            stats.largestFiles.forEach((file, index) => {
                const nameCol = file.name.padEnd(22);
                console.log(
                    `  ${index + 1}. ${nameCol}${formatSize(file.size)}`,
                );
            });
        }

        if (stats.oldestFile) {
            console.log(
                `\nOldest file: ${stats.oldestFile.name} (modified ${stats.oldestFile.daysOld} days ago)`,
            );
        } else {
            console.log("\nOldest file: None");
        }
    });

    await scanner.scan(directory);
}

async function runDuplicates(directory) {
    const finder = new DuplicateFinder();

    finder.on("search-start", (data) => {
        console.log(`🔍 Searching for duplicates in: ${data.directory}`);
    });

    finder.on("file-processed", (data) => {
        process.stdout.write(
            `\rCalculating hashes... ${drawProgressBar(data.current, data.total)}`,
        );
    });

    finder.on("duplicates-found", (results) => {
        if (results.totalFiles > 0) {
            console.log("");
        }

        const groupsCount = results.duplicateGroups.length;
        const totalWastedFormatted = formatSize(results.totalWastedSpace);

        if (groupsCount === 0) {
            console.log("\n✅ No duplicates found!");
            return;
        }

        console.log(
            `\nFound ${groupsCount} duplicate groups (${totalWastedFormatted} wasted):\n`,
        );

        results.duplicateGroups.forEach((group, index) => {
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log(
                `Group ${index + 1} (${group.copiesCount} copies, ${formatSize(group.fileSize)} each):`,
            );
            console.log(`  SHA-256: ${group.hash.slice(0, 12)}...\n`);

            group.paths.forEach((filePath) => {
                // Виводимо відносний шлях від батьківської директорії для читабельності
                const displayPath = path.relative(
                    path.dirname(directory),
                    filePath,
                );
                console.log(`  📄 ${displayPath}`);
            });

            console.log(`\n  Wasted space: ${formatSize(group.wastedSpace)}\n`);
        });

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`💾 Total wasted space: ${totalWastedFormatted}`);
    });

    await finder.findDuplicates(directory);
}

async function runOrganize(sourceDir, targetDir) {
    const organizer = new Organizer();

    organizer.on("organize-start", (data) => {
        console.log(`📦 Organizing: ${data.sourceDir}`);
        console.log(`Target: ${data.targetDir}\n`);
        console.log("Creating folders...");
    });

    organizer.on("folder-created", (data) => {
        console.log(`  ✓ ${data.category}/`);
    });

    organizer.on("copy-complete", (data) => {
        if (data.current === 1) {
            console.log("");
        }
        process.stdout.write(
            `\rCopying files... ${drawProgressBar(data.current, data.total)}`,
        );
    });

    organizer.on("organize-complete", (result) => {
        if (result.totalCopied > 0) {
            console.log("");
        }

        console.log("\n✅ Organization complete!");
        console.log("Summary:");

        const targetFolderName = path.basename(result.targetDir);

        for (const [category, count] of Object.entries(result.summary)) {
            const catCol = `${category}:`.padEnd(11);
            const countCol = `${count} files`.padStart(9);
            console.log(
                `  ${catCol}${countCol} → ${targetFolderName}/${category}/`,
            );
        }

        console.log(
            `\nTotal copied: ${result.totalCopied} files (${formatSize(result.totalSize)})`,
        );
    });

    await organizer.organize(sourceDir, targetDir);
}

async function runCleanup(directory, thresholdDays, confirm) {
    const cleanupTool = new Cleanup();

    cleanupTool.on("cleanup-start", (data) => {
        console.log(`🧹 Cleanup: ${data.directory}`);
        console.log(
            `Looking for files older than ${data.thresholdDays} days...\n`,
        );
    });

    cleanupTool.on("candidates-ready", ({ files, totalSize, confirm }) => {
        if (files.length === 0) {
            console.log("✅ No files found matching the age criteria.");
            return;
        }

        console.log(`Found ${files.length} files to delete:\n`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        files.forEach((file) => {
            console.log(file.name);
            console.log(`  Size: ${formatSize(file.size)}`);
            console.log(
                `  Modified: ${file.daysOld} days ago (${file.modifiedDate})\n`,
            );
        });

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(
            `Total: ${files.length} files (${formatSize(totalSize)})\n`,
        );

        if (confirm) {
            console.log(
                `⚠️  DELETING ${files.length} files (${formatSize(totalSize)}). This action cannot be undone!`,
            );
        }
    });

    cleanupTool.on("file-deleted", (data) => {
        process.stdout.write(
            `\rDeleting... ${drawProgressBar(data.current, data.total)}`,
        );
    });

    cleanupTool.on("cleanup-complete", (result) => {
        if (result.filesFound === 0) return;

        if (!result.confirm) {
            console.log("⚠️  DRY RUN MODE: No files were deleted.");
            console.log(
                "To actually delete these files, run with --confirm flag.",
            );
        } else {
            console.log("\n\n✅ Cleanup complete!");
            console.log(
                `Deleted: ${result.deletedCount} files (${formatSize(result.freedSpace)} freed)`,
            );
        }
    });

    await cleanupTool.cleanup(directory, thresholdDays, confirm);
}

const program = new Command();

program
    .name("file-organizer")
    .description("CLI tool to organize files")
    .version("1.0.0");

program
    .command("scan <directory>")
    .description("Scan directory and show statistics")
    .action(async (directory) => {
        await runScan(path.resolve(directory));
    });

program
    .command("duplicates <directory>")
    .description("Find duplicate files using SHA-256 hashes")
    .action(async (directory) => {
        await runDuplicates(path.resolve(directory));
    });

program
    .command("organize <source>")
    .description("Organize files into categories in the target directory")
    .requiredOption(
        "-o, --output <target>",
        "Target directory for organized files",
    )
    .action(async (source, options) => {
        await runOrganize(path.resolve(source), path.resolve(options.output));
    });

program
    .command("cleanup <directory>")
    .description("Find and optionally delete files older than specified days")
    .requiredOption(
        "--older-than <days>",
        "Delete files older than specified number of days",
    )
    .option(
        "--confirm",
        "Confirm actual deletion (otherwise runs in dry run mode)",
        false,
    )
    .action(async (directory, options) => {
        const days = Number(options.olderThan);
        if (Number.isNaN(days) || days < 0) {
            console.error(
                "❌ Error: --older-than must be a valid positive number of days.",
            );
            process.exit(1);
        }
        await runCleanup(path.resolve(directory), days, options.confirm);
    });

program.parse();
