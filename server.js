const { createClient } = require('@supabase/supabase-js');

// --- НАСТРОЙКИ ---
const SUPABASE_URL = 'https://xzzaoniuzvcxqfugvfzh.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_YAn708jttD0b0vAGLPreog_ZnCvFhAH'; // Используй сервис-ключ (service_role), если возможно
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const WAITING_TIME = 15000; // 15 секунд на ставки
const CRASH_PAUSE = 4000;   // 4 секунды пауза после взрыва
const MAX_MULTIPLIER = 93.0;

// --- МАТЕМАТИКА ШАНСОВ (Твои требования) ---
function generateCrashPoint() {
    const r = Math.random();
    if (r < 0.30) return 1.00; // 30% мгновенный взрыв
    if (r < 0.60) return 1.01 + (Math.random() * 0.24); // 30% до 1.25x
    if (r < 0.85) return 1.26 + (Math.random() * 0.74); // 25% до 2.00x
    if (r < 0.95) return 2.01 + (Math.random() * 2.99); // 10% до 5.00x
    
    // Остальные 5% до 93x
    const highCrash = 5.01 + (Math.random() * 87.99);
    return Math.min(highCrash, MAX_MULTIPLIER);
}

// --- ОСНОВНОЙ ИГРОВОЙ ЦИКЛ ---
async function gameLoop() {
    while (true) {
        console.log("--- НОВЫЙ РАУНД: ОЖИДАНИЕ СТАВОК ---");
        
        const roundId = Date.now();
        
        // 1. ФАЗА ОЖИДАНИЯ
        await sb.from('rocket_state').update({
            status: 'waiting',
            multiplier: 1.0,
            start_time: roundId,
            crash_point: 0
        }).eq('id', 1);

        // Очищаем старые ставки
        await sb.from('rocket_bets').delete().neq('player_id', 'none');

        await new Promise(resolve => setTimeout(resolve, WAITING_TIME));

        // 2. ПОДГОТОВКА К ПОЛЕТУ
        const crashPoint = generateCrashPoint();
        console.log(`Ракетка взлетает! Точка краша: ${crashPoint.toFixed(2)}x`);

        await sb.from('rocket_state').update({
            status: 'flying',
            crash_point: crashPoint,
            start_time: Date.now()
        }).eq('id', 1);

        // 3. ФАЗА ПОЛЕТА
        let currentMultiplier = 1.0;
        const flightStart = Date.now();

        while (currentMultiplier < crashPoint) {
            // Рассчитываем множитель в зависимости от времени (плавный рост)
            const elapsed = (Date.now() - flightStart) / 1000;
            currentMultiplier = Math.pow(1.15, elapsed); // Экспоненциальный рост

            if (currentMultiplier >= crashPoint) break;

            // Обновляем множитель в базе для игроков
            await sb.from('rocket_state').update({
                multiplier: currentMultiplier
            }).eq('id', 1);

            // Скорость обновления базы (каждые 400мс, чтобы не спамить запросами)
            await new Promise(resolve => setTimeout(resolve, 400));
        }

        // 4. ФАЗА КРАША
        console.log("BOOM! CRASH!");
        
        // Получаем текущую историю
        const { data: state } = await sb.from('rocket_state').select('history').eq('id', 1).single();
        let history = state.history || [];
        history.push(parseFloat(crashPoint.toFixed(2)));
        if (history.length > 15) history.shift();

        // Обновляем статус на CRASHED
        await sb.from('rocket_state').update({
            status: 'crashed',
            multiplier: crashPoint,
            history: history
        }).eq('id', 1);

        // Все активные ставки в этом раунде помечаем как LOST
        await sb.from('rocket_bets').update({ status: 'lost' }).eq('status', 'active');

        await new Promise(resolve => setTimeout(resolve, CRASH_PAUSE));
    }
}

// Запуск
console.log("Запуск сервера Ракеты @game44...");
gameLoop().catch(err => console.error("Критическая ошибка цикла:", err));