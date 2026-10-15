// ================================================================
//   ЧАСТЬ 1: ЯДРО — данные, утилиты, навигация, календарь
// ================================================================

// ===== Ключи хранилища =====
const STORAGE_WORKOUTS  = 'workouts_by_date_v1';
const STORAGE_LIBRARY   = 'exercises_library_v1';
const STORAGE_PROGRAMS  = 'programs_library_v1';
const STORAGE_USERS     = 'users_v1';
const IMPERSONATION_KEY = 'impersonatingUserId_v1';

const BLOCKS = {
    warmup:   { key: 'warmup',   title: 'Разминка',               optional: false },
    speed:    { key: 'speed',    title: 'Скоростно-силовой блок', optional: true  },
    strength: { key: 'strength', title: 'Силовая часть',          optional: false }
};

const GROUP_COLORS = 6;

// ===== Работа с localStorage =====
function loadJSON(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
        const parsed = JSON.parse(raw);
        return parsed ?? fallback;
    } catch (e) {
        return fallback;
    }
}

function saveJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        alert('Не удалось сохранить данные. Возможно, хранилище переполнено.');
    }
}

// ===== Глобальные данные =====
// dataByDate — теперь ссылка на user.workoutsByDate активного пользователя
// (устанавливается в applyUserRole / enterClientCalendar / logout)
let dataByDate   = {};
let exercisesLib = loadJSON(STORAGE_LIBRARY, []);
let programsLib  = loadJSON(STORAGE_PROGRAMS, []);
let usersData    = loadJSON(STORAGE_USERS, { users: [] });

// Сохранение тренировок = сохранение usersData (т.к. dataByDate внутри юзера)
function saveWorkoutsData() { saveUsersData(); }
function saveLibraryData()  { saveJSON(STORAGE_LIBRARY, exercisesLib); }
function saveProgramsData() { saveJSON(STORAGE_PROGRAMS, programsLib); }
function saveUsersData()    { saveJSON(STORAGE_USERS, usersData); }

// ===== Управление календарём активного пользователя =====
function loadWorkoutsForUser(user) {
    if (!user) return {};
    if (!user.workoutsByDate) user.workoutsByDate = {};
    return user.workoutsByDate;
}

// Привязать dataByDate к пользователю (или к impersonated-клиенту)
function bindDataToUser(user) {
    dataByDate = loadWorkoutsForUser(user);
}

// ===== Утилиты =====
function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function fromKey(key) {
    const parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function formatDateLabel(key) {
    const d = fromKey(key);
    return d.getDate() + ' ' + MONTHS[d.getMonth()].toLowerCase() + ' ' + d.getFullYear();
}

function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return String(Date.now()) + Math.random().toString(36).slice(2);
}

function empty() { return '<span class="cell-empty">—</span>'; }

function toEmbedUrl(url) {
    if (!url) return null;
    const u = url.trim();
    let m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1];
    m = u.match(/rutube\.ru\/video\/([\w-]+)/);
    if (m) return 'https://rutube.ru/play/embed/' + m[1];
    m = u.match(/vk\.com\/video(-?\d+)_(\d+)/);
    if (m) return 'https://vk.com/video_ext.php?oid=' + m[1] + '&id=' + m[2] + '&hd=1';
    if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(u)) return u;
    return u;
}

// ===== Состояние =====
const today = new Date();
let currentYear  = today.getFullYear();
let currentMonth = today.getMonth();
let selectedDate = toKey(today);
let currentPage  = 'workouts';

// Состояние модалки упражнения в тренировке
let currentWorkoutId = null;
let currentBlockKey  = null;
let editingExerciseId = null;
let pickedLibraryExercise = null;
let exerciseSource = 'library';

// Состояние модалки упражнения библиотеки
let editingLibraryId = null;

// Состояние модалки программы
let editingProgramId = null;
let programDraftDays = [];
let pickingDayIndex  = null;

// ===== Ссылки на элементы =====
const menuBtn      = document.getElementById('menuBtn');
const sideMenu     = document.getElementById('sideMenu');
const menuOverlay  = document.getElementById('menuOverlay');
const closeMenu    = document.getElementById('closeMenu');
const pageTitle    = document.getElementById('pageTitle');

const calendarGrid = document.getElementById('calendarGrid');
const monthLabel   = document.getElementById('monthLabel');
const selectedDateLabel = document.getElementById('selectedDateLabel');
const workoutsList = document.getElementById('workoutsList');

const exercisesListEl = document.getElementById('exercisesList');
const programsListEl  = document.getElementById('programsList');

// ===== Навигация между страницами =====
// Флаг: сейчас идёт обработка popstate — не надо пушить историю
let suppressHistoryPush = false;

function switchPage(page, options) {
    options = options || {};
    currentPage = page;

    // Обновляем историю браузера, если не подавлено
    if (!suppressHistoryPush && !options.skipHistory) {
        history.pushState({ page: page }, '', '#' + page);
    }

    document.querySelectorAll('.page').forEach(function(el) {
        el.classList.add('hidden');
    });
    document.getElementById('page-' + page).classList.remove('hidden');

    document.querySelectorAll('.menu-link').forEach(function(btn) {
        if (btn.dataset.page === page) btn.classList.add('active');
        else btn.classList.remove('active');
    });

           if (page === 'workouts')  pageTitle.textContent = 'Мои тренировки';
    if (page === 'clients')   pageTitle.textContent = 'Клиенты';
    if (page === 'templates') pageTitle.textContent = 'Шаблоны тренировок';
    if (page === 'profiles')  pageTitle.textContent = 'Анкеты';
    if (page === 'screening') pageTitle.textContent = 'Скрининг';
    if (page === 'exercises') pageTitle.textContent = 'Упражнения';
    if (page === 'profile')   pageTitle.textContent = 'Анкета';
        // Обновляем селект при заходе на «Мои тренировки»
    if (page === 'workouts' && typeof renderClientPicker === 'function') {
        renderClientPicker();
    }

    closeSideMenu();

    if (page === 'clients'   && typeof renderClients === 'function') renderClients();
    if (page === 'templates' && typeof renderTemplatesPage === 'function') renderTemplatesPage();
    if (page === 'profiles'  && typeof renderProfilesPage === 'function') renderProfilesPage();
    if (page === 'screening' && typeof renderScreeningPage === 'function') renderScreeningPage();
    if (page === 'exercises' && typeof renderLibrary === 'function') renderLibrary();
    if (page === 'profile'   && typeof renderProfile === 'function') renderProfile();
}

document.querySelectorAll('.menu-link').forEach(function(btn) {
    btn.addEventListener('click', function() { switchPage(btn.dataset.page); });
});
// ===== Обработка кнопки «Назад» браузера =====
window.addEventListener('popstate', function(e) {
    const page = (e.state && e.state.page) ? e.state.page : 'workouts';

    // Ставим флаг, чтобы switchPage не запушил новую запись в историю
    suppressHistoryPush = true;
    switchPage(page, { skipHistory: true });
    suppressHistoryPush = false;
});

function openSideMenu() {
    sideMenu.classList.remove('hidden');
    menuOverlay.classList.remove('hidden');
}

function closeSideMenu() {
    sideMenu.classList.add('hidden');
    menuOverlay.classList.add('hidden');
}

menuBtn.addEventListener('click', openSideMenu);
closeMenu.addEventListener('click', closeSideMenu);
menuOverlay.addEventListener('click', closeSideMenu);

// ===== Календарь =====
function renderCalendar() {
    monthLabel.textContent = MONTHS[currentMonth] + ' ' + currentYear;
    calendarGrid.innerHTML = '';

    const firstDay = new Date(currentYear, currentMonth, 1);
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;

    const daysInMonth   = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();
    const todayKey      = toKey(today);

    // Дни предыдущего месяца
    for (let i = startOffset - 1; i >= 0; i--) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day other-month';
        cell.textContent = prevMonthDays - i;
        calendarGrid.appendChild(cell);
    }

    // Дни текущего месяца
    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(currentYear, currentMonth, day);
        const key = toKey(dateObj);
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        cell.dataset.date = key;

       if (key === todayKey)     cell.classList.add('today');
if (key === selectedDate) cell.classList.add('selected');

// Логика точек: зависит от режима
if (isAdminInOwnCalendar()) {
    // Режим «Мой календарь» админа: точки — по клиентам
    const clientsWithWorkouts = getClientsWithWorkoutsOnDate(key);
    if (clientsWithWorkouts.length > 0) cell.classList.add('has-workouts');
} else {
    // Обычный режим (клиент или админ в impersonation): по своим данным
    if (dataByDate[key] && dataByDate[key].length > 0) cell.classList.add('has-workouts');
    if (dataByDate[key + '_dayOff'] === true) cell.classList.add('has-dayoff');
}

        cell.innerHTML = '<span>' + day + '</span><span class="dot"></span>';

        cell.addEventListener('click', function() {
            selectedDate = key;
            renderCalendar();
            renderSelectedDate();
        });

        calendarGrid.appendChild(cell);
    }

    // Дни следующего месяца
    const totalCells = startOffset + daysInMonth;
    const remaining  = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day other-month';
        cell.textContent = i;
        calendarGrid.appendChild(cell);
    }
}

document.getElementById('prevMonth').addEventListener('click', function() {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
});

document.getElementById('nextMonth').addEventListener('click', function() {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
});

document.getElementById('todayBtn').addEventListener('click', function() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    selectedDate = toKey(now);
    renderCalendar();
    renderSelectedDate();
});
// ================================================================
//   ОБЩИЕ ФУНКЦИИ ДЛЯ МОДАЛОК
// ================================================================

// Проверка: открыта ли модалка
function isModalOpen(modalEl) {
    return modalEl && !modalEl.classList.contains('hidden');
}

// Закрытие модалки по клику на фон (только для модалок просмотра)
function attachBackdropClose(modalEl, closeFn) {
    modalEl.addEventListener('click', function(e) {
        if (e.target === modalEl) closeFn();
    });
}

// Закрытие модалки по Esc (только для модалок просмотра)
function attachEscClose(modalEl, closeFn) {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isModalOpen(modalEl)) closeFn();
    });
}

// ================================================================
//   СТИЛИЗОВАННЫЕ МОДАЛКИ ВМЕСТО alert и confirm
// ================================================================

// Информационное сообщение — только кнопка "ОК"
function showAlert(message) {
    return new Promise(function(resolve) {
        const modal = document.getElementById('alertModal');
        const textEl = document.getElementById('alertModalText');
        const okBtn = document.getElementById('alertModalOk');

        textEl.textContent = message;

        function cleanup() {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
        }

        function onOk() {
            cleanup();
            resolve();
        }

        okBtn.addEventListener('click', onOk);
        modal.classList.remove('hidden');
    });
}

// Подтверждение — заголовок + текст + две кнопки
function showConfirm(title, message, yesText) {
    return new Promise(function(resolve) {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmModalTitle');
        const textEl = document.getElementById('confirmModalText');
        const btnYes = document.getElementById('confirmModalYes');
        const btnNo = document.getElementById('confirmModalNo');

        titleEl.textContent = title;
        textEl.textContent = message;
        btnYes.textContent = yesText || 'Да';

        function cleanup() {
            modal.classList.add('hidden');
            btnYes.removeEventListener('click', onYes);
            btnNo.removeEventListener('click', onNo);
        }

        function onYes() { cleanup(); resolve(true); }
        function onNo()  { cleanup(); resolve(false); }

        btnYes.addEventListener('click', onYes);
        btnNo.addEventListener('click', onNo);

        modal.classList.remove('hidden');
    });
}

// Обёртка для вопроса о несохранённых данных
function confirmCancel(hasChanges) {
    if (!hasChanges) return Promise.resolve(true);
    return showConfirm('Отменить изменения?', 'Все несохранённые данные будут потеряны.', 'Да, выйти');
}
// ================================================================
//   ПОЛЬЗОВАТЕЛИ И АВТОСОЗДАНИЕ АДМИНА
// ================================================================

// Первичная инициализация — создаём админа, если его нет
function initUsers() {
    if (!usersData.users || usersData.users.length === 0) {
        usersData.users = [
            {
                id: uuid(),
                login: 'admin',
                password: 'admin',
                role: 'admin',
                name: 'Администратор',
                createdAt: new Date().toISOString(),
                workoutsByDate: {}
            }
        ];
        saveUsersData();
        console.log('%c✓ Создан администратор по умолчанию. Логин: admin, пароль: admin', 'color: #2f6b4f; font-weight: bold;');
        console.log('%cВАЖНО: смените пароль после первого входа!', 'color: #a94442; font-weight: bold;');
    }
}

// Найти пользователя по логину и паролю
function findUserByCredentials(login, password) {
    if (!usersData.users) return null;
    return usersData.users.find(function(u) {
        return u.login === login && u.password === password;
    }) || null;
}

// Найти пользователя по логину
function findUserByLogin(login) {
    if (!usersData.users) return null;
    return usersData.users.find(function(u) {
        return u.login === login;
    }) || null;
}

// Найти пользователя по id
function findUserById(id) {
    if (!usersData.users) return null;
    return usersData.users.find(function(u) {
        return u.id === id;
    }) || null;
}
// ===== Миграция старых данных =====
// Раньше тренировки хранились в отдельном ключе 'workouts_by_date_v1'.
// Теперь они внутри user.workoutsByDate (у админа).
function migrateLegacyWorkouts() {
    const legacy = loadJSON(STORAGE_WORKOUTS, null);

    // Если старый ключ пуст или уже мигрирован — выходим
    if (!legacy || Object.keys(legacy).length === 0) return;

    // Ищем админа
    const admin = usersData.users.find(function(u) { return u.role === 'admin'; });
    if (!admin) return;

    // Если у админа уже есть данные — не перезаписываем, но бэкапим старый ключ
    const adminHasData = admin.workoutsByDate && Object.keys(admin.workoutsByDate).length > 0;

    if (!adminHasData) {
        admin.workoutsByDate = legacy;
        saveUsersData();
        console.log('%c✓ Миграция: старые тренировки перенесены в календарь админа', 'color: #2f6b4f; font-weight: bold;');
    } else {
        console.log('%c⚠ Старый ключ найден, но у админа уже есть данные — оставляю как backup', 'color: #a94442; font-weight: bold;');
    }

    // Бэкап старого ключа (не удаляем, чтобы была страховка)
    saveJSON(STORAGE_WORKOUTS + '_backup', legacy);
    localStorage.removeItem(STORAGE_WORKOUTS);
    console.log('%c✓ Старый ключ перемещён в workouts_by_date_v1_backup', 'color: #2f6b4f;');
}

// Инициализация при загрузке
initUsers();
migrateLegacyWorkouts();
// ================================================================
//   ЛОГИКА ВХОДА И СЕССИЯ
// ================================================================

const SESSION_KEY = 'currentUser_v1';

// Получить текущего пользователя из sessionStorage
function getCurrentUser() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // На всякий случай — проверяем, что такой пользователь всё ещё есть
        return findUserById(parsed.id);
    } catch (e) {
        return null;
    }
}

// Установить текущего пользователя
function setCurrentUser(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        id: user.id,
        login: user.login,
        role: user.role,
        name: user.name
    }));
}

// Очистить сессию
function clearCurrentUser() {
    sessionStorage.removeItem(SESSION_KEY);
}
function showLoginOverlay() {
    const overlay = document.getElementById('loginOverlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.add('ready');
}

// Скрыть оверлей входа
function hideLoginOverlay() {
    document.getElementById('loginOverlay').classList.add('hidden');
}

// Обработчик формы входа
function initLoginForm() {
    const form = document.getElementById('loginForm');
    const loginInput = document.getElementById('loginInput');
    const passwordInput = document.getElementById('passwordInput');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const login = loginInput.value.trim();
        const password = passwordInput.value;

        if (!login || !password) {
            await showAlert('Введите логин и пароль');
            return;
        }

        const user = findUserByCredentials(login, password);

        if (!user) {
            await showAlert('Неверный логин или пароль');
            passwordInput.value = '';
            return;
        }

        // Успех
        setCurrentUser(user);
        hideLoginOverlay();

        // Сброс полей
        loginInput.value = '';
        passwordInput.value = '';

        // Показываем приложение
        applyUserRole(user);

        console.log('%c✓ Вход выполнен: ' + user.name + ' (' + user.role + ')', 'color: #2f6b4f; font-weight: bold;');
    });
}

// Проверка сессии при загрузке
function checkSession() {
    const user = getCurrentUser();
    if (user) {
        hideLoginOverlay();
        applyUserRole(user);
    } else {
        showLoginOverlay();
    }
}
// ================================================================
//   РЕЖИМ «МОЙ КАЛЕНДАРЬ» АДМИНА
// ================================================================
// true, если админ смотрит СВОЙ календарь (не в impersonation)
// false, если: это клиент, или админ вошёл в календарь клиента
function isAdminInOwnCalendar() {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') return false;
    const impersonatedId = sessionStorage.getItem(IMPERSONATION_KEY);
    return !impersonatedId;
}

// Собрать список клиентов, у которых в указанный день есть тренировки
// dateKey — строка вида '2026-10-15'
function getClientsWithWorkoutsOnDate(dateKey) {
    if (!usersData.users) return [];

    const result = [];

    usersData.users.forEach(function(user) {
        if (user.role !== 'client') return;

        const workouts = (user.workoutsByDate && user.workoutsByDate[dateKey]) || [];
        if (workouts.length > 0) {
            result.push({
                user: user,
                workouts: workouts
            });
        }
    });

    // Сортируем по имени
    result.sort(function(a, b) {
        const an = (a.user.name || a.user.login).toLowerCase();
        const bn = (b.user.name || b.user.login).toLowerCase();
        return an.localeCompare(bn);
    });

    return result;
}
// Применить роль пользователя к интерфейсу
function applyUserRole(user) {
    if (!user) return;

    // Привязываем календарь к пользователю (Вариант A)
    // Если открыт режим клиента — календарь клиента, иначе — свой
    const impersonatedId = sessionStorage.getItem('impersonatingUserId_v1');
    if (impersonatedId && user.role === 'admin') {
        const client = findUserById(impersonatedId);
        bindDataToUser(client || user);
    } else {
        bindDataToUser(user);
    }

    if (user.role === 'client') {
        document.body.classList.add('client-mode');
    } else {
        document.body.classList.remove('client-mode');
    }
    // Режим «Мой календарь» админа
document.body.classList.toggle('admin-own-calendar', isAdminInOwnCalendar());

    // Обновляем заголовок "Тренировки за ..." для клиента
    updateClientDateHeader();

    // Перерисовываем календарь и список тренировок с новыми данными
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderSelectedDate === 'function') renderSelectedDate();

    // Обновляем плашку impersonation (если активен режим — покажется)
    updateImpersonationBanner();

    // Обновляем селект клиентов
    if (typeof renderClientPicker === 'function') renderClientPicker();
}

// Обновить заголовок даты в клиентском режиме
function updateClientDateHeader() {
    const el = document.getElementById('clientSelectedDateLabel');
    if (el) {
        el.textContent = 'Тренировки за ' + formatDateLabel(selectedDate);
    }
}

// Инициализация формы входа
initLoginForm();

// Проверка сессии при загрузке
checkSession();

// Инициализация истории — чтобы при первом «Назад» было куда возвращаться
if (!history.state || !history.state.page) {
    history.replaceState({ page: currentPage }, '', '#' + currentPage);
}
// ================================================================
//   ВЫХОД ИЗ АККАУНТА
// ================================================================
// ================================================================
//   СОЗДАНИЕ / РЕДАКТИРОВАНИЕ КЛИЕНТА
// ================================================================

// Состояние модалки клиента
let editingClientId = null;
let clientFormSnapshot = '';

// Сгенерировать пароль: 8 символов, буквы + цифры
function generatePassword(length) {
    if (length === undefined) length = 8;
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    // убрал похожие символы: l, I, 1, o, O, 0
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Снимок формы клиента — для отслеживания изменений
function snapshotClientForm() {
    const fields = ['clientName', 'clientLogin', 'clientPassword', 'clientNote'];
    return fields.map(function(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }).join('|');
}

function clientFormHasChanges() {
    return snapshotClientForm() !== clientFormSnapshot;
}

// Открыть модалку создания клиента
window.openCreateClientModal = function() {
    editingClientId = null;

    const modal = document.getElementById('clientModal');
    const title = document.getElementById('clientModalTitle');
    const loginFields = document.getElementById('clientLoginFields');

    title.textContent = 'Новый клиент';
    loginFields.classList.remove('hidden'); // при создании поля логина/пароля видны

    // Очищаем форму
    document.getElementById('clientForm').reset();
    document.getElementById('clientName').value = '';
    document.getElementById('clientLogin').value = '';
    document.getElementById('clientPassword').value = '';
    document.getElementById('clientNote').value = '';

    // Сразу генерируем пароль — удобно
    document.getElementById('clientPassword').value = generatePassword(8);

    clientFormSnapshot = snapshotClientForm();
    modal.classList.remove('hidden');
};

// Открыть модалку редактирования клиента
window.openEditClientModal = function(clientId) {
    const client = findUserById(clientId);
    if (!client) {
        showAlert('Клиент не найден');
        return;
    }
    if (client.role !== 'client') {
        showAlert('Этот пользователь не является клиентом');
        return;
    }

    editingClientId = clientId;

    const modal = document.getElementById('clientModal');
    const title = document.getElementById('clientModalTitle');
    const loginFields = document.getElementById('clientLoginFields');

    title.textContent = 'Редактировать клиента';
    loginFields.classList.add('hidden'); // при редактировании логин/пароль не показываем

    document.getElementById('clientName').value = client.name || '';
    document.getElementById('clientNote').value = client.note || '';

    clientFormSnapshot = snapshotClientForm();
    modal.classList.remove('hidden');
};

// Закрыть модалку клиента
function closeClientModal() {
    document.getElementById('clientModal').classList.add('hidden');
    editingClientId = null;
    clientFormSnapshot = '';
}
// ================================================================
//   АНКЕТА КЛИЕНТА
// ================================================================

// Ссылки на поля анкеты
const PROFILE_FIELDS = {
    age: 'pAge',
    height: 'pHeight',
    weight: 'pWeight',
    gender: 'pGender',
    injuries: 'pInjuries',
    contraindications: 'pContraindications',
    pain: 'pPain',
    activity: 'pActivity',
    sleep: 'pSleep',
    meals: 'pMeals',
    stress: 'pStress',
    goals: 'pGoals',
    period: 'pPeriod',
    place: 'pPlace',
    perWeek: 'pPerWeek',
    duration: 'pDuration',
    equipment: 'pEquipment',
    experience: 'pExperience',
    level: 'pLevel'
};

// Получить анкету текущего активного пользователя
// (если админ в impersonation — берём анкету клиента)
function getActiveProfileUser() {
    const me = getCurrentUser();
    if (!me) return null;

    const impersonatedId = sessionStorage.getItem(IMPERSONATION_KEY);
    if (impersonatedId && me.role === 'admin') {
        return findUserById(impersonatedId) || me;
    }
    return me;
}
// ================================================================
//   СТРАНИЦА «ШАБЛОНЫ ТРЕНИРОВОК» (для админа)
// ================================================================

let currentTemplatesClientId = null;

// Отрисовать страницу «Шаблоны»
function renderTemplatesPage() {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') return;

    renderTemplatesList();

    // Если уже был выбран клиент — показать его шаблоны
    if (currentTemplatesClientId) {
        const stillExists = findUserById(currentTemplatesClientId);
        if (stillExists && stillExists.role === 'client') {
            selectTemplateClient(currentTemplatesClientId);
            return;
        }
        currentTemplatesClientId = null;
    }

    // Иначе — заглушка
    document.getElementById('templatesContent').innerHTML =
        '<div class="card profiles-empty"><p class="hint">Выберите клиента из списка слева.</p></div>';
}

// Отрисовать список клиентов слева
function renderTemplatesList() {
    const listEl = document.getElementById('templatesList');
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
        const count = (c.templates || []).length;
        const statusText = count === 0 ? 'нет шаблонов' : (count + ' ' + pluralTemplates(count));
        const activeClass = c.id === currentTemplatesClientId ? ' active' : '';

        return '<div class="profile-pick-item' + activeClass + '" data-client-id="' + c.id + '">' +
            '<div class="pick-name">' + esc(c.name || c.login) + '</div>' +
            '<div class="pick-status">' + statusText + '</div>' +
        '</div>';
    }).join('');

    // Обработчики кликов
    listEl.querySelectorAll('.profile-pick-item').forEach(function(el) {
        el.addEventListener('click', function() {
            selectTemplateClient(el.dataset.clientId);
        });
    });
}

// Склонение: 1 шаблон / 2 шаблона / 5 шаблонов
function pluralTemplates(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'шаблон';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'шаблона';
    return 'шаблонов';
}

// Выбрать клиента — отрисовать его шаблоны справа
function selectTemplateClient(clientId) {
    const client = findUserById(clientId);
    if (!client || client.role !== 'client') return;

    currentTemplatesClientId = clientId;

    // Подсветить активный пункт
    document.querySelectorAll('#templatesList .profile-pick-item').forEach(function(el) {
        if (el.dataset.clientId === clientId) el.classList.add('active');
        else el.classList.remove('active');
    });

    const templates = client.templates || [];

    // Заголовок
    let html = '<div class="profiles-header">' +
        '<h2>Шаблоны: ' + esc(client.name || client.login) + '</h2>' +
        '<p class="hint">' +
            (templates.length === 0
                ? 'У клиента ещё нет шаблонов. Сохраните тренировку как шаблон из календаря.'
                : 'Готовые тренировки, которые можно применить в любой день календаря.') +
        '</p>' +
    '</div>';

    // Карточки или заглушка
    if (templates.length === 0) {
        html += '<div class="templates-empty">' +
            '<strong>Шаблонов пока нет</strong>' +
            'Откройте календарь этого клиента, создайте тренировку и нажмите «Сохранить как шаблон».' +
        '</div>';
    } else {
        html += '<div class="templates-cards">';
        templates.forEach(function(tpl) {
            html += buildTemplateCard(tpl);
        });
        html += '</div>';
    }

    document.getElementById('templatesContent').innerHTML = html;
}

// Построить карточку шаблона
function buildTemplateCard(tpl) {
    const blocks = tpl.blocks || {};
    const warmupCount = (blocks.warmup || []).length;
    const speedCount = (blocks.speed || []).length;
    const strengthCount = (blocks.strength || []).length;

    const created = tpl.createdAt ? formatCreatedAt(tpl.createdAt) : '—';

    let statsHtml = '';
    statsHtml += buildStatItem('Разминка', warmupCount);
    statsHtml += buildStatItem('Скоростно-силовой', speedCount);
    statsHtml += buildStatItem('Силовая', strengthCount);

    // Раскрываемое содержимое
    const contentHtml = buildTemplateContent(tpl);

    return '<div class="template-card" data-template-id="' + tpl.id + '">' +
        '<div class="template-card-header">' +
            '<div>' +
                '<h3>' + esc(tpl.name) + '</h3>' +
                '<div class="template-card-meta">Создан: ' + created + '</div>' +
            '</div>' +
            '<div class="template-card-actions">' +
                '<button type="button" class="danger" onclick="deleteTemplate(\'' + tpl.id + '\')">Удалить</button>' +
            '</div>' +
        '</div>' +
        '<div class="template-card-stats">' + statsHtml + '</div>' +
        '<button type="button" class="template-toggle-btn" onclick="toggleTemplateContent(\'' + tpl.id + '\')">' +
            '<span class="toggle-arrow">▸</span> Показать содержимое' +
        '</button>' +
        '<div class="template-card-content hidden" id="templateContent-' + tpl.id + '">' +
            contentHtml +
        '</div>' +
    '</div>';
}

// Содержимое шаблона — таблицы по блокам
function buildTemplateContent(tpl) {
    const blocks = tpl.blocks || {};

    let html = '';

    Object.keys(BLOCKS).forEach(function(blockKey) {
        const block = BLOCKS[blockKey];
        const exercises = blocks[blockKey] || [];

        if (exercises.length === 0) return; // пустой блок не показываем

        html += '<div class="template-block">' +
            '<div class="template-block-title">' + esc(block.title) + '</div>' +
            '<div class="template-block-scroll">' +
                '<table class="exercise-table template-table">' +
                    '<thead><tr>' +
    '<th>Название</th>' +
    '<th>Темп</th>' +
    '<th>Вес</th>' +
    '<th>Подходы</th>' +
    '<th>Отдых</th>' +
    '<th>Группа</th>' +
    '<th>№</th>' +
    '<th>Комментарий</th>' +
'</tr></thead>' +
                    '<tbody>' +
                        exercises.map(function(ex) {
                            return '<tr>' +
                                '<td class="cell-name" style="cursor:default; text-decoration:none;">' + esc(ex.name || '—') + '</td>' +
                                '<td>' + (ex.tempo ? esc(ex.tempo) : '—') + '</td>' +
                                '<td>' + (ex.intensity ? esc(ex.intensity) : '—') + '</td>' +
                                '<td>' + (ex.sets ? esc(ex.sets) : '—') + '</td>' +
                                '<td>' + (ex.rest ? esc(ex.rest) : '—') + '</td>' +
                                '<td class="cell-group">' + (ex.group ? esc(ex.group) : '—') + '</td>' +
'<td class="cell-num">' + (ex.num ? esc(ex.num) : '—') + '</td>' +
'<td class="cell-comment">' + (ex.comment ? esc(ex.comment) : '—') + '</td>' +
                            '</tr>';
                        }).join('') +
                    '</tbody>' +
                '</table>' +
            '</div>' +
        '</div>';
    });

    if (!html) {
        html = '<p class="no-exercises">У этого шаблона нет упражнений.</p>';
    }

    return html;
}

// Раскрыть/скрыть содержимое шаблона
window.toggleTemplateContent = function(templateId) {
    const contentEl = document.getElementById('templateContent-' + templateId);
    if (!contentEl) return;

    const btn = contentEl.previousElementSibling; // кнопка перед контентом
    const arrow = btn ? btn.querySelector('.toggle-arrow') : null;

    if (contentEl.classList.contains('hidden')) {
        contentEl.classList.remove('hidden');
        if (arrow) arrow.textContent = '▾';
        if (btn) btn.innerHTML = '<span class="toggle-arrow">▾</span> Скрыть содержимое';
    } else {
        contentEl.classList.add('hidden');
        if (arrow) arrow.textContent = '▸';
        if (btn) btn.innerHTML = '<span class="toggle-arrow">▸</span> Показать содержимое';
    }
};
// ================================================================
//   УДАЛЕНИЕ ШАБЛОНА
// ================================================================

window.deleteTemplate = async function(templateId) {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') {
        showAlert('Удалять шаблоны может только администратор');
        return;
    }

    // Какому клиенту принадлежит шаблон
    const clientId = currentTemplatesClientId;
    if (!clientId) {
        showAlert('Клиент не выбран');
        return;
    }

    const client = findUserById(clientId);
    if (!client || client.role !== 'client') {
        showAlert('Клиент не найден');
        return;
    }

    const templates = client.templates || [];
    const template = templates.find(function(t) { return t.id === templateId; });
    if (!template) {
        showAlert('Шаблон не найден');
        return;
    }

    // Подтверждение
    const ok = await showConfirm(
        'Удалить шаблон?',
        'Шаблон «' + template.name + '» будет удалён без возможности восстановления. ' +
        'Тренировки, уже добавленные из него в календарь, не затрагиваются.',
        'Да, удалить'
    );
    if (!ok) return;

    // Удаляем из массива
    client.templates = templates.filter(function(t) { return t.id !== templateId; });
    saveUsersData();

    // Перерисовываем страницу «Шаблоны»
    if (typeof renderTemplatesPage === 'function') {
        renderTemplatesPage();
    }

    showAlert('Шаблон удалён');
};

// Построить одну строку статистики
function buildStatItem(label, count) {
    const emptyClass = count === 0 ? ' empty' : '';
    const display = count === 0 ? '—' : count;

    return '<span class="template-stat">' +
        '<span class="stat-label">' + esc(label) + ':</span> ' +
        '<span class="stat-value' + emptyClass + '">' + display + '</span>' +
    '</span>';
}
// ================================================================
//   СТРАНИЦА «СКРИНИНГ» (для админа)
// ================================================================

let currentScreeningClientId = null;

// Расшифровки пунктов скрининга
const SCREENING_MOBILITY_ITEMS = [
    { key: 'gs',       label: 'ГС' },
    { key: 'hipInt',   label: 'ТБС внутреннее' },
    { key: 'hipExt',   label: 'ТБС наружное' },
    { key: 'kneeInt',  label: 'ПС внутреннее' },
    { key: 'kneeExt',  label: 'ПС наружное' },
    { key: 'kneeOver', label: 'ПС оверхед' }
];

const SCREENING_MOVEMENT_ITEMS = [
    { key: 'landing',    label: 'Приземление с 2 на 1 ногу' },
    { key: 'squatArms',  label: 'Приседания с руками вперёд' },
    { key: 'splitSquat', label: 'Сплит присед' },
    { key: 'hinge',      label: 'Наклон на 2 ногах' },
    { key: 'pushup',     label: 'Отжимания' },
    { key: 'plankTouch', label: 'Планка с касанием плеча' }
];

// Отрисовать страницу скрининга
function renderScreeningPage() {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') return;

    renderScreeningList();

    // Если уже выбран клиент — показать его
    if (currentScreeningClientId) {
        const stillExists = findUserById(currentScreeningClientId);
        if (stillExists && stillExists.role === 'client') {
            selectScreeningClient(currentScreeningClientId);
            return;
        }
        currentScreeningClientId = null;
    }

    // Иначе — заглушка
    document.getElementById('screeningContent').innerHTML =
        '<div class="card profiles-empty"><p class="hint">Выберите клиента из списка слева.</p></div>';
}

// Отрисовать список клиентов слева
function renderScreeningList() {
    const listEl = document.getElementById('screeningList');
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
        const filled = isScreeningFilled(c.screening);
        const statusText = filled ? 'заполнен' : 'не заполнен';
        const activeClass = c.id === currentScreeningClientId ? ' active' : '';

        return '<div class="profile-pick-item' + activeClass + '" data-client-id="' + c.id + '">' +
            '<div class="pick-name">' + esc(c.name || c.login) + '</div>' +
            '<div class="pick-status">' + statusText + '</div>' +
        '</div>';
    }).join('');

    // Обработчики кликов
    listEl.querySelectorAll('.profile-pick-item').forEach(function(el) {
        el.addEventListener('click', function() {
            selectScreeningClient(el.dataset.clientId);
        });
    });
}

// Проверка, заполнен ли скрининг хоть чем-то
function isScreeningFilled(screening) {
    if (!screening) return false;
    if (screening.category) return true;
    if (screening.priorities && typeof screening.priorities === 'string' && screening.priorities.trim()) return true;

    const checkGroup = function(group) {
        if (!group || typeof group !== 'object') return false;

        // Стандартные поля (строки)
        const hasStd = Object.keys(group).some(function(k) {
            if (k === '_custom') return false;
            const v = group[k];
            return typeof v === 'string' && v.trim();
        });
        if (hasStd) return true;

        // Кастомные пункты (массив) — если есть хоть один с текстом
        if (Array.isArray(group._custom)) {
            const hasCustom = group._custom.some(function(item) {
                return (item.label && item.label.trim()) || (item.value && item.value.trim());
            });
            if (hasCustom) return true;
        }

        return false;
    };

    if (checkGroup(screening.mobility)) return true;
    if (checkGroup(screening.movements)) return true;

    return false;
}

// Выбрать клиента — отрисовать форму справа
function selectScreeningClient(clientId) {
    const client = findUserById(clientId);
    if (!client || client.role !== 'client') return;

    currentScreeningClientId = clientId;

    // Подсветить активный пункт
    document.querySelectorAll('#screeningList .profile-pick-item').forEach(function(el) {
        if (el.dataset.clientId === clientId) el.classList.add('active');
        else el.classList.remove('active');
    });

    // Рендер в режиме просмотра
    renderScreeningView(clientId, false);
}

// Отрисовать форму скрининга
// isEditing = true — редактирование, false — просмотр
function renderScreeningView(clientId, isEditing) {
    const client = findUserById(clientId);
    if (!client || client.role !== 'client') return;

    const screening = client.screening || {};
    const category = screening.category || '';
    const mobility = screening.mobility || {};
    const movements = screening.movements || {};
    const priorities = screening.priorities || '';

    const isEmpty = !isScreeningFilled(screening);

    // Заголовок
    let html = '<div class="profiles-header">' +
        '<h2>Скрининг: ' + esc(client.name || client.login) + '</h2>' +
        '<p class="hint">' + (isEmpty ? 'Скрининг ещё не заполнен.' : 'Данные скрининга этого клиента.') + '</p>' +
    '</div>';

    // Категория
    html += '<div class="screening-category">' +
        '<span class="screening-category-label">Категория</span>';
    if (isEditing) {
        html += '<select id="screeningCategory">' +
            '<option value=""' + (category === '' ? ' selected' : '') + '>— Не указано —</option>' +
            '<option value="office"' + (category === 'office' ? ' selected' : '') + '>Офисная работа</option>' +
            '<option value="active"' + (category === 'active' ? ' selected' : '') + '>Активная работа</option>' +
        '</select>';
    } else {
        html += '<span class="screening-category-value">' + (categoryLabel(category) || '— Не указано —') + '</span>';
    }
    html += '</div>';

        // Блок «Ограничения по подвижности»
    html += '<div class="screening-section">' +
        '<h3 class="screening-section-title">Ограничения по подвижности</h3>';
    SCREENING_MOBILITY_ITEMS.forEach(function(item) {
        html += buildScreeningRow('mobility', item.key, item.label, mobility[item.key] || '', isEditing);
    });
    // Кастомные пункты
    (mobility._custom || []).forEach(function(item) {
        html += buildScreeningCustomRow('mobility', item.key, item.label, item.value || '', isEditing);
    });
        if (isEditing) {
        html += '<div class="screening-add-row">' +
            '<input type="text" class="screening-new-label-input" id="newMobilityLabel" placeholder="Название нового пункта...">' +
            '<button type="button" class="secondary" data-add-to="mobility">Добавить</button>' +
        '</div>';
    }
    html += '</div>';

    // Блок «Ограничения по базовым движениям»
    html += '<div class="screening-section">' +
        '<h3 class="screening-section-title">Ограничения по базовым движениям</h3>';
    SCREENING_MOVEMENT_ITEMS.forEach(function(item) {
        html += buildScreeningRow('movements', item.key, item.label, movements[item.key] || '', isEditing);
    });
    // Кастомные пункты
    (movements._custom || []).forEach(function(item) {
        html += buildScreeningCustomRow('movements', item.key, item.label, item.value || '', isEditing);
    });
      if (isEditing) {
        html += '<div class="screening-add-row">' +
            '<input type="text" class="screening-new-label-input" id="newMovementsLabel" placeholder="Название нового пункта...">' +
            '<button type="button" class="secondary" data-add-to="movements">Добавить</button>' +
        '</div>';
    }
    html += '</div>';

    // Блок «Приоритеты в тренировках»
    html += '<div class="screening-section">' +
        '<h3 class="screening-section-title">Приоритеты в тренировках</h3>' +
        '<p class="screening-hint">Описать, над чем стоит работать в тренировках, исходя из описанных показаниях выше.</p>';
    if (isEditing) {
        html += '<textarea id="screeningPriorities" class="screening-priorities" placeholder="Введите текст...">' + esc(priorities) + '</textarea>';
    } else {
        html += '<div class="screening-priorities-value">' + (priorities ? esc(priorities) : '<span class="cell-empty">—</span>') + '</div>';
    }
    html += '</div>';

    // Кнопки
    html += '<div class="screening-actions">';
    if (isEditing) {
        html += '<button type="button" id="saveScreeningBtn">Сохранить</button>' +
                '<button type="button" class="secondary" id="cancelScreeningBtn">Отмена</button>' +
                '<span class="screening-status" id="screeningStatus"></span>';
    } else {
        html += '<button type="button" id="editScreeningBtn">Редактировать</button>' +
                '<span class="screening-status" id="screeningStatus"></span>';
    }
    html += '</div>';

    document.getElementById('screeningContent').innerHTML = html;

      // Обработчики
    if (isEditing) {
        document.getElementById('saveScreeningBtn').addEventListener('click', function() {
            saveScreening(clientId);
        });
        document.getElementById('cancelScreeningBtn').addEventListener('click', function() {
            renderScreeningView(clientId, false);
        });

        // Кнопки «+ Добавить пункт»
        document.querySelectorAll('.screening-add-row button[data-add-to]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const group = btn.dataset.addTo;
                addScreeningCustomRow(clientId, group);
            });
        });

        // Кнопки удаления кастомных пунктов (✕)
        document.querySelectorAll('.screening-remove-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const group = btn.dataset.removeGroup;
                const key = btn.dataset.removeKey;
                removeScreeningCustomRow(clientId, group, key);
            });
        });
    } else {
        document.getElementById('editScreeningBtn').addEventListener('click', function() {
            renderScreeningView(clientId, true);
        });
    }
}

// Расшифровка категории
function categoryLabel(v) {
    return { office: 'Офисная работа', active: 'Активная работа' }[v] || '';
}

// Построить строку скрининга (метка + поле)
function buildScreeningRow(group, key, label, value, isEditing) {
    let fieldHtml;
    if (isEditing) {
        fieldHtml = '<input type="text" data-screening-group="' + group + '" data-screening-key="' + key + '" value="' + esc(value) + '" placeholder="—">';
    } else {
        fieldHtml = '<div class="screening-value">' + (value ? esc(value) : '<span class="cell-empty">—</span>') + '</div>';
    }

    return '<div class="screening-row">' +
        '<div class="screening-row-label">' + esc(label) + '</div>' +
        fieldHtml +
    '</div>';
}
// Построить кастомную строку (с полем для названия и кнопкой удаления)
function buildScreeningCustomRow(group, key, label, value, isEditing) {
    if (isEditing) {
        return '<div class="screening-row screening-row-custom" data-custom-key="' + key + '">' +
            '<div class="screening-custom-label-static">' + esc(label || '—') + '</div>' +
            '<input type="text" data-screening-group="' + group + '" data-screening-key="' + key + '" value="' + esc(value) + '" placeholder="—">' +
            '<button type="button" class="screening-remove-btn" data-remove-group="' + group + '" data-remove-key="' + key + '" title="Удалить пункт">✕</button>' +
        '</div>';
    } else {
        return '<div class="screening-row">' +
            '<div class="screening-row-label">' + esc(label || '—') + '</div>' +
            '<div class="screening-value">' + (value ? esc(value) : '<span class="cell-empty">—</span>') + '</div>' +
        '</div>';
    }
}
// Добавить кастомный пункт в блок
function addScreeningCustomRow(clientId, group) {
    const client = findUserById(clientId);
    if (!client || client.role !== 'client') return;

    // Находим input с названием
    const inputId = group === 'mobility' ? 'newMobilityLabel' : 'newMovementsLabel';
    const inputEl = document.getElementById(inputId);
    const label = inputEl ? inputEl.value.trim() : '';

    // Нельзя добавить без названия
    if (!label) {
        if (inputEl) inputEl.focus();
        return;
    }

    // Собираем текущее состояние из полей
    const screening = collectScreeningFromForm(clientId);
    if (!screening[group]) screening[group] = {};
    if (!screening[group]._custom) screening[group]._custom = [];

    // Генерируем ключ
    const newKey = 'c' + Date.now();
    screening[group]._custom.push({
        key: newKey,
        label: label,
        value: ''
    });

    // Сохраняем временно
    client.screening = screening;

    // Перерисовываем
    renderScreeningView(clientId, true);

    // Фокус — на поле значения нового ряда
    setTimeout(function() {
        const valueInput = document.querySelector('.screening-row-custom[data-custom-key="' + newKey + '"] input[data-screening-group]');
        if (valueInput) valueInput.focus();
    }, 50);
}

// Удалить кастомный пункт
function removeScreeningCustomRow(clientId, group, key) {
    const client = findUserById(clientId);
    if (!client || client.role !== 'client') return;

    // Собираем текущее состояние из полей
    const screening = collectScreeningFromForm(clientId);
    if (!screening[group] || !screening[group]._custom) return;

    // Удаляем по key
    screening[group]._custom = screening[group]._custom.filter(function(item) {
        return item.key !== key;
    });

    // Сохраняем временно
    client.screening = screening;

    // Перерисовываем
    renderScreeningView(clientId, true);
}
// Собрать данные скрининга из текущей формы (чтобы не потерять при перерисовке)
function collectScreeningFromForm(clientId) {
    const client = findUserById(clientId);
    const existing = (client && client.screening) ? client.screening : {};

    // Начинаем с существующих данных
    const screening = {
        category: existing.category || '',
        mobility: {
            gs: existing.mobility && existing.mobility.gs || '',
            hipInt: existing.mobility && existing.mobility.hipInt || '',
            hipExt: existing.mobility && existing.mobility.hipExt || '',
            kneeInt: existing.mobility && existing.mobility.kneeInt || '',
            kneeExt: existing.mobility && existing.mobility.kneeExt || '',
            kneeOver: existing.mobility && existing.mobility.kneeOver || '',
            _custom: (existing.mobility && Array.isArray(existing.mobility._custom))
                ? JSON.parse(JSON.stringify(existing.mobility._custom))
                : []
        },
        movements: {
            landing: existing.movements && existing.movements.landing || '',
            squatArms: existing.movements && existing.movements.squatArms || '',
            splitSquat: existing.movements && existing.movements.splitSquat || '',
            hinge: existing.movements && existing.movements.hinge || '',
            pushup: existing.movements && existing.movements.pushup || '',
            plankTouch: existing.movements && existing.movements.plankTouch || '',
            _custom: (existing.movements && Array.isArray(existing.movements._custom))
                ? JSON.parse(JSON.stringify(existing.movements._custom))
                : []
        },
        priorities: existing.priorities || '',
        updatedAt: existing.updatedAt || ''
    };

    // Категория
    const catEl = document.getElementById('screeningCategory');
    if (catEl) screening.category = catEl.value;

    // Все input'ы с data-screening-group
    document.querySelectorAll('#screeningContent input[data-screening-group]').forEach(function(input) {
        const group = input.dataset.screeningGroup;
        const key = input.dataset.screeningKey;
        if (!group || !key) return;
        if (!screening[group]) return;

        const val = input.value.trim();

        // Кастомный пункт (ключ начинается с 'c')
        if (key.charAt(0) === 'c') {
            const customs = screening[group]._custom || [];
            const found = customs.find(function(item) {
                return item.key === key;
            });
            if (found) {
                found.value = val;
            }
        } else {
            // Стандартный пункт
            screening[group][key] = val;
        }
    });

    // Приоритеты
    const prEl = document.getElementById('screeningPriorities');
    if (prEl) screening.priorities = prEl.value.trim();

    return screening;
}
// Сохранение скрининга
function saveScreening(clientId) {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') {
        showAlert('Заполнять скрининг может только администратор');
        return;
    }

    const client = findUserById(clientId);
    if (!client || client.role !== 'client') {
        showAlert('Клиент не найден');
        return;
    }

    // Автодобавление: если в поле «название» что-то есть, но не нажали «Добавить»
    ['mobility', 'movements'].forEach(function(group) {
        const inputId = group === 'mobility' ? 'newMobilityLabel' : 'newMovementsLabel';
        const inputEl = document.getElementById(inputId);
        if (!inputEl) return;

        const pendingLabel = inputEl.value.trim();
        if (!pendingLabel) return;

        // Добавляем пункт в форму
        const existing = collectScreeningFromForm(clientId);
        if (!existing[group]) existing[group] = {};
        if (!existing[group]._custom) existing[group]._custom = [];

        const newKey = 'c' + Date.now() + '_' + group;
        existing[group]._custom.push({
            key: newKey,
            label: pendingLabel,
            value: ''
        });

        client.screening = existing;
    });

    // Собираем данные из формы (уже с учётом автодобавленных)
    const screening = collectScreeningFromForm(clientId);
    screening.updatedAt = new Date().toISOString();

    // Категория
    const catEl = document.getElementById('screeningCategory');
    if (catEl) screening.category = catEl.value;

    // Подвижность и движения — через data-атрибуты
    document.querySelectorAll('#screeningContent input[data-screening-group]').forEach(function(input) {
        const group = input.dataset.screeningGroup;
        const key = input.dataset.screeningKey;
        if (!group || !key) return;
        if (!screening[group]) screening[group] = {};
        screening[group][key] = input.value.trim();
    });

    // Приоритеты
    const prEl = document.getElementById('screeningPriorities');
    if (prEl) screening.priorities = prEl.value.trim();

    // Сохраняем
    client.screening = screening;
    saveUsersData();

    // Обновляем статус в списке слева
    renderScreeningList();

    // Возвращаемся в режим просмотра
    renderScreeningView(clientId, false);

    // Показываем «Сохранено»
    const statusEl = document.getElementById('screeningStatus');
    if (statusEl) {
        statusEl.textContent = '✓ Сохранено';
        setTimeout(function() {
            if (statusEl) statusEl.textContent = '';
        }, 2000);
    }
}
// ================================================================
//   СТРАНИЦА «АНКЕТЫ» (для админа) — список клиентов + анкета справа
// ================================================================

let currentProfilesClientId = null;

// Отрисовать страницу «Анкеты» (список клиентов + пустая область)
function renderProfilesPage() {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') return;

    renderProfilesList();

    // Если уже был выбран клиент — показываем его анкету
    if (currentProfilesClientId) {
        const stillExists = findUserById(currentProfilesClientId);
        if (stillExists && stillExists.role === 'client') {
            selectProfileClient(currentProfilesClientId);
            return;
        }
        currentProfilesClientId = null;
    }

    // Иначе — заглушка
    document.getElementById('profilesContent').innerHTML =
        '<div class="card profiles-empty"><p class="hint">Выберите клиента из списка слева.</p></div>';
}

// Отрисовать список клиентов слева
function renderProfilesList() {
    const listEl = document.getElementById('profilesList');
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
        const filled = c.profile && Object.keys(c.profile).some(function(k) { return c.profile[k]; });
        const statusText = filled ? 'заполнена' : 'не заполнена';
        const activeClass = c.id === currentProfilesClientId ? ' active' : '';

        return '<div class="profile-pick-item' + activeClass + '" data-client-id="' + c.id + '">' +
            '<div class="pick-name">' + esc(c.name || c.login) + '</div>' +
            '<div class="pick-status">' + statusText + '</div>' +
        '</div>';
    }).join('');

    // Обработчики кликов
    listEl.querySelectorAll('.profile-pick-item').forEach(function(el) {
        el.addEventListener('click', function() {
            const id = el.dataset.clientId;
            selectProfileClient(id);
        });
    });
}

// Выбрать клиента — отрисовать его анкету справа
function selectProfileClient(clientId) {
    const client = findUserById(clientId);
    if (!client || client.role !== 'client') return;

    currentProfilesClientId = clientId;

    // Подсветить активный пункт в списке
    document.querySelectorAll('.profile-pick-item').forEach(function(el) {
        if (el.dataset.clientId === clientId) el.classList.add('active');
        else el.classList.remove('active');
    });

    const profile = client.profile || {};
    const isEmpty = !Object.keys(profile).some(function(k) { return profile[k]; });

    // Заголовок
    let html = '<div class="profiles-header">' +
        '<h2>Анкета: ' + esc(client.name || client.login) + '</h2>' +
        '<p class="hint">' + (isEmpty ? 'Клиент ещё не заполнил анкету.' : 'Данные, которые заполнил клиент.') + '</p>' +
    '</div>';

    // Если пусто — заглушка вместо формы
    if (isEmpty) {
        html += '<div class="profiles-empty-note">Клиент пока не заполнил анкету. Попросите его зайти в раздел «Моя анкета» и заполнить данные.</div>';
        document.getElementById('profilesContent').innerHTML = html;
        return;
    }

    // Иначе — рендерим анкету в readonly
    html += '<div class="card profile-section">' +
        '<h3 class="profile-section-title">Общие данные</h3>' +
        '<div class="profile-grid">' +
            buildProfileField('Возраст', profile.age, 'Лет') +
            buildProfileField('Рост', profile.height, 'см') +
            buildProfileField('Вес', profile.weight, 'кг') +
            buildProfileField('Пол', genderLabel(profile.gender)) +
        '</div>' +
    '</div>';

    html += '<div class="card profile-section">' +
        '<h3 class="profile-section-title">Здоровье</h3>' +
        buildProfileField('История травм и диагнозы', profile.injuries) +
        buildProfileField('Противопоказания', profile.contraindications) +
        buildProfileField('Боли и беспокойства сейчас', profile.pain) +
    '</div>';

    html += '<div class="card profile-section">' +
        '<h3 class="profile-section-title">Образ жизни</h3>' +
        buildProfileField('Характер работы', activityLabel(profile.activity)) +
        '<div class="profile-grid">' +
            buildProfileField('Сон', profile.sleep, 'часов') +
            buildProfileField('Приёмов пищи', profile.meals, 'в день') +
        '</div>' +
        buildProfileField('Стрессовые факторы', profile.stress) +
    '</div>';

    html += '<div class="card profile-section">' +
        '<h3 class="profile-section-title">Цели</h3>' +
        buildProfileField('Цели', profile.goals) +
        buildProfileField('Период достижения', profile.period) +
    '</div>';

    html += '<div class="card profile-section">' +
        '<h3 class="profile-section-title">Условия для тренировок</h3>' +
        buildProfileField('Место тренировок', placeLabel(profile.place)) +
        '<div class="profile-grid">' +
            buildProfileField('Тренировок в неделю', profile.perWeek) +
            buildProfileField('Длительность тренировки', durationLabel(profile.duration)) +
        '</div>' +
        buildProfileField('Инвентарь', profile.equipment) +
    '</div>';

    html += '<div class="card profile-section">' +
        '<h3 class="profile-section-title">Опыт тренировок</h3>' +
        buildProfileField('Опыт', profile.experience) +
        buildProfileField('Уровень', levelLabel(profile.level)) +
    '</div>';

    document.getElementById('profilesContent').innerHTML = html;
}

// Построить одно readonly-поле анкеты
function buildProfileField(label, value, unit) {
    let display = value;
    if (display === undefined || display === null || display === '') {
        display = '<span class="cell-empty">—</span>';
    } else {
        display = esc(String(display)) + (unit ? ' ' + esc(unit) : '');
    }

    return '<label>' + esc(label) +
        '<div class="profile-readonly-field">' + display + '</div>' +
    '</label>';
}

// Расшифровки значений select'ов
function genderLabel(v) {
    return { male: 'Мужской', female: 'Женский' }[v] || '';
}
function activityLabel(v) {
    return {
        sedentary: 'Сидячая работа',
        active: 'Активная работа',
        heavy: 'Тяжёлый физический труд'
    }[v] || '';
}
function placeLabel(v) {
    return { home: 'Дом', gym: 'Зал', street: 'Улица', mixed: 'Смешанно' }[v] || '';
}
function durationLabel(v) {
    return { '30-60': '30–60 минут', '60-90': '60–90 минут', '90-120': '90–120 минут' }[v] || '';
}
function levelLabel(v) {
    return { beginner: 'Новичок', intermediate: 'Средний', advanced: 'Продвинутый' }[v] || '';
}
// Показать/скрыть анкету и заполнить её данными
function renderProfile() {
    const user = getActiveProfileUser();
    if (!user) return;

    // Определяем, кто СЕЙЧАС залогинен (не тот, чью анкету показываем)
    const me = getCurrentUser();
    const isOwnProfile = me && me.id === user.id;
    const canEdit = isOwnProfile && me.role === 'client';  // редактировать может только сам клиент

    const profile = user.profile || {};

    // Заголовок страницы
    const titleEl = document.getElementById('profileTitle');
    const hintEl = document.getElementById('profileHint');

    if (canEdit) {
        titleEl.textContent = 'Моя анкета';
        hintEl.textContent = 'Заполните информацию о себе. Чем подробнее — тем точнее тренер подберёт программу.';
    } else {
        titleEl.textContent = 'Анкета: ' + (user.name || user.login);
        hintEl.textContent = 'Данные, которые заполнил клиент.';
    }

    // Заполняем поля
    Object.keys(PROFILE_FIELDS).forEach(function(key) {
        const el = document.getElementById(PROFILE_FIELDS[key]);
        if (!el) return;
        el.value = profile[key] !== undefined && profile[key] !== null ? profile[key] : '';
    });

    // Режим редактирования / просмотра
    const form = document.getElementById('profileForm');
    const saveBtn = document.getElementById('saveProfileBtn');
    const statusEl = document.getElementById('profileStatus');

    if (!canEdit) {
        // Режим просмотра — readonly
        Object.values(PROFILE_FIELDS).forEach(function(id) {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.tagName === 'SELECT') {
                el.disabled = true;
            } else {
                el.setAttribute('readonly', 'readonly');
            }
        });
        saveBtn.classList.add('hidden');
        statusEl.textContent = '';
        form.classList.add('readonly-mode');
    } else {
        // Редактируемый режим
        Object.values(PROFILE_FIELDS).forEach(function(id) {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.tagName === 'SELECT') {
                el.disabled = false;
            } else {
                el.removeAttribute('readonly');
            }
        });
        saveBtn.classList.remove('hidden');
        statusEl.textContent = '';
        form.classList.remove('readonly-mode');
    }
}

// Сохранить анкету
function saveProfile() {
    const user = getActiveProfileUser();
    if (!user) return;

        const me = getCurrentUser();
    if (!me || me.role !== 'client' || me.id !== user.id) {
        showAlert('Заполнять анкету может только клиент — свою');
        return;
    }

    const profile = {};
    Object.keys(PROFILE_FIELDS).forEach(function(key) {
        const el = document.getElementById(PROFILE_FIELDS[key]);
        if (!el) return;
        profile[key] = el.value.trim ? el.value.trim() : el.value;
    });

    user.profile = profile;
    user.profileUpdatedAt = new Date().toISOString();

    saveUsersData();

    // Показать «Сохранено» на 2 секунды
    const statusEl = document.getElementById('profileStatus');
    statusEl.textContent = '✓ Сохранено';
    statusEl.classList.add('saved');

    setTimeout(function() {
        statusEl.textContent = '';
        statusEl.classList.remove('saved');
    }, 2000);
}

// ================================================================
//   СТРАНИЦА «КЛИЕНТЫ» — рендер таблицы
// ================================================================


// Получить список клиентов (только role === 'client')
function getClientsList() {
    if (!usersData.users) return [];
    return usersData.users.filter(function(u) { return u.role === 'client'; });
}

// Форматировать дату создания: ISO → «11.10.2026»
function formatCreatedAt(isoString) {
    if (!isoString) return '—';
    try {
        const d = new Date(isoString);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return day + '.' + month + '.' + year;
    } catch (e) {
        return '—';
    }
}

// Отрисовать таблицу клиентов
function renderClients() {
    const listEl = document.getElementById('clientsList');
    if (!listEl) return;

    const clients = getClientsList();

    if (clients.length === 0) {
        listEl.innerHTML = '<p class="no-clients">Пока нет клиентов. Нажмите «+ Создать клиента», чтобы добавить первого.</p>';
        return;
    }

    // Сортируем по дате создания (новые сверху)
    clients.sort(function(a, b) {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    const rows = clients.map(function(c) {
        const noteHtml = c.note
            ? '<span class="cell-client-note" title="' + esc(c.note) + '">' + esc(c.note) + '</span>'
            : '<span class="cell-empty">—</span>';

        return '<tr>' +
                        '<td class="cell-client-name" data-label="Имя">' + esc(c.name || c.login) + '</td>' +
            '<td data-label="Логин"><span class="cell-client-login">' + esc(c.login) + '</span></td>' +
            '<td class="cell-client-date" data-label="Создан">' + formatCreatedAt(c.createdAt) + '</td>' +
            '<td data-label="Заметка">' + noteHtml + '</td>' +
            '<td class="cell-client-actions" data-label="Управление">' +
    '<button type="button" class="btn-trainings" title="Открыть календарь тренировок" onclick="openClientCalendar(\'' + c.id + '\')">Тренировки</button>' +
    '<button type="button" class="btn-more secondary" title="Другие действия" onclick="openClientActionsModal(\'' + c.id + '\')">Действия</button>' +
'</td>' +
        '</tr>';
    }).join('');

    listEl.innerHTML = '<table class="clients-table">' +
        '<thead><tr>' +
    '<th>Имя</th>' +
    '<th>Логин</th>' +
    '<th>Создан</th>' +
    '<th>Заметка</th>' +
    '<th>Управление</th>' +
'</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
    '</table>';
}
// ================================================================
//   СЕЛЕКТОР КЛИЕНТА НА СТРАНИЦЕ «МОИ ТРЕНИРОВКИ»
// ================================================================

// Заполнить селект клиентов
function renderClientPicker() {
    const selectEl = document.getElementById('clientPickerSelect');
    if (!selectEl) return;

    const me = getCurrentUser();
    if (!me || me.role !== 'admin') return;

    const impersonatedId = sessionStorage.getItem(IMPERSONATION_KEY);
    const clients = getClientsList();

    // Сортируем по имени
    clients.sort(function(a, b) {
        const an = (a.name || a.login).toLowerCase();
        const bn = (b.name || b.login).toLowerCase();
        return an.localeCompare(bn);
    });

    // Строим опции
    let html = '<option value="__self__">Мой календарь</option>';

    clients.forEach(function(c) {
        html += '<option value="' + c.id + '">' + esc(c.name || c.login) + '</option>';
    });

    selectEl.innerHTML = html;

    // Устанавливаем выбранное значение
    if (impersonatedId && clients.some(function(c) { return c.id === impersonatedId; })) {
        selectEl.value = impersonatedId;
    } else {
        selectEl.value = '__self__';
    }
}

// Обработчик изменения селекта
function initClientPicker() {
    const selectEl = document.getElementById('clientPickerSelect');
    if (!selectEl) return;

    selectEl.addEventListener('change', function() {
        const value = selectEl.value;

        if (value === '__self__') {
            // Вернуться в свой календарь
            if (sessionStorage.getItem(IMPERSONATION_KEY)) {
                exitClientCalendar();
            }
        } else {
            // Войти в календарь клиента
            enterClientCalendar(value);
        }
    });
}
// ================================================================
//   IMPERSONATION: ПРОСМОТР КАЛЕНДАРЯ КЛИЕНТА
// ================================================================



// Войти в календарь клиента (только для админа)
function enterClientCalendar(clientId) {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') {
        console.warn('Войти в календарь клиента может только администратор');
        return;
    }

    const client = findUserById(clientId);
    if (!client) {
        showAlert('Клиент не найден');
        return;
    }
    if (client.role !== 'client') {
        showAlert('Этот пользователь не является клиентом');
        return;
    }

    sessionStorage.setItem(IMPERSONATION_KEY, clientId);

    // Привязываем календарь клиента
    bindDataToUser(client);

    // Перерисовываем
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderSelectedDate === 'function') renderSelectedDate();
      updateImpersonationBanner();
      document.body.classList.toggle('admin-own-calendar', isAdminInOwnCalendar());

    // Синхронизируем селект
    if (typeof renderClientPicker === 'function') renderClientPicker();
}


// Выйти из календаря клиента
function exitClientCalendar() {
    sessionStorage.removeItem(IMPERSONATION_KEY);

    const me = getCurrentUser();
    if (me) bindDataToUser(me);

    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderSelectedDate === 'function') renderSelectedDate();
        updateImpersonationBanner();
        document.body.classList.toggle('admin-own-calendar', isAdminInOwnCalendar());

    // Синхронизируем селект
    if (typeof renderClientPicker === 'function') renderClientPicker();
}


// Обновить плашку impersonation
function updateImpersonationBanner() {
    const banner = document.getElementById('impersonationBanner');
    const nameEl = document.getElementById('impersonationName');
    if (!banner || !nameEl) return;

    const me = getCurrentUser();
    if (!me || me.role !== 'admin') {
        banner.classList.add('hidden');
        return;
    }

    const impersonatedId = sessionStorage.getItem(IMPERSONATION_KEY);
    if (!impersonatedId) {
        banner.classList.add('hidden');
        return;
    }

    const client = findUserById(impersonatedId);
    if (!client) {
        // Клиент удалён — выходим из режима
        sessionStorage.removeItem(IMPERSONATION_KEY);
        banner.classList.add('hidden');
        return;
    }

    nameEl.textContent = client.name || client.login;
    banner.classList.remove('hidden');
}

// Обёртка: открыть календарь клиента и перейти на страницу «Мои тренировки»
window.openClientCalendar = function(clientId) {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') {
        showAlert('Открыть календарь клиента может только администратор');
        return;
    }

    const client = findUserById(clientId);
    if (!client) {
        showAlert('Клиент не найден');
        return;
    }
    if (client.role !== 'client') {
        showAlert('Этот пользователь не является клиентом');
        return;
    }

    // Входим в режим impersonation
    enterClientCalendar(clientId);

    // Переключаемся на страницу «Мои тренировки»
    if (typeof switchPage === 'function') {
        switchPage('workouts');
    }

    // Закрываем боковое меню (если открыто)
    if (typeof closeSideMenu === 'function') {
        closeSideMenu();
    }
};

// Экспорт для теста из консоли
window.enterClientCalendar = enterClientCalendar;
window.exitClientCalendar = exitClientCalendar;
window.renderScreeningPage = renderScreeningPage;
window.selectScreeningClient = selectScreeningClient;
window.renderTemplatesPage = renderTemplatesPage;
window.selectTemplateClient = selectTemplateClient;
document.addEventListener('DOMContentLoaded', function() {
    if (typeof initClientPicker === 'function') initClientPicker();
});

// Если DOM уже загружен
if (document.readyState !== 'loading') {
    if (typeof initClientPicker === 'function') initClientPicker();
}
// ================================================================
//   ОБРАБОТЧИКИ МОДАЛКИ КЛИЕНТА
// ================================================================


// Открытие модалки создания
document.getElementById('addClientBtn').addEventListener('click', function() {
    openCreateClientModal();
});

// Кнопка "Сгенерировать пароль"
const generatePwdBtn = document.getElementById('generatePasswordBtn');
if (generatePwdBtn) {
    generatePwdBtn.innerHTML = icons.refresh(16);
    generatePwdBtn.addEventListener('click', function() {
        document.getElementById('clientPassword').value = generatePassword(8);
        clientFormSnapshot = snapshotClientForm(); // чтобы не считалось «изменением»
    });
}

// Кнопка "Отмена"
document.getElementById('cancelClient').addEventListener('click', async function() {
    if (!await confirmCancel(clientFormHasChanges())) return;
    closeClientModal();
});

// Сохранение формы
document.getElementById('clientForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    clientFormSnapshot = ''; // сбрасываем, чтобы confirmCancel не сработал при успешном сохранении

    const name = document.getElementById('clientName').value.trim();

    // Валидация: имя
    if (!name) {
        await showAlert('Введите имя клиента');
        return;
    }

    // === РЕЖИМ РЕДАКТИРОВАНИЯ ===
    if (editingClientId) {
        const client = findUserById(editingClientId);
        if (!client) {
            await showAlert('Клиент не найден');
            return;
        }
        client.name = name;
        client.note = document.getElementById('clientNote').value.trim();
        saveUsersData();
        closeClientModal();
        renderClients();
        return;
    }

    // === РЕЖИМ СОЗДАНИЯ ===
    let login = document.getElementById('clientLogin').value.trim();
    let password = document.getElementById('clientPassword').value.trim();

    // Если логин пустой — генерируем автоматически
    if (!login) {
        login = 'client' + (usersData.users.length + 1);
    }

    // Если пароль пустой — генерируем
    if (!password) {
        password = generatePassword(8);
    }

    // Валидация: логин уникален
    if (findUserByLogin(login)) {
        await showAlert('Логин «' + login + '» уже занят. Введите другой.');
        return;
    }

    // Валидация: логин без пробелов и спецсимволов (латиница, цифры, _, -)
    if (!/^[A-Za-z0-9_-]{3,}$/.test(login)) {
        await showAlert('Логин должен содержать только латиницу, цифры, _ или -, минимум 3 символа.');
        return;
    }

    // Создаём клиента
    usersData.users.push({
        id: uuid(),
        login: login,
        password: password,
        role: 'client',
        name: name,
        note: document.getElementById('clientNote').value.trim(),
        createdAt: new Date().toISOString(),
        workoutsByDate: {}
    });

    saveUsersData();
    closeClientModal();
    renderClients();

    // Показываем логин и пароль, чтобы админ их скопировал
    await showAlert(
        'Клиент создан!\n\n' +
        'Логин: ' + login + '\n' +
        'Пароль: ' + password + '\n\n' +
        'Скопируйте и передайте клиенту.'
    );
});
// ================================================================
//   ОБРАБОТЧИКИ АНКЕТЫ
// ================================================================

// Сохранение анкеты
const profileFormEl = document.getElementById('profileForm');
if (profileFormEl) {
    profileFormEl.addEventListener('submit', function(e) {
        e.preventDefault();
        saveProfile();
    });
}

// ================================================================
//   ДЕЙСТВИЯ С КЛИЕНТОМ (модалка)
// ================================================================

let actionsClientId = null;

// Открыть модалку действий
window.openClientActionsModal = function(clientId) {
    const client = findUserById(clientId);
    if (!client) {
        showAlert('Клиент не найден');
        return;
    }

    actionsClientId = clientId;

    // Заголовок: "Действия с клиентом: Иван Петров"
    document.getElementById('clientActionsTitle').textContent =
        'Действия с клиентом: ' + (client.name || client.login);

    document.getElementById('clientActionsModal').classList.remove('hidden');
};

// Закрыть модалку действий
function closeClientActionsModal() {
    document.getElementById('clientActionsModal').classList.add('hidden');
    actionsClientId = null;
}

// Скопировать текст в буфер обмена (с fallback)
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    // fallback для старых браузеров
    return new Promise(function(resolve, reject) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            resolve();
        } catch (e) {
            reject(e);
        } finally {
            document.body.removeChild(ta);
        }
    });
}

// Сформировать текст с логином и паролем
function buildCredentialsText(client) {
    return 'Логин: ' + client.login + '\nПароль: ' + client.password;
}
// ================================================================
//   ОБРАБОТЧИКИ КНОПОК МОДАЛКИ ДЕЙСТВИЙ
// ================================================================
// Открыть анкету клиента (для админа)
window.openClientProfile = function(clientId) {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') {
        showAlert('Просмотр анкеты доступен только администратору');
        return;
    }

    const client = findUserById(clientId);
    if (!client) {
        showAlert('Клиент не найден');
        return;
    }
    if (client.role !== 'client') {
        showAlert('Этот пользователь не является клиентом');
        return;
    }

    // Запоминаем, какого клиента смотреть
    currentProfilesClientId = clientId;

    // Закрываем модалку действий
    closeClientActionsModal();

    // Переключаемся на страницу анкет
    switchPage('profiles');

    // renderProfilesPage() вызовется из switchPage,
    // и внутри — selectProfileClient(currentProfilesClientId)
};
// Открыть скрининг клиента (для админа)
window.openClientScreening = function(clientId) {
    const me = getCurrentUser();
    if (!me || me.role !== 'admin') {
        showAlert('Просмотр скрининга доступен только администратору');
        return;
    }

    const client = findUserById(clientId);
    if (!client) {
        showAlert('Клиент не найден');
        return;
    }
    if (client.role !== 'client') {
        showAlert('Этот пользователь не является клиентом');
        return;
    }

    // Запоминаем, какого клиента смотреть
    currentScreeningClientId = clientId;

    // Закрываем модалку действий
    closeClientActionsModal();

    // Переключаемся на страницу скрининга
    switchPage('screening');
};
// Закрытие модалки действий
document.getElementById('closeClientActions').addEventListener('click', closeClientActionsModal);

// Посмотреть анкету
document.getElementById('actionOpenProfile').addEventListener('click', function() {
    if (!actionsClientId) return;
    openClientProfile(actionsClientId);
});
// Посмотреть скрининг
document.getElementById('actionOpenScreening').addEventListener('click', function() {
    if (!actionsClientId) return;
    openClientScreening(actionsClientId);
});



// Просмотровая модалка — закрывается по фону и Esc
attachBackdropClose(document.getElementById('clientActionsModal'), closeClientActionsModal);
attachEscClose(document.getElementById('clientActionsModal'), closeClientActionsModal);

// 📋 Скопировать логин и пароль
document.getElementById('actionCopyCreds').addEventListener('click', async function() {
    if (!actionsClientId) return;
    const client = findUserById(actionsClientId);
    if (!client) return;

    try {
        await copyToClipboard(buildCredentialsText(client));
        closeClientActionsModal();
        await showAlert('Логин и пароль скопированы в буфер обмена');
    } catch (e) {
        await showAlert('Не удалось скопировать. Скопируйте вручную:\n\n' + buildCredentialsText(client));
    }
});

// 👁 Показать логин и пароль
document.getElementById('actionShowCreds').addEventListener('click', async function() {
    if (!actionsClientId) return;
    const client = findUserById(actionsClientId);
    if (!client) return;

    await showAlert(
        'Клиент: ' + (client.name || client.login) + '\n\n' +
        'Логин: ' + client.login + '\n' +
        'Пароль: ' + client.password
    );
});

// ✏️ Изменить имя / заметку
document.getElementById('actionEditClient').addEventListener('click', function() {
    if (!actionsClientId) return;
    const clientId = actionsClientId;
    closeClientActionsModal();
    openEditClientModal(clientId);
});

// 🔑 Сбросить пароль
document.getElementById('actionResetPassword').addEventListener('click', async function() {
    if (!actionsClientId) return;
    const client = findUserById(actionsClientId);
    if (!client) return;

    const ok = await showConfirm(
        'Сбросить пароль?',
        'Клиенту «' + (client.name || client.login) + '» будет сгенерирован новый пароль. Старый перестанет работать.',
        'Да, сбросить'
    );
    if (!ok) return;

    const newPassword = generatePassword(8);
    client.password = newPassword;
    saveUsersData();

    closeClientActionsModal();

    await showAlert(
        'Новый пароль для «' + (client.name || client.login) + '»:\n\n' +
        'Логин: ' + client.login + '\n' +
        'Пароль: ' + newPassword + '\n\n' +
        'Скопируйте и передайте клиенту.'
    );
});

// 🗑️ Удалить клиента
document.getElementById('actionDeleteClient').addEventListener('click', async function() {
    if (!actionsClientId) return;
    const client = findUserById(actionsClientId);
    if (!client) return;

    const ok = await showConfirm(
        'Удалить клиента?',
        'Клиент «' + (client.name || client.login) + '» будет удалён вместе со всеми тренировками, отчётами и обратной связью. Это действие необратимо.',
        'Да, удалить'
    );
    if (!ok) return;

    usersData.users = usersData.users.filter(function(u) {
        return u.id !== client.id;
    });
    saveUsersData();

    closeClientActionsModal();
    renderClients();

    await showAlert('Клиент удалён');
});

function logout() {
    // Очищаем сессию
    clearCurrentUser();

    // Сбрасываем режим impersonation
    sessionStorage.removeItem('impersonatingUserId_v1');

    // Отвязываем календарь
    dataByDate = {};

    // Сбрасываем интерфейс в админский вид
    document.body.classList.remove('client-mode');

    // Показываем форму входа
    showLoginOverlay();

    // Сбрасываем поля формы
    const loginInput = document.getElementById('loginInput');
    const passwordInput = document.getElementById('passwordInput');
    if (loginInput) loginInput.value = '';
    if (passwordInput) passwordInput.value = '';

    // Возвращаемся на главную страницу
    if (typeof switchPage === 'function') switchPage('workouts');
}

// Скрипт подключён в конце body — DOM уже загружен
(function() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            logout();
        });
    }

    const exitImpersonationBtn = document.getElementById('exitImpersonationBtn');
    if (exitImpersonationBtn) {
        exitImpersonationBtn.addEventListener('click', function() {
            exitClientCalendar();
        });
    }
})();