// =================================================================
// SIMPLE SIGNATURE EXTRACTOR - STANDALONE VERSION
// =================================================================

import fs from 'fs';
import path from 'path';

// Simple logger
const log = {
    info: (...args) => console.log('📋', ...args),
    warn: (...args) => console.warn('⚠️', ...args),
    error: (...args) => console.error('❌', ...args),
    success: (...args) => console.log('✅', ...args)
};

const TARGET_URL = 'https://app.appleville.xyz';
const SEARCH_PATTERN = /47121:\s*\([^)]*\)\s*=>/;

// Extract functions
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
    // Pattern 1: let u = { META_HASH: "x-xcsa3d", CLIENT_TIME: "x-dbsv", TRACE_ID: "x-dsa" }
    let match = content.match(/let\s+u\s*=\s*\{([^}]+)\}/);
    if (match) {
        const headerStr = match[1];
        const headers = {};

        const metaMatch = headerStr.match(/META_HASH:\s*"([^"]+)"/);
        if (metaMatch) headers.META_HASH = metaMatch[1];

        const timeMatch = headerStr.match(/CLIENT_TIME:\s*"([^"]+)"/);
        if (timeMatch) headers.CLIENT_TIME = timeMatch[1];

        const traceMatch = headerStr.match(/TRACE_ID:\s*"([^"]+)"/);
        if (traceMatch) headers.TRACE_ID = traceMatch[1];

        if (headers.META_HASH && headers.CLIENT_TIME && headers.TRACE_ID) {
            return headers;
        }
    }

    // Pattern 2: Cari object literal dengan ketiga header
    match = content.match(/\{\s*META_HASH:\s*"([^"]+)"\s*,\s*CLIENT_TIME:\s*"([^"]+)"\s*,\s*TRACE_ID:\s*"([^"]+)"\s*\}/);
    if (match) {
        return {
            META_HASH: match[1],
            CLIENT_TIME: match[2],
            TRACE_ID: match[3]
        };
    }

    // Pattern 3: Cari individual assignments
    const headers = {};
    const metaMatch = content.match(/META_HASH:\s*"([^"]+)"/);
    const timeMatch = content.match(/CLIENT_TIME:\s*"([^"]+)"/);
    const traceMatch = content.match(/TRACE_ID:\s*"([^"]+)"/);

    if (metaMatch) headers.META_HASH = metaMatch[1];
    if (timeMatch) headers.CLIENT_TIME = timeMatch[1];
    if (traceMatch) headers.TRACE_ID = traceMatch[1];

    if (headers.META_HASH && headers.CLIENT_TIME && headers.TRACE_ID) {
        return headers;
    }

    // Pattern 4: Berdasarkan document 3, coba cari dengan spasi berbeda
    match = content.match(/u\s*=\s*\{([^}]+)\}/);
    if (match) {
        const headerStr = match[1];
        const headers = {};

        const metaMatch = headerStr.match(/META_HASH:\s*"([^"]+)"/);
        if (metaMatch) headers.META_HASH = metaMatch[1];

        const timeMatch = headerStr.match(/CLIENT_TIME:\s*"([^"]+)"/);
        if (timeMatch) headers.CLIENT_TIME = timeMatch[1];

        const traceMatch = headerStr.match(/TRACE_ID:\s*"([^"]+)"/);
        if (traceMatch) headers.TRACE_ID = traceMatch[1];

        if (headers.META_HASH && headers.CLIENT_TIME && headers.TRACE_ID) {
            return headers;
        }
    }

    return null;
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

async function main() {
    try {
        log.info('🚀 Starting signature extractor...');
        log.info(`📡 Fetching ${TARGET_URL}...`);

        const response = await fetch(TARGET_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = await response.text();
        log.info('✅ HTML downloaded successfully');

        // Find JavaScript chunks
        const scriptRegex = /src="([^"]+\.js)"/g;
        const scriptPaths = [...html.matchAll(scriptRegex)].map(match => match[1]);
        const chunkScripts = scriptPaths.filter(path => path.includes('/_next/static/chunks/'));

        log.info(`🔍 Found ${chunkScripts.length} chunk files to scan...`);

        for (let i = 0; i < chunkScripts.length; i++) {
            const scriptPath = chunkScripts[i];
            const scriptUrl = new URL(scriptPath, TARGET_URL).href;

            log.info(`📄 Scanning ${i + 1}/${chunkScripts.length}: ${scriptPath}`);

            try {
                const scriptResponse = await fetch(scriptUrl);
                if (!scriptResponse.ok) continue;

                const content = await scriptResponse.text();

                if (SEARCH_PATTERN.test(content)) {
                    log.success(`🎉 FOUND MODULE 47121 in: ${scriptPath}`);

                    // Extract data
                    const pattern = extractPattern(content);
                    const keyParts = extractKeyParts(content);
                    const headers = extractHeaders(content);

                    log.info('📊 Extraction results:');
                    console.log(`   Pattern: ${pattern ? `[${pattern.join(', ')}]` : 'NOT FOUND'}`);
                    console.log(`   KeyParts: ${keyParts ? `[${keyParts.map(k => `"${k}"`).join(', ')}]` : 'NOT FOUND'}`);
                    console.log(`   Headers: ${headers ? JSON.stringify(headers) : 'NOT FOUND'}`);

                    // Debug: manual search for headers in content
                    if (!headers) {
                        log.info('🔍 Searching for headers manually...');
                        const metaMatches = content.match(/META_HASH[^"]*"([^"]+)"/g);
                        const timeMatches = content.match(/CLIENT_TIME[^"]*"([^"]+)"/g);
                        const traceMatches = content.match(/TRACE_ID[^"]*"([^"]+)"/g);

                        if (metaMatches) console.log(`   Found META_HASH patterns: ${metaMatches}`);
                        if (timeMatches) console.log(`   Found CLIENT_TIME patterns: ${timeMatches}`);
                        if (traceMatches) console.log(`   Found TRACE_ID patterns: ${traceMatches}`);

                        // Try to extract values
                        if (metaMatches && timeMatches && traceMatches) {
                            const meta = metaMatches[0].match(/"([^"]+)"/)[1];
                            const time = timeMatches[0].match(/"([^"]+)"/)[1];
                            const trace = traceMatches[0].match(/"([^"]+)"/)[1];

                            headers = { META_HASH: meta, CLIENT_TIME: time, TRACE_ID: trace };
                            console.log(`   Manual extraction: ${JSON.stringify(headers)}`);
                        }
                    }
                    if (pattern && keyParts && headers) {
                        // Create utils directory if not exists
                        const utilsDir = './utils';
                        if (!fs.existsSync(utilsDir)) {
                            fs.mkdirSync(utilsDir, { recursive: true });
                        }

                        // Write config file
                        const configContent = generateConfig(pattern, keyParts, headers);
                        const configPath = './utils/signature-config.js';
                        fs.writeFileSync(configPath, configContent, 'utf8');

                        log.success(`💾 Configuration saved to: ${configPath}`);
                        return;
                    } else {
                        log.error('❌ Failed to extract all required data');

                        // Save debug file
                        fs.writeFileSync('./debug-chunk.js', content, 'utf8');
                        log.info('🐛 Debug content saved to: debug-chunk.js');
                        return;
                    }
                }
            } catch (error) {
                log.warn(`⚠️  Failed to scan ${scriptPath}: ${error.message}`);
            }
        }

        log.error('❌ Module 47121 not found in any chunks');

    } catch (error) {
        log.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Run immediately
main();