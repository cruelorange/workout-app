// ================================================================
//   СОХРАНЕНИЕ ТРЕНИРОВКИ КАК ШАБЛОН
// ================================================================

// Найти тренировку в текущем календаре
function findWorkoutInCalendar(workoutId) {
    const list = dataByDate[selectedDate] || [];
    return list.find(function(w) { return w.id === workoutId; }) || null;
}

// Найти активного клиента (для impersonation)
function getActiveClientForTemplates() {
    const me = getCurrentUser();
    if (!me) return null;

    // Если админ в impersonation — берём клиента
    const impersonatedId = sessionStorage.getItem(IMPERSONATION_KEY);
    if (impersonatedId && me.role === 'admin') {
        const client = findUserById(impersonatedId);
        if (client && client.role === 'client') return client;
    }

    // Если клиент сам — берём себя
    if (me.role === 'client') return findUserById(me.id);

    return null;
}

// Сохранить тренировку как шаблон клиента
window.saveWorkoutAsTemplate = function(workoutId) {
    const me = getCurrentUser();
    if (!me) return;

    // Доступно только админу
    if (me.role !== 'admin') {
        showAlert('Сохранять шаблоны может только администратор');
        return;
    }

    // Найти клиента, которому сохраняем
    const client = getActiveClientForTemplates();
    if (!client) {
        showAlert('Сначала откройте календарь клиента: Клиенты → Тренировки');
        return;
    }

    // Найти тренировку
    const workout = findWorkoutInCalendar(workoutId);
    if (!workout) {
        showAlert('Тренировка не найдена');
        return;
    }

    const templateName = workout.name;

    // Ищем существующий шаблон с таким именем
    if (!client.templates) client.templates = [];

    const existing = client.templates.find(function(t) {
        return t.name === templateName;
    });

    if (existing) {
        // Дубль — показать модалку выбора
        openTemplateDupModal(client, workout, existing);
        return;
    }

    // Нет дубля — сохраняем сразу
    createTemplateFromWorkout(client, workout);
    showTemplateSavedMessage(workout.name);
};

// Создать шаблон из тренировки (с новым id)
function createTemplateFromWorkout(client, workout) {
    if (!client.templates) client.templates = [];

    // Глубокая копия тренировки
    const copied = JSON.parse(JSON.stringify(workout));

    const template = {
        id: uuid(),
        name: workout.name,
        blocks: copied.blocks || { warmup: [], speed: [], strength: [], conditioning: [] },
        hiddenBlocks: copied.hiddenBlocks || [],
        createdAt: new Date().toISOString()
    };

    client.templates.push(template);
    saveUsersData();
}

// Перезаписать существующий шаблон
function overwriteTemplate(client, existingTemplate, workout) {
    const copied = JSON.parse(JSON.stringify(workout));

    existingTemplate.name = workout.name;
    existingTemplate.blocks = copied.blocks || { warmup: [], speed: [], strength: [], conditioning: [] };
    existingTemplate.hiddenBlocks = copied.hiddenBlocks || [];
    existingTemplate.updatedAt = new Date().toISOString();

    saveUsersData();
}

// Показать короткое подтверждение сохранения
function showTemplateSavedMessage(name) {
    // Если сейчас открыта страница «Шаблоны» — перерисуем
    if (typeof currentTemplatesClientId !== 'undefined' && currentTemplatesClientId) {
        const tplPage = document.getElementById('page-templates');
        if (tplPage && !tplPage.classList.contains('hidden')) {
            if (typeof renderTemplatesPage === 'function') renderTemplatesPage();
        }
    }

    // Показываем alert
    showAlert('Шаблон «' + name + '» сохранён');
}

// ================================================================
//   ЧАСТЬ 2: ТРЕНИРОВКИ И МОДАЛКА УПРАЖНЕНИЯ В ТРЕНИРОВКЕ
// ================================================================

// ===== Отрисовка тренировок выбранной даты =====
function renderSelectedDate() {
    selectedDateLabel.textContent = 'Тренировки за ' + formatDateLabel(selectedDate);
        // Для клиента — проверить, надо ли показать инструкцию при первом входе
    if (typeof maybeShowInstruction === 'function') {
        maybeShowInstruction();
    }
      // === РЕЖИМ «МОЙ КАЛЕНДАРЬ» АДМИНА ===
    // Показываем сводку по клиентам вместо тренировок
    if (typeof isAdminInOwnCalendar === 'function' && isAdminInOwnCalendar()) {
        renderAdminDaySummary();
        return;
    }

    // Определяем, клиент ли сейчас смотрит (а не админ в impersonation)
    const me = getCurrentUser();
    const isClient = me && me.role === 'client';

    // Обновляем заголовок и в клиентском режиме
    if (typeof updateClientDateHeader === 'function') {
        updateClientDateHeader();
    }

    const workouts = dataByDate[selectedDate] || [];
    const isDayOff = dataByDate[selectedDate + '_dayOff'] === true;
    workoutsList.innerHTML = '';

    // Обновляем кнопку "Пометить / Убрать выходной"
    updateDayOffButton(isDayOff);

    // Выходной день
    if (isDayOff) {
        workoutsList.innerHTML = '<div class="day-off-message">Выходной</div>';
        renderDayFeedback();
        return;
    }

        // Пустой день
    if (workouts.length === 0) {
        const me = getCurrentUser();
        const isClient = me && me.role === 'client';

        const emptyMessage = isClient
            ? 'Ваш тренер ещё не заполнил этот день.'
            : 'Составьте программу на этот день.';

        workoutsList.innerHTML = '<div class="empty-day-message">' + emptyMessage + '</div>';
        renderDayFeedback();
        return;
    }

    workouts.forEach(function(workout) {
        const div = document.createElement('div');
        div.className = 'workout';

        let blocksHtml = '';

        Object.values(BLOCKS).forEach(function(block) {
            const isExpanded  = block.optional && (workout.hiddenBlocks || []).indexOf(block.key) !== -1;
            const isCollapsed = block.optional && !isExpanded;

            const exercises   = (workout.blocks && workout.blocks[block.key]) || [];
            const groupColorMap = buildGroupColorMap(exercises);

            let tableHtml = '';

            if (exercises.length === 0) {
                tableHtml = isCollapsed ? '' : '<p class="no-exercises">Нет упражнений</p>';
            } else {
                const rows = exercises.map(function(ex) {
                    const colorIdx = ex.group && groupColorMap[ex.group] !== undefined
                        ? groupColorMap[ex.group] : '';
                    const colorAttr = colorIdx !== '' ? ' data-group-color="' + colorIdx + '"' : '';

                    return '<tr' + colorAttr + ' draggable="true"' +
    ' data-workout-id="' + workout.id + '"' +
    ' data-block-key="' + block.key + '"' +
    ' data-exercise-id="' + ex.id + '">' +
    '<td class="cell-group" data-label="Группа">' + (ex.group ? esc(ex.group) : empty()) + '</td>' +
    '<td class="cell-num" data-label="№">' + (ex.num ? esc(ex.num) : empty()) + '</td>' +
    '<td class="cell-name" data-label="Упражнение" onclick="showLibraryCard(\'' + ex.id + '\',\'' + workout.id + '\',\'' + block.key + '\')">' + esc(ex.name) + '</td>' +
    '<td data-label="Темп">' + (ex.tempo ? esc(ex.tempo) : empty()) + '</td>' +
    '<td data-label="Вес">' + (ex.intensity ? esc(ex.intensity) : empty()) + '</td>' +
    '<td data-label="Подходы">' + (ex.sets ? esc(ex.sets) : empty()) + '</td>' +
    '<td data-label="Отдых">' + (ex.rest ? esc(ex.rest) : empty()) + '</td>' +
    '<td class="cell-comment" data-label="Комментарий">' + (ex.comment ? esc(ex.comment) : empty()) + '</td>' +
    '<td class="cell-report" data-label="Отчёт" onclick="openReportModal(\'' + workout.id + '\',\'' + block.key + '\',\'' + ex.id + '\')">' +
        (ex.report
            ? '<div class="report-preview">' + esc(ex.report) + '</div>'
            : (isClient
                ? '<span class="report-empty">+ Отчёт</span>'
                : '<span class="cell-empty">—</span>')
        ) +
    '</td>' +
    '<td class="cell-actions">' +
        '<button title="Редактировать" onclick="editExercise(\'' + workout.id + '\',\'' + block.key + '\',\'' + ex.id + '\')">' + icons.pencil(14) + '</button>' +
        '<button class="danger" title="Удалить" onclick="deleteExercise(\'' + workout.id + '\',\'' + block.key + '\',\'' + ex.id + '\')">' + icons.trash(14) + '</button>' +
    '</td>' +
'</tr>';
                }).join('');

              tableHtml = '<div class="table-scroll">' +
    '<table class="exercise-table">' +
        '<thead><tr>' +
            '<th>Группа</th>' +
            '<th>№</th>' +
            '<th>Название упражнения</th>' +
            '<th>Темп</th>' +
            '<th>Интенсивность (вес)</th>' +
            '<th>Подходы / повторения</th>' +
            '<th>Время отдыха</th>' +
            '<th>Комментарий</th>' +
            '<th>Отчёт</th>' +
            '<th>Действия</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
    '</table>' +
'</div>';
            }

            let blockActionsHtml = '';

            if (block.optional) {
                if (isCollapsed) {
                    blockActionsHtml =
                        '<button class="secondary" onclick="toggleBlock(\'' + workout.id + '\',\'' + block.key + '\')">Добавить</button>';
                } else {
                    blockActionsHtml =
                        '<button onclick="openExerciseModal(\'' + workout.id + '\',\'' + block.key + '\')">+ Упражнение</button>' +
                        '<button class="secondary" onclick="toggleBlock(\'' + workout.id + '\',\'' + block.key + '\')">Убрать</button>';
                }
            } else {
                blockActionsHtml =
                    '<button onclick="openExerciseModal(\'' + workout.id + '\',\'' + block.key + '\')">+ Упражнение</button>';
            }

            blocksHtml += '<div class="block ' + (block.optional ? 'optional' : '') + ' ' + (isCollapsed ? 'collapsed-block' : '') + '">' +
                '<div class="block-header">' +
                    '<h4>' + block.title + '</h4>' +
                    '<div class="block-actions">' + blockActionsHtml + '</div>' +
                '</div>' +
                '<div class="block-body">' + tableHtml + '</div>' +
            '</div>';
        });

              div.innerHTML = '<div class="workout-header">' +
    '<h3>' + esc(workout.name) + '</h3>' +
    '<div class="actions">' +
        '<button class="secondary" onclick="openEditWorkoutNameModal(\'' + workout.id + '\')">Редактировать</button>' +
        '<button class="secondary" onclick="saveWorkoutAsTemplate(\'' + workout.id + '\')">Сохранить как шаблон</button>' +
        '<button class="danger" onclick="deleteWorkout(\'' + workout.id + '\')">Удалить тренировку</button>' +
    '</div>' +
'</div>' +
blocksHtml;
        workoutsList.appendChild(div);
    });

    renderDayFeedback();
}
// ================================================================
//   ПРИМЕНЕНИЕ ШАБЛОНА
// ================================================================

// Применить шаблон — вставить тренировку в текущий выбранный день
window.applyTemplate = async function(templateId) {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') {
        showAlert('Применять шаблоны может только администратор');
        return;
    }

    // Нужно быть в календаре клиента
    const impersonatedId = sessionStorage.getItem(IMPERSONATION_KEY);
    if (!impersonatedId) {
        showAlert('Сначала откройте календарь клиента: Клиенты → Тренировки');
        return;
    }

    const client = findUserById(impersonatedId);
    if (!client || client.role !== 'client') {
        showAlert('Клиент не найден');
        return;
    }

    // Ищем шаблон у клиента
    const template = (client.templates || []).find(function(t) {
        return t.id === templateId;
    });
    if (!template) {
        showAlert('Шаблон не найден');
        return;
    }

    // Подтверждение
    const dateLabel = formatDateLabel(selectedDate);
    const ok = await showConfirm(
        'Применить шаблон?',
        'Тренировка «' + template.name + '» будет добавлена в день ' + dateLabel + ' в календарь клиента ' +
        (client.name || client.login) + '.',
        'Да, применить'
    );
    if (!ok) return;

    // Снимаем выходной, если был
    delete dataByDate[selectedDate + '_dayOff'];

    if (!dataByDate[selectedDate]) dataByDate[selectedDate] = [];

    // Глубокая копия тренировки из шаблона
    const copied = JSON.parse(JSON.stringify(template));

    const newWorkout = {
        id: uuid(),
        name: copied.name,
        blocks: copied.blocks || { warmup: [], speed: [], strength: [], conditioning: [] },
        hiddenBlocks: copied.hiddenBlocks || []
    };

    // Генерим новые id упражнениям (чтобы отчёты не смешивались)
    Object.keys(newWorkout.blocks).forEach(function(blockKey) {
        (newWorkout.blocks[blockKey] || []).forEach(function(ex) {
            ex.id = uuid();
            // Отчёт не копируем — новый день, новые отчёты
            delete ex.report;
        });
    });

    dataByDate[selectedDate].push(newWorkout);
    saveWorkoutsData();

    // Переходим в календарь
    switchPage('workouts');

    // Обновляем календарь и список тренировок
    renderCalendar();
    renderSelectedDate();

    // Показываем подтверждение
    showAlert('Тренировка «' + template.name + '» добавлена на ' + dateLabel);
};
// ================================================================
//   МОДАЛКА ВЫБОРА ШАБЛОНА (из календаря)
// ================================================================

// Открыть модалку со списком шаблонов клиента
window.openPickTemplateModal = function() {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') {
        showAlert('Доступно только администратору');
        return;
    }

    // Нужно быть в календаре клиента
    const impersonatedId = sessionStorage.getItem(IMPERSONATION_KEY);
    if (!impersonatedId) {
        showAlert('Сначала откройте календарь клиента');
        return;
    }

    const client = findUserById(impersonatedId);
    if (!client || client.role !== 'client') {
        showAlert('Клиент не найден');
        return;
    }

    const templates = client.templates || [];

    // Подзаголовок с именем клиента
    const subtitleEl = document.getElementById('pickTemplateSubtitle');
    if (subtitleEl) {
        subtitleEl.textContent = (client.name || client.login) + ' · ' + formatDateLabel(selectedDate);
    }

    // Список
    const listEl = document.getElementById('pickTemplateList');
    if (!listEl) return;

    if (templates.length === 0) {
        listEl.innerHTML = '<p class="no-exercises">У этого клиента пока нет шаблонов. Сохраните тренировку как шаблон из календаря.</p>';
    } else {
        listEl.innerHTML = templates.map(function(tpl) {
            const blocks = tpl.blocks || {};
            const warmupCount = (blocks.warmup || []).length;
            const speedCount = (blocks.speed || []).length;
            const strengthCount = (blocks.strength || []).length;

            const stats = [];
            if (warmupCount) stats.push('Разминка: ' + warmupCount);
            if (speedCount) stats.push('Скорость: ' + speedCount);
            if (strengthCount) stats.push('Сила: ' + strengthCount);
            const statsText = stats.length ? stats.join(' · ') : 'пустая';

            return '<div class="library-item" data-template-id="' + tpl.id + '">' +
                '<div class="library-item-title">' + esc(tpl.name) + '</div>' +
                '<div class="library-item-meta">' + esc(statsText) + '</div>' +
            '</div>';
        }).join('');

        // Обработчики кликов
        listEl.querySelectorAll('.library-item').forEach(function(el) {
            el.addEventListener('click', function() {
                const templateId = el.dataset.templateId;
                closePickTemplateModal();
                applyTemplateFromCalendar(templateId);
            });
        });
    }

    document.getElementById('pickTemplateModal').classList.remove('hidden');
};

// Закрыть модалку
function closePickTemplateModal() {
    document.getElementById('pickTemplateModal').classList.add('hidden');
}

// Применить шаблон из календаря — без подтверждения (уже выбрали в модалке)
window.applyTemplateFromCalendar = function(templateId) {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') return;

    const impersonatedId = sessionStorage.getItem(IMPERSONATION_KEY);
    if (!impersonatedId) return;

    const client = findUserById(impersonatedId);
    if (!client || client.role !== 'client') return;

    const template = (client.templates || []).find(function(t) {
        return t.id === templateId;
    });
    if (!template) return;

    // Снимаем выходной
    delete dataByDate[selectedDate + '_dayOff'];
    if (!dataByDate[selectedDate]) dataByDate[selectedDate] = [];

    // Копия
    const copied = JSON.parse(JSON.stringify(template));
    const newWorkout = {
        id: uuid(),
        name: copied.name,
        blocks: copied.blocks || { warmup: [], speed: [], strength: [] },
        hiddenBlocks: copied.hiddenBlocks || []
    };

    // Новые id упражнениям, без отчётов
    Object.keys(newWorkout.blocks).forEach(function(blockKey) {
        (newWorkout.blocks[blockKey] || []).forEach(function(ex) {
            ex.id = uuid();
            delete ex.report;
        });
    });

    dataByDate[selectedDate].push(newWorkout);
    saveWorkoutsData();

    renderCalendar();
    renderSelectedDate();

    // Короткий alert
    showAlert('Тренировка «' + template.name + '» добавлена');
};

// Обработчики кнопок модалки
document.addEventListener('DOMContentLoaded', function() {
    const addBtn = document.getElementById('addFromTemplateBtn');
    if (addBtn) {
        addBtn.addEventListener('click', openPickTemplateModal);
    }
    const cancelBtn = document.getElementById('cancelPickTemplate');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closePickTemplateModal);
    }
    const modal = document.getElementById('pickTemplateModal');
    if (modal) {
        attachBackdropClose(modal, closePickTemplateModal);
        attachEscClose(modal, closePickTemplateModal);
    }
});

// На случай если DOM уже загружен
(function() {
    const addBtn = document.getElementById('addFromTemplateBtn');
    if (addBtn) {
        addBtn.addEventListener('click', openPickTemplateModal);
    }
    const cancelBtn = document.getElementById('cancelPickTemplate');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closePickTemplateModal);
    }
    const modal = document.getElementById('pickTemplateModal');
    if (modal) {
        attachBackdropClose(modal, closePickTemplateModal);
        attachEscClose(modal, closePickTemplateModal);
    }
})();
// ================================================================
//   МОДАЛКА ДУБЛЯ ШАБЛОНА
// ================================================================

let pendingTemplateClient = null;
let pendingTemplateWorkout = null;
let pendingTemplateExisting = null;

function openTemplateDupModal(client, workout, existingTemplate) {
    pendingTemplateClient = client;
    pendingTemplateWorkout = workout;
    pendingTemplateExisting = existingTemplate;

    // Текст с названием
    const textEl = document.getElementById('templateDupText');
    if (textEl) {
        textEl.textContent = 'Шаблон «' + workout.name + '» уже существует у клиента ' +
            (client.name || client.login) + '. Что делать?';
    }

    document.getElementById('templateDupModal').classList.remove('hidden');
}

function closeTemplateDupModal() {
    document.getElementById('templateDupModal').classList.add('hidden');
    pendingTemplateClient = null;
    pendingTemplateWorkout = null;
    pendingTemplateExisting = null;
}

// Кнопки модалки
document.getElementById('templateDupOverwrite').addEventListener('click', function() {
    if (!pendingTemplateClient || !pendingTemplateWorkout || !pendingTemplateExisting) {
        closeTemplateDupModal();
        return;
    }

    overwriteTemplate(pendingTemplateClient, pendingTemplateExisting, pendingTemplateWorkout);
    const name = pendingTemplateWorkout.name;

    closeTemplateDupModal();
    showTemplateSavedMessage(name + '» (перезаписан)');
});

document.getElementById('templateDupAddNew').addEventListener('click', function() {
    if (!pendingTemplateClient || !pendingTemplateWorkout) {
        closeTemplateDupModal();
        return;
    }

    createTemplateFromWorkout(pendingTemplateClient, pendingTemplateWorkout);
    const name = pendingTemplateWorkout.name;

    closeTemplateDupModal();
    showTemplateSavedMessage(name + '» (добавлен ещё один)');
});

document.getElementById('templateDupCancel').addEventListener('click', function() {
    closeTemplateDupModal();
});

function buildGroupColorMap(exercises) {
    const map = {};
    let idx = 0;
    exercises.forEach(function(ex) {
        if (ex.group && map[ex.group] === undefined) {
            map[ex.group] = idx % GROUP_COLORS;
            idx++;
        }
    });
    return map;
}

// ===== Создание тренировки =====
document.getElementById('workoutForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const input = document.getElementById('workoutName');
    const name = input.value.trim();
    if (!name) return;

    // Снимаем выходной, если он был
    delete dataByDate[selectedDate + '_dayOff'];

    if (!dataByDate[selectedDate]) dataByDate[selectedDate] = [];
    dataByDate[selectedDate].push({
        id: uuid(),
        name: name,
        blocks: { warmup: [], speed: [], strength: [], conditioning: [] },
        hiddenBlocks: []
    });

    saveWorkoutsData();
    input.value = '';
    renderCalendar();
    renderSelectedDate();
});

// ===== Удаление тренировки =====
window.deleteWorkout = async function(id) {
    if (!await showConfirm('Удалить тренировку?', 'Тренировка будет удалена вместе со всеми упражнениями.', 'Да, удалить')) return;
    dataByDate[selectedDate] = (dataByDate[selectedDate] || []).filter(function(w) { return w.id !== id; });
    saveWorkoutsData();
    renderCalendar();
    renderSelectedDate();
};

// ===== Переключение опционального блока =====
window.toggleBlock = function(workoutId, blockKey) {
    const w = (dataByDate[selectedDate] || []).find(function(x) { return x.id === workoutId; });
    if (!w) return;
    w.hiddenBlocks = w.hiddenBlocks || [];
    const i = w.hiddenBlocks.indexOf(blockKey);
    if (i === -1) w.hiddenBlocks.push(blockKey);
    else w.hiddenBlocks.splice(i, 1);
    saveWorkoutsData();
    renderSelectedDate();
};

// ================================================================
//   ВЫХОДНЫЕ ДНИ
// ================================================================
const toggleDayOffBtn = document.getElementById('toggleDayOffBtn');

function updateDayOffButton(isDayOff) {
    if (isDayOff) {
        toggleDayOffBtn.textContent = 'Убрать выходной';
        toggleDayOffBtn.classList.remove('secondary');
        toggleDayOffBtn.classList.add('danger');
    } else {
        toggleDayOffBtn.textContent = 'Пометить выходным';
        toggleDayOffBtn.classList.add('secondary');
        toggleDayOffBtn.classList.remove('danger');
    }
}

toggleDayOffBtn.addEventListener('click', async function() {
    const isDayOff = dataByDate[selectedDate + '_dayOff'] === true;
    const workouts = dataByDate[selectedDate] || [];

    // Убрать выходной
    if (isDayOff) {
        delete dataByDate[selectedDate + '_dayOff'];
        saveWorkoutsData();
        renderCalendar();
        renderSelectedDate();
        return;
    }

    // Поставить выходной
    if (workouts.length > 0) {
        const ok = await showConfirm(
            'Сделать день выходным?',
            'Все тренировки за этот день будут удалены.',
            'Да, выходной'
        );
        if (!ok) return;

        dataByDate[selectedDate] = [];
    }

    dataByDate[selectedDate + '_dayOff'] = true;
    saveWorkoutsData();
    renderCalendar();
    renderSelectedDate();
});

// ===== Модалка упражнения в тренировке =====
const exerciseModal    = document.getElementById('exerciseModal');
const modalTitle       = document.getElementById('modalTitle');
const exerciseForm     = document.getElementById('exerciseForm');
const cancelExercise   = document.getElementById('cancelExercise');
const libraryPicker    = document.getElementById('libraryPicker');
const libraryList      = document.getElementById('libraryList');
const customForm       = document.getElementById('customForm');
const librarySearch    = document.getElementById('librarySearch');

// Отслеживание изменений в форме
let exerciseFormSnapshot = '';

document.querySelectorAll('.exercise-source-toggle .tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        exerciseSource = btn.dataset.source;
        document.querySelectorAll('.exercise-source-toggle .tab-btn').forEach(function(b) {
            if (b.dataset.source === exerciseSource) b.classList.add('active');
            else b.classList.remove('active');
        });
        if (exerciseSource === 'library') {
            libraryPicker.classList.remove('hidden');
            customForm.classList.add('hidden');
        } else {
            libraryPicker.classList.add('hidden');
            customForm.classList.remove('hidden');
        }
    });
});

// Снимок формы — для отслеживания изменений
function snapshotExerciseForm() {
    const fields = ['fName', 'fNum', 'fTempo', 'fIntensity', 'fSets', 'fRest', 'fGroup', 'fComment'];
    return fields.map(function(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }).join('|');
}

function exerciseFormHasChanges() {
    return snapshotExerciseForm() !== exerciseFormSnapshot;
}

function openExerciseModalInternal(workoutId, blockKey, exerciseId) {
    currentWorkoutId = workoutId;
    currentBlockKey  = blockKey;
    editingExerciseId = exerciseId || null;
    pickedLibraryExercise = null;

    if (editingExerciseId) {
        document.querySelector('.exercise-source-toggle').classList.add('hidden');
        libraryPicker.classList.add('hidden');
        customForm.classList.remove('hidden');

        const w = (dataByDate[selectedDate] || []).find(function(x) { return x.id === workoutId; });
        const ex = w.blocks[blockKey].find(function(e) { return e.id === exerciseId; });

        document.getElementById('fName').value      = ex.name || '';
document.getElementById('fNum').value       = ex.num || '';
document.getElementById('fTempo').value     = ex.tempo || '';
document.getElementById('fIntensity').value = ex.intensity || '';
document.getElementById('fSets').value      = ex.sets || '';
document.getElementById('fRest').value      = ex.rest || '';
document.getElementById('fGroup').value     = ex.group || '';
document.getElementById('fComment').value   = ex.comment || '';
        modalTitle.textContent = 'Редактировать упражнение';
    } else {
        document.querySelector('.exercise-source-toggle').classList.remove('hidden');
        exerciseSource = 'library';
        document.querySelectorAll('.exercise-source-toggle .tab-btn').forEach(function(b) {
            if (b.dataset.source === 'library') b.classList.add('active');
            else b.classList.remove('active');
        });
        libraryPicker.classList.remove('hidden');
        customForm.classList.add('hidden');

        exerciseForm.reset();
        modalTitle.textContent = 'Добавить упражнение';
        renderLibraryPicker();
    }

    exerciseModal.classList.remove('hidden');

    exerciseFormSnapshot = snapshotExerciseForm();
}

function renderLibraryPicker(filter) {
    if (filter === undefined) filter = '';
    const f = filter.trim().toLowerCase();
    const isSearching = f.length > 0;

    // Фильтруем упражнения по поисковой строке
    const items = exercisesLib.filter(function(ex) {
        return !f || ex.name.toLowerCase().indexOf(f) !== -1;
    });

    if (items.length === 0) {
        libraryList.innerHTML = '<p class="no-exercises">Упражнений не найдено. Добавьте в библиотеке или создайте своё.</p>';
        return;
    }

    // Группируем отфильтрованные упражнения по группам
    const groupsMap = {};
    const noGroup = [];

    items.forEach(function(ex) {
        const g = (ex.group || '').trim();
        if (!g) {
            noGroup.push(ex);
        } else {
            if (!groupsMap[g]) groupsMap[g] = [];
            groupsMap[g].push(ex);
        }
    });

    // Сортируем группы по алфавиту
    const sortedGroups = Object.keys(groupsMap).sort(function(a, b) {
        return a.localeCompare(b, 'ru');
    });

    // Строим HTML
    let html = '';

    // Группы с упражнениями
    sortedGroups.forEach(function(groupName) {
        html += buildLibraryGroupHtml(groupName, groupsMap[groupName], isSearching);
    });

    // Упражнения без группы — в конце
    if (noGroup.length > 0) {
        html += buildLibraryGroupHtml('Без группы', noGroup, isSearching);
    }

    libraryList.innerHTML = html;

    // Обработчики: раскрытие/сворачивание групп
    libraryList.querySelectorAll('.library-group-header').forEach(function(header) {
        header.addEventListener('click', function() {
            const group = header.closest('.library-group');
            if (group) group.classList.toggle('open');
        });
    });

    // Обработчики: выбор упражнения
    libraryList.querySelectorAll('.library-item').forEach(function(el) {
        el.addEventListener('click', function() {
            const ex = exercisesLib.find(function(x) { return x.id === el.dataset.id; });
            if (!ex) return;
            pickedLibraryExercise = ex;
            document.getElementById('fName').value = ex.name;

            // Снимаем подсветку со всех
            libraryList.querySelectorAll('.library-item').forEach(function(i) {
                i.classList.remove('selected');
            });
            // Подсвечиваем выбранное
            el.classList.add('selected');
        });
    });

    // Восстанавливаем подсветку, если упражнение уже было выбрано
    if (pickedLibraryExercise) {
        libraryList.querySelectorAll('.library-item').forEach(function(el) {
            if (el.dataset.id === pickedLibraryExercise.id) {
                el.classList.add('selected');
            }
        });
    }
}

// Построить HTML одной группы в аккордеоне
function buildLibraryGroupHtml(groupName, exercises, autoOpen) {
    // Сортируем упражнения по алфавиту
    exercises.sort(function(a, b) {
        return (a.name || '').localeCompare(b.name || '', 'ru');
    });

    const openClass = autoOpen ? ' open' : '';
    const arrow = autoOpen ? '▾' : '▸';

    let itemsHtml = '';
    exercises.forEach(function(ex) {
        const meta = [ex.vector, ex.equipment].filter(Boolean).join(' · ');
        itemsHtml += '<div class="library-item" data-id="' + ex.id + '">' +
            '<div class="library-item-title">' + esc(ex.name) + '</div>' +
            (meta ? '<div class="library-item-meta">' + esc(meta) + '</div>' : '') +
        '</div>';
    });

    return '<div class="library-group' + openClass + '">' +
        '<div class="library-group-header">' +
            '<div class="library-group-title">' +
                '<span class="toggle-arrow">' + arrow + '</span>' +
                esc(groupName) +
            '</div>' +
            '<span class="library-group-count">' + exercises.length + '</span>' +
        '</div>' +
        '<div class="library-group-body">' +
            itemsHtml +
        '</div>' +
    '</div>';
}

librarySearch.addEventListener('input', function() {
    renderLibraryPicker(librarySearch.value);
});

function closeExerciseModal() {
    exerciseModal.classList.add('hidden');
    currentWorkoutId = null;
    currentBlockKey  = null;
    editingExerciseId = null;
    pickedLibraryExercise = null;
    exerciseFormSnapshot = '';
}

cancelExercise.addEventListener('click', async function() {
    if (!await confirmCancel(exerciseFormHasChanges())) return;
    closeExerciseModal();
});

// ===== Сохранение упражнения в тренировке =====
exerciseForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    exerciseFormSnapshot = '';

    const w = (dataByDate[selectedDate] || []).find(function(x) { return x.id === currentWorkoutId; });
    if (!w) { await showAlert('Тренировка не найдена'); return; }
    // Если блока нет — создаём его пустым массивом
if (!w.blocks[currentBlockKey]) {
    w.blocks[currentBlockKey] = [];
}
const list = w.blocks[currentBlockKey];

    let name = '';
    if (exerciseSource === 'custom') {
        name = document.getElementById('fName').value.trim();
        if (!name) { await showAlert('Введите название упражнения'); return; }
    } else if (!editingExerciseId) {
        if (!pickedLibraryExercise) {
            await showAlert('Выберите упражнение из библиотеки или переключитесь на «Своё»');
            return;
        }
        name = pickedLibraryExercise.name;
    }

    let libraryId = null;
    if (pickedLibraryExercise) {
        libraryId = pickedLibraryExercise.id;
    } else if (editingExerciseId) {
        const oldEx = list.find(function(x) { return x.id === editingExerciseId; });
        libraryId = oldEx ? oldEx.libraryId : null;
    }

    const data = {
    name: editingExerciseId ? document.getElementById('fName').value.trim() : name,
    libraryId: libraryId,
    num: document.getElementById('fNum').value.trim(),
    tempo: document.getElementById('fTempo').value.trim(),
    intensity: document.getElementById('fIntensity').value.trim(),
    sets: document.getElementById('fSets').value.trim(),
    rest: document.getElementById('fRest').value.trim(),
    group: document.getElementById('fGroup').value.trim(),
    comment: document.getElementById('fComment').value.trim()
};

    if (editingExerciseId) {
        const ex = list.find(function(x) { return x.id === editingExerciseId; });
        if (ex) Object.assign(ex, data);
    } else {
        const newEx = Object.assign({ id: uuid() }, data);
        list.push(newEx);
    }

    saveWorkoutsData();
    closeExerciseModal();
    renderSelectedDate();
});

// ===== Удаление упражнения из тренировки =====
window.deleteExercise = function(workoutId, blockKey, exerciseId) {
    const w = (dataByDate[selectedDate] || []).find(function(x) { return x.id === workoutId; });
    if (!w) return;
    w.blocks[blockKey] = w.blocks[blockKey].filter(function(e) { return e.id !== exerciseId; });
    saveWorkoutsData();
    renderSelectedDate();
};

// ===== Глобальные обёртки (для onclick в HTML) =====
window.openExerciseModal = function(workoutId, blockKey) {
    openExerciseModalInternal(workoutId, blockKey, null);
};

window.editExercise = function(workoutId, blockKey, exerciseId) {
    openExerciseModalInternal(workoutId, blockKey, exerciseId);
};

// ================================================================
//   МОДАЛКА ОТЧЁТА ПО УПРАЖНЕНИЮ
// ================================================================
const reportModal    = document.getElementById('reportModal');
const reportModalTitle = document.getElementById('reportModalTitle');
const reportForm     = document.getElementById('reportForm');
const reportText     = document.getElementById('reportText');
const cancelReport   = document.getElementById('cancelReport');
const saveReportBtn  = document.getElementById('saveReport');

let reportWorkoutId = null;
let reportBlockKey  = null;
let reportExerciseId = null;
let reportSnapshot  = '';

window.openReportModal = function(workoutId, blockKey, exerciseId) {
    const w = (dataByDate[selectedDate] || []).find(function(x) { return x.id === workoutId; });
    if (!w) return;
    const ex = w.blocks[blockKey].find(function(e) { return e.id === exerciseId; });
    if (!ex) return;

    reportWorkoutId  = workoutId;
    reportBlockKey   = blockKey;
    reportExerciseId = exerciseId;

     const me = getCurrentUser();
    const isClient = me && me.role === 'client';

        reportModalTitle.textContent = ex.name;
    reportText.value = ex.report || '';
    reportSnapshot = reportText.value;

    // Меняем label и placeholder в зависимости от роли
    const reportLabel = document.getElementById('reportLabel');
    if (isClient) {
        reportLabel.textContent = 'Ваш отчёт';
        reportText.placeholder = 'Как прошло выполнение? Вес, самочувствие, заметки...';
    } else {
        reportLabel.textContent = 'Отчёт клиента';
        reportText.placeholder = 'Клиент ещё не оставил отчёт';
    }

       // === РЕЖИМ ПРОСМОТРА для админа ===
    if (!isClient) {
        reportText.setAttribute('readonly', 'readonly');
        reportModal.classList.add('modal-readonly');
        saveReportBtn.classList.add('hidden');
        cancelReport.textContent = 'Закрыть';
    } else {
        reportText.removeAttribute('readonly');
        reportModal.classList.remove('modal-readonly');
        saveReportBtn.classList.remove('hidden');
        cancelReport.textContent = 'Отмена';
    }

    reportModal.classList.remove('hidden');
};

function closeReportModal() {
    reportModal.classList.add('hidden');
    reportWorkoutId  = null;
    reportBlockKey   = null;
    reportExerciseId = null;
    reportSnapshot   = '';
}

cancelReport.addEventListener('click', async function() {
    if (reportText.value !== reportSnapshot) {
        if (!await showConfirm('Отменить изменения?', 'Ваш отчёт не будет сохранён.', 'Да, выйти')) return;
    }
    closeReportModal();
});

reportForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const w = (dataByDate[selectedDate] || []).find(function(x) { return x.id === reportWorkoutId; });
    if (!w) return;
    const ex = w.blocks[reportBlockKey].find(function(e) { return e.id === reportExerciseId; });
    if (!ex) return;

    ex.report = reportText.value.trim();

    saveWorkoutsData();
    closeReportModal();
    renderSelectedDate();
});

// ================================================================
//   ОБРАТНАЯ СВЯЗЬ ПО ТРЕНИРОВОЧНОМУ ДНЮ
// ================================================================
const dayFeedbackSection = document.getElementById('dayFeedbackSection');
const dayFeedbackText    = document.getElementById('dayFeedbackText');
const difficultyButtons  = document.getElementById('difficultyButtons');
const dayFeedbackStatus  = document.getElementById('dayFeedbackStatus');

let currentDifficulty = null;
let savedSnapshot = '';
let saveBtnTimeout = null;

function dayFeedbackSnapshot() {
    return (dayFeedbackText.value.trim() || '') + '|' + (currentDifficulty || '');
}

function updateDayFeedbackStatus() {
    const saved = dataByDate[selectedDate + '_feedback'];
    const current = dayFeedbackSnapshot();
    const savedString = saved
        ? (saved.text || '') + '|' + (saved.difficulty || '')
        : '';

    if (!current || current === '|') {
        dayFeedbackStatus.textContent = '';
        dayFeedbackStatus.className = 'day-feedback-status';
        return;
    }

    if (current === savedString) {
        dayFeedbackStatus.textContent = '✓ Сохранено';
        dayFeedbackStatus.className = 'day-feedback-status saved';
    } else {
        dayFeedbackStatus.textContent = '● Не сохранено';
        dayFeedbackStatus.className = 'day-feedback-status unsaved';
    }
}

// Флаг: находимся ли в режиме редактирования feedback (для клиента)
let feedbackEditMode = false;

function renderDayFeedback() {
    const workouts = dataByDate[selectedDate] || [];
    const isDayOff = dataByDate[selectedDate + '_dayOff'] === true;

    const me = getCurrentUser();
    const isClient = me && me.role === 'client';

    if (isDayOff || workouts.length === 0) {
        dayFeedbackSection.classList.add('hidden');
        return;
    }

    const feedback = dataByDate[selectedDate + '_feedback'] || null;

    if (!isClient && !feedback) {
        dayFeedbackSection.classList.add('hidden');
        return;
    }

    dayFeedbackSection.classList.remove('hidden');

    // Меняем тексты в зависимости от роли
    const titleEl  = document.getElementById('dayFeedbackTitle');
    const hintEl   = document.getElementById('dayFeedbackHint');
    const labelEl  = document.getElementById('dayFeedbackLabel');

    // Собираем кнопки в блоке действий
    const actionsEl = document.querySelector('.day-feedback-actions');

    // === АДМИН: всегда readonly ===
    if (!isClient) {
        dayFeedbackSection.classList.add('readonly-mode');
        dayFeedbackText.setAttribute('readonly', 'readonly');
        difficultyButtons.querySelectorAll('button').forEach(function(btn) {
            btn.disabled = true;
        });

        titleEl.textContent = 'Обратная связь клиента';
        hintEl.textContent = 'Что клиент написал о тренировочном дне.';
        labelEl.textContent = 'Комментарий клиента';
        dayFeedbackText.placeholder = 'Клиент ещё не оставил обратную связь';

        // Кнопок нет
        actionsEl.innerHTML = '';
    }

    // === КЛИЕНТ ===
    else {
        const hasSavedFeedback = feedback && (feedback.text || feedback.difficulty);

        // Кнопки в actions
        let actionsHtml = '';
        if (feedbackEditMode || !hasSavedFeedback) {
            // Режим редактирования (или первый раз — нет сохранённого)
            actionsHtml =
                '<button type="button" id="saveDayFeedback">Сохранить</button>' +
                (hasSavedFeedback ? '<button type="button" class="secondary" id="cancelDayFeedback">Отмена</button>' : '');
        } else {
            // Режим просмотра — сохранено есть
            actionsHtml = '<button type="button" id="editDayFeedback">Редактировать</button>';
        }
        actionsEl.innerHTML = actionsHtml;

        const isEditing = feedbackEditMode || !hasSavedFeedback;

        if (isEditing) {
            dayFeedbackSection.classList.remove('readonly-mode');
            dayFeedbackText.removeAttribute('readonly');
            difficultyButtons.querySelectorAll('button').forEach(function(btn) {
                btn.disabled = false;
            });

            titleEl.textContent = 'Обратная связь по тренировочному дню';
            hintEl.textContent = 'Опишите свои ощущения и оцените сложность дня от 1 до 10.';
            labelEl.textContent = 'Ваши ощущения';
            dayFeedbackText.placeholder = 'Как прошла тренировка? Что было тяжело, что легко?';
        } else {
            dayFeedbackSection.classList.add('readonly-mode');
            dayFeedbackText.setAttribute('readonly', 'readonly');
            difficultyButtons.querySelectorAll('button').forEach(function(btn) {
                btn.disabled = true;
            });

            titleEl.textContent = 'Обратная связь по тренировочному дню';
            hintEl.textContent = 'Ваша сохранённая обратная связь. Нажмите «Редактировать», чтобы изменить.';
            labelEl.textContent = 'Ваши ощущения';
            dayFeedbackText.placeholder = '';
        }

        // Навешиваем обработчики на новые кнопки
        const editBtn = document.getElementById('editDayFeedback');
        const saveBtn = document.getElementById('saveDayFeedback');
        const cancelBtn = document.getElementById('cancelDayFeedback');

        if (editBtn) {
            editBtn.addEventListener('click', function() {
                feedbackEditMode = true;
                renderDayFeedback();
            });
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                saveDayFeedback();
            });
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                feedbackEditMode = false;
                renderDayFeedback();
            });
        }
    }

    dayFeedbackText.value = feedback && feedback.text ? feedback.text : '';
    currentDifficulty = feedback && feedback.difficulty ? feedback.difficulty : null;

    updateDifficultyButtons();
    updateDayFeedbackStatus();
}

function updateDifficultyButtons() {
    difficultyButtons.querySelectorAll('button').forEach(function(btn) {
        const val = parseInt(btn.dataset.value, 10);
        if (val === currentDifficulty) btn.classList.add('active');
        else btn.classList.remove('active');
    });
}

difficultyButtons.addEventListener('click', function(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    currentDifficulty = parseInt(btn.dataset.value, 10);
    updateDifficultyButtons();
    updateDayFeedbackStatus();
});

dayFeedbackText.addEventListener('input', updateDayFeedbackStatus);

// Отдельная функция сохранения (вызывается из динамической кнопки)
async function saveDayFeedback() {
    const text = dayFeedbackText.value.trim();

    if (!text) {
        await showAlert('Пожалуйста, напишите свои ощущения.');
        return;
    }
    if (!currentDifficulty) {
        await showAlert('Пожалуйста, оцените сложность от 1 до 10.');
        return;
    }

    dataByDate[selectedDate + '_feedback'] = {
        text: text,
        difficulty: currentDifficulty,
        updatedAt: new Date().toISOString()
    };

    saveWorkoutsData();

    // Выходим из режима редактирования
    feedbackEditMode = false;

    // Перерисовываем — теперь readonly с кнопкой «Редактировать»
    renderDayFeedback();

    // Временный статус «Сохранено»
    setTimeout(function() {
        const statusEl = document.getElementById('dayFeedbackStatus');
        if (statusEl) {
            statusEl.textContent = '✓ Сохранено';
            statusEl.className = 'day-feedback-status saved';
            setTimeout(function() {
                if (statusEl) {
                    statusEl.textContent = '';
                    statusEl.className = 'day-feedback-status';
                }
            }, 2000);
        }
    }, 50);
}
// ================================================================
//   СВОДКА ПО КЛИЕНТАМ (для админа в «Моём календаре»)
// ================================================================
function renderAdminDaySummary() {
    const clients = getClientsWithWorkoutsOnDate(selectedDate);
    const dateLabel = formatDateLabel(selectedDate);

    // Обновляем заголовок
    selectedDateLabel.textContent = 'Клиенты с тренировками на ' + dateLabel;

    // Скрываем обратную связь и шапку клиента
    if (typeof dayFeedbackSection !== 'undefined' && dayFeedbackSection) {
        dayFeedbackSection.classList.add('hidden');
    }
    const clientHeader = document.getElementById('clientDateHeader');
    if (clientHeader) clientHeader.classList.add('hidden');

    // Если ни у кого нет — заглушка как «выходной»
    if (clients.length === 0) {
        workoutsList.innerHTML = '<div class="day-off-message">В этот день у клиентов нет тренировок</div>';
        return;
    }

    // Собираем HTML
    let html = '<div class="admin-day-summary">';

    clients.forEach(function(item) {
        const client = item.user;
        const workouts = item.workouts;

        const name = client.name || client.login;

        // Список названий тренировок (если больше одной — перечисляем)
        const workoutNames = workouts.map(function(w) {
            return '<span class="admin-day-summary-workout">' + esc(w.name || 'Без названия') + '</span>';
        }).join('');

        html += '<div class="admin-day-summary-item">' +
            '<div class="admin-day-summary-info">' +
                '<div class="admin-day-summary-name">' + esc(name) + '</div>' +
                '<div class="admin-day-summary-workouts">' + workoutNames + '</div>' +
            '</div>' +
            '<button type="button" class="admin-day-summary-btn" ' +
                'onclick="openClientCalendar(\'' + client.id + '\')">Открыть</button>' +
        '</div>';
    });

    html += '</div>';

    workoutsList.innerHTML = html;
}
// ================================================================
//   РЕДАКТИРОВАНИЕ НАЗВАНИЯ ТРЕНИРОВКИ
// ================================================================

let editingWorkoutId = null;
let editingWorkoutSnapshot = '';

// Открыть модалку редактирования названия
window.openEditWorkoutNameModal = function(workoutId) {
    const w = (dataByDate[selectedDate] || []).find(function(x) { return x.id === workoutId; });
    if (!w) {
        showAlert('Тренировка не найдена');
        return;
    }

    editingWorkoutId = workoutId;

    const input = document.getElementById('editWorkoutNameInput');
    input.value = w.name || '';
    editingWorkoutSnapshot = w.name || '';

    document.getElementById('editWorkoutNameModal').classList.remove('hidden');

    // Фокус на поле + выделение текста
    setTimeout(function() {
        input.focus();
        input.select();
    }, 50);
};

// Закрыть модалку
function closeEditWorkoutNameModal() {
    document.getElementById('editWorkoutNameModal').classList.add('hidden');
    editingWorkoutId = null;
    editingWorkoutSnapshot = '';
}

// Обработчик формы
document.getElementById('editWorkoutNameForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!editingWorkoutId) return;

    const input = document.getElementById('editWorkoutNameInput');
    const newName = input.value.trim();

    if (!newName) {
        await showAlert('Введите название тренировки');
        return;
    }

    const w = (dataByDate[selectedDate] || []).find(function(x) { return x.id === editingWorkoutId; });
    if (!w) {
        await showAlert('Тренировка не найдена');
        closeEditWorkoutNameModal();
        return;
    }

    w.name = newName;
    saveWorkoutsData();
    closeEditWorkoutNameModal();
    renderSelectedDate();
});

// Кнопка «Отмена»
document.getElementById('cancelEditWorkoutName').addEventListener('click', async function() {
    const input = document.getElementById('editWorkoutNameInput');
    const currentValue = input.value.trim();

    // Если название изменилось — спросим подтверждение
    if (currentValue !== editingWorkoutSnapshot) {
        const ok = await showConfirm(
            'Отменить изменения?',
            'Новое название не сохранится.',
            'Да, выйти'
        );
        if (!ok) return;
    }

    closeEditWorkoutNameModal();
});
// ================================================================
//   DRAG & DROP УПРАЖНЕНИЙ ВНУТРИ БЛОКА
// ================================================================

let dragSourceExerciseId = null;
let dragSourceWorkoutId = null;
let dragSourceBlockKey = null;

// Один общий обработчик на документ — делегирование событий
document.addEventListener('dragstart', function(e) {
    const tr = e.target.closest('tr[draggable="true"]');
    if (!tr) return;

    dragSourceWorkoutId = tr.dataset.workoutId;
    dragSourceBlockKey  = tr.dataset.blockKey;
    dragSourceExerciseId = tr.dataset.exerciseId;

    tr.classList.add('dragging');

    // Чтобы Firefox начал перетаскивание
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragSourceExerciseId);
});

document.addEventListener('dragend', function(e) {
    const tr = e.target.closest('tr[draggable="true"]');
    if (tr) tr.classList.remove('dragging');

    // Убираем все подсказки
    document.querySelectorAll('.exercise-table tr').forEach(function(row) {
        row.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    dragSourceExerciseId = null;
    dragSourceWorkoutId = null;
    dragSourceBlockKey = null;
});

document.addEventListener('dragover', function(e) {
    const tr = e.target.closest('tr[draggable="true"]');
    if (!tr) return;

    // Разрешаем drop только в том же блоке и той же тренировке
    if (tr.dataset.workoutId !== dragSourceWorkoutId) return;
    if (tr.dataset.blockKey !== dragSourceBlockKey) return;
    if (tr.dataset.exerciseId === dragSourceExerciseId) return;

    // Отменяем дефолт — иначе drop не сработает
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Определяем, сверху или снизу от центра строки находится курсор
    const rect = tr.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const isTopHalf = e.clientY < midpoint;

    // Снимаем старые подсказки
    tr.classList.remove('drag-over-top', 'drag-over-bottom');
    tr.classList.add(isTopHalf ? 'drag-over-top' : 'drag-over-bottom');
});

document.addEventListener('dragleave', function(e) {
    const tr = e.target.closest('tr[draggable="true"]');
    if (!tr) return;
    tr.classList.remove('drag-over-top', 'drag-over-bottom');
});

document.addEventListener('drop', function(e) {
    const tr = e.target.closest('tr[draggable="true"]');
    if (!tr) return;

    // Те же проверки, что и в dragover
    if (tr.dataset.workoutId !== dragSourceWorkoutId) return;
    if (tr.dataset.blockKey !== dragSourceBlockKey) return;
    if (tr.dataset.exerciseId === dragSourceExerciseId) return;

    e.preventDefault();

    const targetExerciseId = tr.dataset.exerciseId;

    // Определяем позицию — до или после целевой строки
    const rect = tr.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const insertBefore = e.clientY < midpoint;

    // Находим тренировку и массив упражнений
    const workout = (dataByDate[selectedDate] || []).find(function(w) {
        return w.id === dragSourceWorkoutId;
    });
    if (!workout) return;

    const list = workout.blocks[dragSourceBlockKey];
    if (!list) return;

    const sourceIdx = list.findIndex(function(ex) {
        return ex.id === dragSourceExerciseId;
    });
    const targetIdx = list.findIndex(function(ex) {
        return ex.id === targetExerciseId;
    });

    if (sourceIdx === -1 || targetIdx === -1) return;

    // Вынимаем упражнение из массива
    const moved = list.splice(sourceIdx, 1)[0];

    // Вычисляем новый индекс для вставки
    let newIdx = targetIdx;
    if (sourceIdx < targetIdx) newIdx--; // сдвиг, потому что мы уже удалили один элемент
    if (!insertBefore) newIdx++;

    // Вставляем
    list.splice(newIdx, 0, moved);

    // Сохраняем и перерисовываем
    saveWorkoutsData();
    renderSelectedDate();

    // Снимаем подсказки
    document.querySelectorAll('.exercise-table tr').forEach(function(row) {
        row.classList.remove('drag-over-top', 'drag-over-bottom');
    });
});
// ================================================================
//   ИНСТРУКЦИЯ ПО ТАБЛИЦЕ (только для клиента)
// ================================================================

// Открыть модалку с инструкцией
function openInstructionModal() {
    const modal = document.getElementById('instructionModal');
    if (!modal) return;
    modal.classList.remove('hidden');
}

// Закрыть модалку + пометить, что инструкция просмотрена
function closeInstructionModal() {
    const modal = document.getElementById('instructionModal');
    if (!modal) return;
    modal.classList.add('hidden');

    // Помечаем, что клиент видел инструкцию
    const me = getCurrentUser();
    if (!me || me.role !== 'client') return;

    const user = findUserById(me.id);
    if (!user) return;

    if (!user.instructionSeen) {
        user.instructionSeen = true;
        saveUsersData();
    }
}

// Проверить и показать инструкцию при первом заходе
function maybeShowInstruction() {
    const me = getCurrentUser();
    if (!me || me.role !== 'client') return;

    const user = findUserById(me.id);
    if (!user) return;

    // Уже видел — не показываем
    if (user.instructionSeen) return;

    // Показываем с небольшой задержкой, чтобы страница успела отрисоваться
    setTimeout(function() {
        openInstructionModal();
    }, 500);
}

// Кнопка «Как читать таблицу»
document.getElementById('openInstructionBtn').addEventListener('click', function() {
    openInstructionModal();
});

// Кнопка «Понятно»
document.getElementById('closeInstructionBtn').addEventListener('click', function() {
    closeInstructionModal();
});