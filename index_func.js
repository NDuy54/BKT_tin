// index_func.js
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start_btn');
    const adminBtn = document.getElementById('admin_btn');
    const sidInput = document.getElementById('student_id');
    const msg = document.getElementById('msg');

    startBtn.addEventListener('click', () => {
        const sid = sidInput.value.trim();
        if (!sid) {
            msg.textContent = 'Vui lòng nhập mã học sinh (student ID).';
            return;
        }
        // chuyển sang trang KT với query params student_id
        location.href = `/kt?student_id=${encodeURIComponent(sid)}`;
    });

    adminBtn.addEventListener('click', () => {
        location.href = '/admin';
    });
});
