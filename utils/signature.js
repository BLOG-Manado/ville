// =================================================================
// SIGNATURE GENERATOR
// Menggabungkan logika webcrypto dengan pemuatan konfigurasi dinamis.
// =================================================================

import { webcrypto } from 'crypto';
import fs from 'fs';
import { logger } from './logger.js';

let signatureConfig = {};

/**
 * Memastikan file signature-config.js ada. Jika tidak, buat file sementara.
 */
function ensureConfigFile() {
    const configPath = './utils/signature-config.js';
    if (!fs.existsSync(configPath)) {
        const content = `
export const SIGNATURE_PATTERN = [];
export const KEY_PARTS = [];
export const HEADER_NAMES = {};`;
        fs.writeFileSync(configPath, content, 'utf8');
        logger.warn('File signature-config.js tidak ditemukan, file sementara telah dibuat.');
    }
}

/**
 * Memuat atau memuat ulang file signature-config.js secara dinamis.
 * Ini adalah kunci untuk memperbaiki infinite loop.
 */
export async function loadSignatureConfig() {
    const configPath = './signature-config.js';
    const timestamp = Date.now();
    try {
        // Impor modul dengan query unik untuk bypass cache Node.js
        const module = await import(`${configPath}?v=${timestamp}`);
        signatureConfig = {
            SIGNATURE_PATTERN: module.SIGNATURE_PATTERN,
            KEY_PARTS: module.KEY_PARTS,
            HEADER_NAMES: module.HEADER_NAMES
        };
        logger.info('Konfigurasi signature berhasil dimuat/dimuat ulang ke dalam memori.');
    } catch (error) {
        logger.error(`Gagal memuat signature-config.js: ${error.message}`);
        signatureConfig = { SIGNATURE_PATTERN: [], KEY_PARTS: [], HEADER_NAMES: {} };
    }
}

// Pengecekan dan pemuatan awal
ensureConfigFile();
await loadSignatureConfig();

/**
 * Menghasilkan secret key berdasarkan pattern dan key parts dari config yang dimuat.
 */
function getSecretKey() {
    const { SIGNATURE_PATTERN, KEY_PARTS } = signatureConfig;
    if (!SIGNATURE_PATTERN || !KEY_PARTS) return "";
    return SIGNATURE_PATTERN.map(index => KEY_PARTS[index]).join("");
}

/**
 * Membuat HMAC signature menggunakan Web Crypto API.
 */
async function createHmacSignature(secretKey, message) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(message);

    const cryptoKey = await webcrypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    const signature = await webcrypto.subtle.sign("HMAC", cryptoKey, messageData);
    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate random nonce.
 */
function generateNonce() {
    const randomBytes = new Uint8Array(16);
    webcrypto.getRandomValues(randomBytes);
    return Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Menghasilkan header yang diperlukan untuk request mutation.
 * @param {object | null} payload - Payload JSON dari request.
 * @returns {Promise<object>} Objek berisi header signature.
 */
export async function mutationHeaders(payload) {
    try {
        const { HEADER_NAMES } = signatureConfig;
        if (!HEADER_NAMES || !HEADER_NAMES.META_HASH) {
            logger.warn('Konfigurasi signature tidak lengkap. Melewatkan pembuatan signature.');
            return {};
        }

        const timestamp = Date.now();
        const nonce = generateNonce();
        const payloadString = JSON.stringify(payload ?? null);
        const message = `${timestamp}.${nonce}.${payloadString}`;
        const secretKey = getSecretKey();

        if (!secretKey) {
            logger.warn('Secret key kosong. Tidak dapat membuat signature.');
            return {};
        }

        const signature = await createHmacSignature(secretKey, message);

        const headers = {
            [HEADER_NAMES.META_HASH]: signature,
            [HEADER_NAMES.CLIENT_TIME]: timestamp.toString(),
            [HEADER_NAMES.TRACE_ID]: nonce,
        };

        logger.debug(`Headers generated for path with payload: ${JSON.stringify(payload)}`);
        return headers;
    } catch (error) {
        logger.error('[ERROR] Gagal membuat signature headers:', error);
        return {};
    }
}
