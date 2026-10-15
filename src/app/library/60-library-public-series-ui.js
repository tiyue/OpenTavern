/**
 * 公开角色卡系列导航。
 *
 * 负责公共卡片与贡献者卡片的系列层级、学院/作者筛选、面包屑和返回操作。
 * 弹出筛选菜单由事件层负责点击外部关闭。
 */
function getPublicLibraryChromeElements() {
    return {
        backButton: document.getElementById('publicSeriesBackBtn'),
        breadcrumb: document.getElementById('publicSeriesBreadcrumb'),
        breadcrumbRoot: document.getElementById('publicSeriesBreadcrumbRoot'),
        breadcrumbName: document.getElementById('publicSeriesBreadcrumbName'),
        filterWrap: document.getElementById('academyFilterWrap'),
        filterToggle: document.getElementById('academyFilterToggle'),
        filterLabel: document.getElementById('academyFilterLabel'),
        filterMenu: document.getElementById('academyFilterMenu')
    };
}

function closeAcademyFilterMenu() {
    var elements = getPublicLibraryChromeElements();
    if (elements.filterMenu) elements.filterMenu.classList.add('hidden');
    if (elements.filterToggle) elements.filterToggle.setAttribute('aria-expanded', 'false');
}

function getActivePublicSeriesFilterOptions(series) {
    if (!series) return [];
    return activeLibraryTab === 'contributors'
        ? (Array.isArray(series.authors) ? series.authors : [])
        : (Array.isArray(series.academies) ? series.academies : []);
}

function updateAcademyFilterLabel(series) {
    var label = getPublicLibraryChromeElements().filterLabel;
    if (!label) return;
    if (libraryAcademyFilter === 'all') {
        var key = activeLibraryTab === 'contributors' ? 'filter_author' : 'filter_academy';
        label.textContent = t(key);
        return;
    }
    var selected = getActivePublicSeriesFilterOptions(series).find(function(option) {
        return option && option.id === libraryAcademyFilter;
    });
    label.textContent = selected ? selected.name : libraryAcademyFilter;
}

function populateAcademyFilterMenu(series) {
    var menu = getPublicLibraryChromeElements().filterMenu;
    if (!menu) return;
    var options = [{ id: 'all', name: t('filter_all') }].concat(getActivePublicSeriesFilterOptions(series));
    menu.innerHTML = '';
    options.forEach(function(option) {
        var button = document.createElement('button');
        var active = libraryAcademyFilter === option.id;
        button.type = 'button';
        button.className = 'w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ' +
            (active ? 'bg-amber-500/20 text-amber-300' : 'text-zinc-300 hover:bg-white/10 hover:text-zinc-100');
        button.textContent = option.name;
        button.dataset.academy = option.id;
        button.addEventListener('click', function(event) {
            event.stopPropagation();
            libraryAcademyFilter = option.id;
            closeAcademyFilterMenu();
            updateAcademyFilterLabel(series);
            renderPublicCards();
        });
        menu.appendChild(button);
    });
}

function updatePublicLibraryChrome() {
    var elements = getPublicLibraryChromeElements();
    var isCatalog = activeLibraryTab === 'public' || activeLibraryTab === 'contributors';
    var inSeries = isCatalog && publicLibraryLevel === 'cards' && !!activePublicSeriesId;
    var series = inSeries ? getPublicSeriesById(activePublicSeriesId) : null;

    if (elements.backButton) elements.backButton.classList.toggle('hidden', !inSeries);
    if (elements.breadcrumb) elements.breadcrumb.classList.toggle('hidden', !inSeries);
    if (elements.filterWrap) elements.filterWrap.classList.toggle('hidden', !inSeries);

    if (!inSeries) {
        closeAcademyFilterMenu();
        return;
    }
    if (elements.breadcrumbName) elements.breadcrumbName.textContent = series ? (series.name || series.nameEn || '') : '';
    if (elements.breadcrumbRoot) {
        var rootKey = activeLibraryTab === 'contributors' ? 'tab_contributors' : 'tab_public';
        elements.breadcrumbRoot.dataset.i18n = rootKey;
        elements.breadcrumbRoot.textContent = t(rootKey);
    }
    populateAcademyFilterMenu(series);
    updateAcademyFilterLabel(series);
}

function openPublicSeries(seriesId) {
    if (!getPublicSeriesById(seriesId)) return;
    activePublicSeriesId = seriesId;
    publicLibraryLevel = 'cards';
    libraryAcademyFilter = 'all';
    renderPublicCards();
}

function backToPublicSeriesList() {
    publicLibraryLevel = 'series';
    activePublicSeriesId = null;
    libraryAcademyFilter = 'all';
    closeAcademyFilterMenu();
    renderPublicCards();
}

function createPublicSeriesFolder(series, cardCount) {
    var folder = document.createElement('button');
    folder.type = 'button';
    folder.className = 'glass rounded-2xl overflow-hidden cursor-pointer hover:bg-white/5 transition-all border border-white/5 hover:border-amber-500/30 flex flex-col text-left group';
    folder.setAttribute('aria-label', (series.name || series.nameEn || '') + '，' + cardCount);

    var preview = document.createElement('div');
    preview.className = 'aspect-[3/4] w-full overflow-hidden rounded-t-2xl bg-zinc-900 relative';
    if (series.coverImage) {
        var image = document.createElement('img');
        image.src = resolvePublicCardImageUrl({ previewImage: series.coverImage });
        image.className = 'w-full h-full object-cover transition-transform duration-300 group-hover:scale-105';
        image.alt = series.name || series.nameEn || '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.onerror = function() {
            preview.innerHTML = '';
            preview.appendChild(createPublicLibraryCardFallback({ name: series.name }));
        };
        preview.appendChild(image);
    } else {
        preview.appendChild(createPublicLibraryCardFallback({ name: series.name }));
    }

    var badge = document.createElement('div');
    badge.className = 'absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1';
    var typeBadge = document.createElement('span');
    typeBadge.className = 'px-2 py-0.5 rounded-lg bg-black/55 backdrop-blur-sm text-[10px] text-zinc-100';
    typeBadge.textContent = t('public_series_folder');
    var countBadge = document.createElement('span');
    countBadge.className = 'px-2 py-0.5 rounded-lg bg-black/55 backdrop-blur-sm text-[10px] text-zinc-200';
    countBadge.textContent = String(cardCount);
    badge.appendChild(typeBadge);
    badge.appendChild(countBadge);
    preview.appendChild(badge);

    var info = document.createElement('span');
    info.className = 'p-2 block w-full';
    var name = document.createElement('span');
    name.className = 'text-sm font-medium text-zinc-100 truncate block';
    name.textContent = series.name || series.nameEn || '';
    var description = document.createElement('span');
    description.className = 'text-[10px] text-zinc-400 mt-0.5 truncate block';
    description.textContent = series.description || series.nameEn || '';
    info.appendChild(name);
    info.appendChild(description);

    folder.appendChild(preview);
    folder.appendChild(info);
    folder.addEventListener('click', function() { openPublicSeries(series.id); });
    return folder;
}

function appendPublicLibraryNoResults(container) {
    var empty = document.createElement('div');
    empty.className = 'col-span-full py-12 text-center text-sm text-zinc-500';
    empty.textContent = t('card_library_no_results');
    container.appendChild(empty);
}

function renderPublicSeriesFolders() {
    var seriesGrid = document.getElementById('publicSeriesGrid');
    var cardsGrid = document.getElementById('publicCardsGrid');
    if (cardsGrid) {
        cardsGrid.classList.add('hidden');
        cardsGrid.innerHTML = '';
    }
    if (!seriesGrid) return;
    seriesGrid.classList.remove('hidden');
    seriesGrid.innerHTML = '';

    var catalog = getActivePublicCardCatalog();
    var query = (librarySearchQuery || '').toLowerCase().trim();
    var visibleSeries = catalog.series.filter(function(series) {
        if (!query) return true;
        var seriesText = [series.name, series.nameEn, series.description].filter(Boolean).join(' ').toLowerCase();
        if (seriesText.includes(query)) return true;
        return catalog.cards.some(function(card) {
            return card.seriesId === series.id && passesLibraryFilter(card);
        });
    });
    visibleSeries.forEach(function(series) {
        var count = catalog.cards.filter(function(card) { return card.seriesId === series.id; }).length;
        seriesGrid.appendChild(createPublicSeriesFolder(series, count));
    });
    if (visibleSeries.length === 0) appendPublicLibraryNoResults(seriesGrid);
}

function renderPublicSeriesCards() {
    var seriesGrid = document.getElementById('publicSeriesGrid');
    var cardsGrid = document.getElementById('publicCardsGrid');
    if (seriesGrid) {
        seriesGrid.classList.add('hidden');
        seriesGrid.innerHTML = '';
    }
    if (!cardsGrid) return;
    cardsGrid.classList.remove('hidden');
    cardsGrid.innerHTML = '';
    var cards = getFilteredPublicLibraryCards();
    cards.forEach(function(card) {
        cardsGrid.appendChild(createPublicLibraryCard(card));
    });
    if (cards.length === 0) appendPublicLibraryNoResults(cardsGrid);
}
