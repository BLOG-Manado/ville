// =================================================================
// LOGGER UTILITY
// Logger internal yang ringkas tanpa dependensi eksternal.
// =================================================================
import { DEFAULT_SETTINGS } from '../config.js'; // <-- Impor config

// Kode ANSI untuk warna, jauh lebih ringan daripada library.
const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
};

const ICONS = {
    success: '✅',
    warn: '⚠️',
    error: '❌',
    plant: '🌱',
    boost: '⚡',
    harvest: '🔪',
    buy: '🛒',
    info: 'ℹ️',
    clock: '⏳',
};

/**
 * Mendapatkan timestamp dalam format HH:MM:SS.
 * @returns {string} Timestamp yang diformat.
 */
const getTimestamp = () => new Date().toLocaleTimeString('sv-SE', { hour12: false });

/**
 * Fungsi log dasar.
 * @param {string} color - Kode warna ANSI.
 * @param {string} icon - Ikon emoji.
 * @param {string} message - Pesan yang akan di-log.
 */
const log = (color, icon, message) => {
    console.log(`${colors.cyan}[${getTimestamp()}]${colors.reset} ${icon} ${color}${message}${colors.reset}`);
};

export const logger = {
    info: (message) => log(colors.reset, ICONS.info, message),
    success: (message) => log(colors.green, ICONS.success, message),
    warn: (message) => log(colors.yellow, ICONS.warn, message),
    error: (message) => log(colors.red, ICONS.error, message),
    debug: (message) => {
        // Baca dari config, bukan process.env
        if (DEFAULT_SETTINGS.DEBUG_MODE) {
            console.log(`${colors.cyan}[${getTimestamp()}]${colors.reset} ${colors.gray}[DEBUG] ${message}${colors.reset}`);
        }
    },
    // Fungsi khusus untuk log aksi bot
    action: (type, message) => {
        const icon = ICONS[type] || ICONS.info;
        log(colors.reset, icon, message);
    }
};

/**
 * Fungsi khusus untuk memperbarui satu baris di konsol.
 * Berguna untuk menampilkan countdown tanpa memenuhi layar.
 */
export const updateLine = (message) => {
    // \r menggerakkan kursor ke awal baris
    // process.stdout.clearLine(0) membersihkan baris saat ini
    if (process.stdout.isTTY) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`${colors.cyan}[${getTimestamp()}]${colors.reset} ${message}`);
    } else {
        // Fallback untuk environment non-TTY (misalnya, file log)
        console.log(`[${getTimestamp()}] ${message}`);
    }
};
