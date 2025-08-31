// =================================================================
// TELEGRAM UTILITY
// Mengelola pengiriman notifikasi ke bot Telegram.
// =================================================================

import { logger } from './logger.js';

// [DIUBAH] Impor dari file terpisah dan tangani jika file tidak ada.
let TELEGRAM_SETTINGS = { ENABLED: false };
try {
    const config = await import('../telegram-config.js');
    TELEGRAM_SETTINGS = config.TELEGRAM_SETTINGS;
} catch (error) {
    logger.warn('File telegram-config.js tidak ditemukan. Notifikasi Telegram dinonaktifkan.');
    logger.info("Untuk mengaktifkan, salin 'telegram-config.example.js' menjadi 'telegram-config.js' dan isi detailnya.");
}

/**
 * Mengirim pesan ke chat Telegram yang ditentukan di config.
 * @param {string} message - Pesan yang akan dikirim.
 */
export async function sendTelegramMessage(message) {
    if (!TELEGRAM_SETTINGS.ENABLED || !TELEGRAM_SETTINGS.BOT_TOKEN || !TELEGRAM_SETTINGS.CHAT_ID) {
        logger.debug('Notifikasi Telegram dinonaktifkan atau tidak dikonfigurasi.');
        return;
    }

    const { BOT_TOKEN, CHAT_ID } = TELEGRAM_SETTINGS;
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown',
            }),
        });

        const result = await response.json();
        if (!result.ok) {
            logger.error(`Gagal mengirim pesan Telegram: ${result.description}`);
        } else {
            logger.info('Notifikasi Telegram berhasil dikirim.');
        }
    } catch (error) {
        logger.error(`Error saat mengirim pesan Telegram: ${error.message}`);
    }
}
