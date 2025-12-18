const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xzzaoniuzvcxqfugvfzh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6emFvbml1enZjeHFmdWd2ZnpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNDczMTYsImV4cCI6MjA4MTYyMzMxNn0.i9l_HJJgCR7_uqbjibE65D8Qk9N0nFSGIvGAt9m78QY'; // Используй service_role!
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const WAITING_TIME = 15000; 
const CRASH_PAUSE = 4000;

function generateCrashPoint() {
    const r = Math.random();
    if (r < 0.30) return 1.00; 
    if (r < 0.60) return 1.01 + (Math.random() * 0.24);
    if (r < 0.85) return 1.26 + (Math.random() * 0.74);
    if (r < 0.95) return 2.01 + (Math.random() * 2.99);
    return Math.min(5.01 + (Math.random() * 87.99), 93.0);
}

async function gameLoop() {
    while (true) {
        const roundId = Date.now();
        
        // 1. ОЖИДАНИЕ
        await sb.from('rocket_bets').delete().neq('player_id', 'none');
        await sb.from('rocket_state').update({
            status: 'waiting',
            multiplier: 1.0,
            start_time: roundId // Метка начала отсчета 15 сек
        }).eq('id', 1);

        await new Promise(r => setTimeout(r, WAITING_TIME));

        // 2. ПОЛЕТ
        const crashPoint = generateCrashPoint();
        const flightStart = Date.now();
        
        await sb.from('rocket_state').update({
            status: 'flying',
            crash_point: crashPoint,
            start_time: flightStart, // Метка начала полета
            multiplier: 1.0
        }).eq('id', 1);

        let currentMult = 1.0;
        while (currentMult < crashPoint) {
            await new Promise(r => setTimeout(r, 500)); // Обновляем базу редко
            const elapsed = (Date.now() - flightStart) / 1000;
            currentMult = Math.pow(1.15, elapsed);
            
            if (currentMult >= crashPoint) break;
            
            await sb.from('rocket_state').update({ multiplier: currentMult }).eq('id', 1);
        }

        // 3. КРАШ
        const { data } = await sb.from('rocket_state').select('history').eq('id', 1).single();
        let history = data.history || [];
        history.push(parseFloat(crashPoint.toFixed(2)));
        if(history.length > 15) history.shift();

        await sb.from('rocket_state').update({
            status: 'crashed',
            multiplier: crashPoint,
            history: history
        }).eq('id', 1);

        await sb.from('rocket_bets').update({ status: 'lost' }).eq('status', 'active');
        await new Promise(r => setTimeout(r, CRASH_PAUSE));
    }
}

gameLoop();
