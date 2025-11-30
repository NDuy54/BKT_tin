# server.py (SỬA LẠI)
from flask import Flask, send_from_directory, jsonify, request, abort
import os
import json
from threading import Lock
from datetime import datetime

app = Flask(__name__, static_folder='.', static_url_path='')

# ==== Cấu hình chính ====
ADMIN_KEY = "12345"   # đổi giá trị này nếu muốn
DATA_DIR = 'data'
TESTS_FILE = os.path.join(DATA_DIR, 'tests.json')
LOGS_FILE = os.path.join(DATA_DIR, 'logs.json')
lock = Lock()

# Ensure data dir and files exist
os.makedirs(DATA_DIR, exist_ok=True)
if not os.path.exists(TESTS_FILE):
    with open(TESTS_FILE, 'w', encoding='utf-8') as f:
        json.dump([], f, ensure_ascii=False, indent=2)
if not os.path.exists(LOGS_FILE):
    with open(LOGS_FILE, 'w', encoding='utf-8') as f:
        json.dump([], f, ensure_ascii=False, indent=2)


# ==== Helpers ====
def read_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ==== Routes phục vụ trang tĩnh ====
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')


@app.route('/kt')
def serve_kt():
    return send_from_directory('.', 'KT.html')


@app.route('/admin')
def serve_admin():
    return send_from_directory('.', 'admin.html')


@app.route('/deco/<path:filename>')
def serve_css(filename):
    return send_from_directory('deco', filename)


# ==== API: get tests ====
@app.route('/api/tests', methods=['GET'])
def api_get_tests():
    tests = read_json(TESTS_FILE)
    return jsonify({'ok': True, 'tests': tests})


# ==== API: create test (admin) - old full format (/api/tests POST) ====
@app.route('/api/tests', methods=['POST'])
def api_create_test():
    body = request.get_json(force=True)
    admin_key = body.get('admin_key')
    if admin_key != ADMIN_KEY:
        return jsonify({'ok': False, 'error': 'unauthorized'}), 403

    test = body.get('test')
    if not test or 'id' not in test:
        return jsonify({'ok': False, 'error': 'invalid test payload'}), 400

    with lock:
        tests = read_json(TESTS_FILE)
        # check id uniqueness
        for t in tests:
            if t.get('id') == test['id']:
                return jsonify({'ok': False, 'error': 'test id exists'}), 400
        tests.append(test)
        write_json(TESTS_FILE, tests)
    return jsonify({'ok': True, 'test': test})


# ==== API: alternative create endpoint for simpler admin UI (/api/create_test) ====
# Accepts payload like: { admin_key, questions: [ { q_text, A, B, C, D, correct }, ... ], id?, title?, duration_minutes? }
@app.route('/api/create_test', methods=['POST'])
def api_create_test_simple():
    data = request.get_json(force=True)
    if data.get('admin_key') != ADMIN_KEY:
        return jsonify({'ok': False, 'error': 'unauthorized'}), 403

    questions_in = data.get('questions')
    if not isinstance(questions_in, list) or len(questions_in) == 0:
        return jsonify({'ok': False, 'error': 'questions must be a non-empty list'}), 400

    # build test meta
    test_id = data.get('id') or data.get('test_id') or f"test_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    title = data.get('title') or f"Bài kiểm tra {test_id}"
    duration = int(data.get('duration_minutes') or data.get('duration') or 15)

    # convert admin-provided question shape to standard shape used by front-end
    questions = []
    for i, q in enumerate(questions_in, start=1):
        # If admin already provided full structure (question + choices), accept them
        if 'question' in q and 'choices' in q:
            # ensure answer index present (may be 0-based or letter)
            answer = q.get('answer')
            # accept either numeric index or letter
            if isinstance(answer, str) and answer.upper() in ['A','B','C','D']:
                answer_index = ord(answer.upper()) - ord('A')
            elif isinstance(answer, int):
                answer_index = int(answer)
            else:
                answer_index = 0
            questions.append({
                'id': q.get('id', f"q{i}"),
                'type': q.get('type','mcq'),
                'question': q.get('question'),
                'choices': q.get('choices'),
                'answer': answer_index
            })
        else:
            # expect q_text, A,B,C,D, correct (letter)
            q_text = q.get('q_text') or q.get('question') or ''
            A = q.get('A') or ''
            B = q.get('B') or ''
            C = q.get('C') or ''
            D = q.get('D') or ''
            correct = q.get('correct') or q.get('answer') or 'A'
            correct = str(correct).strip().upper()
            answer_index = 0
            if correct in ['A','B','C','D']:
                answer_index = ord(correct) - ord('A')
            choices = [A, B, C, D]
            questions.append({
                'id': f"q{i}",
                'type': 'mcq',
                'question': q_text,
                'choices': choices,
                'answer': answer_index
            })

    test_obj = {
        'id': test_id,
        'title': title,
        'duration_minutes': duration,
        'questions': questions
    }

    # save into TESTS_FILE (append)
    with lock:
        tests = read_json(TESTS_FILE)
        # ensure id uniqueness
        if any(t.get('id') == test_id for t in tests):
            return jsonify({'ok': False, 'error': 'test id exists'}), 400
        tests.append(test_obj)
        write_json(TESTS_FILE, tests)

    return jsonify({'ok': True, 'test': test_obj})


# ==== API: student submits answers ====
@app.route('/api/submit', methods=['POST'])
def api_submit():
    body = request.get_json(force=True)
    student_id = body.get('student_id')
    test_id = body.get('test_id')
    answers = body.get('answers')
    ts = datetime.utcnow().isoformat() + 'Z'
    if not student_id or not test_id or answers is None:
        return jsonify({'ok': False, 'error': 'missing fields'}), 400

    entry = {
        'type': 'submission',
        'student_id': student_id,
        'test_id': test_id,
        'answers': answers,
        'timestamp': ts
    }
    with lock:
        logs = read_json(LOGS_FILE)
        logs.append(entry)
        write_json(LOGS_FILE, logs)
    return jsonify({'ok': True})


# ==== API: log focus/exit event ====
@app.route('/api/log_event', methods=['POST'])
def api_log_event():
    body = request.get_json(force=True)
    student_id = body.get('student_id')
    test_id = body.get('test_id')
    event = body.get('event')  # e.g., 'blur', 'visibility_hidden', 'focus'
    ts = datetime.utcnow().isoformat() + 'Z'
    if not student_id or not test_id or not event:
        return jsonify({'ok': False, 'error': 'missing fields'}), 400
    entry = {
        'type': 'event',
        'student_id': student_id,
        'test_id': test_id,
        'event': event,
        'timestamp': ts
    }
    with lock:
        logs = read_json(LOGS_FILE)
        logs.append(entry)
        write_json(LOGS_FILE, logs)
    return jsonify({'ok': True})

# ==== API: stats aggregated (admin) ====
@app.route('/api/stats', methods=['GET'])
def api_stats():
    admin_key = request.args.get('admin_key')
    if admin_key != ADMIN_KEY:
        return jsonify({'ok': False, 'error': 'unauthorized'}), 403

    logs = read_json(LOGS_FILE)
    tests = read_json(TESTS_FILE)

    # build lookup for tests answers (for scoring)
    test_lookup = {}
    for t in tests:
        test_lookup[t.get('id')] = t

    # aggregate per student_id
    stats = {}
    for entry in logs:
        sid = entry.get('student_id') or entry.get('student_id') or entry.get('student') or entry.get('student_name')
        if not sid:
            continue
        rec = stats.setdefault(sid, {
            'student_id': sid,
            'student_name': entry.get('student_name') or entry.get('name') or sid,
            'exits': 0,
            'submissions': [],
            'last_submit': None
        })
        if entry.get('type') == 'event':
            # count only events that represent leaving/focus loss
            if entry.get('event') in ('blur', 'visibility_hidden', 'focus_loss', 'tab_hide'):
                rec['exits'] += 1
        elif entry.get('type') == 'submission':
            rec['submissions'].append(entry)
            # update last_submit timestamp
            ts = entry.get('timestamp')
            if ts and (rec['last_submit'] is None or ts > rec['last_submit']):
                rec['last_submit'] = ts

    # compute score (thang 10) using latest submission per student
    results = []
    for sid, rec in stats.items():
        score10 = None
        # pick latest submission if any
        if rec['submissions']:
            # use last submission by timestamp
            latest = sorted(rec['submissions'], key=lambda x: x.get('timestamp',''))[-1]
            test_id = latest.get('test_id')
            answers = latest.get('answers') or {}
            test = test_lookup.get(test_id)
            if test:
                correct = 0
                total = len(test.get('questions', []))
                if total == 0:
                    score10 = 0.0
                else:
                    for q in test.get('questions', []):
                        qid = q.get('id')
                        # answers may be numeric indices or strings
                        given = answers.get(qid)
                        # normalize: if radio returns string index, convert to int
                        try:
                            if given is None:
                                pass
                            else:
                                gi = int(given)
                                if gi == q.get('answer'):
                                    correct += 1
                        except:
                            # maybe given is letter A/B/C/D
                            if isinstance(given, str) and given.upper() in ['A','B','C','D']:
                                idx = ord(given.upper()) - ord('A')
                                if idx == q.get('answer'):
                                    correct += 1
                    score10 = round((correct / total) * 10, 1)
            else:
                score10 = 0.0
        results.append({
            'student_id': rec['student_id'],
            'student_name': rec.get('student_name'),
            'exits': rec.get('exits', 0),
            'score10': score10,
            'last_submit': rec.get('last_submit')
        })

    return jsonify({'ok': True, 'stats': results})


# ==== API: delete all tests + logs (admin) ====
@app.route('/api/delete_all', methods=['POST'])
def api_delete_all():
    data = request.get_json(force=True)
    if data.get('admin_key') != ADMIN_KEY:
        return jsonify({'ok': False, 'error': 'unauthorized'}), 403

    with lock:
        write_json(TESTS_FILE, [])
        write_json(LOGS_FILE, [])
    return jsonify({'ok': True})


# ==== API: delete single student logs/submissions ====
@app.route('/api/delete_student', methods=['POST'])
def api_delete_student():
    data = request.get_json(force=True)
    if data.get('admin_key') != ADMIN_KEY:
        return jsonify({'ok': False, 'error': 'unauthorized'}), 403
    student_id = data.get('student_id')
    if not student_id:
        return jsonify({'ok': False, 'error': 'missing student_id'}), 400

    with lock:
        logs = read_json(LOGS_FILE)
        logs = [l for l in logs if (l.get('student_id') or l.get('student') or l.get('student_name')) != student_id]
        write_json(LOGS_FILE, logs)
    return jsonify({'ok': True})



# ==== API: get logs (admin) ====
@app.route('/api/logs', methods=['GET'])
def api_get_logs():
    admin_key = request.args.get('admin_key')
    if admin_key != ADMIN_KEY:
        return jsonify({'ok': False, 'error': 'unauthorized'}), 403

    logs = read_json(LOGS_FILE)
    return jsonify({'ok': True, 'logs': logs})


# ==== Serve other static files (js, html, ...) LAST to avoid catching API paths ====
@app.route('/<path:filename>')
def serve_static_any(filename):
    return send_from_directory('.', filename)


if __name__ == '__main__':
    # debug=True chỉ dùng khi dev
    app.run(host='0.0.0.0', port=5000, debug=True)

