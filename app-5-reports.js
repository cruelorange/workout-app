// ================================================================
//   ЧАСТЬ 5: ОТЧЁТНОСТЬ (для админа)
// ================================================================
// Один отчёт на клиента. Слева — список клиентов, справа — таблица.
// Данные хранятся в user.report (по аналогии с user.profile, user.screening).
//
// Структура user.report:
// {
//   repeated: [ { weight, ivn, sets, reps, tempo }, x4 ],   // Повторные усилия
//   submax:   [ { weight, ivn, sets, reps, tempo }, x4 ],   // Субмаксимальные усилия
//   updatedAt
// }
// ================================================================

// Какой клиент сейчас открыт на странице «Отчётность»
let currentReportsClientId = null;

// ================================================================
//   Отрисовка страницы «Отчётность»
// ================================================================
function renderReportsPage() {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') return;

    renderReportsList();

    // Если уже был выбран клиент — показать его отчёт
    if (currentReportsClientId) {
        const stillExists = findUserById(currentReportsClientId);
        if (stillExists && stillExists.role === 'client') {
            selectReportsClient(currentReportsClientId);
            return;
        }
        currentReportsClientId = null;
    }

    // Иначе — заглушка
    document.getElementById('reportsContent').innerHTML =
        '<div class="card profiles-empty"><p class="hint">Выберите клиента из списка слева.</p></div>';
}

// ================================================================
//   Список клиентов слева
// ================================================================
function renderReportsList() {
    const listEl = document.getElementById('reportsList');
    if (!listEl) return;

    const clients = getClientsList();

    if (clients.length === 0) {
        listEl.innerHTML = '<p class="no-clients" style="padding: 12px;">Клиентов пока нет.</p>';
        return;
    }

    // Сортируем по имени
    clients.sort(function(a, b) {
        const an = (a.name || a.login).toLowerCase();
        const bn = (b.name || b.login).toLowerCase();
        return an.localeCompare(bn);
    });

    listEl.innerHTML = clients.map(function(c) {
        const filled = isReportFilled(c.report);
        const statusText = filled ? 'заполнена' : 'не заполнена';
        const activeClass = c.id === currentReportsClientId ? ' active' : '';

        return '<div class="profile-pick-item' + activeClass + '" data-client-id="' + c.id + '">' +
            '<div class="pick-name">' + esc(c.name || c.login) + '</div>' +
            '<div class="pick-status">' + statusText + '</div>' +
        '</div>';
    }).join('');

    // Обработчики кликов
    listEl.querySelectorAll('.profile-pick-item').forEach(function(el) {
        el.addEventListener('click', function() {
            selectReportsClient(el.dataset.clientId);
        });
    });
}

// Проверка: заполнен ли отчёт хоть чем-то
function isReportFilled(report) {
    if (!report) return false;

    const checkRows = function(rows) {
        if (!Array.isArray(rows)) return false;
        return rows.some(function(r) {
            if (!r) return false;
            return !!(r.weight || r.ivn || r.sets || r.reps || r.tempo);
        });
    };

    return checkRows(report.repeated) || checkRows(report.submax);
}

// ================================================================
//   Выбор клиента — отрисовка таблицы справа
// ================================================================
function selectReportsClient(clientId) {
    const client = findUserById(clientId);
    if (!client || client.role !== 'client') return;

    // Если сменили клиента — сбрасываем пагинацию, режим редактирования и сортировку
    if (currentReportsClientId !== clientId) {
        resetCompletedWorkoutsPagination();
        resetAdminReportEditing();
        feedSortOldestFirst = false;
    }

    currentReportsClientId = clientId;

    // Подсветить активный пункт в списке
    document.querySelectorAll('#reportsList .profile-pick-item').forEach(function(el) {
        if (el.dataset.clientId === clientId) el.classList.add('active');
        else el.classList.remove('active');
    });

    renderReportTable(client);
}

// ================================================================
//   Отрисовка таблицы отчёта
// ================================================================
function renderReportTable(client) {
    // Нормализуем данные: если у клиента ещё нет report — создаём пустой шаблон
    const report = ensureReportShape(client.report);

    let html = '';

    // Заголовок страницы
    html += '<div class="profiles-header">' +
        '<h2>Отчёт: ' + esc(client.name || client.login) + '</h2>' +
        '<p class="hint">Заполните данные по неделям. КПШ и Тоннаж посчитаются автоматически.</p>' +
    '</div>';

       // Обе таблицы — в одну строку, слева и справа
    html += '<div class="report-blocks-row">';
    html += buildReportBlock('Повторных усилий', 'repeated', report.repeated);
    html += buildReportBlock('Субмаксимальных усилий', 'submax', report.submax);
    html += '</div>';

    document.getElementById('reportsContent').innerHTML = html;

    // Первичный пересчёт всех строк (для сохранённых данных)
    recalcAllReportRows();

    // Навешиваем обработчики input (один раз на контейнер — делегирование)
    // Защита от повторного навешивания: ставим флаг на контейнер
    const container = document.getElementById('reportsContent');
    if (container && !container.dataset.reportHandlersAttached) {
        container.dataset.reportHandlersAttached = '1';
        attachReportHandlers();
        attachAdminReportHandlers();
    }

    // Архив выполненных тренировок
    renderCompletedWorkouts(client);
}

// Привести report к нужной форме (4 строки в каждом блоке)
function ensureReportShape(report) {
    const emptyRow = function() {
        return { weight: '', ivn: '', sets: '', reps: '', tempo: '' };
    };

    const result = {
        repeated: [],
        submax: [],
        updatedAt: (report && report.updatedAt) || ''
    };

    for (let i = 0; i < 4; i++) {
        const src1 = (report && report.repeated && report.repeated[i]) || {};
        result.repeated.push({
            weight: src1.weight != null ? src1.weight : '',
            ivn:    src1.ivn    != null ? src1.ivn    : '',
            sets:   src1.sets   != null ? src1.sets   : '',
            reps:   src1.reps   != null ? src1.reps   : '',
            tempo:  src1.tempo  != null ? src1.tempo  : ''
        });

        const src2 = (report && report.submax && report.submax[i]) || {};
        result.submax.push({
            weight: src2.weight != null ? src2.weight : '',
            ivn:    src2.ivn    != null ? src2.ivn    : '',
            sets:   src2.sets   != null ? src2.sets   : '',
            reps:   src2.reps   != null ? src2.reps   : '',
            tempo:  src2.tempo  != null ? src2.tempo  : ''
        });
    }

    return result;
}

// Построить один блок (заголовок + таблица 4 строки)
// blockKey — 'repeated' или 'submax' (для data-атрибутов)
function buildReportBlock(title, blockKey, rows) {
    let html = '<div class="report-block">' +
        '<div class="report-block-title">' + esc(title) + '</div>' +
        '<div class="table-scroll report-scroll">' +
    '<table class="report-table">' +
                '<thead><tr>' +
                    '<th>Неделя</th>' +
                    '<th>Вес</th>' +
                    '<th>ИВН</th>' +
                    '<th>Подходы</th>' +
                    '<th>Повторы</th>' +
                    '<th>Темп</th>' +
                    '<th>КПШ</th>' +
                    '<th>Тоннаж</th>' +
                '</tr></thead>' +
                '<tbody>';

    for (let i = 0; i < 4; i++) {
        const r = rows[i] || {};
        const weekNum = i + 1;

        html += '<tr data-block="' + blockKey + '" data-row="' + i + '">' +
            '<td class="report-week">' + weekNum + '</td>' +
            '<td><input type="number" class="report-input" data-field="weight" value="' + esc(r.weight) + '" placeholder="—"></td>' +
            '<td><input type="text" class="report-input" data-field="ivn" value="' + esc(r.ivn) + '" placeholder="—"></td>' +
            '<td><input type="number" class="report-input" data-field="sets" value="' + esc(r.sets) + '" placeholder="—"></td>' +
            '<td><input type="number" class="report-input" data-field="reps" value="' + esc(r.reps) + '" placeholder="—"></td>' +
            '<td><input type="text" class="report-input" data-field="tempo" value="' + esc(r.tempo) + '" placeholder="—"></td>' +
            '<td class="report-calc" data-field="kpsh">—</td>' +
            '<td class="report-calc" data-field="tonnage">—</td>' +
        '</tr>';
    }

    html += '</tbody></table></div></div>';
    return html;
}

// ================================================================
//   ПЕРЕСЧЁТ СТРОКИ: КПШ и Тоннаж
// ================================================================
// КПШ = Подходы × Повторы
// Тоннаж = КПШ × Вес
function calcRow(row) {
    const sets  = parseFloat(row.sets);
    const reps  = parseFloat(row.reps);
    const weight = parseFloat(row.weight);

    const kpsh = (isFinite(sets) && isFinite(reps))
        ? sets * reps
        : null;

    const tonnage = (kpsh !== null && isFinite(weight))
        ? kpsh * weight
        : null;

    return { kpsh: kpsh, tonnage: tonnage };
}

// Форматирование числа для вывода (без лишних нулей)
function fmtNum(n) {
    if (n === null || n === undefined) return '—';
    if (!isFinite(n)) return '—';
    // Если целое — без десятичной части
    if (Math.floor(n) === n) return String(n);
    // Иначе — до 2 знаков, убираем trailing zeros
    return String(parseFloat(n.toFixed(2)));
}

// ================================================================
//   ОБНОВЛЕНИЕ ОДНОЙ СТРОКИ (пересчёт + сохранение)
// ================================================================
function updateReportRow(blockKey, rowIndex) {
    const client = findUserById(currentReportsClientId);
    if (!client || client.role !== 'client') return;

    // Нормализуем report
    client.report = ensureReportShape(client.report);

    const row = client.report[blockKey][rowIndex];
    const calc = calcRow(row);

    // Обновляем ячейки КПШ и Тоннаж в DOM
    const tr = document.querySelector(
        '#reportsContent tr[data-block="' + blockKey + '"][data-row="' + rowIndex + '"]'
    );
    if (tr) {
        const kpshCell = tr.querySelector('td[data-field="kpsh"]');
        const tonnageCell = tr.querySelector('td[data-field="tonnage"]');
        if (kpshCell) kpshCell.textContent = fmtNum(calc.kpsh);
        if (tonnageCell) tonnageCell.textContent = fmtNum(calc.tonnage);
    }

    // Помечаем время обновления
    client.report.updatedAt = new Date().toISOString();

    // Сохраняем
    saveUsersData();

    // Обновляем статус «заполнена / не заполнена» в списке слева
    if (typeof renderReportsList === 'function') {
        // Перерисовывать весь список каждый раз — тяжело.
        // Достаточно обновить статус у активного клиента.
        updateReportsListStatus(client.id);
    }
}

// Обновить только статус одного клиента в списке слева (без полной перерисовки)
function updateReportsListStatus(clientId) {
    const client = findUserById(clientId);
    if (!client) return;

    const item = document.querySelector('#reportsList .profile-pick-item[data-client-id="' + clientId + '"]');
    if (!item) return;

    const statusEl = item.querySelector('.pick-status');
    if (!statusEl) return;

    statusEl.textContent = isReportFilled(client.report) ? 'заполнена' : 'не заполнена';
}

// ================================================================
//   НАВЕШИВАНИЕ ОБРАБОТЧИКОВ НА ТАБЛИЦУ
// ================================================================
function attachReportHandlers() {
    const container = document.getElementById('reportsContent');
    if (!container) return;

    // Делегирование: ловим input на всех .report-input
    container.addEventListener('input', function(e) {
        const input = e.target.closest('.report-input');
        if (!input) return;

        const tr = input.closest('tr[data-block][data-row]');
        if (!tr) return;

        const blockKey = tr.dataset.block;
        const rowIndex = parseInt(tr.dataset.row, 10);
        const field = input.dataset.field;

        const client = findUserById(currentReportsClientId);
        if (!client) return;

        // Обновляем данные в памяти
        client.report = ensureReportShape(client.report);
        client.report[blockKey][rowIndex][field] = input.value;

        // Пересчитываем и сохраняем
        updateReportRow(blockKey, rowIndex);
    });
}

// ================================================================
//   ПЕРВИЧНЫЙ ПЕРЕСЧЁТ ВСЕХ СТРОК ПРИ ОТРИСОВКЕ
// ================================================================
function recalcAllReportRows() {
    const container = document.getElementById('reportsContent');
    if (!container) return;

    container.querySelectorAll('tr[data-block][data-row]').forEach(function(tr) {
        const blockKey = tr.dataset.block;
        const rowIndex = parseInt(tr.dataset.row, 10);

        const client = findUserById(currentReportsClientId);
        if (!client) return;

        client.report = ensureReportShape(client.report);
        const row = client.report[blockKey][rowIndex];
        const calc = calcRow(row);

        const kpshCell = tr.querySelector('td[data-field="kpsh"]');
        const tonnageCell = tr.querySelector('td[data-field="tonnage"]');
        if (kpshCell) kpshCell.textContent = fmtNum(calc.kpsh);
        if (tonnageCell) tonnageCell.textContent = fmtNum(calc.tonnage);
    });
}

// ================================================================
//   ВЫПОЛНЕННЫЕ ТРЕНИРОВКИ (архив с обратной связью)
// ================================================================
// «Выполненная» = у дня есть _feedback (клиент оставил обратную связь).
// Источник — client.workoutsByDate (не dataByDate!).

const COMPLETED_WORKOUTS_PAGE_SIZE = 10;

// Сколько сейчас показано у активного клиента
let completedWorkoutsShown = COMPLETED_WORKOUTS_PAGE_SIZE;

// Собрать массив выполненных тренировок клиента
// Возвращает: [{ dateKey, workout, feedback }, ...]
// Отсортировано: новые сверху.
function getClientCompletedWorkouts(client) {
    if (!client || !client.workoutsByDate) return [];

    const result = [];

    Object.keys(client.workoutsByDate).forEach(function(key) {
        // Пропускаем служебные ключи (dayOff, feedback)
        if (key.indexOf('_dayOff') !== -1) return;
        if (key.indexOf('_feedback') !== -1) return;

        // Есть ли обратная связь по дню?
        const feedback = client.workoutsByDate[key + '_feedback'];
        if (!feedback) return;

        const workouts = client.workoutsByDate[key];
        if (!Array.isArray(workouts) || workouts.length === 0) return;

        // Каждая тренировка этого дня — отдельная запись
        workouts.forEach(function(w) {
            result.push({
                dateKey: key,
                workout: w,
                feedback: feedback
            });
        });
    });

    // Сортировка: новые сверху.
    // 1) По дате (dateKey, лексикографически = хронологически).
    // 2) Внутри одного дня — по порядку из workoutsByDate (как было).
    result.sort(function(a, b) {
        if (a.dateKey < b.dateKey) return 1;
        if (a.dateKey > b.dateKey) return -1;
        return 0;
    });

    return result;
}

// Сбросить счётчик показанных тренировок (вызывать при смене клиента)
function resetCompletedWorkoutsPagination() {
    completedWorkoutsShown = COMPLETED_WORKOUTS_PAGE_SIZE;
}

// ================================================================
//   ЛЕНТА: активная карточка отчёта + список (отчёты + тренировки)
// ================================================================
function renderCompletedWorkouts(client) {
    const container = document.getElementById('reportsContent');
    if (!container) return;

    // 1. Активная карточка отчёта — всегда наверху
    let html = buildAdminReportActiveCard(client);

    // 2. Единый список: сохранённые отчёты + выполненные тренировки, по дате
    const items = buildMergedFeed(client);

    const sortLabel = feedSortOldestFirst ? '↑ Сначала старые' : '↓ Сначала новые';
    const hintText = feedSortOldestFirst
        ? 'Отчёты тренера и выполненные тренировки. Старые — сверху.'
        : 'Отчёты тренера и выполненные тренировки. Новые — сверху.';

    html += '<div class="completed-workouts-section">' +
        '<div class="completed-workouts-header">' +
            '<div class="completed-workouts-header-text">' +
                '<h3>Лента</h3>' +
                '<p class="hint">' + hintText + '</p>' +
            '</div>' +
            '<div class="completed-workouts-header-actions">' +
                '<button type="button" class="secondary" id="sortFeedBtn">' + sortLabel + '</button>' +
                '<button type="button" class="secondary" id="toggleAllWorkoutsBtn">Развернуть все</button>' +
            '</div>' +
        '</div>';

    if (items.length === 0) {
        html += '<div class="completed-workouts-empty">' +
            'Пока ничего нет. Как только появятся отчёты или тренировки с обратной связью — они появятся здесь.' +
        '</div>';
        html += '</div>';
        container.insertAdjacentHTML('beforeend', html);
        return;
    }

    // Пагинация
    const shown = Math.min(completedWorkoutsShown, items.length);
    const visible = items.slice(0, shown);

    html += '<div class="completed-workouts-list">';
    visible.forEach(function(item, idx) {
        if (item.kind === 'report') {
            html += buildSavedAdminReportCard(item.report);
        } else {
            html += buildCompletedWorkoutCard(item, idx);
        }
    });
    html += '</div>';

    if (items.length > shown) {
        const remaining = items.length - shown;
        html += '<div class="completed-workouts-more">' +
            '<button type="button" class="secondary" id="showMoreCompletedBtn">' +
                'Показать ещё ' + Math.min(COMPLETED_WORKOUTS_PAGE_SIZE, remaining) +
                ' из ' + remaining +
            '</button>' +
        '</div>';
    }

    html += '</div>';

    container.insertAdjacentHTML('beforeend', html);

    // Кнопка "Показать ещё"
    const moreBtn = document.getElementById('showMoreCompletedBtn');
    if (moreBtn) {
        moreBtn.addEventListener('click', function() {
            completedWorkoutsShown += COMPLETED_WORKOUTS_PAGE_SIZE;
            renderReportTable(client);
        });
    }

    // Кнопка "Развернуть все / Свернуть все"
    const toggleAllBtn = document.getElementById('toggleAllWorkoutsBtn');
    if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', function() {
            toggleAllWorkouts();
        });
    }

    // Кнопка "Сортировка"
    const sortBtn = document.getElementById('sortFeedBtn');
    if (sortBtn) {
        sortBtn.addEventListener('click', function() {
            toggleFeedSort();
        });
    }

    attachCompletedWorkoutHandlers();
}

// ================================================================
//   СБОРКА ЕДИНОЙ ЛЕНТЫ (отчёты + тренировки, по дате)
// ================================================================
function buildMergedFeed(client) {
    ensureAdminReports(client);

    const items = [];

    // Сохранённые отчёты тренера — сортируем по точному времени создания
    client.adminReports.forEach(function(r) {
        if (editingAdminReportId && r.id === editingAdminReportId) return;

        items.push({
            kind: 'report',
            report: r,
            sortDate: r.createdAt || ''
        });
    });

    // Выполненные тренировки — сортируем по дате (начало дня).
    // Тогда отчёт, написанный позже в тот же день, встанет ВЫШЕ тренировки.
    const workouts = getClientCompletedWorkouts(client);
    workouts.forEach(function(w) {
        items.push({
            kind: 'workout',
            dateKey: w.dateKey,
            workout: w.workout,
            feedback: w.feedback,
            sortDate: w.dateKey + 'T00:00:00.000Z'
        });
    });

    // Сортировка: новые сверху (или старые сверху, если переключено)
    items.sort(function(a, b) {
        const da = a.sortDate || '';
        const db = b.sortDate || '';
        if (da < db) return feedSortOldestFirst ? -1 : 1;
        if (da > db) return feedSortOldestFirst ? 1 : -1;
        return 0;
    });

    return items;
}

// ================================================================
//   КАРТОЧКА СОХРАНЁННОГО ОТЧЁТА
// ================================================================
function buildSavedAdminReportCard(r) {
    const dateLabel = r.createdAt ? formatCreatedAt(r.createdAt) : '—';
    const fullText = r.text || '';
    const preview = fullText.length > 140
        ? fullText.slice(0, 140).trim() + '…'
        : fullText;

    return '<div class="admin-report-saved" data-report-id="' + esc(r.id) + '">' +
        '<div class="admin-report-saved-header">' +
            '<div class="admin-report-saved-title">Отчёт</div>' +
            '<div class="admin-report-saved-date" ' +
                'data-action="edit-report-date" ' +
                'data-report-id="' + esc(r.id) + '" ' +
                'title="Нажмите, чтобы изменить дату">' +
                esc(dateLabel) +
                '<span class="admin-report-date-edit-icon"> ✎</span>' +
            '</div>' +
        '</div>' +
        '<div class="admin-report-body" data-report-id="' + esc(r.id) + '" data-expanded="0">' +
            '<div class="admin-report-body-preview">' + esc(preview) + '</div>' +
            '<div class="admin-report-body-full hidden">' + esc(fullText) + '</div>' +
        '</div>' +
        '<div class="admin-report-saved-actions">' +
            '<button type="button" class="secondary" data-action="edit-report" data-report-id="' + esc(r.id) + '">Редактировать</button>' +
            '<button type="button" class="danger" data-action="delete-report" data-report-id="' + esc(r.id) + '">Удалить</button>' +
        '</div>' +
    '</div>';
}

// ================================================================
//   КАРТОЧКА ОДНОЙ ТРЕНИРОВКИ (свёрнутая шапка)
// ================================================================
function buildCompletedWorkoutCard(item, idx) {
    const w = item.workout;
    const dateLabel = formatDateLabel(item.dateKey);
    const name = (w.name && w.name.trim()) ? w.name : 'Тренировка без названия';

    // Оценка сложности
    const diff = item.feedback && item.feedback.difficulty;
    const diffHtml = diff
        ? '<span class="completed-workout-difficulty">Сложность: ' + esc(diff) + '</span>'
        : '';

    // Подсчёт упражнений по блокам
    const blocks = w.blocks || {};
    const warmupCount     = (blocks.warmup || []).length;
    const speedCount      = (blocks.speed || []).length;
    const strengthCount   = (blocks.strength || []).length;
    const conditioningCount = (blocks.conditioning || []).length;

    let statsHtml = '';
    statsHtml += buildCompletedStat('Разминка', warmupCount);
    statsHtml += buildCompletedStat('Скоростно-силовой', speedCount);
    statsHtml += buildCompletedStat('Силовая', strengthCount);
    statsHtml += buildCompletedStat('Кондиции', conditioningCount);

    // Уникальный id для связи шапки и содержимого
    const uid = 'cw-' + idx + '-' + item.dateKey + '-' + (w.id || '');

    return '<div class="completed-workout-card" data-uid="' + esc(uid) + '">' +
        '<div class="completed-workout-card-header">' +
            '<div class="completed-workout-title-block">' +
                '<h4>' + esc(name) + '</h4>' +
                '<div class="completed-workout-meta">' +
                    '<span class="completed-workout-date">' + esc(dateLabel) + '</span>' +
                    diffHtml +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="completed-workout-stats">' + statsHtml + '</div>' +
        '<button type="button" class="template-toggle-btn completed-workout-toggle" data-uid="' + esc(uid) + '">' +
            '<span class="toggle-arrow">▸</span> Показать содержимое' +
        '</button>' +
                '<div class="completed-workout-content hidden" id="cwContent-' + esc(uid) + '">' +
            buildCompletedWorkoutContent(w) +
        '</div>' +
    '</div>';
}

// Строка статистики в шапке карточки (по аналогии с buildStatItem у шаблонов)
function buildCompletedStat(label, count) {
    const emptyClass = count === 0 ? ' empty' : '';
    const display = count === 0 ? '—' : count;

    return '<span class="template-stat">' +
        '<span class="stat-label">' + esc(label) + ':</span> ' +
        '<span class="stat-value' + emptyClass + '">' + display + '</span>' +
    '</span>';
}

// ================================================================
//   ОБРАБОТЧИКИ АРХИВА
// ================================================================
// Пока — заглушки (содержимое в Шаге 6.3).
function attachCompletedWorkoutHandlers() {
    const container = document.getElementById('reportsContent');
    if (!container) return;

    container.querySelectorAll('.completed-workout-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const uid = btn.dataset.uid;
            const content = document.getElementById('cwContent-' + uid);
            if (!content) return;

            const arrow = btn.querySelector('.toggle-arrow');
            const isHidden = content.classList.contains('hidden');

            if (isHidden) {
                content.classList.remove('hidden');
                if (arrow) arrow.textContent = '▾';
                btn.innerHTML = '<span class="toggle-arrow">▾</span> Скрыть содержимое';
            } else {
                content.classList.add('hidden');
                if (arrow) arrow.textContent = '▸';
                btn.innerHTML = '<span class="toggle-arrow">▸</span> Показать содержимое';
            }
        });
    });
}

// ================================================================
//   СОДЕРЖИМОЕ КАРТОЧКИ: 4 БЛОКА С УПРАЖНЕНИЯМИ
// ================================================================
// Использует BLOCKS из app-1-core.js (глобальная константа).
function buildCompletedWorkoutContent(workout) {
    const blocks = workout.blocks || {};

    let html = '';

    // Пробегаем по всем 4 блокам (Разминка, Скоростно-силовой, Силовая, Кондиции)
    Object.keys(BLOCKS).forEach(function(blockKey) {
        const block = BLOCKS[blockKey];
        const exercises = blocks[blockKey] || [];

        html += '<div class="template-block">' +
            '<div class="template-block-title">' + esc(block.title) + '</div>';

        if (exercises.length === 0) {
            html += '<p class="no-exercises">Нет упражнений</p>';
        } else {
                     html += '<div class="table-scroll report-scroll">' +
                '<table class="completed-workout-table">' +
                    '<colgroup>' +
                        '<col style="width: 70px;">' +
                        '<col style="width: 50px;">' +
                        '<col style="width: 220px;">' +
                        '<col style="width: 70px;">' +
                        '<col style="width: 70px;">' +
                        '<col style="width: 90px;">' +
                        '<col style="width: 70px;">' +
                        '<col style="width: 180px;">' +
                        '<col style="width: 220px;">' +
                    '</colgroup>' +
                    '<thead><tr>' +
                        '<th>Группа</th>' +
                        '<th>№</th>' +
                        '<th>Название</th>' +
                        '<th>Темп</th>' +
                        '<th>Вес</th>' +
                        '<th>Подходы</th>' +
                        '<th>Отдых</th>' +
                        '<th>Комментарий</th>' +
                        '<th>Отчёт</th>' +
                    '</tr></thead>' +
                    '<tbody>' +
                        exercises.map(buildCompletedExerciseRow).join('') +
                    '</tbody>' +
                '</table>' +
            '</div>';
        }

        html += '</div>';
    });

    return html;
}

// Одна строка таблицы упражнений
function buildCompletedExerciseRow(ex) {
    return '<tr>' +
        '<td class="cell-group">' + (ex.group ? esc(ex.group) : '—') + '</td>' +
        '<td class="cell-num">' + (ex.num ? esc(ex.num) : '—') + '</td>' +
        '<td class="cell-name" style="cursor:default; text-decoration:none;">' + esc(ex.name || '—') + '</td>' +
        '<td>' + (ex.tempo ? esc(ex.tempo) : '—') + '</td>' +
        '<td>' + (ex.intensity ? esc(ex.intensity) : '—') + '</td>' +
        '<td>' + (ex.sets ? esc(ex.sets) : '—') + '</td>' +
        '<td>' + (ex.rest ? esc(ex.rest) : '—') + '</td>' +
        '<td class="cell-comment">' + (ex.comment ? esc(ex.comment) : '—') + '</td>' +
        '<td class="cell-report">' +
            (ex.report
                ? '<div class="report-preview">' + esc(ex.report) + '</div>'
                : '<span class="cell-empty">—</span>') +
        '</td>' +
    '</tr>';
}

// ================================================================
//   ОТЧЁТЫ ТРЕНЕРА (adminReports)
// ================================================================
// Хранилище: user.adminReports = [{ id, text, createdAt }, ...]
// Сортировка: новые сверху по createdAt.
// Одна активная карточка в любой момент.

// Редактируемый сейчас отчёт (id). null — значит активная карточка пустая (новая).
let editingAdminReportId = null;

// Сбросить режим редактирования (при смене клиента)
function resetAdminReportEditing() {
    editingAdminReportId = null;
}

// Убедиться, что массив adminReports есть
function ensureAdminReports(user) {
    if (!Array.isArray(user.adminReports)) user.adminReports = [];
    return user.adminReports;
}

// Активная карточка отчёта (сверху)
function buildAdminReportActiveCard(client) {
    ensureAdminReports(client);

    // Если редактируем существующий — берём его текст
    let text = '';
    let isEditing = false;
    if (editingAdminReportId) {
        const found = client.adminReports.find(function(r) { return r.id === editingAdminReportId; });
        if (found) {
            text = found.text || '';
            isEditing = true;
        } else {
            // Если не нашли — сбрасываем режим
            editingAdminReportId = null;
        }
    }

    let html = '<div class="admin-report-active" data-editing="' + (isEditing ? '1' : '0') + '">' +
        '<div class="admin-report-active-header">' +
            '<h3>' + (isEditing ? 'Редактировать отчёт' : 'Новый отчёт') + '</h3>' +
        '</div>' +
        '<label class="admin-report-active-label">' +
            '<span>Ваш отчёт</span>' +
            '<textarea id="adminReportText" rows="6" placeholder="Напишите отчёт по тренировкам клиента...">' +
                esc(text) +
            '</textarea>' +
        '</label>' +
        '<div class="admin-report-active-actions">';

    if (isEditing) {
        html += '<button type="button" class="secondary" id="adminReportCancelBtn">Отмена</button>';
    }

    html += '<button type="button" id="adminReportSaveBtn">Сохранить</button>' +
        '</div>' +
    '</div>';

    return html;
}

// ================================================================
//   СОХРАНЕНИЕ / РЕДАКТИРОВАНИЕ / УДАЛЕНИЕ ОТЧЁТОВ
// ================================================================

// Сохранить (новый или существующий)
function saveAdminReport() {
    const client = findUserById(currentReportsClientId);
    if (!client || client.role !== 'client') return;

    ensureAdminReports(client);

    const textarea = document.getElementById('adminReportText');
    if (!textarea) return;

    const text = textarea.value.trim();
    if (!text) {
        showAlert('Введите текст отчёта');
        return;
    }

    if (editingAdminReportId) {
        // Редактируем существующий — createdAt НЕ меняем
        const found = client.adminReports.find(function(r) { return r.id === editingAdminReportId; });
        if (found) {
            found.text = text;
            // createdAt не трогаем
        }
        editingAdminReportId = null;
    } else {
        // Новый отчёт
        client.adminReports.push({
            id: uuid(),
            text: text,
            createdAt: new Date().toISOString()
        });
    }

    saveUsersData();

    // Запоминаем id только что сохранённого отчёта, чтобы подсветить его в ленте
    const savedReportId = editingAdminReportId
        ? editingAdminReportId
        : client.adminReports[client.adminReports.length - 1].id;

    // Сбрасываем режим редактирования
    editingAdminReportId = null;

    // Перерисовываем всё — активная карточка снова пустая, отчёт ушёл вниз
    renderReportTable(client);

    // Подсвечиваем сохранённый отчёт в ленте
    highlightAdminReport(savedReportId);

    // Подсвечиваем активную карточку (чтобы глаз заметил «новая пустая»)
    highlightActiveReportCard();
}

// Подсветить сохранённый отчёт в ленте (зелёная вспышка)
function highlightAdminReport(reportId) {
    setTimeout(function() {
        const el = document.querySelector('.admin-report-saved[data-report-id="' + reportId + '"]');
        if (!el) return;

        el.classList.add('admin-report-just-saved');
        setTimeout(function() {
            el.classList.remove('admin-report-just-saved');
        }, 1600);
    }, 50);
}

// Подсветить активную карточку (пульсация, что она «обновилась»)
function highlightActiveReportCard() {
    setTimeout(function() {
        const el = document.querySelector('.admin-report-active');
        if (!el) return;

        el.classList.add('admin-report-active-flash');
        setTimeout(function() {
            el.classList.remove('admin-report-active-flash');
        }, 900);
    }, 50);
}

// Отменить редактирование
function cancelAdminReportEdit() {
    editingAdminReportId = null;
    const client = findUserById(currentReportsClientId);
    if (client) renderReportTable(client);
}

// Начать редактирование отчёта
function editAdminReport(reportId) {
    editingAdminReportId = reportId;
    const client = findUserById(currentReportsClientId);
    if (client) renderReportTable(client);

    // Прокрутить наверх, чтобы админ увидел активную карточку
    const activeCard = document.querySelector('.admin-report-active');
    if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Удалить отчёт
function deleteAdminReport(reportId) {
    const client = findUserById(currentReportsClientId);
    if (!client || client.role !== 'client') return;

    ensureAdminReports(client);

    client.adminReports = client.adminReports.filter(function(r) {
        return r.id !== reportId;
    });

    // Если удаляем тот, что сейчас редактируется — сбрасываем режим
    if (editingAdminReportId === reportId) editingAdminReportId = null;

    saveUsersData();
    renderReportTable(client);
}

// Навешивание обработчиков (один раз на контейнер, делегирование)
function attachAdminReportHandlers() {
    const container = document.getElementById('reportsContent');
    if (!container) return;

    container.addEventListener('click', function(e) {
                // Клик по дате отчёта — открыть модалку редактирования
        const dateEl = e.target.closest('[data-action="edit-report-date"]');
        if (dateEl) {
            e.stopPropagation();
            const reportId = dateEl.dataset.reportId;
            if (reportId) {
                openEditReportDateModal(reportId);
            }
            return;
        }

        // Раскрытие / сворачивание сохранённого отчёта — клик по превью/тексту
        const body = e.target.closest('.admin-report-body');
        if (body && !e.target.closest('button')) {
            const previewEl = body.querySelector('.admin-report-body-preview');
            const fullEl = body.querySelector('.admin-report-body-full');
            if (!previewEl || !fullEl) return;

            const isExpanded = body.dataset.expanded === '1';

            if (isExpanded) {
                // Свернуть
                previewEl.classList.remove('hidden');
                fullEl.classList.add('hidden');
                body.dataset.expanded = '0';
                body.classList.remove('expanded');
            } else {
                // Раскрыть
                previewEl.classList.add('hidden');
                fullEl.classList.remove('hidden');
                body.dataset.expanded = '1';
                body.classList.add('expanded');
            }
            return;
        }

        const saveBtn = e.target.closest('#adminReportSaveBtn');
        if (saveBtn) { saveAdminReport(); return; }

        const cancelBtn = e.target.closest('#adminReportCancelBtn');
        if (cancelBtn) { cancelAdminReportEdit(); return; }

        const editBtn = e.target.closest('button[data-action="edit-report"]');
        if (editBtn) { editAdminReport(editBtn.dataset.reportId); return; }

        const delBtn = e.target.closest('button[data-action="delete-report"]');
        if (delBtn) {
            const id = delBtn.dataset.reportId;
            showConfirm('Удалить отчёт?', 'Отчёт тренера будет удалён без возможности восстановления.', 'Да, удалить')
                .then(function(ok) {
                    if (ok) deleteAdminReport(id);
                });
            return;
        }
    });
}
// ================================================================
//   РАЗВЕРНУТЬ / СВЕРНУТЬ ВСЕ ТРЕНИРОВКИ
// ================================================================
function toggleAllWorkouts() {
    const btn = document.getElementById('toggleAllWorkoutsBtn');
    const cards = document.querySelectorAll('.completed-workout-card');

    if (!cards.length) return;

    // Проверяем: сейчас раскрыты все? Если да — сворачиваем. Иначе — раскрываем.
    const allExpanded = Array.from(cards).every(function(card) {
        const content = card.querySelector('.completed-workout-content');
        return content && !content.classList.contains('hidden');
    });

    cards.forEach(function(card) {
        const content = card.querySelector('.completed-workout-content');
        const toggleBtn = card.querySelector('.completed-workout-toggle');
        if (!content || !toggleBtn) return;

        if (allExpanded) {
            // Сворачиваем
            content.classList.add('hidden');
            toggleBtn.innerHTML = '<span class="toggle-arrow">▸</span> Показать содержимое';
        } else {
            // Разворачиваем
            content.classList.remove('hidden');
            toggleBtn.innerHTML = '<span class="toggle-arrow">▾</span> Скрыть содержимое';
        }
    });

    // Обновляем надпись на кнопке
    if (btn) {
        btn.textContent = allExpanded ? 'Развернуть все' : 'Свернуть все';
    }
}
// ================================================================
//   СОРТИРОВКА ЛЕНТЫ: новые сверху / старые сверху
// ================================================================
// false — новые сверху (по умолчанию). true — старые сверху.
let feedSortOldestFirst = false;

function toggleFeedSort() {
    feedSortOldestFirst = !feedSortOldestFirst;
    const client = findUserById(currentReportsClientId);
    if (client) renderReportTable(client);
}
// ================================================================
//   РЕДАКТИРОВАНИЕ ДАТЫ ОТЧЁТА
// ================================================================
let editingReportDateId = null;
let editingReportDateSnapshot = '';

// Открыть модалку редактирования даты
function openEditReportDateModal(reportId) {
    const client = findUserById(currentReportsClientId);
    if (!client || client.role !== 'client') return;

    ensureAdminReports(client);

    const report = client.adminReports.find(function(r) { return r.id === reportId; });
    if (!report) {
        showAlert('Отчёт не найден');
        return;
    }

    editingReportDateId = reportId;

    // Переводим ISO в YYYY-MM-DD для input[type=date]
    let dateValue = '';
    if (report.createdAt) {
        const d = new Date(report.createdAt);
        if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            dateValue = y + '-' + m + '-' + day;
        }
    }

    const input = document.getElementById('editReportDateInput');
    input.value = dateValue;
    editingReportDateSnapshot = dateValue;

    document.getElementById('editReportDateModal').classList.remove('hidden');

    setTimeout(function() {
        input.focus();
    }, 50);
}

// Закрыть модалку
function closeEditReportDateModal() {
    document.getElementById('editReportDateModal').classList.add('hidden');
    editingReportDateId = null;
    editingReportDateSnapshot = '';
}

// Сохранить новую дату
function saveEditReportDate() {
    if (!editingReportDateId) return;

    const client = findUserById(currentReportsClientId);
    if (!client || client.role !== 'client') return;

    ensureAdminReports(client);

    const report = client.adminReports.find(function(r) { return r.id === editingReportDateId; });
    if (!report) {
        showAlert('Отчёт не найден');
        closeEditReportDateModal();
        return;
    }

    const input = document.getElementById('editReportDateInput');
    const value = input.value.trim();

    if (!value) {
        showAlert('Введите дату');
        return;
    }

    // Сохраняем в ISO. Время — 12:00, чтобы дата не "съезжала" при таймзонах.
    const newDate = new Date(value + 'T12:00:00');
    if (isNaN(newDate.getTime())) {
        showAlert('Некорректная дата');
        return;
    }

    report.createdAt = newDate.toISOString();

    saveUsersData();
    closeEditReportDateModal();

    // Перерисовываем — отчёт пересортируется
    renderReportTable(client);
}

// Обработчики модалки
document.getElementById('editReportDateForm').addEventListener('submit', function(e) {
    e.preventDefault();
    saveEditReportDate();
});

document.getElementById('cancelEditReportDate').addEventListener('click', function() {
    closeEditReportDateModal();
});

attachBackdropClose(document.getElementById('editReportDateModal'), closeEditReportDateModal);
attachEscClose(document.getElementById('editReportDateModal'), closeEditReportDateModal);

// Экспорт для возможных вызовов из консоли/других файлов
window.renderReportsPage = renderReportsPage;
window.selectReportsClient = selectReportsClient;
window.getClientCompletedWorkouts = getClientCompletedWorkouts;
window.resetCompletedWorkoutsPagination = resetCompletedWorkoutsPagination;
window.renderCompletedWorkouts = renderCompletedWorkouts;
window.buildCompletedWorkoutContent = buildCompletedWorkoutContent;
window.saveAdminReport = saveAdminReport;
window.editAdminReport = editAdminReport;
window.deleteAdminReport = deleteAdminReport;
