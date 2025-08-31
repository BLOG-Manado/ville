// =================================================================
// MAIN ENTRY POINT
// Titik awal untuk menjalankan bot.
// Mengelola setup, interaksi pengguna, dan inisialisasi bot.
// =================================================================

import readline from 'node:readline';
import fs from 'fs';
import path from 'path';
import { logger } from './utils/logger.js';
import { setCookie, api } from './services/api.js';
import { DEFAULT_SETTINGS, SEEDS, BOOSTERS, PRESTIGE_LEVELS } from './config.js';
import { Bot } from './core/bot.js';
import { updateSignature } from './utils/signature-updater.js';
import { loadSignatureConfig } from './utils/signature.js';

// --- FUNGSI INTERAKSI PENGGUNA ---

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const askQuestion = (question) => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
    });
};

// Helper function untuk format waktu
const formatSeconds = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${ss}s`;
    return `${ss}s`;
};

async function ensureCookieInteractive() {
    const cookieFile = path.join(process.cwd(), 'akun.txt');
    try {
        const cookie = fs.readFileSync(cookieFile, 'utf8').trim();
        if (cookie) {
            logger.success('Cookie ditemukan di akun.txt');
            return cookie;
        }
    } catch { }

    logger.info('Cara mendapatkan cookie:');
    console.log('1. Buka browser → https://app.appleville.xyz');
    console.log('2. Login ke akun Anda');
    console.log('3. Tekan F12 → Tab Application → Cookies');
    console.log('4. Copy semua cookies dan paste di bawah ini.\n');

    const cookieInput = await askQuestion('📋 Paste cookie Anda di sini lalu tekan ENTER: ');

    if (!cookieInput || cookieInput.length < 20 || !cookieInput.includes('=')) {
        logger.error('Format cookie tidak valid. Coba lagi.');
        process.exit(1);
    }

    try {
        fs.writeFileSync(cookieFile, cookieInput, 'utf8');
        logger.success('Cookie berhasil disimpan ke akun.txt untuk penggunaan selanjutnya.');
    } catch (error) {
        logger.warn(`Gagal menyimpan cookie ke file: ${error.message}`);
    }
    return cookieInput;
}

// Setup interaktif untuk konfigurasi Telegram
async function ensureTelegramConfigInteractive() {
    const configFile = path.join(process.cwd(), 'telegram-config.js');
    if (fs.existsSync(configFile)) {
        logger.debug('File telegram-config.js sudah ada.');
        return;
    }

    logger.info('\n--- Setup Notifikasi Telegram ---');
    const setupAnswer = await askQuestion('Apakah Anda ingin mengatur notifikasi Telegram sekarang? (y/n) [default: n]: ');

    if (setupAnswer.toLowerCase() !== 'y') {
        const content = `
// Konfigurasi Telegram dinonaktifkan.
// Isi detail di bawah dan ubah ENABLED menjadi true untuk mengaktifkan.
export const TELEGRAM_SETTINGS = {
  ENABLED: false,
  BOT_TOKEN: 'ISI_DENGAN_TOKEN_BOT_ANDA',
  CHAT_ID: 'ISI_DENGAN_CHAT_ID_ANDA',
  CAPTCHA_RETRY_INTERVAL: 120000,
};`;
        fs.writeFileSync(configFile, content.trim(), 'utf8');
        logger.info('Setup Telegram dilewati. File telegram-config.js telah dibuat dengan status nonaktif.');
        return;
    }

    const botToken = await askQuestion('Masukkan Token Bot Telegram Anda: ');
    const chatId = await askQuestion('Masukkan Chat ID Anda: ');

    if (!botToken || !chatId) {
        const content = `
// Konfigurasi Telegram dinonaktifkan karena data tidak lengkap.
export const TELEGRAM_SETTINGS = {
  ENABLED: false,
  BOT_TOKEN: 'ISI_DENGAN_TOKEN_BOT_ANDA',
  CHAT_ID: 'ISI_DENGAN_CHAT_ID_ANDA',
  CAPTCHA_RETRY_INTERVAL: 120000,
};`;
        fs.writeFileSync(configFile, content.trim(), 'utf8');
        logger.warn('Token atau Chat ID kosong. File telegram-config.js dibuat dengan status nonaktif.');
        return;
    }

    const content = `
// Konfigurasi Notifikasi Telegram
export const TELEGRAM_SETTINGS = {
  ENABLED: true,
  BOT_TOKEN: '${botToken}',
  CHAT_ID: '${chatId}',
  CAPTCHA_RETRY_INTERVAL: 120000, // 2 menit
};`;
    fs.writeFileSync(configFile, content.trim(), 'utf8');
    logger.success('Konfigurasi Telegram berhasil disimpan di telegram-config.js');
}

/**
 * Memvalidasi konfigurasi signature yang ada.
 * @returns {boolean} - True jika valid, false jika tidak.
 */
async function validateSignatureConfig() {
    try {
        const configPath = './utils/signature-config.js';
        // Menggunakan import dinamis untuk mendapatkan data terbaru
        const module = await import(`${configPath}?v=${Date.now()}`);
        const { SIGNATURE_PATTERN, KEY_PARTS, HEADER_NAMES } = module;

        if (!SIGNATURE_PATTERN || SIGNATURE_PATTERN.length === 0) return false;
        if (!KEY_PARTS || KEY_PARTS.length === 0) return false;
        if (!HEADER_NAMES || !HEADER_NAMES.META_HASH) return false;

        return true;
    } catch (error) {
        return false;
    }
}


// --- FUNGSI UTAMA ---

async function start() {
    try {
        const cookie = await ensureCookieInteractive();
        setCookie(cookie);

        await ensureTelegramConfigInteractive();

        // [LOGIKA BARU] Pengecekan signature proaktif
        logger.info('\nMemvalidasi konfigurasi signature...');
        const isSignatureValid = await validateSignatureConfig();
        if (!isSignatureValid) {
            logger.warn('Konfigurasi signature tidak valid atau kosong. Menjalankan pembaruan...');
            try {
                await updateSignature();
                await loadSignatureConfig(); // Muat ulang config setelah update
            } catch (error) {
                logger.error(`Gagal memperbarui signature secara otomatis: ${error.message}`);
                logger.error('Bot akan berhenti. Coba jalankan ulang.');
                process.exit(1);
            }
        } else {
            logger.success('Konfigurasi signature valid.');
        }


        // Verifikasi koneksi dan cookie
        logger.info('\nMemverifikasi koneksi dan cookie...');
        const initialState = await api.getState();
        if (!initialState.ok) {
            logger.error('Gagal terhubung. Periksa kembali cookie Anda atau koneksi internet.');
            process.exit(1);
        }

        // Semua info status ditampilkan di awal
        const user = initialState.user;
        const userPrestigeLevel = user?.prestigeLevel || 0;
        logger.success(`Terhubung sebagai: ${user?.rewardWalletAddress || 'Unknown'}`);
        logger.info(`💰 Saldo: ${user?.coins || 0} koin | ${user?.ap || 0} AP (apel)`);
        logger.info(`✨ XP: ${user?.xp || 0} | Level Prestige: ${userPrestigeLevel}`);

        const nextPrestigeLevel = userPrestigeLevel + 1;
        if (PRESTIGE_LEVELS[nextPrestigeLevel]) {
            const requiredAP = PRESTIGE_LEVELS[nextPrestigeLevel].apRequired;
            logger.info(`🎯 Next Prestige (${nextPrestigeLevel}): ${requiredAP.toLocaleString('id-ID')} AP dibutuhkan`);
        }

        logger.info('--- Status Slot Awal ---');
        const slotMap = new Map(initialState.state.plots.map(p => [p.slotIndex, p]));
        const allSlots = initialState.state.plots.map(p => p.slotIndex).sort((a, b) => a - b);
        for (const slotIndex of allSlots) {
            const slot = slotMap.get(slotIndex);
            const plantInfo = slot?.seed ? `🌱 ${slot.seed.key}` : 'Kosong';
            const boosterInfo = slot?.modifier ? `⚡ ${slot.modifier.key}` : 'Tanpa Booster';
            logger.info(`Slot ${String(slotIndex).padEnd(2, ' ')}: ${plantInfo.padEnd(25, ' ')} | ${boosterInfo}`);
        }
        logger.info('------------------------');


        // Kumpulkan konfigurasi dari pengguna
        const slotsAns = await askQuestion(`\nMasukkan slot yang ingin dijalankan (mis: 1,2,3) [default: semua (${allSlots.length} slot)]: `);
        let slots = slotsAns ? slotsAns.split(',').map(x => parseInt(x.trim(), 10)).filter(Boolean) : allSlots;
        if (!slots.length) slots = allSlots;

        // Menampilkan daftar bibit yang sesuai dengan level prestige
        console.log('\n--- Bibit Tersedia ---');
        Object.entries(SEEDS)
            .filter(([key, seedData]) => !seedData.prestige || seedData.prestige <= userPrestigeLevel)
            .forEach(([key, seedData]) => {
                const growTime = seedData.growSeconds ? `(${formatSeconds(seedData.growSeconds)})` : '';
                const prestigeInfo = seedData.prestige ? ` (Prestige: ${seedData.prestige})` : '';
                const rewardInfo = seedData.reward ? `| Reward: ${seedData.rewardCurrency === 'coins' ? '🪙' : '🍎'} ${seedData.reward}` : '';
                console.log(`- ${key.padEnd(18, ' ')} ${growTime.padEnd(10, ' ')} ${rewardInfo} ${prestigeInfo}`);
            });
        const seedKey = (await askQuestion(`\nPilih bibit [default: ${DEFAULT_SETTINGS.SEED}]: `) || DEFAULT_SETTINGS.SEED).toLowerCase();
        if (!SEEDS[seedKey]) {
            logger.error(`Bibit '${seedKey}' tidak dikenal.`);
            process.exit(1);
        }

        // Menampilkan daftar booster yang sesuai dengan level prestige
        console.log('\n--- Booster Tersedia ---');
        Object.entries(BOOSTERS)
            .filter(([key, boosterData]) => !boosterData.prestige || boosterData.prestige <= userPrestigeLevel)
            .forEach(([key, boosterData]) => {
                const prestigeInfo = boosterData.prestige ? `(Prestige: ${boosterData.prestige})` : '';
                const effectInfo = boosterData.effect ? `| ${boosterData.effect}` : '';
                console.log(`- ${key.padEnd(20, ' ')} ${effectInfo} ${prestigeInfo}`);
            });
        console.log(`- none`);
        const boosterKey = (await askQuestion(`\nPilih booster (ketik 'none' untuk tanpa booster) [default: ${DEFAULT_SETTINGS.BOOSTER}]: `) || DEFAULT_SETTINGS.BOOSTER).toLowerCase();
        if (boosterKey !== 'none' && !BOOSTERS[boosterKey]) {
            logger.error(`Booster '${boosterKey}' tidak dikenal.`);
            process.exit(1);
        }

        // Menambahkan kembali pertanyaan untuk jumlah pembelian
        const seedBuyQtyAns = await askQuestion(`\nJumlah pembelian bibit saat habis [default: ${DEFAULT_SETTINGS.BUY_QTY_SEED}]: `);
        const seedBuyQty = parseInt(seedBuyQtyAns, 10) || DEFAULT_SETTINGS.BUY_QTY_SEED;

        let boosterBuyQty = DEFAULT_SETTINGS.BUY_QTY_BOOSTER;
        if (boosterKey !== 'none') {
            const boosterBuyQtyAns = await askQuestion(`Jumlah pembelian booster saat habis [default: ${DEFAULT_SETTINGS.BUY_QTY_BOOSTER}]: `);
            boosterBuyQty = parseInt(boosterBuyQtyAns, 10) || DEFAULT_SETTINGS.BUY_QTY_BOOSTER;
        }

        rl.close();

        const config = {
            slots,
            seedKey,
            boosterKey: boosterKey === 'none' ? null : boosterKey,
            seedBuyQty,
            boosterBuyQty,
        };

        // Membuat instance bot dan memulainya
        const bot = new Bot(config);
        await bot.start();

    } catch (error) {
        logger.error(`Terjadi kesalahan fatal: ${error.message}`);
        rl.close();
        process.exit(1);
    }
}

start();
