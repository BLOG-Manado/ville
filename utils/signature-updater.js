// =================================================================
// SIGNATURE UPDATER MODULE
// Mengubah logika chunk.js menjadi fungsi yang bisa diimpor.
// =================================================================

import fs from 'fs';
import { logger } from './logger.js'; // Menggunakan logger utama bot

const TARGET_URL = 'https://app.appleville.xyz';
const SEARCH_PATTERN = /47121:\s*\([^)]*\)\s*=>/;

// --- FUNGSI EKSTRAKSI (disalin dari chunk.js) ---

function extractPattern(content) {
    const match = content.match(/let\s+d\s*=\s*\[([^\]]+)\]/);
    if (match) {
        return match[1].split(',').map(n => parseInt(n.trim()));
    }
    return null;
}

function extractKeyParts(content) {
    const match = content.match(/let\s+e\s*=\s*\[([^\]]+)\]/);
    if (match) {
        const keyStr = match[1];
        const keyParts = [...keyStr.matchAll(/"([^"]*)"/g)].map(match => match[1]);
        if (keyParts.length === 4) {
            return keyParts;
        }
    }
    return null;
}

function extractHeaders(content) {
    const headers = {};

    // Pola 1: Mencari objek literal seperti `let u={...}` atau `={...}`
    const objectMatch = content.match(/=\s*\{(\s*META_HASH:\s*"[^"]+",\s*CLIENT_TIME:\s*"[^"]+",\s*TRACE_ID:\s*"[^"]+"\s*)\}/);
    if (objectMatch) {
        const headerStr = objectMatch[1];
        const metaMatch = headerStr.match(/META_HASH:\s*"([^"]+)"/);
        const timeMatch = headerStr.match(/CLIENT_TIME:\s*"([^"]+)"/);
        const traceMatch = headerStr.match(/TRACE_ID:\s*"([^"]+)"/);

        if (metaMatch && timeMatch && traceMatch) {
            return {
                META_HASH: metaMatch[1],
                CLIENT_TIME: timeMatch[1],
                TRACE_ID: traceMatch[1]
            };
        }
    }

    // Pola 2: Mencari penetapan individual jika Pola 1 gagal
    const metaMatch = content.match(/META_HASH:\s*"([^"]+)"/);
    const timeMatch = content.match(/CLIENT_TIME:\s*"([^"]+)"/);
    const traceMatch = content.match(/TRACE_ID:\s*"([^"]+)"/);

    if (metaMatch) headers.META_HASH = metaMatch[1];
    if (timeMatch) headers.CLIENT_TIME = timeMatch[1];
    if (traceMatch) headers.TRACE_ID = traceMatch[1];

    if (headers.META_HASH && headers.CLIENT_TIME && headers.TRACE_ID) {
        return headers;
    }

    return null; // Kembalikan null jika tidak ada yang ditemukan
}

function generateConfig(pattern, keyParts, headers) {
    return `// =================================================================
// SIGNATURE CONFIG
// Generated at: ${new Date().toISOString()}
// =================================================================

export const SIGNATURE_PATTERN = ${JSON.stringify(pattern)};
export const KEY_PARTS = ${JSON.stringify(keyParts)};
export const HEADER_NAMES = {
    META_HASH: "${headers.META_HASH}",
    CLIENT_TIME: "${headers.CLIENT_TIME}",
    TRACE_ID: "${headers.TRACE_ID}"
};`;
}


/**
 * Menjalankan proses untuk mengambil dan memperbarui signature config.
 * Akan melempar error jika gagal.
 */
export async function updateSignature() {
    logger.info('🚀 Memulai proses pembaruan signature...');
    logger.info(`📡 Mengambil data dari ${TARGET_URL}...`);

    const response = await fetch(TARGET_URL);
    if (!response.ok) {
        throw new Error(`Gagal mengambil HTML: HTTP ${response.status}`);
    }
    const html = await response.text();
    logger.info('✅ HTML berhasil diunduh.');

    const scriptRegex = /src="([^"]+\.js)"/g;
    const scriptPaths = [...html.matchAll(scriptRegex)].map(match => match[1]);
    const chunkScripts = scriptPaths.filter(path => path.includes('/_next/static/chunks/'));

    if (chunkScripts.length === 0) {
        throw new Error('Tidak ada file chunk JavaScript yang ditemukan di HTML.');
    }
    logger.info(`🔍 Menemukan ${chunkScripts.length} file chunk untuk dipindai...`);

    for (const scriptPath of chunkScripts) {
        const scriptUrl = new URL(scriptPath, TARGET_URL).href;
        logger.debug(`📄 Memindai: ${scriptPath}`);

        try {
            const scriptResponse = await fetch(scriptUrl);
            if (!scriptResponse.ok) continue;
            const content = await scriptResponse.text();

            if (SEARCH_PATTERN.test(content)) {
                logger.success(`🎉 Modul signature ditemukan di: ${scriptPath}`);

                const pattern = extractPattern(content);
                const keyParts = extractKeyParts(content);
                const headers = extractHeaders(content);

                // [LOGGING BARU] Tampilkan hasil ekstraksi untuk debugging
                logger.info('📊 Hasil Ekstraksi:');
                logger.info(`  - Pattern: ${pattern ? 'Ditemukan' : 'TIDAK DITEMUKAN'}`);
                logger.info(`  - KeyParts: ${keyParts ? 'Ditemukan' : 'TIDAK DITEMUKAN'}`);
                logger.info(`  - Headers: ${headers ? 'Ditemukan' : 'TIDAK DITEMUKAN'}`);

                if (pattern && keyParts && headers) {
                    const configContent = generateConfig(pattern, keyParts, headers);
                    const configPath = './utils/signature-config.js';
                    fs.writeFileSync(configPath, configContent, 'utf8');
                    logger.success(`💾 Konfigurasi signature berhasil disimpan ke: ${configPath}`);
                    return; // Selesai dan berhasil
                } else {
                    // Jika ada bagian yang gagal diekstrak, simpan file untuk debug
                    fs.writeFileSync('./debug-chunk.js', content, 'utf8');
                    logger.warn('⚠️ Gagal mengekstrak semua data. File debug-chunk.js telah disimpan.');
                }
            }
        } catch (error) {
            logger.warn(`⚠️ Gagal memindai ${scriptPath}: ${error.message}`);
        }
    }

    // Jika loop selesai tanpa menemukan apa pun
    throw new Error('Gagal mengekstrak data signature dari semua file chunk.');
}
