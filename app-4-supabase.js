// ================================================================
//   ЧАСТЬ 4: SUPABASE — подключение и функции
// ================================================================
// Подключение к Supabase. Пока НЕ заменяет localStorage —
// работает параллельно, чтобы можно было постепенно мигрировать.

// ⚠️ ЗАМЕНИ ЭТИ ДВЕ СТРОКИ НА СВОИ ЗНАЧЕНИЯ ИЗ SUPABASE
// Supabase URL — из Settings → API
// Publishable key — из Settings → API (в новом формате sb_publishable_...)
const SUPABASE_URL = 'https://xdiyvgkcskykagnmgwip.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xQ5DZga6zddIcBR_ZFH6aQ_s28G-MCm';

// Инициализация клиента (клиент доступен глобально как sb)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ================================================================
//   Проверка подключения
// ================================================================

// Простой тест: попробовать получить одну строку из profiles
async function sbTestConnection() {
    try {
        const { data, error } = await sb
            .from('profiles')
            .select('id')
            .limit(1);

        if (error) {
            console.error('❌ Supabase ошибка:', error.message);
            return false;
        }

        console.log('%c✓ Supabase подключён', 'color: #2f6b4f; font-weight: bold;');
        return true;
    } catch (e) {
        console.error('❌ Не удалось подключиться к Supabase:', e);
        return false;
    }
}

// ================================================================
//   СОЗДАНИЕ ПЕРВОГО АДМИНА
// ================================================================
// Вызывать из Console ОДИН РАЗ, если в Supabase нет ни одного админа.
// После создания — удалить или закомментировать.

window.sbCreateFirstAdmin = async function() {
    const ADMIN_LOGIN = 'admin';
    const ADMIN_PASSWORD = 'admin12345';
    const ADMIN_NAME = 'Администратор';

    console.log('Создаю админа...');

    // 1. Создаём пользователя в auth.users через signUp
   const { data: authData, error: authError } = await sb.auth.signUp({
    email: ADMIN_LOGIN + '@workout-app.com',
    password: ADMIN_PASSWORD
});

    if (authError) {
        console.error('❌ Ошибка регистрации:', authError.message);
        return;
    }

    if (!authData.user) {
    console.error('❌ Пользователь не создан');
    return;
}

console.log('Auth пользователь создан:', authData.user.id);

// Логинимся сразу после регистрации (чтобы получить активную сессию)
const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({
    email: ADMIN_LOGIN + '@workout-app.com',
    password: ADMIN_PASSWORD
});

if (signInError) {
    console.error('❌ Ошибка входа после регистрации:', signInError.message);
    return;
}

console.log('✓ Вошли как:', signInData.user.email);

    // 2. Создаём запись в profiles
    const { error: profileError } = await sb
        .from('profiles')
        .insert({
            id: authData.user.id,
            login: ADMIN_LOGIN,
            name: ADMIN_NAME,
            role: 'admin'
        });

    if (profileError) {
        console.error('❌ Ошибка создания профиля:', profileError.message);
        return;
    }

    console.log('%c✓ Админ создан!', 'color: #2f6b4f; font-weight: bold;');
    console.log('Логин:', ADMIN_LOGIN);
    console.log('Пароль:', ADMIN_PASSWORD);
    console.log('%cВАЖНО: смени пароль после первого входа!', 'color: #a94442; font-weight: bold;');
};

// ================================================================
//   ДИАГНОСТИКА
// ================================================================
window.sbDiagnostics = async function() {
    console.log('--- Диагностика Supabase ---');
    console.log('URL:', SUPABASE_URL);
    console.log('Ключ (первые 30):', SUPABASE_KEY.slice(0, 30) + '...');

    const ok = await sbTestConnection();

    if (ok) {
        const { data, count, error } = await sb
            .from('profiles')
            .select('*', { count: 'exact' });

        if (error) {
            console.error('Ошибка чтения profiles:', error.message);
        } else {
            console.log('Профилей в базе:', count);
        }
    }
};

// Автопроверка при загрузке
document.addEventListener('DOMContentLoaded', function() {
    sbTestConnection();
});

// Если DOM уже загружен
if (document.readyState !== 'loading') {
    sbTestConnection();
}