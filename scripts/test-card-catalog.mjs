import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readProjectFile(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function exposeSource(relativePath, expression) {
    const context = { console };
    vm.createContext(context);
    vm.runInContext(readProjectFile(relativePath) + '\n;globalThis.__result = ' + expression + ';', context);
    return context.__result;
}

function localPathFromCatalogUrl(url) {
    const normalized = decodeURIComponent(String(url || '')).replace(/^\/+/, '').replace(/\//g, path.sep);
    const absolute = path.resolve(projectRoot, normalized);
    const cardsRoot = path.resolve(projectRoot, 'cards') + path.sep;
    assert.ok(absolute.startsWith(cardsRoot), 'Catalog path escaped cards/: ' + url);
    return absolute;
}

const catalog = exposeSource(
    'src/app/library/60-public-card-data.js',
    '({ publicSeries: PUBLIC_SERIES, publicCards: PUBLIC_CARDS, contributorSeries: CONTRIBUTOR_SERIES, contributorCards: CONTRIBUTOR_CARDS })'
);

assert.equal(catalog.publicSeries.length, 2, 'Expected the two packaged public series.');
assert.equal(catalog.publicCards.length, 157, 'Expected all 157 packaged public character cards.');
assert.equal(catalog.contributorSeries.length, 1, 'Expected the contributor series.');
assert.equal(catalog.contributorCards.length, 41, 'Expected all 41 public contributor cards.');

for (const list of [catalog.publicCards, catalog.contributorCards]) {
    const ids = new Set();
    const urls = new Set();
    for (const card of list) {
        assert.ok(card.id && !ids.has(card.id), 'Duplicate or empty card id: ' + card.id);
        assert.ok(card.jsonUrl && !urls.has(card.jsonUrl), 'Duplicate or empty card URL: ' + card.jsonUrl);
        ids.add(card.id);
        urls.add(card.jsonUrl);

        const jsonPath = localPathFromCatalogUrl(card.jsonUrl);
        assert.ok(fs.existsSync(jsonPath), 'Missing catalog JSON: ' + card.jsonUrl);
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const payload = parsed && parsed.data && parsed.data.name ? parsed.data : parsed;
        assert.ok(payload && payload.name, 'Card JSON has no importable name: ' + card.jsonUrl);

        for (const imageUrl of [card.previewImage, card.avatar].filter(Boolean)) {
            assert.ok(fs.existsSync(localPathFromCatalogUrl(imageUrl)), 'Missing catalog image: ' + imageUrl);
        }
    }
}

for (const series of catalog.publicSeries) {
    if (series.coverImage) {
        assert.ok(fs.existsSync(localPathFromCatalogUrl(series.coverImage)), 'Missing series cover: ' + series.coverImage);
    }
}

const packagedJsonRoot = path.join(projectRoot, 'cards', 'Hajimides');
let packagedJsonCount = 0;
const pendingDirectories = [packagedJsonRoot];
while (pendingDirectories.length) {
    const directory = pendingDirectories.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) pendingDirectories.push(absolute);
        else if (entry.name.toLowerCase().endsWith('.json')) packagedJsonCount++;
    }
}
assert.equal(packagedJsonCount, 159, 'Expected 157 cards plus two packaged auxiliary JSON files.');

const normalizeCard = exposeSource('src/app/character/40-character-card-import.js', 'normalizeImportedCharacterCardData');
const normalized = normalizeCard({ name: 'Test', creator: 'Author', character_version: '3.1' });
assert.equal(normalized.creator, 'Author', 'Character creator metadata was not preserved.');
assert.equal(normalized.character_version, '3.1', 'Character version metadata was not preserved.');

const assetContext = {
    console,
    window: {
        location: { protocol: 'https:' },
        __OT_CARD_ASSET_BASE__: 'https://opentavern.pages.dev/'
    }
};
vm.createContext(assetContext);
vm.runInContext(
    readProjectFile('src/app/library/60-public-card-assets.js') +
    '\n;globalThis.__image = resolvePublicCardImageUrl; globalThis.__json = resolvePublicCardJsonUrl;',
    assetContext
);
assert.equal(
    assetContext.__image({ previewImage: '/cards/example.png' }),
    'https://opentavern.pages.dev/cards/example.png',
    'Android image base was not applied.'
);
assert.equal(assetContext.__json({ jsonUrl: '/cards/example.json' }), '/cards/example.json', 'Packaged JSON must remain local.');

console.log('Card catalog checks passed: 198 cards, 159 packaged JSON files, all referenced assets present.');
