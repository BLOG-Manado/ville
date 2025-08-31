// =================================================================
// BOT CORE LOGIC (IMPROVED)
// Jantung dari bot dengan logika transisi yang lebih baik dan prioritas yang benar.
// =================================================================

import { logger } from '../utils/logger.js';
import { api, CaptchaError, SignatureError } from '../services/api.js';
import { handleBatchCycle, handleHarvest, handlePlanting, handleBoosterApplication } from './handlers/actionHandlers.js';
import { handleCaptchaRequired, checkPrestigeUpgrade, handleSignatureError } from './handlers/eventHandlers.js';
import { displayStatus } from './utils/display.js';
import { BATCH_SETTINGS } from '../config.js';

export class Bot {
    constructor(config) {
        this.config = config;
        this.plantTimers = new Map();
        this.boosterTimers = new Map();
        this.slotStates = new Map();
        this.batchTimer = null;
        this.transitionTimer = null;
        this.isRunning = false;
        this.isPausedForCaptcha = false;
        this.isPausedForSignature = false;
        this.isBatchCycleRunning = false;
        this.isInTransitionMode = false;
        this.captchaCheckInterval = null;
        this.statusInterval = null;
        this.prestigeCheckInterval = null;
        this.notifiedPrestigeLevel = 0;
        this.isBuyingSeed = false;
        this.isBuyingBooster = false;
        this.userIdentifier = 'Unknown Account';
        this.lastCaptchaTimestamp = null;
    }

    async start(initialState = null) {
        this.isRunning = true;
        logger.success('Bot berhasil dimulai. Tekan Ctrl+C untuk berhenti.');

        try {
            const data = initialState || await api.getState();
            if (!data.ok) {
                throw new Error(data.error?.message || "Gagal mendapatkan state awal.");
            }

            this.userIdentifier = data.user?.rewardWalletAddress || 'Unknown Account';
            this.notifiedPrestigeLevel = data.user?.prestigeLevel || 0;

            await this.refreshAllTimers(data.state);

        } catch (error) {
            if (error instanceof CaptchaError) return this.handleCaptchaRequired();
            if (error instanceof SignatureError) return this.handleSignatureError();
            logger.error(`Gagal inisialisasi bot: ${error.message}`);
            return this.stop();
        }

        this.statusInterval = setInterval(() => this.displayStatus(), 1000);
        this.prestigeCheckInterval = setInterval(() => this.checkPrestigeUpgrade(), 300000);
        process.on('SIGINT', () => this.stop());
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        logger.warn('Menghentikan bot...');

        this.clearAllTimers();
        clearInterval(this.statusInterval);
        clearInterval(this.captchaCheckInterval);
        clearInterval(this.prestigeCheckInterval);

        logger.success('Bot berhenti dengan aman.');
        process.exit(0);
    }

    clearAllTimers() {
        this.plantTimers.forEach(timer => clearTimeout(timer));
        this.boosterTimers.forEach(timer => clearTimeout(timer));
        clearTimeout(this.batchTimer);
        clearTimeout(this.transitionTimer);
        this.plantTimers.clear();
        this.boosterTimers.clear();
    }

    async refreshAllTimers(initialState = null) {
        if (!this.isRunning || this.isPausedForCaptcha || this.isPausedForSignature) return;
        logger.info('Memperbarui semua timer slot...');
        this.clearAllTimers();

        try {
            const state = initialState || (await api.getState()).state;
            if (!state) return;

            const plots = state.plots.filter(p => this.config.slots.includes(p.slotIndex));
            const isBatchModeConfigured = BATCH_SETTINGS.ENABLED_SEEDS.includes(this.config.seedKey);
            const hasIndividualPlants = plots.some(p => p.seed && !BATCH_SETTINGS.ENABLED_SEEDS.includes(p.seed.key));

            if (hasIndividualPlants && isBatchModeConfigured && !this.isInTransitionMode) {
                this.isInTransitionMode = true;
                logger.warn('Mode Transisi: Terdeteksi tanaman individual. Menunggu selesai sebelum beralih ke mode batch.');

                const individualPlants = plots.filter(p => p.seed && !BATCH_SETTINGS.ENABLED_SEEDS.includes(p.seed.key));
                if (individualPlants.length > 0) {
                    let latestHarvestTime = Math.max(...individualPlants.map(p => new Date(p.seed.endsAt).getTime()));
                    const delay = latestHarvestTime - Date.now() + 2000; //+2 detik buffer
                    logger.info(`Transisi ke mode batch akan dicoba dalam ${Math.round(delay / 1000)} detik.`);
                    this.transitionTimer = setTimeout(() => this.refreshAllTimers(), Math.max(1000, delay));
                }
                this.runIndividualMode(plots); // Tetap jalankan mode individual selama transisi

            } else if (isBatchModeConfigured && !this.isInTransitionMode) {
                this.runBatchMode(plots);
            } else {
                this.isInTransitionMode = false; // Pastikan transisi selesai jika tidak ada lagi tanaman individual
                this.runIndividualMode(plots);
            }

        } catch (error) {
            logger.warn(`Gagal memperbarui timer: ${error.message}`);
        }
    }

    runBatchMode(plots) {
        logger.info('Mode Batch: Mengatur siklus batch berikutnya.');
        let nextBatchHarvestTime = Infinity;
        let allSlotsEmpty = true;

        for (const slot of plots) {
            if (slot.seed) {
                allSlotsEmpty = false;
                const endsAt = new Date(slot.seed.endsAt).getTime();
                if (endsAt < nextBatchHarvestTime) {
                    nextBatchHarvestTime = endsAt;
                }
            }
        }

        if (allSlotsEmpty) {
            this.handleBatchCycle();
        } else {
            const duration = nextBatchHarvestTime - Date.now();
            this.batchTimer = setTimeout(() => this.handleBatchCycle(), Math.max(0, duration) + 1000);
        }
    }

    runIndividualMode(plots) {
        if (!this.isInTransitionMode) logger.info('Mode Individual: Mengatur timer untuk setiap slot.');
        const now = Date.now();

        for (const slot of plots) {
            const slotIndex = slot.slotIndex;

            if (slot.seed && this.config.boosterKey && !slot.modifier) {
                // Prioritas 1: Ada Tanaman, tapi Booster Hilang/Habis
                this.handleBoosterApplication(slotIndex);
                this.setHarvestTimer(slotIndex, new Date(slot.seed.endsAt).getTime());
            } else if (slot.seed && new Date(slot.seed.endsAt).getTime() <= now) {
                // Prioritas 2: Siap Panen
                this.handleHarvest(slotIndex);
            } else if (!slot.seed) {
                // Prioritas 3: Slot Kosong
                this.handlePlanting(slotIndex);
            } else {
                // Kondisi Normal: Cukup atur timer
                if (slot.seed) {
                    this.setHarvestTimer(slotIndex, new Date(slot.seed.endsAt).getTime());
                }
                if (slot.modifier) {
                    this.setBoosterTimer(slotIndex, new Date(slot.modifier.endsAt).getTime());
                }
            }
        }
    }

    setHarvestTimer(slotIndex, endsAt) {
        this.slotStates.set(slotIndex, { ...this.slotStates.get(slotIndex), plantEndsAt: endsAt });
        const duration = endsAt - Date.now();
        if (duration <= 0) {
            this.handleHarvest(slotIndex);
            return;
        }
        if (this.plantTimers.has(slotIndex)) clearTimeout(this.plantTimers.get(slotIndex));
        const timer = setTimeout(() => this.handleHarvest(slotIndex), duration);
        this.plantTimers.set(slotIndex, timer);
    }

    setBoosterTimer(slotIndex, endsAt) {
        this.slotStates.set(slotIndex, { ...this.slotStates.get(slotIndex), boosterEndsAt: endsAt });
        const duration = endsAt - Date.now();
        if (duration <= 0) {
            this.handleBoosterApplication(slotIndex);
            return;
        }
        if (this.boosterTimers.has(slotIndex)) clearTimeout(this.boosterTimers.get(slotIndex));
        const timer = setTimeout(() => this.handleBoosterApplication(slotIndex), duration);
        this.boosterTimers.set(slotIndex, timer);
    }

    // --- Pemanggil Handler ---
    handleBatchCycle(initialState = null) {
        handleBatchCycle(this, initialState);
    }

    handleHarvest(slotIndex) {
        handleHarvest(this, slotIndex);
    }

    handlePlanting(slotIndex) {
        handlePlanting(this, slotIndex);
    }

    handleBoosterApplication(slotIndex) {
        handleBoosterApplication(this, slotIndex);
    }

    handleCaptchaRequired() {
        handleCaptchaRequired(this);
    }

    handleSignatureError() {
        handleSignatureError(this);
    }

    checkPrestigeUpgrade() {
        checkPrestigeUpgrade(this);
    }

    displayStatus() {
        displayStatus(this);
    }
}

