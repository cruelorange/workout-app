// ================================================================
//   ЧАСТЬ 3: БИБЛИОТЕКА УПРАЖНЕНИЙ
// ================================================================
// ================================================================
//   ГРУППЫ УПРАЖНЕНИЙ (создаются автоматически)
// ================================================================
const STORAGE_GROUPS = 'exercise_groups_v1';

// Загрузить список групп из localStorage
function loadExerciseGroups() {
    return loadJSON(STORAGE_GROUPS, []);
}

// Сохранить список групп
function saveExerciseGroups(groups) {
    saveJSON(STORAGE_GROUPS, groups);
}

// Если группа новая — добавить в список (без дублей, регистр не учитывается)
function registerExerciseGroup(groupName) {
    const name = (groupName || '').trim();
    if (!name) return;

    const groups = loadExerciseGroups();
    const exists = groups.some(function(g) {
        return g.toLowerCase() === name.toLowerCase();
    });

    if (!exists) {
        groups.push(name);
        groups.sort(function(a, b) { return a.localeCompare(b, 'ru'); });
        saveExerciseGroups(groups);
    }
}

// Собрать все группы: сохранённые + те, что уже есть у упражнений
function getAllExerciseGroups() {
    // Единственный источник групп — сами упражнения.
    // Если упражнение удалили — группа исчезает автоматически.
    const fromExercises = exercisesLib
        .map(function(ex) { return (ex.group || '').trim(); })
        .filter(Boolean);

    // Убираем дубли (регистр не учитываем)
    const seen = {};
    const result = [];

    fromExercises.forEach(function(g) {
        const key = g.toLowerCase();
        if (!seen[key]) {
            seen[key] = true;
            result.push(g);
        }
    });

    result.sort(function(a, b) { return a.localeCompare(b, 'ru'); });
    return result;
}

// Обновить содержимое <datalist> в модалке библиотеки
function renderGroupDatalist() {
    const list = document.getElementById('libGroupList');
    if (!list) return;

    const groups = getAllExerciseGroups();
    list.innerHTML = groups.map(function(g) {
        return '<option value="' + esc(g) + '">';
    }).join('');
}

// ===== Просмотр карточки упражнения =====
const libraryViewModal = document.getElementById('libraryViewModal');
const libraryViewTitle = document.getElementById('libraryViewTitle');
const libraryViewBody  = document.getElementById('libraryViewBody');

function buildLibraryViewHtml(libEx) {
    let html = '';

    if (libEx.video) {
        const embed = toEmbedUrl(libEx.video);
        if (embed && /\.(mp4|webm|ogg)(\?.*)?$/i.test(embed)) {
            html += '<video src="' + esc(embed) + '" controls></video>';
        } else if (embed) {
            html += '<iframe src="' + esc(embed) + '" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>';
        }
    }

    if (libEx.photo) {
        html += '<img src="' + esc(libEx.photo) + '" alt="' + esc(libEx.name) + '" onerror="this.style.display=\'none\'">';
    }

    // Дополнительные ссылки
    if (libEx.links) {
        const linkList = libEx.links.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
        if (linkList.length > 0) {
            html += '<div class="extra-links"><strong>Дополнительные ссылки:</strong><ul>';
            linkList.forEach(function(url) {
                html += '<li><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a></li>';
            });
            html += '</ul></div>';
        }
    }

    // Мышцы и инвентарь
    if (libEx.vector || libEx.equipment) {
    html += '<p class="meta">' +
        (libEx.vector ? esc(libEx.vector) : '') +
        (libEx.vector && libEx.equipment ? ' · ' : '') +
        (libEx.equipment ? esc(libEx.equipment) : '') +
    '</p>';
}

    // Порядок выполнения
    if (libEx.order) {
        html += '<p class="description"><strong>Порядок выполнения:</strong><br>' + esc(libEx.order) + '</p>';
    }

    // Технические особенности
    if (libEx.tech) {
        html += '<p class="description"><strong>Технические особенности:</strong><br>' + esc(libEx.tech) + '</p>';
    }

    // Fallback — старое поле "Описание"
    if (!libEx.order && !libEx.tech && libEx.description) {
        html += '<p class="description">' + esc(libEx.description) + '</p>';
    }

    if (!html) html = '<p class="description">Нет данных.</p>';
    return html;
}
window.showLibraryCard = function(exerciseId, workoutId, blockKey) {
    const w = (dataByDate[selectedDate] || []).find(function(x) { return x.id === workoutId; });
    if (!w) return;
    const ex = w.blocks[blockKey].find(function(e) { return e.id === exerciseId; });
    if (!ex) return;

    const libEx = ex.libraryId ? exercisesLib.find(function(x) { return x.id === ex.libraryId; }) : null;

    if (!libEx) {
        libraryViewTitle.textContent = ex.name;
        libraryViewBody.innerHTML =
            '<p class="description">' +
                (ex.libraryId ? 'Это упражнение было удалено из библиотеки.' : 'Кастомное упражнение — нет описания в библиотеке.') +
            '</p>' +
            '<p class="meta">Параметры в тренировке: ' + esc(ex.tempo || '—') + ' · ' + esc(ex.intensity || '—') + ' · ' + esc(ex.sets || '—') + '</p>';
        libraryViewModal.classList.remove('hidden');
        return;
    }

    libraryViewTitle.textContent = libEx.name;
    libraryViewBody.innerHTML = buildLibraryViewHtml(libEx);
    libraryViewModal.classList.remove('hidden');
};

function closeLibraryViewModal() {
    libraryViewModal.classList.add('hidden');
}

document.getElementById('closeLibraryView').addEventListener('click', closeLibraryViewModal);
attachBackdropClose(libraryViewModal, closeLibraryViewModal);
attachEscClose(libraryViewModal, closeLibraryViewModal);

// ===== Страница «Упражнения» (библиотека) =====
function renderLibrary() {
    exercisesListEl.innerHTML = '';

    if (exercisesLib.length === 0) {
        exercisesListEl.innerHTML = '<p class="no-exercises">Библиотека пуста. Добавьте первое упражнение!</p>';
        renderLibraryGroupFilter();
        return;
    }

    // Обновляем выпадающий фильтр
    renderLibraryGroupFilter();

    // Получаем активный фильтр
    const filterSelect = document.getElementById('libraryGroupFilter');
    const activeFilter = filterSelect ? filterSelect.value : '';

    // Группируем упражнения по группам
    const groupsMap = {};
    const noGroup = [];

    exercisesLib.forEach(function(ex) {
        const g = (ex.group || '').trim();
        if (!g) {
            noGroup.push(ex);
        } else {
            if (!groupsMap[g]) groupsMap[g] = [];
            groupsMap[g].push(ex);
        }
    });

    // Сортировка групп по алфавиту
    const sortedGroups = Object.keys(groupsMap).sort(function(a, b) {
        return a.localeCompare(b, 'ru');
    });

    // Рендерим каждую группу
    sortedGroups.forEach(function(groupName) {
        if (activeFilter && activeFilter !== groupName) return;
        renderExerciseGroupSection(groupName, groupsMap[groupName]);
    });

    // Без группы — в конце
    if (noGroup.length > 0 && (!activeFilter || activeFilter === '__no_group__')) {
        renderExerciseGroupSection('Без группы', noGroup, true);
    }
}

// Отрисовать одну секцию-группу
function renderExerciseGroupSection(groupName, exercises, isNoGroup) {
    const section = document.createElement('div');
    section.className = 'exercise-group-section';

    const title = document.createElement('h3');
    title.className = 'exercise-group-title';
    title.innerHTML = esc(groupName) +
        ' <span class="group-count">' + exercises.length + '</span>';
    section.appendChild(title);

    // Сортируем упражнения по алфавиту
    exercises.sort(function(a, b) {
        return (a.name || '').localeCompare(b.name || '', 'ru');
    });

    exercises.forEach(function(ex) {
        section.appendChild(buildExerciseCard(ex));
    });

    exercisesListEl.appendChild(section);
}

// Собрать DOM-элемент карточки упражнения
function buildExerciseCard(ex) {
    const card = document.createElement('div');
    card.className = 'exercise-card';

    let mediaHtml = '';
    if (ex.photo) {
        mediaHtml = '<img src="' + esc(ex.photo) + '" alt="' + esc(ex.name) + '" onerror="this.parentElement.innerHTML=\'Фото не загрузилось\'">';
    } else if (ex.video) {
        mediaHtml = '🎬 Есть видео';
    } else {
        mediaHtml = 'Нет медиа';
    }

    card.innerHTML =
        '<div class="exercise-card-media">' + mediaHtml + '</div>' +
        '<div>' +
            '<h3>' + esc(ex.name) + '</h3>' +
            '<div class="meta">' +
                (ex.vector ? '<span>' + esc(ex.vector) + '</span>' : '') +
                (ex.equipment ? '<span>' + esc(ex.equipment) + '</span>' : '') +
            '</div>' +
            (ex.order ? '<p class="description"><strong>Порядок:</strong><br>' + esc(ex.order) + '</p>' : '') +
            (ex.tech ? '<p class="description"><strong>Техника:</strong><br>' + esc(ex.tech) + '</p>' : '') +
            (!ex.order && !ex.tech && ex.description ? '<p class="description">' + esc(ex.description) + '</p>' : '') +
            renderExtraLinks(ex.links) +
        '</div>' +
        '<div class="actions">' +
            '<button class="secondary" onclick="openLibraryViewFromPage(\'' + ex.id + '\')">Просмотр</button>' +
            '<button class="secondary" onclick="editLibraryExercise(\'' + ex.id + '\')">Изменить</button>' +
            '<button class="danger" onclick="deleteLibraryExercise(\'' + ex.id + '\')">Удалить</button>' +
        '</div>';

    return card;
}

// Обновить выпадающий фильтр по группам
function renderLibraryGroupFilter() {
    const select = document.getElementById('libraryGroupFilter');
    if (!select) return;

    // Запоминаем текущее выбранное значение
    const currentValue = select.value;

    const groups = getAllExerciseGroups();

    let html = '<option value="">Все группы</option>';
    groups.forEach(function(g) {
        html += '<option value="' + esc(g) + '">' + esc(g) + '</option>';
    });

    // «Без группы» — если есть упражнения без группы
    const hasNoGroup = exercisesLib.some(function(ex) {
        return !(ex.group || '').trim();
    });
    if (hasNoGroup) {
        html += '<option value="__no_group__">Без группы</option>';
    }

    select.innerHTML = html;

    // Восстанавливаем выбранное значение
    if (currentValue) select.value = currentValue;
}

// Обработчик смены фильтра — вешаем один раз при загрузке
(function initLibraryFilter() {
    function attach() {
        const select = document.getElementById('libraryGroupFilter');
        if (!select) return;
        select.addEventListener('change', function() {
            renderLibrary();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
    } else {
        attach();
    }
})();

window.openLibraryViewFromPage = function(id) {
    const ex = exercisesLib.find(function(x) { return x.id === id; });
    if (!ex) return;
    libraryViewTitle.textContent = ex.name;
    libraryViewBody.innerHTML = buildLibraryViewHtml(ex);
    libraryViewModal.classList.remove('hidden');
};

// ===== Модалка добавления/редактирования упражнения в библиотеке =====
const exerciseLibraryModal = document.getElementById('exerciseLibraryModal');
const exerciseLibraryTitle = document.getElementById('exerciseLibraryTitle');
const exerciseLibraryForm  = document.getElementById('exerciseLibraryForm');

// Снимок формы
let exerciseLibraryFormSnapshot = '';

function snapshotExerciseLibraryForm() {
   const fields = ['libName', 'libOrder', 'libTech', 'libVideo', 'libLinks', 'libVector', 'libEquipment', 'libGroup'];
    return fields.map(function(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }).join('|');
}

function exerciseLibraryHasChanges() {
    return snapshotExerciseLibraryForm() !== exerciseLibraryFormSnapshot;
}

document.getElementById('addExerciseToLibrary').addEventListener('click', function() {
    editingLibraryId = null;
    exerciseLibraryForm.reset();
    exerciseLibraryTitle.textContent = 'Новое упражнение';
    renderGroupDatalist();
    exerciseLibraryModal.classList.remove('hidden');
    exerciseLibraryFormSnapshot = snapshotExerciseLibraryForm();
});

window.editLibraryExercise = function(id) {
    const ex = exercisesLib.find(function(x) { return x.id === id; });
    if (!ex) return;
    editingLibraryId = id;
    document.getElementById('libName').value      = ex.name || '';
    document.getElementById('libOrder').value     = ex.order || (ex.description ? '' : ''); // новых нет
    document.getElementById('libTech').value      = ex.tech || '';
    document.getElementById('libVideo').value     = ex.video || '';
    document.getElementById('libLinks').value     = ex.links || '';
    document.getElementById('libVector').value    = ex.vector || '';
        document.getElementById('libGroup').value     = ex.group || '';
    document.getElementById('libEquipment').value = ex.equipment || '';
    exerciseLibraryTitle.textContent = 'Редактировать упражнение';
     renderGroupDatalist();
    exerciseLibraryModal.classList.remove('hidden');
    exerciseLibraryFormSnapshot = snapshotExerciseLibraryForm();
};

window.deleteLibraryExercise = async function(id) {
    if (!await showConfirm('Удалить упражнение?', 'Из библиотеки оно исчезнет, но в тренировках останется как архивное.', 'Да, удалить')) return;
    exercisesLib = exercisesLib.filter(function(x) { return x.id !== id; });
    saveLibraryData();
    renderLibrary();
};

function closeExerciseLibraryModal() {
    exerciseLibraryModal.classList.add('hidden');
    editingLibraryId = null;
    exerciseLibraryFormSnapshot = '';
}

document.getElementById('cancelExerciseLibrary').addEventListener('click', async function() {
    if (!await confirmCancel(exerciseLibraryHasChanges())) return;
    closeExerciseLibraryModal();
});

exerciseLibraryForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    exerciseLibraryFormSnapshot = '';

    const data = {
        name:      document.getElementById('libName').value.trim(),
        group:     document.getElementById('libGroup').value.trim(),
        order:     document.getElementById('libOrder').value.trim(),
        tech:      document.getElementById('libTech').value.trim(),
        video:     document.getElementById('libVideo').value.trim(),
        links:     document.getElementById('libLinks').value.trim(),
        vector:    document.getElementById('libVector').value.trim(),
        equipment: document.getElementById('libEquipment').value.trim()
    };
    if (!data.name) { await showAlert('Введите название'); return; }

    // Регистрируем группу (если новая — запоминаем)
    if (data.group) registerExerciseGroup(data.group);

    if (editingLibraryId) {
        const ex = exercisesLib.find(function(x) { return x.id === editingLibraryId; });
        if (ex) Object.assign(ex, data);
    } else {
        exercisesLib.push(Object.assign({ id: uuid() }, data));
    }

    saveLibraryData();
    closeExerciseLibraryModal();
    renderLibrary();
});
// Рендер списка дополнительных ссылок в карточке
function renderExtraLinks(links) {
    if (!links) return '';
    const list = links.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
    if (list.length === 0) return '';
    let html = '<div class="extra-links"><strong>Ссылки:</strong><ul>';
    list.forEach(function(url) {
        html += '<li><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(url) + '</a></li>';
    });
    html += '</ul></div>';
    return html;
}

// ===== Запуск приложения =====
renderCalendar();
renderSelectedDate();