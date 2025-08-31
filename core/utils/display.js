// =================================================================
// DISPLAY UTILITY
// Mengelola pembaruan status yang ditampilkan di konsol.
// =================================================================

import { updateLine } from '../../utils/logger.js';
import { BATCH_SETTINGS } from '../../config.js';

export function displayStatus(bot) {
    if (bot.isPausedForCaptcha) {
        updateLine(`⏸️ Bot dijeda untuk akun ${bot.userIdentifier}. Menunggu CAPTCHA diselesaikan...`);
        return;
    }

    // [LOGIKA BARU] Cek apakah bot sedang dalam mode batch
    const isBatchMode = BATCH_SETTINGS.ENABLED_SEEDS.includes(bot.config.seedKey);

    if (isBatchMode) {
        // Jika mode batch, tampilkan jumlah total slot yang dikonfigurasi
        const farmingCount = bot.config.slots.length;
        updateLine(`🌱 Farming ${farmingCount} slots (Mode Batch)...`);
        return;
    }

    // Logika lama untuk mode individual timer
    const now = Date.now();
    let nextHarvestSlot = null;
    let minDuration = Infinity;
    bot.slotStates.forEach((state, slotIndex) => {
        if (state.plantEndsAt) {
            const duration = state.plantEndsAt - now;
            if (duration < minDuration) {
                minDuration = duration;
                nextHarvestSlot = slotIndex;
            }
        }
    });
    const farmingCount = bot.plantTimers.size;
    let statusMessage = `🌱 Farming ${farmingCount} slots.`;
    if (nextHarvestSlot) {
        const secondsLeft = Math.max(0, Math.floor(minDuration / 1000));
        const hours = Math.floor(secondsLeft / 3600);
        const minutes = Math.floor((secondsLeft % 3600) / 60);
        const seconds = secondsLeft % 60;
        let timeString = '';
        if (hours > 0) timeString += `${hours}h `;
        timeString += `${minutes}m ${seconds}s`;
        statusMessage += ` | Next: slot ${nextHarvestSlot} (${timeString.trim()})`;
    }
    updateLine(statusMessage);
}
