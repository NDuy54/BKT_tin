document.addEventListener("DOMContentLoaded", () => {
    const adminKeyInput = document.getElementById("admin_key");
    const saveBtn = document.getElementById("saveBtn");
    const fetchLogsBtn = document.getElementById("fetch_logs");
    const deleteAllBtn = document.getElementById("delete_test_btn");
    const msg = document.getElementById("msg");
    const logsDiv = document.getElementById("logs");
    const questionArea = document.getElementById("questionArea");
    const addQBtn = document.getElementById("addQBtn");

    // add question (keeps old behavior)
    addQBtn.addEventListener("click", () => {
        const qDiv = document.createElement("div");
        qDiv.className = "question-block";
        qDiv.style.position = "relative";

        const qIndex = questionArea.children.length + 1;

        qDiv.innerHTML = `
        <button class="delete_question_btn">❌</button>
        <h3>Câu ${qIndex}</h3>
        <label>Câu hỏi:</label>
        <textarea class="q_text" placeholder="Nhập nội dung câu hỏi"></textarea>

        <div class="answers">
            ${["A", "B", "C", "D"].map(opt => `
                <div class="ans">
                    <label>Đáp án ${opt}:</label>
                    <input type="text" class="ans_${opt}" placeholder="Nhập đáp án ${opt}">
                </div>
            `).join("")}
        </div>

        <label>Đáp án đúng:</label>
        <select class="correct_ans">
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
        </select>
        <hr>
    `;

        // Xử lý nút xóa
        const delBtn = qDiv.querySelector(".delete_question_btn");
        delBtn.addEventListener("click", () => qDiv.remove());

        questionArea.appendChild(qDiv);
    });
    // save test (unchanged format: choices array + answer index)
    saveBtn.addEventListener("click", async () => {
        const key = adminKeyInput.value.trim();
        if (!key) return alert("Nhập mật khẩu admin");
        const questions = [];
        document.querySelectorAll(".question-block").forEach((div, idx) => {
            const q_text = div.querySelector(".q_text").value.trim();
            const A = div.querySelector(".ans_A").value.trim();
            const B = div.querySelector(".ans_B").value.trim();
            const C = div.querySelector(".ans_C").value.trim();
            const D = div.querySelector(".ans_D").value.trim();
            const correct = div.querySelector(".correct_ans").value;
            if (!q_text || !A || !B || !C || !D) return;
            const choiceArr = [A, B, C, D];
            const answerIndex = ["A", "B", "C", "D"].indexOf(correct);
            questions.push({
                id: `q${idx + 1}`,
                type: "mcq",
                question: q_text,
                choices: choiceArr,
                answer: answerIndex
            });
        });
        if (questions.length === 0) { alert("Chưa có câu hỏi hợp lệ!"); return; }
        try {
            const res = await fetch("/api/create_test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ admin_key: key, questions })
            });
            const data = await res.json();
            if (data.ok) { msg.textContent = "✅ Đã lưu bài kiểm tra!"; msg.style.color = "green"; }
            else { msg.textContent = "❌ " + (data.error || "Lỗi"); msg.style.color = "red"; }
        } catch (err) {
            msg.textContent = "❌ Lỗi mạng khi lưu."; msg.style.color = "red";
        }
    });

    // fetch aggregated stats
    fetchLogsBtn.addEventListener("click", async () => {
        const key = adminKeyInput.value.trim();
        if (!key) return alert("Nhập mật khẩu admin");
        logsDiv.innerHTML = "⏳ Đang tải...";
        try {
            const res = await fetch(`/api/stats?admin_key=${encodeURIComponent(key)}`);
            const data = await res.json();
            if (!data.ok) { logsDiv.textContent = "❌ " + (data.error || "không thể tải"); return; }
            const stats = data.stats || [];
            if (stats.length === 0) { logsDiv.textContent = "Không có dữ liệu."; return; }
            let html = `<table><thead><tr><th>STT</th><th>Student ID</th><th>Số lần thoát</th><th>Điểm (thang10)</th><th>Last submit</th><th>Xóa</th></tr></thead><tbody>`;
            stats.forEach((s, i) => {
                html += `<tr>
          <td>${i + 1}</td>
          <td>${s.student_id}</td>
          <td>${(Number(s.exits) || 0) <= 4 ? 0 : Number(s.exits) / 2 - 2}</td>
          <td>${s.score10 === null || s.score10 === undefined ? "–" : s.score10}</td>
          <td>${s.last_submit || ""}</td>
          <td><button class="del-student" style="background: #ff4d4f;" data-sid="${s.student_id}">🗑️</button></td>
        </tr>`;
            });
            html += `</tbody></table>`;
            logsDiv.innerHTML = html;

            // attach delete handler for each student button
            logsDiv.querySelectorAll(".del-student").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    const sid = e.currentTarget.dataset.sid;
                    if (!confirm(`Xóa dữ liệu của học sinh ${sid}?`)) return;
                    try {
                        const res = await fetch("/api/delete_student", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ admin_key: key, student_id: sid })
                        });
                        const data = await res.json();
                        if (data.ok) {
                            alert("Đã xóa dữ liệu học sinh " + sid);
                            fetchLogsBtn.click(); // refresh
                        } else {
                            alert("Lỗi: " + (data.error || "không xóa được"));
                        }
                    } catch {
                        alert("Lỗi mạng khi xóa học sinh");
                    }
                });
            });

        } catch (err) {
            logsDiv.textContent = "❌ Lỗi khi tải thống kê.";
        }
    });

    // delete all
    deleteAllBtn.addEventListener("click", async () => {
        const key = adminKeyInput.value.trim();
        if (!key) return alert("Nhập mật khẩu admin");
        if (!confirm("Xóa tất cả bài kiểm tra và logs?")) return;
        try {
            const res = await fetch("/api/delete_all", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ admin_key: key })
            });
            const data = await res.json();
            if (data.ok) {
                alert("Đã xóa toàn bộ dữ liệu.");
                logsDiv.innerHTML = "";
            } else alert("Lỗi: " + (data.error || "không xóa được"));
        } catch {
            alert("Lỗi mạng khi xóa");
        }
    });
});