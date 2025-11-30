// KT_func.js
let student_id = null;
let test = null;
let test_id = null;
let leaveCount = 0;
let timerInterval = null;
let timeRemaining = 0; // seconds

function qs(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

async function fetchTests() {
    const res = await fetch('/api/tests');
    const data = await res.json();
    if (data.ok) return data.tests;
    throw new Error('Không lấy được tests');
}

function renderQuestions(t) {
    const container = document.getElementById('questions');
    container.innerHTML = '';
    t.questions.forEach((q, idx) => {
        const box = document.createElement('div');
        box.className = 'qbox';
        const qtitle = document.createElement('div');
        qtitle.innerHTML = `<strong>Câu ${idx + 1}:</strong> ${q.question}`;
        box.appendChild(qtitle);

        if (q.type === 'mcq') {
            q.choices.forEach((c, i) => {
                const id = `q_${q.id}_${i}`;
                const label = document.createElement('label');
                label.style.display = 'block';
                label.innerHTML = `<input type="radio" name="q_${q.id}" value="${i}" id="${id}"> ${c}`;
                box.appendChild(label);
            });
        } else { // short answer
            const ta = document.createElement('input');
            ta.className = 'input';
            ta.name = `q_${q.id}`;
            box.appendChild(ta);
        }
        container.appendChild(box);
    });
}

function collectAnswers() {
    const ans = {};
    test.questions.forEach(q => {
        const name = `q_${q.id}`;
        if (q.type === 'mcq') {
            const sel = document.querySelector(`input[name="${name}"]:checked`);
            ans[q.id] = sel ? sel.value : null;
        } else {
            const el = document.querySelector(`input[name="${name}"]`);
            ans[q.id] = el ? el.value : '';
        }
    });
    return ans;
}

async function submitAnswers() {
    const answers = collectAnswers();
    try {
        const res = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id, test_id, answers })
        });
        const data = await res.json();
        if (data.ok) {
            alert('Nộp bài thành công!');
            window.location.href = '/';
        } else {
            alert('Lỗi khi nộp: ' + (data.error || 'unknown'));
        }
    } catch (e) {
        alert('Lỗi mạng khi nộp bài');
    }
}

function startTimer(seconds) {
    timeRemaining = seconds;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeRemaining--;
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            alert('Hết thời gian! Bài sẽ được nộp tự động.');
            submitAnswers();
        } else {
            updateTimerDisplay();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const mm = String(Math.floor(timeRemaining / 60)).padStart(2, '0');
    const ss = String(timeRemaining % 60).padStart(2, '0');
    document.getElementById('timer').textContent = `${mm}:${ss}`;
}

async function logEvent(eventName) {
    // send to server
    try {
        await fetch('/api/log_event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id, test_id, event: eventName })
        });
    } catch (e) {
        // ignore
    }
}

function incLeave() {
    leaveCount++;
    document.getElementById('leave_count').textContent = leaveCount;
}

document.addEventListener('visibilitychange', async () => {
    const state = document.hidden ? 'hidden' : 'visible';
    document.getElementById('vis_state').textContent = state;
    if (state === 'hidden') {
        incLeave();
        await logEvent('visibility_hidden');
    } else {
        await logEvent('visibility_visible');
    }
});

window.addEventListener('blur', async () => {
    // may fire when user switches window
    incLeave();
    await logEvent('blur');
});

window.addEventListener('focus', async () => {
    await logEvent('focus');
});

window.addEventListener('DOMContentLoaded', async () => {
    student_id = qs('student_id') || prompt('Nhập mã học sinh (student id):');
    if (!student_id) {
        alert('Thiếu student id. Quay lại trang chủ.');
        window.location.href = '/';
        return;
    }
    document.getElementById('sid_display').textContent = student_id;

    // choose a test. For demo: pick first test or a test id passed in query param
    const test_param = qs('test_id');
    const tests = await fetchTests();
    if (test_param) {
        test = tests.find(t => t.id === test_param);
    } else {
        test = tests[0];
    }
    if (!test) {
        alert('Không tìm thấy đề.');
        window.location.href = '/';
        return;
    }
    test_id = test.id;
    document.getElementById('test_title').textContent = test.title || test.id;
    renderQuestions(test);
    startTimer((test.duration_minutes || 15) * 60);

    document.getElementById('submit_btn').addEventListener('click', () => {
        if (confirm('Bạn có chắc muốn nộp bài không?')) {
            submitAnswers();
        }
    });

    // initial log that student started
    await logEvent('start_test');
});
