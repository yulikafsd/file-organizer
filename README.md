# File Organizer CLI

A Node.js CLI tool for analyzing directories, finding duplicate files via SHA-256 hashes, sorting files into categories, and safely cleaning up outdated data.

## Installation & Setup

1. Clone the repository and navigate to the project directory:
   ```bash
   git clone <your-repository-url>
   cd file-organizer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Verify the CLI help menu:
   ```bash
   node file-organizer.js --help
   ```

## Project Structure

```text
file-organizer/
├── package.json        # Project configuration, dependencies, and npm scripts
├── .gitignore          # Excludes node_modules and system files from Git
├── README.md           # Project documentation
├── file-organizer.js   # CLI entry point (command parsing and event listeners)
└── lib/
    ├── scanner.js      # Scanner class: recursive traversal and file statistics
    ├── duplicates.js   # DuplicateFinder class: duplicate detection via SHA-256 streams
    ├── organizer.js    # Organizer class: categorizing and copying files
    └── cleanup.js      # Cleanup class: finding and deleting outdated files
```

## Commands & Usage Examples

You can run commands either directly via `node file-organizer.js` or using the pre-configured npm scripts (`npm run <command> -- ...`).

### 1. `scan` — Directory Analysis
Recursively scans the target directory and displays the total file count, total size, breakdown by file extensions and age, top 3 largest files, and the oldest file.

* **Syntax:**
  ```bash
  node file-organizer.js scan <directory>
  ```
* **Example:**
  ```bash
  npm run scan -- ./Downloads
  ```
* **Arguments:**
  * `<directory>` — Path to the directory to scan (required).

---

### 2. `duplicates` — Duplicate File Detection
Calculates the cryptographic SHA-256 hash for each file using streams (`fs.createReadStream`), identifies identical files regardless of their names, and calculates wasted disk space.

* **Syntax:**
  ```bash
  node file-organizer.js duplicates <directory>
  ```
* **Example:**
  ```bash
  npm run duplicates -- ./Downloads
  ```
* **Arguments:**
  * `<directory>` — Path to the directory to search for duplicates (required).

---

### 3. `organize` — File Categorization
Copies files into the target directory, sorting them into category folders (`Documents`, `Images`, `Archives`, `Code`, `Videos`, `Other`). Original files remain untouched. Files ≥ 10 MB are copied using streams via `stream/promises` (`pipeline`). Name collisions are automatically resolved by appending a numeric suffix (e.g., `file(1).pdf`).

* **Syntax:**
  ```bash
  node file-organizer.js organize <source> --output <target>
  ```
* **Example:**
  ```bash
  npm run organize -- ./Downloads --output ./Organized
  ```
* **Arguments & Options:**
  * `<source>` — Source directory containing files to organize (required).
  * `-o, --output <target>` — Target directory where categorized folders will be created (required).

---

### 4. `cleanup` — Outdated File Removal
Finds files older than a specified number of days based on their last modification date. By default, it runs in a safe **dry run** mode without deleting any files.

* **Syntax:**
  ```bash
  node file-organizer.js cleanup <directory> --older-than <days> [--confirm]
  ```
* **Example (Dry Run):**
  ```bash
  npm run cleanup -- ./Downloads --older-than 90
  ```
* **Example (Actual Deletion):**
  ```bash
  npm run cleanup -- ./Downloads --older-than 90 --confirm
  ```
* **Arguments & Options:**
  * `<directory>` — Directory to clean up (required).
  * `--older-than <days>` — Minimum age of files in days to be targeted (required).
  * `--confirm` — Confirms permanent file deletion (optional flag).

## Architecture & Key Features

* **Event-Driven Architecture:** Every command is implemented as a separate class extending `EventEmitter`, decoupling core business logic from console UI updates and progress bars.
* **Memory-Efficient Streams:** Hashing (`crypto`) and copying large files (≥ 10 MB) are handled via Node.js streams (`fs.createReadStream`, `pipeline`) to prevent memory overflow.
* **Robust Error Handling:** All filesystem operations are wrapped in `try...catch` blocks with specific user-friendly messages for common error codes (`ENOENT`, `EACCES`, etc.).