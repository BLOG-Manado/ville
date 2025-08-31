// =================================================================
// PAYLOAD TEMPLATES (SINGLE ACTION)
// Berisi fungsi-fungsi untuk membuat objek payload yang akan dikirim ke API.
// Didesain untuk aksi per-slot untuk meningkatkan keandalan.
// =================================================================

/**
 * Membuat payload untuk menanam SATU bibit di SATU slot.
 * @param {number} slotIndex - Nomor slot.
 * @param {string} seedKey - Kunci bibit yang akan ditanam.
 * @returns {object} Payload yang diformat untuk API.
 */
export const plantSeedPayload = (slotIndex, seedKey) => ({
    0: { json: { plantings: [{ slotIndex, seedKey }] } }
});

/**
 * Membuat payload untuk memanen SATU slot.
 * @param {number} slotIndex - Nomor slot yang akan dipanen.
 * @returns {object} Payload yang diformat untuk API.
 */
export const harvestPayload = (slotIndex) => ({
    0: { json: { slotIndexes: [slotIndex] } }
});

/**
 * Membuat payload untuk memasang booster/modifier di SATU slot.
 * @param {number} slotIndex - Nomor slot.
 * @param {string} modifierKey - Kunci booster yang akan dipasang.
 * @returns {object} Payload yang diformat untuk API.
 */
export const applyModifierPayload = (slotIndex, modifierKey) => ({
    0: { json: { applications: [{ slotIndex, modifierKey }] } }
});

/**
 * Membuat payload untuk membeli item (bibit atau booster).
 * Fungsi ini tetap sama karena pembelian adalah satu aksi tunggal.
 * @param {string} key - Kunci item (e.g., 'wheat', 'fertiliser').
 * @param {number} quantity - Jumlah yang akan dibeli.
 * @returns {object} Payload yang diformat untuk API.
 */
export const buyItemPayload = (key, quantity) => ({
    0: { json: { purchases: [{ key, quantity }] } }
});



// --- [BARU] AKSI MASSAL (BATCH) ---

export const plantMultiplePayload = (plantings) => ({
    0: { json: { plantings } }
});

export const harvestMultiplePayload = (slotIndexes) => ({
    0: { json: { slotIndexes } }
});