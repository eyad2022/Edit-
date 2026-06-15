let savedSelection = null;
let activeEditor = null;

document.addEventListener('selectionchange', () => {
    if (document.activeElement && document.activeElement.getAttribute('contenteditable') === 'true') {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            savedSelection = sel.getRangeAt(0);
            activeEditor = document.activeElement;
        }
    }
});

function formatText(cmd, val = null) {
    if (activeEditor && savedSelection) {
        activeEditor.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedSelection);
    }
    document.execCommand(cmd, false, val);

    if (window.getSelection().rangeCount > 0) {
        savedSelection = window.getSelection().getRangeAt(0);
    }

    autoSaveData();
    syncTextToDatabase();
}

const firebaseConfig = {
    apiKey: "AIzaSyDAbNo9AHi73rTNogXHpKk9MDp8HpY16Mw",
    authDomain: "elalfey-app.firebaseapp.com",
    projectId: "elalfey-app",
    storageBucket: "elalfey-app.firebasestorage.app",
    messagingSenderId: "676659616653",
    appId: "1:676659616653:web:6a6e3ef338cc9a0e8bfbc4",
    measurementId: "G-8S7X0YJGFZ"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let localDeviceId = localStorage.getItem('elalfey_device_id') || Math.random().toString(36).substring(2, 15);
localStorage.setItem('elalfey_device_id', localDeviceId);

let currentMode = 'questions';
let currentQuestionSystem = 'arabic';
let questionsDatabase = [];
let appHistory = [];
let appHistoryIndex = -1;
let historyTimeout;
let pendingAction = null;
let pendingActionParam = null;
let historySaveTimeout;

function setQuestionSystem(sys) {
    currentQuestionSystem = sys;
    document.getElementById('sysBtnArabic').style = "background:var(--ui-container); color:var(--ui-text); flex: 1; justify-content: center; min-width: 200px;";
    document.getElementById('sysBtnForeign').style = "background:var(--ui-container); color:var(--ui-text); flex: 1; justify-content: center; min-width: 200px;";
    document.getElementById('sysBtnScience').style = "background:var(--ui-container); color:var(--ui-text); flex: 1; justify-content: center; min-width: 200px;";

    let activeBtn = sys === 'arabic' ? 'sysBtnArabic' : sys === 'foreign' ? 'sysBtnForeign' : 'sysBtnScience';
    document.getElementById(activeBtn).style = "background:var(--primary-color); color:white; border-color:var(--primary-color); flex: 1; justify-content: center; min-width: 200px;";

    const qInp = document.getElementById('questionsInput');
    const aInp = document.getElementById('answersInput');
    const sciTb = document.getElementById('scientificToolbar');
    const mcqBtn = document.getElementById('btnInsertMCQ');
    const tfBtn = document.getElementById('btnInsertTF');
    const essayBtn = document.getElementById('btnInsertEssay');

    if (sys === 'arabic') {
        qInp.dir = "auto";
        qInp.style.textAlign = "start";
        qInp.style.fontFamily = "inherit";
        aInp.dir = "auto";
        aInp.style.textAlign = "start";
        aInp.style.fontFamily = "inherit";
        if (sciTb) sciTb.style.display = "none";
        mcqBtn.innerHTML = "➕ سؤال اختياري";
        tfBtn.innerHTML = "➕ سؤال صح/خطأ";
        essayBtn.innerHTML = "➕ سؤال مقالي";
    } else if (sys === 'foreign') {
        qInp.dir = "ltr";
        qInp.style.textAlign = "left";
        qInp.style.fontFamily = "'Readex Pro', Arial, sans-serif";
        aInp.dir = "ltr";
        aInp.style.textAlign = "left";
        aInp.style.fontFamily = "'Readex Pro', Arial, sans-serif";
        if (sciTb) sciTb.style.display = "none";
        mcqBtn.innerHTML = "➕ Add MCQ";
        tfBtn.innerHTML = "➕ Add T/F";
        essayBtn.innerHTML = "➕ Add Essay";
    } else if (sys === 'science') {
        qInp.dir = "auto";
        qInp.style.textAlign = "left";
        qInp.style.fontFamily = "inherit";
        aInp.dir = "auto";
        aInp.style.textAlign = "left";
        aInp.style.fontFamily = "inherit";
        if (sciTb) sciTb.style.display = "flex";
        mcqBtn.innerHTML = "➕ MCQ (Science)";
        tfBtn.innerHTML = "➕ T/F (Science)";
        essayBtn.innerHTML = "➕ Essay (Science)";
    }
    showToast("تم تفعيل " + document.getElementById(activeBtn).innerText, 'info');
}

function insertSci(code) {
    document.getElementById('questionsInput').focus();
    document.execCommand('insertHTML', false, code);
    if (window.MathJax) setTimeout(() => MathJax.typesetPromise(), 100);
    autoSaveData();
    syncTextToDatabase();
}

let activeImage = null;

document.addEventListener('click', function (e) {
    if (e.target.tagName === 'IMG' && e.target.closest('[contenteditable="true"]')) {
        activeImage = e.target;
        const t = document.getElementById('imageToolbar');
        const rect = activeImage.getBoundingClientRect();
        t.style.top = (rect.top + window.scrollY - 90) + 'px';
        t.style.left = (rect.left + window.scrollX + (rect.width / 2) - 110) + 'px';
        t.style.display = 'flex';
    } else if (!e.target.closest('#imageToolbar')) {
        const t = document.getElementById('imageToolbar');
        if (t) t.style.display = 'none';
        activeImage = null;
    }
});

function alignImage(pos) {
    if (!activeImage) return;
    if (pos === 'center') {
        activeImage.style.display = 'block';
        activeImage.style.float = 'none';
        activeImage.style.margin = '15px auto';
    } else if (pos === 'right') {
        activeImage.style.display = 'inline-block';
        activeImage.style.float = 'right';
        activeImage.style.margin = '5px 0 15px 15px';
    } else {
        activeImage.style.display = 'inline-block';
        activeImage.style.float = 'left';
        activeImage.style.margin = '5px 15px 15px 0';
    }
    autoSaveData();
    syncTextToDatabase();
}

function resizeImage(width, height = 'auto') {
    if (!activeImage) return;
    activeImage.style.width = width;
    activeImage.style.height = height;
    autoSaveData();
    syncTextToDatabase();
}

// دالة جديدة للتحكم الدقيق بزيادة أو نقصان الطول والعرض
function adjustImageSize(dimension, amount) {
    if (!activeImage) return;
    let currentSize = parseInt(window.getComputedStyle(activeImage)[dimension]);
    if (isNaN(currentSize)) currentSize = 100;
    let newSize = currentSize + amount;
    if (newSize < 20) newSize = 20; // منع تصغير الصورة لدرجة الاختفاء
    activeImage.style[dimension] = newSize + 'px';
    autoSaveData();
    syncTextToDatabase();
}

function getEditorText(id) {
    const el = document.getElementById(id);
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    clone.querySelectorAll('div, p').forEach(div => div.replaceWith('\n' + div.innerHTML + '\n'));
    let temp = document.createElement('div');
    temp.innerHTML = clone.innerHTML;
    let finalStr = '';

    function traverse(node) {
        if (node.nodeType === 3) finalStr += node.nodeValue;
        else if (node.nodeName === 'IMG') finalStr += '\n' + node.outerHTML + '\n';
        else node.childNodes.forEach(traverse);
    }
    traverse(temp);
    return finalStr.replace(/\n\n+/g, '\n').trim();
}

function getRawPreamble(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return '';
    let childNodes = Array.from(el.childNodes);
    let html = '';
    for (let node of childNodes) {
        let text = node.textContent || node.innerText || "";
        if (text.trim().match(/^\s*\**\d+\s*[\.\-\)]/)) break;
        html += node.nodeType === 1 ? node.outerHTML : node.textContent;
    }
    return html;
}

let sessionListener = null; // متغير لحفظ المراقب اللحظي

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const docRef = db.collection('users').doc(user.uid);

        // 1. الفحص الأولي عند الدخول
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            let data = docSnap.data();
            let devices = data.devices || [];

            // 2. نظام التخيير الصارم للأجهزة الجديدة
            if (!devices.includes(localDeviceId)) {
                if (devices.length >= 3) {
                    let resetConfirm = confirm("⚠️ عذراً، لقد وصلت للحد الأقصى (3 أجهزة).\n\n- اضغط [إلغاء/Cancel] للذهاب وتسجيل الخروج يدوياً من أحد أجهزتك.\n- اضغط [موافق/OK] لتصفير الأجهزة وطرد جميع الأجهزة الأخرى إجبارياً الآن.");
                    if (resetConfirm) {
                        devices = [localDeviceId]; // تصفير القائمة وتسجيل هذا الجهاز فقط
                        await docRef.update({ devices: devices });
                    } else {
                        auth.signOut(); // التراجع عن تسجيل الدخول
                        return;
                    }
                } else {
                    devices.push(localDeviceId);
                    await docRef.update({ devices: devices });
                }
            }

            // 3. تحديث الواجهة
            document.getElementById('currentLoggedInUser').innerText = user.email;
            document.getElementById('authSection').style.display = 'none';
            document.getElementById('userProfileSection').style.display = 'block';

            if (user.email === 'ayadmsd67@gmail.com') {
                document.getElementById('adminPanelBtn').style.display = 'inline-block';
            } else {
                document.getElementById('adminPanelBtn').style.display = 'none';
            }

            if (data.history) loadHistoryUI(data.history);
            if (data.vipExpiry) localStorage.setItem('elalfey_vip_expiry', data.vipExpiry);
            if (data.trialStart) localStorage.setItem('elalfey_trial_start', data.trialStart);

            // 4. تشغيل "المراقب اللحظي الصارم" (Real-time Enforcer)
            if (sessionListener) sessionListener(); // إيقاف أي مراقب قديم
            sessionListener = docRef.onSnapshot((snap) => {
                if (snap.exists) {
                    let liveData = snap.data();
                    let liveDevices = liveData.devices || [];

                    // تحديث العداد في الشاشة لحظياً
                    const countEl = document.getElementById('activeDevicesCount');
                    if (countEl) countEl.innerText = liveDevices.length;

                    // 🛑 الطرد الإجباري: إذا تم تصفير الأجهزة من جهاز آخر، يتم طرد هذا الجهاز فوراً
                    if (!liveDevices.includes(localDeviceId)) {
                        showToast('⚠️ تم تسجيل خروجك إجبارياً لأن الحساب تم فتحه وتصفيره من جهاز آخر!', 'error');
                        auth.signOut();
                    }
                }
            });
        }
    } else {
        // حالة تسجيل الخروج
        if (sessionListener) {
            sessionListener(); // إيقاف المراقب اللحظي
            sessionListener = null;
        }
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('userProfileSection').style.display = 'none';
        document.getElementById('adminPanelBtn').style.display = 'none';
    }
});

// 1. دالة إنشاء الحساب (صارمة لمنع تكرار الحسابات لنفس الجهاز)
// 1. دالة تسجيل الدخول المطورة (مع الحفظ التلقائي)
async function handleLoginCloud() {
    const email = document.getElementById('emailInput').value.trim();
    const pass = document.getElementById('passwordInput').value.trim();
    if (!email || !pass) return showToast('يرجى ملء الحقول المطلوبة', 'error');

    try {
        showToast('جاري تسجيل الدخول...', 'info');

        // 🛑 إجبار Firebase على حفظ الجلسة بشكل دائم على هذا الجهاز
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        await auth.signInWithEmailAndPassword(email, pass);
        showToast('تم تسجيل الدخول وحفظ الحساب بنجاح!', 'success');
    } catch (e) {
        showToast('بيانات الدخول غير صحيحة', 'error');
    }
}

// 2. دالة إنشاء الحساب المطورة (مع الحفظ التلقائي)
async function handleSignupCloud() {
    const email = document.getElementById('emailInput').value.trim();
    const pass = document.getElementById('passwordInput').value.trim();
    if (!email || !pass) return showToast('يرجى ملء البيانات أولاً', 'error');

    try {
        showToast('جاري التحقق من صلاحية الجهاز...', 'info');

        const deviceCheck = await db.collection('users').where('devices', 'array-contains', localDeviceId).get();
        if (!deviceCheck.empty) {
            return showToast('عذراً، هذا الجهاز مسجل بحساب بالفعل! لا يمكنك إنشاء حساب جديد من نفس الجهاز.', 'error');
        }

        // 🛑 إجبار النظام على حفظ الحساب الجديد دائمًا بعد إنشائه
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await db.collection('users').doc(cred.user.uid).set({
            email: email,
            devices: [localDeviceId],
            history: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('تم إنشاء الحساب وحفظه تلقائياً بنجاح!', 'success');
        document.getElementById('passwordInput').value = '';
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function handleLogoutCloud() {
    try {
        const user = auth.currentUser;
        if (user) {
            // إزالة هذا الجهاز من السحابة لتحرير "الكرسي" للأجهزة الأخرى
            const docRef = db.collection('users').doc(user.uid);
            await docRef.update({
                devices: firebase.firestore.FieldValue.arrayRemove(localDeviceId)
            });
        }

        // تسجيل الخروج ومسح الجلسة
        await auth.signOut();
        localStorage.removeItem('elalfey_vip_expiry');

        document.getElementById('authSection').style.display = 'block';
        document.getElementById('userProfileSection').style.display = 'none';
        document.getElementById('adminPanelBtn').style.display = 'none';

        showToast('تم تسجيل الخروج بنجاح وإخلاء الجهاز من النظام', 'info');
    } catch (error) {
        showToast('حدث خطأ أثناء تسجيل الخروج', 'error');
    }
}

async function deleteUserAccount() {
    const user = auth.currentUser;
    if (!user) return;

    // رسالة تأكيد تحذيرية للمستخدم
    const confirmation = confirm("⚠️ تحذير نهائي: هل أنت متأكد من رغبتك في حذف حسابك؟\nسيتم مسح جميع بياناتك وسجل مستنداتك السحابية فوراً ولا يمكن التراجع عن هذا الإجراء.");

    if (confirmation) {
        try {
            showToast('جاري مسح بياناتك وإغلاق الحساب...', 'info');

            // 1. مسح جميع بيانات المستخدم من قاعدة بيانات Firestore
            await db.collection('users').doc(user.uid).delete();

            // 2. حذف الحساب جذرياً من نظام Authentication
            await user.delete();

            // 3. تنظيف الذاكرة المحلية لتسجيل خروجه
            localStorage.removeItem('elalfey_vip_expiry');

            // 4. تحديث الواجهة لتعود لشاشة تسجيل الدخول
            document.getElementById('authSection').style.display = 'block';
            document.getElementById('userProfileSection').style.display = 'none';
            document.getElementById('adminPanelBtn').style.display = 'none';

            showToast('تم حذف حسابك وجميع بياناتك بنجاح', 'success');

        } catch (error) {
            console.error(error);
            // إجراء أمني من Firebase: إذا كان تسجيل الدخول قديماً، يطلب تسجيل دخول حديث قبل الحذف
            if (error.code === 'auth/requires-recent-login') {
                showToast('لدواعي أمنية، يرجى تسجيل الخروج ثم الدخول مرة أخرى قبل محاولة حذف الحساب.', 'error');
            } else {
                showToast('حدث خطأ أثناء حذف الحساب: ' + error.message, 'error');
            }
        }
    }
}

function syncCurrentToHistory() {
    const user = auth.currentUser;
    if (!user) return;

    clearTimeout(historySaveTimeout);
    historySaveTimeout = setTimeout(async () => {
        const docRef = db.collection('users').doc(user.uid);
        const docSnap = await docRef.get();
        if (!docSnap.exists) return;

        const qEl = document.getElementById('questionsInput');
        const aEl = document.getElementById('answersInput');
        const qInput = qEl ? qEl.innerHTML : '';
        const aInput = aEl ? aEl.innerHTML : '';
        const gText = document.getElementById('generalTextInput').innerHTML;

        if (!qInput.trim() && !aInput.trim() && gText === 'اكتب محتوى المستند الخاص بك هنا...') return;

        let hist = docSnap.data().history || [];
        if (hist.length > 0 && hist[0].q === qInput && hist[0].a === aInput && hist[0].g === gText) return;

        hist.unshift({
            title: "مستند محفوظ آلياً",
            time: new Date().toLocaleTimeString('ar-EG') + ' - ' + new Date().toLocaleDateString('ar-EG'),
            q: qInput,
            a: aInput,
            g: gText,
            mode: currentMode
        });

        if (hist.length > 30) hist.pop();
        await docRef.update({ history: hist });
        loadHistoryUI(hist);
    }, 1500);
}

function loadHistoryUI(hist) {
    const container = document.getElementById('historyListContainer');
    if (!hist || hist.length === 0) {
        container.innerHTML = `<p style="color:#64748b; font-size:13px; text-align:center;">السجل فارغ حالياً.</p>`;
        return;
    }
    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
    window.tempCloudHistory = hist;
    hist.forEach((item, idx) => {
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--ui-container); padding:10px; border-radius:6px; border:1px solid var(--ui-border); gap:10px;">
                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    <strong style="color:var(--primary-color); font-size:14px;">${item.title}</strong>
                    <span style="font-size:11px; color:#64748b; margin-right:10px;">(${item.time})</span>
                </div>
                <button class="btn-tool" onclick="restoreFromCloudHistory(${idx})" style="padding:4px 10px; font-size:12px; border-color:#10b981; color:#10b981;">استعادة 📂</button>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

function restoreFromCloudHistory(idx) {
    if (!window.tempCloudHistory) return;
    const item = window.tempCloudHistory[idx];
    document.getElementById('questionsInput').innerHTML = item.q;
    document.getElementById('answersInput').innerHTML = item.a;
    document.getElementById('generalTextInput').innerHTML = item.g;
    switchTab(item.mode, document.getElementById(item.mode === 'questions' ? 'btnTabQuestions' : 'btnTabText'));
    syncTextToDatabase();
    autoSaveData();
    showToast('تم استعادة المشروع المختار بنجاح', 'success');
}

function requireVIP(actionType, param) {
    let expiry = localStorage.getItem('elalfey_vip_expiry');
    let isVIP = false;
    if (expiry === 'lifetime') isVIP = true;
    else if (expiry && parseInt(expiry) > Date.now()) isVIP = true;

    if (isVIP) { proceedWithAction(actionType, param); return; }

    let trialStart = localStorage.getItem('elalfey_trial_start');
    if (!trialStart) {
        trialStart = Date.now();
        localStorage.setItem('elalfey_trial_start', trialStart);
        const user = auth.currentUser;
        if (user) db.collection('users').doc(user.uid).update({ trialStart: trialStart });
    }

    const daysElapsed = (Date.now() - parseInt(trialStart)) / (1000 * 60 * 60 * 24);
    const daysLeft = Math.ceil(7 - daysElapsed);

    if (daysLeft > 0) {
        showToast(`أنت تستخدم الفترة التجريبية المفتوحة (متبقي ${daysLeft} أيام)`, 'info');
        proceedWithAction(actionType, param);
    } else {
        pendingAction = actionType;
        pendingActionParam = param;
        document.getElementById('vipModalText').innerText = "لقد انتهت فترة الـ 7 أيام التجريبية المجانية لإنشاء وتصدير الأسئلة. يرجى إدخال كود التفعيل المخصص لترقية حسابك الآن.";
        document.getElementById('vipModal').style.display = 'flex';
    }
}

function openVIPModalManual() {
    let expiry = localStorage.getItem('elalfey_vip_expiry');
    if (expiry === 'lifetime' || (expiry && parseInt(expiry) > Date.now())) {
        showToast('حسابك مفعل بالفعل بالنسخة الاحترافية الشاملة! 🎉', 'info');
        return;
    }
    document.getElementById('vipModalText').innerText = "للاستمتاع بخصائص الذكاء الاصطناعي، تصدير النماذج المتعددة، والبابل شيت بدون توقف، أدخل كود التفعيل:";
    document.getElementById('vipModal').style.display = 'flex';
    pendingAction = null;
    pendingActionParam = null;
}

async function verifyVIPCode() {
    const code = document.getElementById('vipCodeInput').value.trim().toUpperCase();
    if (!code) return showToast('يرجى إدخال الكود أولاً!', 'error');

    const user = auth.currentUser;
    if (!user) return showToast('يجب إنشاء حساب وتسجيل الدخول لتفعيل الأكواد!', 'error');

    try {
        showToast('جاري التحقق سحابياً...', 'info');
        const codeRef = db.collection('vip_codes').doc(code);
        const codeDoc = await codeRef.get();

        if (!codeDoc.exists) return showToast('كود التفعيل هذا غير صحيح أو غير مدرج بالنظام!', 'error');

        const codeData = codeDoc.data();
        if (codeData.used) return showToast('عذراً، هذا الكود تم استخدامه وحرقه مسبقاً لحساب آخر!', 'error');

        let addDays = codeData.days;
        let newExpiry = 'lifetime';

        if (addDays !== 9999) {
            let current = parseInt(localStorage.getItem('elalfey_vip_expiry')) || Date.now();
            if (current < Date.now()) current = Date.now();
            newExpiry = current + (addDays * 24 * 60 * 60 * 1000);
        }

        const batch = db.batch();
        batch.update(db.collection('users').doc(user.uid), { vipExpiry: newExpiry });
        batch.update(codeRef, { used: true, usedBy: user.email, usedAt: firebase.firestore.FieldValue.serverTimestamp() });
        await batch.commit();

        localStorage.setItem('elalfey_vip_expiry', newExpiry);
        document.getElementById('vipModal').style.display = 'none';
        showToast('تم ترقية حسابك بنجاح للنسخة البرو المكتملة! 🎉', 'success');
        if (pendingAction) proceedWithAction(pendingAction, pendingActionParam);

    } catch (e) { showToast('فشل التفعيل السحابي، تأكد من اتصال الإنترنت', 'error'); }
}

async function generateDynamicCodes() {
    const days = parseInt(document.getElementById('adminCodeType').value);
    const count = parseInt(document.getElementById('adminCodeCount').value);
    // جعل البادئة تمثل المقطع الأول
    let prefix = days === 7 ? 'W' : days === 30 ? 'M' : days === 365 ? 'Y' : 'L';
    let generated = [];
    document.getElementById('generatedCodesOutput').value = 'جاري توليد الأكواد وحفظها سحابياً...';

    try {
        const batch = db.batch();
        for (let i = 0; i < count; i++) {
            // توليد 3 مقاطع عشوائية، كل مقطع يتكون من 4 رموز
            let p1 = Math.random().toString(36).substring(2, 6).toUpperCase().padStart(4, '0');
            let p2 = Math.random().toString(36).substring(2, 6).toUpperCase().padStart(4, '0');
            let p3 = Math.random().toString(36).substring(2, 6).toUpperCase().padStart(4, '0');

            // دمج المقاطع الأربعة معاً (البادئة + 3 مقاطع عشوائية)
            let newCode = `${prefix}-${p1}-${p2}-${p3}`;
            let codeRef = db.collection('vip_codes').doc(newCode);

            batch.set(codeRef, { days: days, used: false, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            generated.push(newCode);
        }
        await batch.commit();
        document.getElementById('generatedCodesOutput').value = generated.join('\n');
        showToast(`تم إنتاج ${count} كود فريد وحفظهم بنجاح على Firestore`, 'success');
    } catch (e) {
        document.getElementById('generatedCodesOutput').value = 'خطأ سحابي: ' + e.message;
    }
}

function proceedWithAction(actionType, param) {
    if (actionType === 'export') executeExport(param);
    else if (actionType === 'multi') generateMultiModels();
    else if (actionType === 'multi_bubble_dummy') generateMultiEmptyBubbles();
    else if (actionType === 'ai') document.getElementById('aiModal').style.display = 'flex';
}

window.addEventListener('DOMContentLoaded', async () => {
    await loadSavedData();
    document.querySelectorAll('input, select').forEach(el => { el.addEventListener('input', autoSaveData); });
    const qInp = document.getElementById('questionsInput');
    const aInp = document.getElementById('answersInput');
    const gText = document.getElementById('generalTextInput');

    if (qInp) qInp.addEventListener('input', () => {
        syncTextToDatabase();
        autoSaveData();
        recordHistory();
        syncCurrentToHistory();
    });
    if (aInp) aInp.addEventListener('input', () => {
        syncTextToDatabase();
        autoSaveData();
        recordHistory();
        syncCurrentToHistory();
    });
    if (gText) gText.addEventListener('input', () => {
        autoSaveData();
        recordHistory();
        syncCurrentToHistory();
    });

    syncTextToDatabase();
    recordHistory();

    appHistory = [{
        q: qInp ? qInp.innerHTML : '',
        a: aInp ? aInp.innerHTML : '',
        g: gText ? gText.innerHTML : ''
    }];
    appHistoryIndex = 0;
});

function recordHistory() {
    clearTimeout(historyTimeout);
    historyTimeout = setTimeout(() => {
        const qEl = document.getElementById('questionsInput');
        const aEl = document.getElementById('answersInput');
        const gEl = document.getElementById('generalTextInput');
        const qVal = qEl ? qEl.innerHTML : '';
        const aVal = aEl ? aEl.innerHTML : '';
        const gVal = gEl ? gEl.innerHTML : '';

        if (appHistoryIndex >= 0 && appHistory[appHistoryIndex] &&
            appHistory[appHistoryIndex].q === qVal &&
            appHistory[appHistoryIndex].a === aVal &&
            appHistory[appHistoryIndex].g === gVal) return;

        if (appHistoryIndex < appHistory.length - 1) appHistory = appHistory.slice(0, appHistoryIndex + 1);
        appHistory.push({ q: qVal, a: aVal, g: gVal });
        if (appHistory.length > 50) appHistory.shift();
        else appHistoryIndex++;
    }, 300);
}

function execUndo() {
    if (appHistoryIndex > 0) {
        appHistoryIndex--;
        const qEl = document.getElementById('questionsInput');
        const aEl = document.getElementById('answersInput');
        const gEl = document.getElementById('generalTextInput');

        if (qEl) qEl.innerHTML = appHistory[appHistoryIndex].q;
        if (aEl) aEl.innerHTML = appHistory[appHistoryIndex].a;
        if (gEl) gEl.innerHTML = appHistory[appHistoryIndex].g;

        syncTextToDatabase();
        autoSaveData();
        showToast('تم التراجع عن الإجراء', 'info');
    } else { showToast('لا توجد خطوات سابقة', 'error'); }
}

function execRedo() {
    if (appHistoryIndex < appHistory.length - 1) {
        appHistoryIndex++;
        const qEl = document.getElementById('questionsInput');
        const aEl = document.getElementById('answersInput');
        const gEl = document.getElementById('generalTextInput');

        if (qEl) qEl.innerHTML = appHistory[appHistoryIndex].q;
        if (aEl) aEl.innerHTML = appHistory[appHistoryIndex].a;
        if (gEl) gEl.innerHTML = appHistory[appHistoryIndex].g;

        syncTextToDatabase();
        autoSaveData();
        showToast('تم إعادة الإجراء', 'info');
    } else { showToast('أنت في الخطوة الأحدث', 'error'); }
}

function showToast(message, type = 'success') {
    const t = document.createElement('div');
    t.style.padding = '14px 24px';
    t.style.borderRadius = '8px';
    t.style.color = 'white';
    t.style.fontWeight = 'bold';
    t.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
    t.style.opacity = '0';
    t.style.transform = 'translateY(20px)';
    t.style.transition = '0.3s';
    t.style.display = 'flex';
    t.style.alignItems = 'center';
    t.style.gap = '12px';
    t.style.zIndex = '999999';
    t.style.background = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
    t.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> <span>${message}</span>`;
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(() => {
        t.style.opacity = '1';
        t.style.transform = 'translateY(0)';
    }, 10);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(20px)';
        setTimeout(() => t.remove(), 400);
    }, 3500);
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    localforage.setItem('elalfey_theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
}

function switchTab(mode, btnElement) {
    currentMode = mode;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.input-section').forEach(sec => sec.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    else document.querySelector(`button[onclick*="${mode}"]`).classList.add('active');
    document.getElementById(mode + 'Tab').classList.add('active');
    document.getElementById('questionActionButtons').style.display = (mode === 'questions') ? 'flex' : 'none';
    document.getElementById('textActionButtons').style.display = (mode === 'text') ? 'flex' : 'none';
    ['examSettingsPanel', 'questionSettingsPanel', 'bubbleSettingsPanel', 'bubbleHeaderSettingsPanel', 'multiModelSettingsPanel'].forEach(id => document.getElementById(id).style.display = (mode === 'questions') ? 'block' : 'none');
}

const inputIdsToSave = [
    'enableBorder', 'borderStyle', 'borderWidth', 'borderColor', 'pageBgColor',
    'wmText', 'wmColor', 'wmType', 'userFont', 'textAlign', 'textColor', 'textBgToggle', 'textBgColor',
    'cardRadius', 'userPrimaryColor', 'hdrRight', 'hdrCenter', 'hdrLeft', 'enableHdr', 'enableStudentBox',
    'columnsLayout', 'qDisplayMode', 'optionsLayout', 'qFontSize', 'optFontSize',
    'qColor', 'optColor', 'correctColor', 'hdrSize', 'hdrTextColor', 'hdrBgColor', 'hdrBorderType', 'hdrRadius',
    'bubbleShape', 'bubbleTextPosition', 'bubbleLettersType', 'bubbleOptionsCount', 'bubbleColumns', 'bubbleSize', 'bubbleStrokeColor',
    'bHdrStyle', 'bHdrField1', 'bHdrField2', 'bHdrField3', 'bHdrIdTitle', 'bHdrNote', 'bHdrColor', 'bHdrBgColor', 'bHdrBorderColor', 'bHdrSize',
    'modelNumberType', 'modelLabelPos'
];

async function autoSaveData() {
    try {
        for (let id of inputIdsToSave) {
            let el = document.getElementById(id);
            if (el) await localforage.setItem(`elalfey_${id}`, el.value);
        }
        if (document.getElementById('questionsInput')) await localforage.setItem('elalfey_q_input', document.getElementById('questionsInput').innerHTML);
        if (document.getElementById('answersInput')) await localforage.setItem('elalfey_a_input', document.getElementById('answersInput').innerHTML);
        if (document.getElementById('generalTextInput')) await localforage.setItem('elalfey_general_text', document.getElementById('generalTextInput').innerHTML);
    } catch (e) { }
}

async function loadSavedData() {
    try {
        for (let id of inputIdsToSave) {
            let val = await localforage.getItem(`elalfey_${id}`);
            if (val !== null && document.getElementById(id)) document.getElementById(id).value = val;
        }
        let qData = await localforage.getItem('elalfey_q_input');
        if (qData && document.getElementById('questionsInput')) document.getElementById('questionsInput').innerHTML = qData;
        let aData = await localforage.getItem('elalfey_a_input');
        if (aData && document.getElementById('answersInput')) document.getElementById('answersInput').innerHTML = aData;
        let eData = await localforage.getItem('elalfey_general_text');
        if (eData && document.getElementById('generalTextInput')) document.getElementById('generalTextInput').innerHTML = eData;
        let thm = await localforage.getItem('elalfey_theme');
        if (thm === 'dark') document.body.classList.add('dark-mode');
    } catch (e) { }
}

async function executeClearData() {
    await localforage.clear();
    document.getElementById('questionsInput').innerHTML = '';
    document.getElementById('answersInput').innerHTML = '';
    document.getElementById('generalTextInput').innerHTML = 'اكتب محتوى المستند الخاص بك هنا...';
    questionsDatabase = [];
    document.getElementById('confirmModal').style.display = 'none';
    recordHistory();
    showToast('تم تهيئة مسودة جديدة فارغة للموقع', 'success');
}

function syncTextToDatabase() {
    const qText = getEditorText('questionsInput');
    const aText = getEditorText('answersInput');
    if (!qText.trim()) { questionsDatabase = []; return; }

    // بناء خريطة إجابات ذكية تفصل بين الأقسام (الاختياري، صح/خطأ، مقالي)
    const ansMap = { mcq: {}, tf_inline: {}, essay: {} };
    if (aText.trim()) {
        const aLines = aText.split('\n');
        let currentAnsSection = 'mcq'; // القسم الافتراضي
        let currentAnsNum = null;

        aLines.forEach(line => {
            let cleanLine = line.replace(/<[^>]+>/g, '').trim();
            // تحديد القسم الحالي بذكاء
            if (cleanLine.includes('الاختيار من متعدد')) currentAnsSection = 'mcq';
            else if (cleanLine.includes('الصواب والخطأ')) currentAnsSection = 'tf_inline';
            else if (cleanLine.includes('المقالي')) currentAnsSection = 'essay';

            let m = cleanLine.match(/^(\d+)\s*[\.\-\)]\s*(.+)/);
            if (m) {
                currentAnsNum = m[1];
                ansMap[currentAnsSection][currentAnsNum] = m[2].trim();
            } else if (currentAnsNum && cleanLine && !cleanLine.match(/^--/) && !cleanLine.match(/^مفتاح/)) {
                ansMap[currentAnsSection][currentAnsNum] += '\n' + cleanLine;
            }
        });
    }

    let lines = qText.split('\n');
    const parsed = [];
    let curQ = null;
    let isOptMode = false;
    let isAnsMode = false;
    let hasSeenFirstQuestion = false;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        let qMatch = line.match(/^\s*\**(\d+)\s*[\.\-\)]\s*\**([\s\S]*)/);
        if (qMatch) {
            hasSeenFirstQuestion = true;
            if (curQ) { parsed.push(curQ); }
            curQ = {
                num: qMatch[1],
                text: qMatch[2].trim(),
                options: [],
                type: 'essay',
                ans: "", // سيتم التعيين بعد معرفة النوع
                tags: qMatch[2].match(/#[\w\u0600-\u06FF]+/g) || []
            };
            curQ.text = curQ.text.replace(/#[\w\u0600-\u06FF]+/g, '').trim();
            isOptMode = false;
            isAnsMode = false;
            continue;
        }

        const oReg = /^[\s\*\-]*\[?\(?\s*([أ-يa-zA-Z0-9])\s*\)?\]?[\.\-\)]\s*(.+)/;
        const bReg = /^[\s]*[\*\-]\s+(.+)/;
        let oM = line.match(oReg);
        let bM = line.match(bReg);

        if (curQ) {
            let explicitAnsMatch = line.match(/^(?:الإجابة|الجواب|الحل|Answer)[\s\:\-\*]*([\s\S]*)$/i);
            if (explicitAnsMatch) {
                isAnsMode = true;
                isOptMode = false;
                if (explicitAnsMatch[1].trim()) curQ.ans = explicitAnsMatch[1].trim();
                continue;
            }

            if (isAnsMode) {
                if (line.match(/^--/)) {
                    isAnsMode = false;
                } else {
                    curQ.ans += (curQ.ans ? '\n' : '') + line;
                    continue;
                }
            }

            if (oM) {
                isOptMode = true;
                let optLetter = oM[1];
                let optText = oM[2].trim();
                if (optText.match(/[✓✔]/)) curQ.ans = optLetter;
                curQ.options.push({ l: optLetter, t: optText });
                continue;
            } else if (bM && isOptMode) {
                let lets = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
                let nextL = (currentQuestionSystem === 'foreign' || currentQuestionSystem === 'science') ? String.fromCharCode(65 + curQ.options.length) : (lets[curQ.options.length] || '•');
                let optText = bM[1].trim();
                if (optText.match(/[✓✔]/)) curQ.ans = nextL;
                curQ.options.push({ l: nextL, t: optText });
                continue;
            }

            if (isOptMode) {
                parsed.push(curQ);
                curQ = null;
                isOptMode = false;
                parsed.push({ type: 'heading', text: line });
            } else {
                curQ.text += '\n' + line;
            }
        } else {
            if (hasSeenFirstQuestion) {
                parsed.push({ type: 'heading', text: line });
            }
        }
    }
    if (curQ) { parsed.push(curQ); }

    let typeCounters = { mcq: 1, tf_inline: 1, essay: 1 };
    parsed.forEach(q => {
        if (q.type !== 'heading') {
            if (q.options.length > 0) {
                q.type = 'mcq';
                q.options.forEach(o => {
                    if (o.t.match(/[✓✔]/)) q.ans = o.l;
                    o.t = o.t.replace(/\[[✓✔]\]/g, '').replace(/[✓✔]/g, '').replace(/\*\*/g, '').trim();
                });
            } else {
                let tfMatch = q.text.match(/\(\s*(صح|خطأ|ص|خ|✓|✗|x|✔|true|false|t|f)\s*\)/i);
                let emptyTfMatch = q.text.match(/\(\s*\)/);

                if (tfMatch) {
                    q.type = 'tf_inline';
                    if (!q.ans) q.ans = tfMatch[1].trim();
                    q.text = q.text.replace(/\(\s*(صح|خطأ|ص|خ|✓|✗|x|✔|true|false|t|f)\s*\)/i, '(   )');
                } else if (emptyTfMatch || q.text.includes('(   )')) {
                    q.type = 'tf_inline';
                } else {
                    q.type = 'essay';
                }
            }

            q.num = typeCounters[q.type]++;

            // سحب الإجابة بذكاء بناءً على (رقم السؤال + نوع القسم) لمنع التداخل تماماً
            if (!q.ans && ansMap[q.type] && ansMap[q.type][q.num]) {
                q.ans = ansMap[q.type][q.num];
            }
        }
    });

    questionsDatabase = parsed;
}

function insertQuestionTemplate(t) {
    let html = '';
    if (currentQuestionSystem === 'arabic') {
        html = t === 'mcq' ? "<br>1. اكتب السؤال هنا:<br>أ) الخيار الأول<br>ب) الخيار الثاني<br>ج) الخيار الثالث<br>د) الخيار الرابع<br>" :
            t === 'tf' ? "<br>1. العبارة هنا (   )<br>" :
                "<br>1. السؤال المقالي:<br>......................................................................................<br>......................................................................................<br><br>";
    } else if (currentQuestionSystem === 'foreign') {
        html = t === 'mcq' ? "<br>1. Write your question here:<br>A) First Option<br>B) Second Option<br>C) Third Option<br>D) Fourth Option<br>" :
            t === 'tf' ? "<br>1. Statement goes here (   )<br>" :
                "<br>1. Essay Question:<br>......................................................................................<br>......................................................................................<br><br>";
    } else if (currentQuestionSystem === 'science') {
        html = t === 'mcq' ? "<br>1. قم بحل المسألة التالية \\( x^2=4 \\) :<br>A) \\( x=2 \\)<br>B) \\( x=-2 \\)<br>C) \\( x=\\pm 2 \\)<br>D) \\( x=4 \\)<br>" :
            t === 'tf' ? "<br>1. \\( \\sqrt{16} = 4 \\) (   )<br>" :
                "<br>1. أثبت صحة المعادلة التالية:<br>\\( E = mc^2 \\)<br>...........................................................<br><br>";
    }

    document.getElementById('questionsInput').focus();
    document.execCommand('insertHTML', false, html);
}

function smartFormatAndClean() {
    syncTextToDatabase();
    let qP = getRawPreamble('questionsInput');

    let qT = qP;
    let aT = "<div class='ans-key-heading' style='font-size: 16px; font-weight: bold; color: var(--primary-color);'>مفتاح الإجابات:</div>";
    let cType = '';

    questionsDatabase.forEach((q) => {
        if (q.type === 'heading') {
            qT += `<br><div style="clear:both; font-weight:bold; color:var(--primary-color);">${q.text}</div><br>`;
            return;
        }
        let n = q.num;
        let tg = q.tags.length > 0 ? " " + q.tags.join(" ") : "";

        let qText = q.text;
        if (q.type === 'tf_inline') {
            if (!qText.match(/\(/)) qText += " (   )";
        }

        qT += `<br><div style="clear:both;">${n}. ${qText.replace(/\n/g, '<br>')}${tg}</div>`;

        q.options.forEach(o => {
            let isCorrect = (q.ans === o.l || q.ans === o.t) ? ' [✓]' : '';
            qT += ` ${o.l}) ${o.t}${isCorrect}<br>`;
        });

        if (q.type === 'essay' && q.ans) {
            qT += `<div style="color:#10b981; font-weight:bold; margin-top:5px;">الإجابة: ${q.ans.replace(/\n/g, '<br>')}</div>`;
        }

        qT += "<br>";

        if (cType !== q.type) {
            cType = q.type;
            let typeName = cType === 'mcq' ? 'أسئلة الاختيار من متعدد' : cType === 'tf_inline' ? 'أسئلة الصواب والخطأ' : 'الأسئلة المقالية';
            aT += `<div class='ans-key-heading'><br><strong style="color:var(--primary-color);">-- ${typeName} --</strong><br></div>`;
        }

        if (q.ans) {
            if (q.type === 'essay') {
                aT += `<strong>${n}-</strong> ${q.ans.replace(/\n/g, '<br>')}<br>`;
            } else {
                aT += `${n}- ${q.ans}<br>`;
            }
        } else {
            aT += `${n}- <br>`;
        }
    });

    document.getElementById('questionsInput').innerHTML = qT;
    document.getElementById('answersInput').innerHTML = aT;
    showToast('تم التنسيق الذكي وتوقع الإجابات بنجاح');
}

function shuffleQuestions() {
    if (!confirm('سيتم خلط ترتيب مفردات الأسئلة، هل تود المتابعة؟')) return;
    syncTextToDatabase();
    questionsDatabase.forEach(q => {
        if (q.type === 'mcq' && q.options.length > 0) {
            let lA = (currentQuestionSystem === 'foreign' || currentQuestionSystem === 'science') ? ['A', 'B', 'C', 'D', 'E', 'F'] : ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
            let cOpt = q.options.find(o => o.l == q.ans);
            let cTxt = cOpt ? cOpt.t : null;
            q.options.sort(() => Math.random() - 0.5);
            q.options.forEach((o, i) => { o.l = lA[i] || o.l; if (cTxt && o.t === cTxt) q.ans = o.l; });
        }
    });

    let questionsOnly = questionsDatabase.filter(q => q.type !== 'heading');
    questionsOnly.sort(() => Math.random() - 0.5);

    let qIdx = 0;
    questionsDatabase = questionsDatabase.map(q => {
        if (q.type === 'heading') return q;
        return questionsOnly[qIdx++];
    });

    smartFormatAndClean();
}

function showAnalytics() {
    syncTextToDatabase();
    const realQs = questionsDatabase.filter(q => q.type !== 'heading');
    const t = realQs.length;
    const m = realQs.filter(q => q.type === 'mcq').length;
    const tf = realQs.filter(q => q.type === 'tf_inline').length;
    const e = realQs.filter(q => q.type === 'essay').length;
    document.getElementById('statTotal').innerText = t;
    document.getElementById('statMcqCount').innerText = m;
    document.getElementById('statTfCount').innerText = tf;
    document.getElementById('statEssayCount').innerText = e;
    document.getElementById('statMcqBar').style.width = `${t > 0 ? (m / t) * 100 : 0}%`;
    document.getElementById('statTfBar').style.width = `${t > 0 ? (tf / t) * 100 : 0}%`;
    document.getElementById('statEssayBar').style.width = `${t > 0 ? (e / t) * 100 : 0}%`;
    document.getElementById('analyticsModal').style.display = 'flex';
}

async function generateAIQuestions(mode = 'quiz') {
    const txt = document.getElementById('aiTextInput').value.trim();
    // التعديل هنا: جلب جميع الملفات بدلاً من الملف الأول فقط
    const files = document.getElementById('aiFileInput').files;
    const outputDiv = document.getElementById('aiChatOutput');

    if (!txt && files.length === 0) return showToast('يرجى كتابة نص المادة العلمية أو إرفاق ملفات', 'error');

    // ⚠️ ضع مفتاحك هنا
    const apiKey = "AQ.Ab8RN6IvZM5OdpXCh3_PJDyn_lXFHufz04OH-zdtUtg6APgZrA";

    let systemInstruction = mode === 'quiz' ?
        "أنت مساعد تعليمي. استخرج أسئلة من النص التالي. المخرج النهائي يجب أن يكون كود JSON فقط (مصفوفة كائنات) بدون أي نصوص أخرى. هيكل الكائن المطلوب:\n[\n  { \"type\": \"mcq\", \"text\": \"نص السؤال؟\", \"options\": [{\"l\":\"أ\", \"t\":\"خيار 1\"}, {\"l\":\"ب\", \"t\":\"خيار 2\"}], \"ans\": \"أ\" }\n]" :
        "أنت مساعد ذكي موسوعي. أجب على السؤال التالي بشكل مباشر ومهني باللغة العربية.";

    let promptText = `${systemInstruction}\n\nالمحتوى المطلوب معالجته:\n${txt}`;

    try {
        showToast('جاري معالجة طلبك بواسطة المحرك الذكي...', 'info');
        outputDiv.style.display = 'block';
        outputDiv.innerHTML = '<div style="text-align: center; color: #8b5cf6; font-weight: bold;">جاري التفكير وتحليل الملفات... ⏳</div>';

        let parts = [{ text: promptText }];

        // التعديل هنا: المرور على جميع الملفات المرفقة ومعالجتها
        if (files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                let f = files[i];
                if (f.type.startsWith('image/')) {
                    const b = await new Promise(r => {
                        const rd = new FileReader();
                        rd.onload = e => {
                            const img = new Image();
                            img.onload = () => {
                                const c = document.createElement('canvas'); const scale = Math.min(1, 1024 / img.width);
                                c.width = img.width * scale;
                                c.height = img.height * scale;
                                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                                r(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
                            };
                            img.src = e.target.result;
                        };
                        rd.readAsDataURL(f);
                    });
                    parts.push({ inlineData: { data: b, mimeType: 'image/jpeg' } });
                }
                else if (f.type === 'application/pdf') {
                    const b = await new Promise(r => {
                        const rd = new FileReader();
                        rd.onload = () => r(rd.result.split(',')[1]);
                        rd.readAsDataURL(f);
                    });
                    parts.push({ inlineData: { data: b, mimeType: 'application/pdf' } });
                }
                else if (f.type === 'text/plain') {
                    const tx = await new Promise(r => {
                        const rd = new FileReader();
                        rd.onload = () => r(rd.result);
                        rd.readAsText(f);
                    });
                    parts[0].text += `\n\n--- محتوى ملف (${f.name}) ---\n${tx}`;
                }
            }
        }

        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                parts: parts
            })
        });

        if (!res.ok) {
            const errData = await res.json();
            alert("السبب التقني هو: " + errData.error);
            throw new Error(errData.error || 'حدث خطأ');
        }



        const data = await res.json();
        if (!data.candidates || data.candidates.length === 0) throw new Error("لم يقم النموذج بتوليد أي بيانات.");

        let aiResponse = data.candidates[0].content.parts[0].text.trim();

        if (mode === 'quiz') {
            let jsonStr = aiResponse;
            const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
            if (jsonMatch) jsonStr = jsonMatch[0];

            const gQs = JSON.parse(jsonStr);

            let qInput = document.getElementById('questionsInput');
            let generatedHTML = "<br>";

            gQs.forEach(q => {
                generatedHTML += `<div>1. ${q.text} #ذكاء_اصطناعي</div>`;
                if (q.type === 'mcq' && q.options) {
                    q.options.forEach(o => {
                        let check = (o.l == q.ans || o.t == q.ans) ? " [✓]" : "";
                        generatedHTML += `<div>${o.l}) ${o.t}${check}</div>`;
                    });
                } else if (q.type === 'tf_inline') {
                    generatedHTML += `<div>( ${q.ans} )</div>`;
                } else {
                    generatedHTML += `<div>الإجابة: ${q.ans}</div>`;
                }
                generatedHTML += "<br>";
            });

            qInput.innerHTML += generatedHTML;
            smartFormatAndClean();

            outputDiv.innerHTML = `<div style="color: #10b981; font-weight: bold; text-align: center;">✅ تم تحليل الملفات وتوليد وإدراج ${gQs.length} أسئلة بنجاح!</div>`;
            showToast('تم إدراج الأسئلة الذكية في المحرر', 'success');

        } else {
            let formattedHtml = aiResponse
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');

            outputDiv.innerHTML = `<div style="color: #1e293b;">${formattedHtml}</div>`;
            showToast('تم استلام الإجابة', 'success');
        }

    } catch (e) {
        console.error(e);
        let errorMsg = e.message.includes('JSON') ? 'لم يقم النموذج بإرجاع الأسئلة بالتنسيق المطلوب، يرجى المحاولة مرة أخرى.' : e.message;
        outputDiv.innerHTML = `<div style="color: #ef4444; font-weight: bold;">❌ توقف النظام مؤقتاً.. <a href="https://wa.me/201155324374" target="_blank" style="color: #10b981; text-decoration: underline;">راسلني علي الواتس اب وسوف أحل هذه المشكلة 📞</a></div>`;

        showToast('حدث خطأ في عملية التوليد', 'error');
    }
}

function insertImageToQuestion(e) {
    if (e.target.files[0]) {
        const rd = new FileReader();
        rd.onload = ev => {
            const i = new Image();
            i.onload = () => {
                const c = document.createElement('canvas');
                let scale = 1;
                if (i.width > 800) scale = 800 / i.width;
                c.width = i.width * scale;
                c.height = i.height * scale;
                c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
                const imgHTML = `<br><img src="${c.toDataURL('image/jpeg', 0.8)}" style="width:50%; max-width:100%; display:inline-block; margin:15px; border-radius:6px; cursor:pointer;" class="resizable-img">&nbsp;`;
                document.getElementById('questionsInput').focus();
                document.execCommand('insertHTML', false, imgHTML);
            };
            i.src = ev.target.result;
        };
        rd.readAsDataURL(e.target.files[0]);
    }
    e.target.value = '';
}

function insertImage(e) {
    if (e.target.files[0]) {
        const rd = new FileReader();
        rd.onload = ev => {
            const i = new Image();
            i.onload = () => {
                const c = document.createElement('canvas');
                let scale = 1;
                if (i.width > 800) scale = 800 / i.width;
                c.width = i.width * scale;
                c.height = i.height * scale;
                c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
                document.execCommand('insertHTML', false, `<img src="${c.toDataURL('image/jpeg', 0.8)}" style="width:50%; max-width:100%; display:inline-block; margin:15px; border-radius:6px; cursor:pointer;" class="resizable-img">&nbsp;`);
            };
            i.src = ev.target.result;
        };
        rd.readAsDataURL(e.target.files[0]);
    }
    e.target.value = '';
}

function insertTable() {
    const r = prompt("صفوف:", "3"); const c = prompt("أعمدة:", "3"); if (r && c) {
        let h = `<table border="1" style="width:100%; border-collapse:collapse; text-align:center;"><tbody>`; for (let i = 0; i < r; i++) {
            h += `<tr>`; for (let j = 0; j < c; j++) h += `<td style="padding:12px;">نص</td>`;
            h += `</tr>`;
        } h += `</tbody></table><br/>`;
        document.execCommand('insertHTML', false, h);
    }
}

function insertMathEquation() { const eq = prompt("أدخل كود المعادلة بصيغة LaTeX:"); if (eq) { document.execCommand('insertHTML', false, ` \\( ${eq} \\) `); if (window.MathJax) MathJax.typesetPromise(); } }

function applyUserSettings() {
    const r = document.documentElement;
    r.style.setProperty('--main-font', document.getElementById('userFont').value);
    r.style.setProperty('--primary-color', document.getElementById('userPrimaryColor').value);
    r.style.setProperty('--page-bg-color', document.getElementById('pageBgColor').value);
    r.style.setProperty('--text-color', document.getElementById('textColor').value);
    r.style.setProperty('--text-align', document.getElementById('textAlign').value);
    r.style.setProperty('--card-radius', document.getElementById('cardRadius').value + 'px');
    if (document.getElementById('textBgToggle').value === 'transparent') {
        r.style.setProperty('--text-bg-color', 'transparent');
        r.style.setProperty('--card-border-color', 'transparent');
    } else {
        r.style.setProperty('--text-bg-color', document.getElementById('textBgColor').value);
        r.style.setProperty('--card-border-color', '#e2e8f0');
    }
    r.style.setProperty('--q-font-size', document.getElementById('qFontSize').value + 'px');
    r.style.setProperty('--opt-font-size', document.getElementById('optFontSize').value + 'px');
    r.style.setProperty('--q-color', document.getElementById('qColor').value);
    r.style.setProperty('--opt-color', document.getElementById('optColor').value);
    r.style.setProperty('--correct-color', document.getElementById('correctColor').value);
    if (document.getElementById('enableBorder').value === 'yes') {
        r.style.setProperty('--border-width', document.getElementById('borderWidth').value + 'px');
        r.style.setProperty('--border-style', document.getElementById('borderStyle').value);
        r.style.setProperty('--border-color', document.getElementById('borderColor').value);
        r.style.setProperty('--print-border-display', 'block');
    } else { r.style.setProperty('--print-border-display', 'none'); }
    r.style.setProperty('--hdr-size', document.getElementById('hdrSize').value + 'px');
    r.style.setProperty('--hdr-text-color', document.getElementById('hdrTextColor').value);
    r.style.setProperty('--hdr-bg-color', document.getElementById('hdrBgColor').value);
    let hType = document.getElementById('hdrBorderType').value;
    let pColor = document.getElementById('userPrimaryColor').value;
    if (hType === 'bottom') {
        r.style.setProperty('--hdr-border', 'none');
        r.style.setProperty('--hdr-border-bottom', `3px solid ${pColor}`);
        r.style.setProperty('--hdr-padding', '0 0 12px 0');
    } else if (hType === 'box') {
        r.style.setProperty('--hdr-border', `2px solid ${pColor}`);
        r.style.setProperty('--hdr-border-bottom', `2px solid ${pColor}`);
        r.style.setProperty('--hdr-padding', '15px 20px');
    } else {
        r.style.setProperty('--hdr-border', 'none');
        r.style.setProperty('--hdr-border-bottom', 'none');
        r.style.setProperty('--hdr-padding', '0');
    }
    r.style.setProperty('--hdr-radius', document.getElementById('hdrRadius').value + 'px');
}

function getBackgroundCSS(modelLetter = '') {
    const c = document.getElementById('wmColor').value;
    const t = document.getElementById('wmType').value;
    let txt = document.getElementById('wmText').value;
    if (modelLetter) txt += ` - (${modelLetter})`;
    let svg = t === 'repeat' ? `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><text x="30" y="200" transform="rotate(-35 200 200)" fill="${c}" font-family="Arial" font-size="45" font-weight="900">${txt}</text></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1200"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" transform="rotate(-45 500 600)" fill="${c}" font-family="Arial" font-size="120" font-weight="900">${txt}</text></svg>`;
    return `url('data:image/svg+xml,${encodeURIComponent(svg)}') ${t === 'repeat' ? 'repeat' : 'no-repeat center center fixed'}`;
}

function getDirection(text) {
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    return arabicPattern.test(text) ? 'rtl' : 'ltr';
}

function buildQAndA_HTML(dataArray, pColor) {
    let hN = '';
    let hA = '';
    const qM = document.getElementById('qDisplayMode').value;
    const oL = document.getElementById('optionsLayout').value;
    const cC = qM === 'text' ? 'content-card mode-text' : 'content-card';
    const lC = `options-list layout-${oL}`;

    dataArray.forEach((q, i) => {
        if (q.type === 'heading') {
            let hDir = getDirection(q.text);
            let headingHTML = `<div class="print-heading-block" dir="${hDir}" style="direction: ${hDir}; text-align: start; width: 100%; margin-bottom: 18px; font-weight: bold; font-size: 18px; clear: both; line-height: 1.6; color: var(--text-color);">${q.text}</div>`;
            hN += headingHTML;
            hA += headingHTML;
            return;
        }

        let qNumStr = q.num;
        let qDir = getDirection(q.text);

        hN += `<div class="${cC}" dir="${qDir}" style="direction: ${qDir}; text-align: ${qDir === 'rtl' ? 'right' : 'left'}; clear: both;"><div class="q-text" dir="${qDir}" style="text-align: ${qDir === 'rtl' ? 'right' : 'left'};">${qNumStr}. ${q.text.replace(/\n/g, '<br>')}</div>`;
        if (q.type === 'mcq') {
            hN += `<ul class="${lC}" dir="${qDir}" style="direction: ${qDir};">`;
            q.options.forEach(o => hN += `<li class="option-item" dir="${qDir}" style="display: flex; gap: 6px; text-align: ${qDir === 'rtl' ? 'right' : 'left'};"><span style="flex-shrink: 0;">(${o.l})</span> <span>${o.t}</span></li>`);
            hN += `</ul>`;
        }
        hN += `</div>`;

        let aT = q.text.replace(/\n/g, '<br>');

        if (q.type === 'tf_inline') {
            let m = q.ans || '';
            let mC = 'var(--correct-color)';
            let cA = m.trim().toLowerCase();
            if (['صح', 'ص', 'true', 't', '✓', 'yes', 'نعم'].includes(cA)) {
                m = '✓';
                mC = '#10b981';
            }
            else if (['خطأ', 'خ', 'غلط', 'غ', 'false', 'f', '✗', 'x', 'no', 'لا'].includes(cA)) {
                m = '✗';
                mC = '#ef4444';
            }
            aT = aT.replace(/\(\s*\)/, `( <span style="color:${mC}; font-weight:900;" dir="${qDir}">${m}</span> )`);
        }
        else if (q.type === 'essay' && q.ans) {
            let ansHtml = `<span style="color:#10b981; font-weight:bold;">${q.ans.replace(/\n/g, '<br>')}</span>`;

            // خوارزمية ذكية لمحو جميع سطور النقاط أياً كان عددها ووضع الحل مكانها بسلاسة
            if (aT.match(/[\.\-_]{4,}/)) {
                let replaced = false;
                aT = aT.replace(/(?:<br\s*\/?>)?\s*[\.\-_]{4,}/g, (match) => {
                    if (!replaced) {
                        replaced = true;
                        return '<br>' + ansHtml;
                    }
                    return '';
                });
            } else {
                aT += `<br><br><strong>الإجابة:</strong> ${ansHtml}`;
            }
        }

        hA += `<div class="${cC}" dir="${qDir}" style="direction: ${qDir}; text-align: ${qDir === 'rtl' ? 'right' : 'left'}; clear: both; ${qM !== 'text' ? `border-right-color:${pColor};` : ''}"><div class="q-text" dir="${qDir}" style="text-align: ${qDir === 'rtl' ? 'right' : 'left'};">${qNumStr}. ${aT}</div>`;

        if (q.type === 'mcq') {
            hA += `<ul class="${lC}" dir="${qDir}" style="direction: ${qDir};">`;
            q.options.forEach(o => {
                let clA = q.ans ? q.ans.toString().replace(/\s/g, '').trim() : '';
                let clO = o.l.toString().replace(/\s/g, '').trim();
                let clT = o.t.toString().replace(/\s/g, '').trim();

                if (clA === clO || clA.includes(clO) || clA === clT) {
                    hA += `<li class="option-item correct" dir="${qDir}" style="display: flex; gap: 6px; text-align: ${qDir === 'rtl' ? 'right' : 'left'}; background:${qM === 'text' ? 'transparent' : 'var(--correct-color)'}!important;color:${qM === 'text' ? 'var(--correct-color)' : '#fff'}!important;border:${qM === 'text' ? '2px dashed var(--correct-color)' : 'none'}!important;font-weight:900;"><span style="flex-shrink: 0;">✓</span> <span style="flex-shrink: 0;">(${o.l})</span> <span>${o.t}</span></li>`;
                } else {
                    hA += `<li class="option-item" dir="${qDir}" style="display: flex; gap: 6px; text-align: ${qDir === 'rtl' ? 'right' : 'left'};"><span style="flex-shrink: 0;">(${o.l})</span> <span>${o.t}</span></li>`;
                }
            });
            hA += `</ul>`;
        }

        hA += `</div>`;
    });

    // إخفاء العناوين التي تخص مفتاح الإجابات من الظهور العشوائي في شاشة الطباعة
    hA = `<style>#wordPrintPreviewArea .ans-key-heading { display: none !important; }</style>` + hA;

    return { noAns: hN, withAns: hA };
}

function generatePageHTML(contentHTML, bgCSS, isAnswers = false, modelBadge = '') {
    let hdr = '';
    let std = '';
    let cols = '';

    // التحقق من النظام المختار للتحويل التلقائي للإنجليزية
    let isForeign = (currentQuestionSystem === 'foreign');
    let dir = isForeign ? 'ltr' : 'rtl';
    let align = isForeign ? 'left' : 'right';

    if (currentMode === 'questions' && !isAnswers) {
        hdr = document.getElementById('enableHdr').value === 'yes' ?
            `<div class="exam-header-print" style="direction:${dir}; text-align:${align};">
                 <div class="${isForeign ? 'left' : 'right'}">${document.getElementById('hdrRight').value}</div>
                 <div class="center">${document.getElementById('hdrCenter').value}</div>
                 <div class="${isForeign ? 'right' : 'left'}">${document.getElementById('hdrLeft').value}</div>
               </div>` :
            '';

        // ترجمة بيانات الطالب التلقائية
        let stdText = isForeign ?
            `<div>Student Name: ....................................................</div><div>Seat No: .........................</div>` :
            `<div>اسم الطالب: ....................................................</div><div>رقم الجلوس: .........................</div>`;

        std = document.getElementById('enableStudentBox').value === 'yes' ? `<div class="student-info-print" style="direction:${dir};">${stdText}</div>` : '';
        cols = document.getElementById('columnsLayout').value === '2' ? 'two-columns-layout' : '';
    }

    return `
    <div class="pdf-page" style="background:${bgCSS}; direction:${dir}; text-align:${align};">
        <table style="width: 100%; border-collapse: collapse; border: none; direction:${dir};">
            <thead style="display: table-header-group;">
                <tr><td style="height: 30mm; border: none; padding: 0;"></td></tr>
            </thead>
            <tbody>
                <tr><td style="border: none; padding: 0;">
                    ${hdr}${modelBadge}${std}
                    <div class="${cols}" style="direction:${dir}; text-align:${align};">${contentHTML}</div>
                </td></tr>
            </tbody>
            <tfoot style="display: table-footer-group;">
                <tr><td style="height: 25mm; border: none; padding: 0;"></td></tr>
            </tfoot>
        </table>
    </div>`;
}

function getBubbleSheetContent(qDb, emptyCount = 0) {
    // 1. جلب جميع القيم من واجهة المستخدم بشكل ديناميكي (بدون أي أرقام ثابتة)
    const sh = document.getElementById('bubbleShape').value;
    const pos = document.getElementById('bubbleTextPosition').value;
    const oC = parseInt(document.getElementById('bubbleOptionsCount').value);
    const lT = document.getElementById('bubbleLettersType').value;
    const sC = document.getElementById('bubbleStrokeColor').value;
    const userBubbleSize = document.getElementById('bubbleSize').value + 'px';
    const userColumnsCount = parseInt(document.getElementById('bubbleColumns').value);

    // 2. تحديد نوع الأحرف (عربي، إنجليزي، أرقام) بناءً على القائمة المنسدلة
    const lA = { 'arabic': ['أ', 'ب', 'ج', 'د', 'هـ', 'و'], 'english': ['A', 'B', 'C', 'D', 'E', 'F'], 'numbers': ['1', '2', '3', '4', '5', '6'] }[lT];

    let isForeign = (currentQuestionSystem === 'foreign');
    let dir = isForeign ? 'ltr' : 'rtl';
    let align = isForeign ? 'left' : 'right';

    let f1 = isForeign ? 'Student Name: ...........................................................' : document.getElementById('bHdrField1').value;
    let f2 = isForeign ? 'Subject: .........................................' : document.getElementById('bHdrField2').value;
    let f3 = isForeign ? 'Grade/Class: .........................' : document.getElementById('bHdrField3').value;
    let idTitle = isForeign ? 'Seat Number' : document.getElementById('bHdrIdTitle').value;

    let mcqTitle = isForeign ? 'Multiple Choice Questions (MCQ)' : 'قسم أسئلة الاختيار من متعدد';
    let tfTitle = isForeign ? 'True/False Questions (T/F)' : 'قسم أسئلة الصواب والخطأ';
    let tfLetters = isForeign ? ['T', 'F'] : ['ص', 'خ'];

    let bH = '';
    const hs = document.getElementById('bHdrStyle').value;
    const hC = document.getElementById('bHdrColor').value;
    const hb = document.getElementById('bHdrBorderColor').value;
    const hbg = document.getElementById('bHdrBgColor').value;
    const hz = document.getElementById('bHdrSize').value + 'px';

    if (hs === 'advanced') {
        let ig = '';
        for (let c = 0; c < 6; c++) {
            let cb = `<input type="text" class="bubble-id-input" style="border-color:${hb};color:${hC}; height:20px; font-size:12px; margin-bottom:4px;" maxlength="1">`;
            for (let r = 0; r <= 9; r++) { cb += `<div class="bubble-shape shape-circle" style="width:14px;height:14px;font-size:9px;border:1px solid ${hb};color:${hC};margin-bottom:2px;">${r}</div>`; }
            ig += `<div class="bubble-id-col">${cb}</div>`;
        }
        bH = `<div class="bubble-advanced-header" style="border:2px solid ${hb};background:${hbg};color:${hC};font-size:${hz}; padding:8px 15px; margin-bottom:10px; direction:${dir}; text-align:${align};">
            <div class="bubble-student-info"><div>${f1}</div><div style="display:flex;gap:25px;"><div>${f2}</div><div>${f3}</div></div></div>
            <div style="display:flex;flex-direction:column;align-items:center;"><div>${idTitle}</div><div class="bubble-student-id-grid" style="border-color:${hb};background:#fff; padding:4px;">${ig}</div></div>
        </div>`;
    }
    else if (hs === 'basic') {
        bH = `<div class="student-info-print" style="border:2px solid ${hb};background:${hbg};color:${hC};font-size:${hz}; padding:8px 15px; margin-bottom:10px; direction:${dir}; text-align:${align}; display:flex; justify-content:space-between;"><div>${f1}</div><div>${f2}</div><div>${f3}</div></div>`;
    }

    const renderBubbleSection = (title, qList, qType, gridCols) => {
        if (qList.length === 0) return '';
        let secHtml = `<div style="border: 2px solid ${sC}; padding: 6px 10px; margin-bottom: 6px; border-radius: 8px; background: rgba(255,255,255,0.8); direction:${dir}; text-align:${align};">`;
        secHtml += `<h4 style="margin-top: 0; color: ${sC}; text-align: center; margin-bottom: 12px; border-bottom: 1px dashed ${sC}; padding-bottom: 4px; font-weight: 900; font-size: 13px;">${title}</h4>`;

        // تطبيق فئة الأعمدة التي اختارها المستخدم (bubble-col-1 إلى 4)
        secHtml += `<div class="bubble-container bubble-col-${gridCols}" style="display: grid; color:${sC}; direction:${dir};">`;

        qList.forEach((q) => {
            let i = q.num;
            // إضافة مسافة علوية تلقائياً إذا اختار المستخدم الحروف فوق الفقاعة لتجنب تداخل النصوص
            let rowClass = pos === 'above' ? 'bubble-row spacing-above' : 'bubble-row';
            let rowMargin = pos === 'above' ? 'margin-top: 22px;' : '';

            secHtml += `<div class="${rowClass}" style="${rowMargin} margin-bottom: 8px; display: flex; align-items: center; gap: 4px; width:100%; direction:${dir};">`;
            secHtml += `<div class="bubble-q-num" style="width: 25px; font-size: 14px; font-weight:bold; flex-shrink:0; text-align:${align};">${i}.</div>`;
            secHtml += `<div class="bubble-options-wrapper" style="gap: ${pos === 'beside' ? '8px' : '4px'}; flex:1; justify-content:flex-start;">`;

            let bSize = userBubbleSize;
            let fontSize = (parseInt(userBubbleSize) * 0.45) + 'px';

            // 3. دالة بناء الفقاعة المتطورة للتحكم في موضع الحرف (بجانب، أعلى، داخل، مخفي)
            const createBubbleHTML = (letter) => {
                let lbl = (pos === 'above' || pos === 'beside') ? `<span class="bubble-label" style="color:${sC};">${letter}</span>` : '';
                let ins = (pos === 'inside') ? letter : '';

                return `
                <div class="bubble-item pos-${pos}">
                    ${pos === 'beside' ? lbl : ''}
                    <div class="bubble-shape shape-${sh}" style="width:${bSize}; height:${sh === 'oval' ? 'auto' : bSize}; border-color:${sC}; color:${sC}; font-size:${fontSize};">
                        ${ins}
                    </div>
                    ${pos === 'above' ? lbl : ''}
                </div>`;
            };

            // 4. تطبيق عدد الخيارات (أقصى عدد للخيارات لكل سؤال) بناءً على ما يختاره المستخدم
            if (qType === 'mcq') {
                for (let o = 0; o < oC; o++) {
                    let l = lA[o] || '';
                    secHtml += pos !== 'hidden' ? createBubbleHTML(l) : createBubbleHTML('');
                }
            } else if (qType === 'tf_inline') {
                for (let o = 0; o < 2; o++) {
                    let l = tfLetters[o];
                    secHtml += pos !== 'hidden' ? createBubbleHTML(l) : createBubbleHTML('');
                }
            }
            secHtml += `</div></div>`;
        });
        secHtml += `</div></div>`;
        return secHtml;
    };

    let bHt = '';

    // في حالة النماذج الفارغة، يتم تطبيق الأعمدة والتحكمات بدقة
    if (qDb.filter(q => q.type !== 'heading').length === 0) {
        let dummyMCQ = Array.from({ length: 60 }, (_, i) => ({ num: i + 1 }));
        let dummyTF = Array.from({ length: 50 }, (_, i) => ({ num: i + 1 }));

        bHt += renderBubbleSection(isForeign ? mcqTitle + ' (60 Questions)' : mcqTitle + ' (60 سؤال)', dummyMCQ, 'mcq', userColumnsCount);
        bHt += renderBubbleSection(isForeign ? tfTitle + ' (50 Questions)' : tfTitle + ' (50 سؤال)', dummyTF, 'tf_inline', userColumnsCount);
    } else {
        let mcqQs = qDb.filter(q => q.type === 'mcq');
        let tfQs = qDb.filter(q => q.type === 'tf_inline');

        bHt += renderBubbleSection(mcqTitle, mcqQs, 'mcq', userColumnsCount);
        bHt += renderBubbleSection(tfTitle, tfQs, 'tf_inline', userColumnsCount);
    }

    return bH + bHt;
}


async function executeExport(printType) {
    applyUserSettings();
    const pA = document.getElementById('wordPrintPreviewArea');
    pA.innerHTML = '';
    syncTextToDatabase();
    let qC = questionsDatabase.filter(q => q.type !== 'heading').length;
    let emptyBCount = 0;
    if (printType === 'bubble' && qC === 0) {
        let m = prompt("عدد أسئلة البابل شيت الفارغ:", "50"); if (m && !isNaN(m)) emptyBCount = parseInt(m);
        else return showToast('تم إلغاء الأمر', 'error');
    }
    else if (printType !== 'bubble' && qC === 0 && currentMode === 'questions') return showToast('أدرج الأسئلة والمفردات الاختبارية أولاً', 'error');

    if (currentMode === 'text') {
        pA.className = 'print-mode-text';
        pA.innerHTML = generatePageHTML(`<div class="content-card general-text-display">${document.getElementById('generalTextInput').innerHTML}</div>`, getBackgroundCSS());
    }
    else {
        pA.className = 'print-mode-questions';
        if (printType === 'bubble') {
            pA.innerHTML = generatePageHTML(getBubbleSheetContent(questionsDatabase, emptyBCount), getBackgroundCSS(), true);
        } else {
            let qP = getRawPreamble('questionsInput');
            if (qP) qP = `<div dir="auto" style="width: 100%; margin-bottom: 30px; clear: both; unicode-bidi: plaintext; text-align: start;">${qP}</div>`;
            let aP = getRawPreamble('answersInput');
            if (aP) aP = `<div dir="auto" style="width: 100%; margin-bottom: 30px; clear: both; unicode-bidi: plaintext; text-align: start;">${aP}</div>`;

            const hs = buildQAndA_HTML(questionsDatabase, document.getElementById('userPrimaryColor').value);
            let fH = '';
            if (printType === 'student' || printType === 'both') fH += generatePageHTML(qP + hs.noAns, getBackgroundCSS(), false);
            if (printType === 'teacher' || printType === 'both') fH += generatePageHTML(aP + hs.withAns, getBackgroundCSS(), true);
            pA.innerHTML = fH;
        }
    }
    if (window.MathJax) await MathJax.typesetPromise([pA]);
    document.getElementById('printBorderOverlay').style.display = document.getElementById('enableBorder').value === 'yes' ? 'block' : 'none';
    document.getElementById('wordPrintModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

async function generateMultiEmptyBubbles() {
    applyUserSettings();
    const pA = document.getElementById('wordPrintPreviewArea');
    pA.innerHTML = '';
    pA.className = 'print-mode-questions';
    let fH = '';

    const numType = document.getElementById('modelNumberType').value;
    const posType = document.getElementById('modelLabelPos').value;

    let mods = ['A', 'B', 'C', 'D'];
    if (numType === 'arabic') mods = ['أ', 'ب', 'ج', 'د'];
    else if (numType === 'number') mods = ['1', '2', '3', '4'];

    let dummyDb = [];
    for (let i = 1; i <= 60; i++) dummyDb.push({ type: 'mcq', num: i });
    for (let i = 1; i <= 50; i++) dummyDb.push({ type: 'tf_inline', num: i });

    for (let i = 0; i < mods.length; i++) {
        let m = mods[i];
        let bgCSS = getBackgroundCSS();
        let modelBadgeHtml = '';

        if (posType === 'watermark') {
            bgCSS = getBackgroundCSS(m);
        } else {
            let align = posType.replace('header_', '');
            if (align === 'right') align = 'right';
            else if (align === 'left') align = 'left';
            modelBadgeHtml = `<div style="text-align: ${align}; width: 100%; margin-bottom: 20px;"><span style="font-weight: 900; font-size: 22px; color: var(--primary-color); border: 3px dashed var(--primary-color); padding: 5px 25px; border-radius: 8px; background: rgba(255,255,255,0.9);">نموذج الاختبار (${m})</span></div>`;
        }

        fH += generatePageHTML(getBubbleSheetContent(dummyDb, 0), bgCSS, true, modelBadgeHtml);
    }

    pA.innerHTML = fH;
    if (window.MathJax) await MathJax.typesetPromise([pA]);
    document.getElementById('printBorderOverlay').style.display = document.getElementById('enableBorder').value === 'yes' ? 'block' : 'none';
    document.getElementById('wordPrintModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

async function generateMultiModels() {
    syncTextToDatabase();
    if (questionsDatabase.length === 0) return showToast('يلزم إدراج الأسئلة أولاً', 'error');
    const pA = document.getElementById('wordPrintPreviewArea');
    pA.innerHTML = '';
    pA.className = 'print-mode-questions';
    let fH = '';

    let qP = getRawPreamble('questionsInput');
    if (qP) qP = `<div dir="auto" style="width: 100%; margin-bottom: 30px; clear: both; unicode-bidi: plaintext; text-align: start;">${qP}</div>`;
    let aP = getRawPreamble('answersInput');
    if (aP) aP = `<div dir="auto" style="width: 100%; margin-bottom: 30px; clear: both; unicode-bidi: plaintext; text-align: start;">${aP}</div>`;

    const numType = document.getElementById('modelNumberType').value;
    const posType = document.getElementById('modelLabelPos').value;

    let mods = ['A', 'B', 'C', 'D'];
    if (numType === 'arabic') mods = ['أ', 'ب', 'ج', 'د'];
    else if (numType === 'number') mods = ['1', '2', '3', '4'];

    for (let i = 0; i < mods.length; i++) {
        let m = mods[i];

        let headings = questionsDatabase.filter(q => q.type === 'heading');
        let questionsOnly = questionsDatabase.filter(q => q.type !== 'heading').sort(() => Math.random() - 0.5);

        let qIdx = 0;
        let sDb = questionsDatabase.map(q => {
            if (q.type === 'heading') return q;
            return questionsOnly[qIdx++];
        });

        let typeCounters = { mcq: 1, tf_inline: 1, essay: 1 };
        sDb.forEach(q => {
            if (q.type !== 'heading') {
                q.num = typeCounters[q.type]++;
            }
        });

        let hs = buildQAndA_HTML(sDb, document.getElementById('userPrimaryColor').value);
        let bgCSS = getBackgroundCSS();
        let modelBadgeHtml = '';

        if (posType === 'watermark') {
            bgCSS = getBackgroundCSS(m);
        } else {
            let align = posType.replace('header_', '');
            modelBadgeHtml = `<div style="text-align: ${align}; width: 100%; margin-bottom: 20px;"><span style="font-weight: 900; font-size: 22px; color: var(--primary-color); border: 3px dashed var(--primary-color); padding: 5px 25px; border-radius: 8px; background: rgba(255,255,255,0.9);">نموذج الاختبار (${m})</span></div>`;
        }

        fH += generatePageHTML(qP + hs.noAns, bgCSS, false, modelBadgeHtml);
        fH += generatePageHTML(aP + hs.withAns, bgCSS, true, modelBadgeHtml);
        fH += generatePageHTML(getBubbleSheetContent(sDb, 0), bgCSS, true, modelBadgeHtml);
    }

    pA.innerHTML = fH;
    if (window.MathJax) await MathJax.typesetPromise([pA]);
    document.getElementById('printBorderOverlay').style.display = document.getElementById('enableBorder').value === 'yes' ? 'block' : 'none';
    document.getElementById('wordPrintModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeWordPrint() {
    document.getElementById('wordPrintModal').style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('printBorderOverlay').style.display = 'none';
}

function applySystemLanguageSettings() {
    // 1. اكتشاف لغة نظام التشغيل أو المتصفح للجهاز الحالي
    const userLang = navigator.language || navigator.userLanguage;
    const isArabic = userLang.toLowerCase().startsWith('ar');

    // 2. تغيير اتجاه الصفحة جذرياً (RTL للعربية و LTR للإنجليزية)
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
    document.documentElement.lang = isArabic ? 'ar' : 'en';
    document.documentElement.style.setProperty('--text-align', isArabic ? 'right' : 'left');

    // إذا كانت لغة الجهاز ليست عربية، سيبقى الموقع باللغة الإنجليزية كما هو
    if (!isArabic) return;

    // 3. قاموس المصطلحات لإعادتها للغة العربية برمجياً دون المساس بتركيبة الـ HTML
    const translations = {
        'Integrated workspace to create and format professional notes and exams with one click': 'بيئة عمل متكاملة لإنشاء وتنسيق الملازم والامتحانات الاحترافية بلمسة واحدة',
        'Comprehensive Question Bank': 'بنك الأسئلة الشامل',
        'Document & Text Editor (Free)': 'محرر النصوص والمستندات (مجاني)',
        'New Draft': 'مسودة جديدة',
        'Undo': 'تراجع',
        'Redo': 'عودة',
        'Upgrade Account (VIP)': 'ترقية الحساب (VIP)',
        'Smart AI Assistant (VIP)': 'مساعد التوليد الذكي (VIP)',
        'Cloud Account System (Firebase) & Document History': 'نظام الحسابات السحابي (Firebase) وسجل المستندات',
        'Login to save your data in the cloud and sync VIP licenses across your devices (Max 3 devices).': 'قم بتسجيل الدخول لحفظ بياناتك في السحابة ومزامنة التراخيص بين أجهزتك',
        'Email': 'البريد الإلكتروني',
        'Password': 'كلمة المرور',
        'Login': 'تسجيل الدخول',
        'Create Account': 'إنشاء حساب',
        'Input System & Formatting': 'أنظمة الإدخال والتنسيق المتقدم',
        'Arabic System (RTL)': 'النظام العربي المطور',
        'English System (LTR)': 'نظام اللغات الأجنبية',
        'Scientific System (Math/Science)': 'النظام العلمي (رياضيات وعلوم)',
        'Insert Tools:': 'أدوات الإدراج:',
        'Add MCQ': 'سؤال اختياري',
        'Add T/F': 'سؤال صح/خطأ',
        'Add Essay': 'سؤال مقالي',
        'Insert Image': 'إدراج صورة',
        'Bank Analytics': 'تحليل البنك',
        'Global Shuffle': 'خلط شامل',
        'Reformat': 'إعادة تنسيق',
        'Heading & Question Editor': 'محرر العناوين والأسئلة:',
        'Answer Key: (Auto-generated or paste manually)': 'مفتاح الإجابات: (توليد تلقائي أو يدوي)',
        'Size': 'حجم',
        'Normal': 'عادي',
        'Medium': 'متوسط',
        'Large': 'كبير',
        'Huge': 'ضخم',
        'Giant': 'عملاق',
        'Multi-Model Engineering & Generation (A, B, C)': 'هندسة وتوليد النماذج المتعددة (A, B, C)',
        'Model Label Position': 'مكان ظهور اسم النموذج',
        'Model Label Format': 'تنسيق اسم الترقيم',
        'Under Header - Center (Above Student Name)': 'تحت الترويسة العلوية - منتصف',
        'English Letters (A, B, C, D)': 'حروف إنجليزية (A, B, C, D)',
        'Print Student Copy': 'طباعة نسخة الطالب',
        'Print Answer Key': 'طباعة نموذج الإجابة',
        'Create Professional Bubble Sheet': 'إنشاء بابل شيت احترافي',
        'Export Full Document': 'تصدير المستند كاملاً',
        'Generate Multi-Models': 'توليد نماذج متعددة',
        'Gen Multi-Model Empty Bubbles (60 MCQ, 50 TF)': 'نماذج بابل شيت فارغة (60 MCQ, 50 TF)'
    };

    // دالة للمرور على كافة النصوص في الصفحة واستبدالها بسلاسة
    function translateDOM(node) {
        if (node.nodeType === 3) { // إذا كان النص مجرداً
            let text = node.nodeValue;
            let textTrimmed = text.trim();
            if (textTrimmed && translations[textTrimmed]) {
                node.nodeValue = text.replace(textTrimmed, translations[textTrimmed]);
            } else {
                // استبدال الكلمات المتداخلة
                for (let [eng, ar] of Object.entries(translations)) {
                    if (text.includes(eng)) {
                        text = text.replace(eng, ar);
                    }
                }
                node.nodeValue = text;
            }
        } else if (node.nodeType === 1 && !['SCRIPT', 'STYLE'].includes(node.nodeName)) {
            for (let i = 0; i < node.childNodes.length; i++) {
                translateDOM(node.childNodes[i]);
            }
        }
    }

    translateDOM(document.body);

    // 4. تعديل النصوص الإرشادية داخل مربعات الكتابة (Placeholders)
    const qInput = document.getElementById('questionsInput');
    if (qInput) {
        qInput.setAttribute('placeholder', 'اكتب العنوان الرئيسي هنا، ثم انزل سطراً واكتب:\n1. اكتب سؤالك الأول هنا...\nأ) الخيار الأول\nب) الخيار الثاني [✓]\nج) الخيار الثالث\nد) الخيار الرابع');
    }

    const aInput = document.getElementById('answersInput');
    if (aInput) {
        aInput.setAttribute('placeholder', 'عنوان صفحة الإجابات هنا...\nإذا لم تضع الإجابة بجوار الخيار، اكتبها هنا:\n1- ب\n2- صح');
    }
}

// تفعيل الدالة فور تحميل عناصر الصفحة بالكامل
window.addEventListener('DOMContentLoaded', applySystemLanguageSettings);

// 1. الدالة الأساسية لتوليد وعرض النماذج المضغوطة
function generateCompactEmptyBubbleSheet() {
    const lType = document.getElementById('compactLettersType').value;
    const sColor = document.getElementById('compactColor').value;

    // قراءة إعدادات النماذج المتعددة الجديدة الخاصة بالنظام المضغوط
    const mCount = parseInt(document.getElementById('compactModelsCount').value) || 1;
    const mType = document.getElementById('compactModelNaming').value;
    const placement = document.getElementById('compactModelPlacement').value;

    const pA = { 'arabic_letters': ['أ', 'ب', 'ج', 'د', 'هـ', 'و'], 'english_letters': ['A', 'B', 'C', 'D', 'E', 'F'], 'numbers': ['1', '2', '3', '4', '5', '6'] }[mType] || ['أ', 'ب', 'ج', 'د'];

    let finalHtml = '';
    const isForeign = (currentQuestionSystem === 'foreign');

    for (let i = 0; i < mCount; i++) {
        let modelName = '';
        if (mCount > 1) {
            let mLetter = pA[i] || (i + 1);
            modelName = isForeign ? `Model (${mLetter})` : `نموذج الاختبار (${mLetter})`;
        }

        finalHtml += `<div class="pdf-page" style="position: relative; padding: 10mm; background: white; margin: 0 auto 20px auto; width: 210mm; min-height: 297mm; box-sizing: border-box; box-shadow: 0 0 10px rgba(0,0,0,0.1); page-break-after: always; overflow: hidden;">`;
        if (typeof getWatermarkHTML === "function") finalHtml += getWatermarkHTML();
        finalHtml += getStrictCompactBubbleSheetContent(lType, sColor, modelName, placement);
        finalHtml += `</div>`;
    }

    document.getElementById('wordPrintPreviewArea').innerHTML = finalHtml;
    document.getElementById('wordPrintModal').style.display = 'flex';
    showToast('تم تجهيز النموذج المضغوط بنجاح!', 'success');
}

// 2. الكود الهندسي الصارم للـ 110 سؤال مع التحكم بالترتيب
// الكود الهندسي الصارم المطور (يدعم الترويسات الديناميكية)
function getStrictCompactBubbleSheetContent(lType, sColor, modelName, placement) {
    let isForeign = (currentQuestionSystem === 'foreign');
    let dir = isForeign ? 'ltr' : 'rtl';
    let align = isForeign ? 'left' : 'right';

    const lA = { 'arabic': ['أ', 'ب', 'ج', 'د'], 'english': ['A', 'B', 'C', 'D'], 'numbers': ['1', '2', '3', '4'] }[lType];
    const tfLetters = isForeign ? ['T', 'F'] : ['ص', 'خ'];

    // 1. قراءة النصوص المخصصة من اللوحة الخضراء (أو وضع قيم افتراضية)
    let f1 = document.getElementById('compactField1') ? document.getElementById('compactField1').value : 'اسم الطالب:';
    let f2 = document.getElementById('compactField2') ? document.getElementById('compactField2').value : 'المادة:';
    let f3 = document.getElementById('compactField3') ? document.getElementById('compactField3').value : 'الفرقة/الصف:';
    let hStyle = document.getElementById('compactHeaderStyle') ? document.getElementById('compactHeaderStyle').value : 'basic';
    let seatTitle = isForeign ? 'Seat No.' : 'رقم الجلوس';

    // 2. تصميم الترويسة بناءً على اختيار المستخدم
    let headerInfoHtml = '';

    if (hStyle === 'basic') {
        // التصميم الأول: صندوق كلاسيكي
        headerInfoHtml = `
            <div style="border: 2px solid ${sColor}; padding: 8px 12px; margin-bottom: 8px; border-radius: 6px; direction:${dir}; text-align:${align}; font-size: 13px; font-weight: bold; color: ${sColor}; display: flex; justify-content: space-between;">
                <div style="flex:1;"><div>${f3} ........................</div></div>
                <div style="flex:1; text-align:center;"><div>${f2} ........................</div></div>
                <div style="flex:2; text-align:${isForeign ? 'right' : 'left'};"><div>${f1} ....................................................</div></div>
            </div>`;
    }
    else if (hStyle === 'lines') {
        // التصميم الثاني: خطوط حرة بدون إطار
        headerInfoHtml = `
            <div style="padding: 4px 12px; margin-bottom: 12px; direction:${dir}; text-align:${align}; font-size: 14px; font-weight: bold; color: ${sColor}; display: flex; justify-content: space-between;">
                <div style="flex:1; border-bottom: 1px dashed ${sColor}; margin-inline-end: 15px;">${f3} </div>
                <div style="flex:1; border-bottom: 1px dashed ${sColor}; margin-inline-end: 15px; text-align:center;">${f2} </div>
                <div style="flex:2; border-bottom: 1px dashed ${sColor}; text-align:${isForeign ? 'right' : 'left'};">${f1} </div>
            </div>`;
    }
    else if (hStyle === 'advanced') {
        // التصميم الثالث: متقدم مع شبكة بابل شيت صغيرة لرقم الجلوس (لا تؤثر على مساحة الصفحة)
        let ig = '';
        for (let c = 0; c < 6; c++) {
            let cb = `<div style="border:1px solid ${sColor}; height:14px; margin-bottom:2px; background:#fff;"></div>`;
            for (let r = 0; r <= 9; r++) {
                cb += `<div style="width:11px;height:11px;font-size:8px;border:1px solid ${sColor};border-radius:50%;display:flex;align-items:center;justify-content:center;margin:1px auto;">${r}</div>`;
            }
            ig += `<div style="display:flex;flex-direction:column;width:14px;gap:1px;">${cb}</div>`;
        }
        headerInfoHtml = `
            <div style="border: 2px solid ${sColor}; padding: 6px 12px; margin-bottom: 8px; border-radius: 6px; direction:${dir}; text-align:${align}; font-size: 13px; font-weight: bold; color: ${sColor}; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.7);">
                <div style="flex:1; display:flex; flex-direction:column; gap:12px;">
                    <div>${f1} ....................................................................</div>
                    <div style="display:flex; gap: 20px;">
                        <div style="flex:1;">${f2} ......................................</div>
                        <div style="flex:1;">${f3} ......................................</div>
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; border-inline-start: 2px dashed ${sColor}; padding-inline-start: 15px; margin-inline-start: 15px;">
                    <div style="font-size:11px; margin-bottom:4px;">${seatTitle}</div>
                    <div style="display:flex; gap: 2px;">${ig}</div>
                </div>
            </div>`;
    }

    let modelHeaderHtml = modelName ? `<div style="text-align:center; margin-bottom: 8px;"><span style="border: 2px dashed ${sColor}; padding: 4px 20px; font-weight: 900; border-radius: 8px; color: ${sColor}; font-size: 15px;">${modelName}</span></div>` : '';

    // ترتيب ظهور الترويسة مع اسم النموذج (Top or Above Student)
    let topSection = placement === 'top' ? (modelHeaderHtml + headerInfoHtml) : (headerInfoHtml + modelHeaderHtml);

    const renderSection = (title, startNum, totalQs, cols, options) => {
        let html = `<div style="border: 2px solid ${sColor}; padding: 6px; margin-bottom: 6px; border-radius: 6px; direction:${dir}; text-align:${align}; color: ${sColor};">`;
        html += `<div style="text-align: center; font-weight: 900; font-size: 12px; border-bottom: 1px dashed ${sColor}; margin-bottom: 6px; padding-bottom: 4px;">${title}</div>`;
        html += `<div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 4px 8px;">`;

        for (let i = 0; i < totalQs; i++) {
            let num = startNum + i;
            html += `<div style="display: flex; align-items: center; justify-content: flex-start; font-size: 11px; margin-bottom: 2px;">`;
            html += `<div style="width: 22px; font-weight: bold; text-align: ${align};">${num}.</div>`;
            html += `<div style="display: flex; gap: 6px; flex: 1;">`;
            options.forEach(opt => {
                html += `<div style="display: flex; align-items: center; gap: 3px;">`;
                html += `<span style="font-size: 11px;">${opt}</span>`;
                html += `<div style="width: 14px; height: 14px; border: 1px solid ${sColor}; border-radius: 50%;"></div>`;
                html += `</div>`;
            });
            html += `</div></div>`;
        }
        html += `</div></div>`;
        return html;
    };

    let mcqTitle = isForeign ? 'Multiple Choice Questions' : 'قسم أسئلة الاختيار من متعدد';
    let tfTitle = isForeign ? 'True/False Questions' : 'قسم أسئلة الصواب والخطأ';

    let mcqHtml = renderSection(mcqTitle, 1, 60, 4, lA);
    let tfHtml = renderSection(tfTitle, 1, 50, 4, tfLetters);

    return topSection + mcqHtml + tfHtml;
}
// 1. نظام العلامة المائية المتطور (مربوط بأسماء لوحتك الأصلية)
function getWatermarkHTML() {
    let textEl = document.getElementById('wmText');
    let text = textEl ? textEl.value : 'EL-ALFEY';
    if (!text.trim()) text = 'EL-ALFEY';
    let colorEl = document.getElementById('wmColor');
    const color = colorEl ? colorEl.value : '#4A00E0';
    let typeEl = document.getElementById('wmType');
    const type = typeEl ? typeEl.value : 'repeat';
    if (type === 'single') {
        return '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 120px; color: ' + color + '; opacity: 0.1; z-index: 1; pointer-events: none; font-weight: 900; white-space: nowrap;">' + text + '</div>';
    } else {
        let wmHtml = '<div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; z-index: 1; pointer-events: none; display: flex; flex-wrap: wrap; align-content: flex-start; justify-content: space-around; gap: 40px; padding: 30px; opacity: 0.08;">';
        for (let i = 0; i < 60; i++) {
            wmHtml += '<div style="transform: rotate(-35deg); font-size: 32px; font-weight: 900; color: ' + color + '; user-select: none; margin: 10px;">' + text + '</div>';
        }
        wmHtml += '</div>';
        return wmHtml;
    }
}

function applyGlobalPaperFormatting() {
    try {
        const borderEl = document.getElementById('enableBorder');
        const borderToggle = borderEl ? borderEl.value : 'yes';
        const isBorderEnabled = (borderToggle !== 'no' && borderToggle !== 'none' && borderToggle.indexOf('إلغاء') === -1);
        const borderStyle = document.getElementById('borderStyle') ? document.getElementById('borderStyle').value : 'solid';
        const borderWidth = document.getElementById('borderWidth') ? document.getElementById('borderWidth').value + 'px' : '8px';
        const borderColor = document.getElementById('borderColor') ? document.getElementById('borderColor').value : '#4A00E0';
        const paperBg = document.getElementById('pageBgColor') ? document.getElementById('pageBgColor').value : '#ffffff';
        const fontFamily = document.getElementById('userFont') ? document.getElementById('userFont').value : "'Cairo', sans-serif";
        const textAlign = document.getElementById('textAlign') ? document.getElementById('textAlign').value : 'right';
        const textColor = document.getElementById('textColor') ? document.getElementById('textColor').value : '#1e293b';
        const primaryColor = document.getElementById('userPrimaryColor') ? document.getElementById('userPrimaryColor').value : '#4A00E0';
        const cardBgToggle = document.getElementById('textBgToggle') ? document.getElementById('textBgToggle').value : 'color';
        const cardBgColor = document.getElementById('textBgColor') ? document.getElementById('textBgColor').value : '#ffffff';
        const cardRadius = document.getElementById('cardRadius') ? document.getElementById('cardRadius').value + 'px' : '8px';

        let styleStr = "";
        styleStr += "#wordPrintPreviewArea { font-family: " + fontFamily + " !important; color: " + textColor + " !important; text-align: " + textAlign + " !important; } ";

        styleStr += "#wordPrintPreviewArea .pdf-page * { line-height: 1 !important; } ";
        styleStr += "#wordPrintPreviewArea .pdf-page br { display: none !important; } ";
        styleStr += "#wordPrintPreviewArea .pdf-page table { margin: 0 !important; padding: 0 !important; border-collapse: collapse !important; width: 100% !important; } ";
        styleStr += "#wordPrintPreviewArea .pdf-page th, #wordPrintPreviewArea .pdf-page td { padding: 0px 2px !important; margin: 0 !important; } ";

        styleStr += "#wordPrintPreviewArea h1, #wordPrintPreviewArea h2, #wordPrintPreviewArea h3, #wordPrintPreviewArea h4, #wordPrintPreviewArea .bubble-advanced-header { color: " + primaryColor + " !important; position: relative; z-index: 5; margin: 0 !important; padding: 0 !important; } ";

        styleStr += "#wordPrintPreviewArea .pdf-page > *:first-child { margin-top: -4px !important; padding-top: 0 !important; } ";
        styleStr += "#wordPrintPreviewArea .pdf-page > *:last-child { margin-bottom: 0 !important; padding-bottom: 0 !important; } ";

        styleStr += "#wordPrintPreviewArea .question-card { background-color: " + (cardBgToggle === 'color' ? cardBgColor : 'transparent') + " !important; border-radius: " + cardRadius + " !important; border: 1px solid " + borderColor + " !important; position: relative; z-index: 5; margin-top: 0 !important; margin-bottom: 0px !important; padding: 1px 4px !important; page-break-inside: avoid !important; } ";

        styleStr += "#wordPrintPreviewArea .pdf-page { ";
        styleStr += "position: relative !important; ";
        styleStr += "background-color: " + paperBg + " !important; ";
        if (isBorderEnabled) {
            styleStr += "border: " + borderWidth + " " + borderStyle + " " + borderColor + " !important; ";
        } else {
            styleStr += "border: none !important; ";
        }
        styleStr += "box-sizing: border-box !important; ";
        styleStr += "padding: 0px 4mm 0px 4mm !important; ";
        styleStr += "margin: 0 auto 15px auto !important; ";
        styleStr += "width: 210mm !important; ";
        styleStr += "min-height: 297mm !important; ";
        styleStr += "-webkit-box-decoration-break: clone !important; ";
        styleStr += "box-decoration-break: clone !important; ";
        styleStr += "overflow: hidden !important; ";
        styleStr += "-webkit-print-color-adjust: exact !important; ";
        styleStr += "print-color-adjust: exact !important; ";
        styleStr += "} ";

        styleStr += "@media print { ";
        styleStr += "@page { size: A4 portrait; margin: 0 !important; } ";
        styleStr += "html, body { width: 210mm !important; background: #ffffff !important; margin: 0 !important; padding: 0 !important; } ";
        styleStr += "body * { visibility: hidden !important; } ";
        styleStr += "#wordPrintModal, #wordPrintModal * { visibility: visible !important; } ";
        styleStr += "#wordPrintModal { position: absolute !important; left: 0 !important; top: 0 !important; width: 210mm !important; margin: 0 !important; padding: 0 !important; background: transparent !important; } ";
        styleStr += "#wordPrintPreviewArea { width: 210mm !important; margin: 0 !important; padding: 0 !important; } ";

        styleStr += "#wordPrintPreviewArea .pdf-page { ";
        styleStr += "margin: 0 !important; ";
        styleStr += "padding: 0px 4mm 0px 4mm !important; ";
        styleStr += "box-shadow: none !important; ";
        styleStr += "} ";
        styleStr += ".word-sidebar, .btn-print, .btn-close { display: none !important; } ";
        styleStr += "} ";

        let styleTag = document.getElementById('dynamicGlobalPaperStyles');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'dynamicGlobalPaperStyles';
            document.head.appendChild(styleTag);
        }
        styleTag.innerHTML = styleStr;
    } catch (error) { }
}

const myPanel = document.getElementById('generalSettingsPanel');
if (myPanel) {
    myPanel.addEventListener('input', applyGlobalPaperFormatting);
    myPanel.addEventListener('change', applyGlobalPaperFormatting);
}
window.addEventListener('load', applyGlobalPaperFormatting);

window.addEventListener('beforeprint', function () {
    let modal = document.getElementById('wordPrintModal');
    if (!modal) return;
    let children = document.body.children;
    for (let i = 0; i < children.length; i++) {
        let child = children[i];
        if (child !== modal && !child.contains(modal) && child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE') {
            child.setAttribute('data-print-hide', child.style.display || 'none-default');
            child.style.display = 'none';
        }
    }

    let pageEl = document.querySelector('#wordPrintPreviewArea .pdf-page');
    if (pageEl) {
        let ruler = document.createElement('div');
        ruler.style.height = '296.5mm';
        ruler.style.position = 'absolute';
        ruler.style.visibility = 'hidden';
        document.body.appendChild(ruler);
        let pageHeightPx = ruler.getBoundingClientRect().height;
        document.body.removeChild(ruler);

        let contentH = pageEl.getBoundingClientRect().height;
        let remainder = contentH % pageHeightPx;

        if (remainder > 10 && remainder < pageHeightPx - 10) {
            let padNeeded = pageHeightPx - remainder;
            let strut = document.createElement('div');
            strut.id = 'print-strut-helper';
            strut.style.height = padNeeded + 'px';
            strut.style.width = '100%';
            strut.style.backgroundColor = 'transparent';
            strut.style.border = 'none';
            pageEl.appendChild(strut);
        }
    }
});

window.addEventListener('afterprint', function () {
    let hiddenEls = document.querySelectorAll('[data-print-hide]');
    for (let i = 0; i < hiddenEls.length; i++) {
        let el = hiddenEls[i];
        let originalDisplay = el.getAttribute('data-print-hide');
        el.style.display = (originalDisplay === 'none-default') ? '' : originalDisplay;
        el.removeAttribute('data-print-hide');
    }

    let strut = document.getElementById('print-strut-helper');
    if (strut) strut.remove();
});
window.addEventListener('load', () => {
    const panels = document.querySelectorAll('.settings-panel');
    panels.forEach((panel, index) => {

        // 🌟 السر هنا: استثناء لوحة تسجيل الدخول (نظام الحسابات) من الطي 🌟
        if (panel.id === 'accountHistoryPanel') return;

        // إضافة كلاس لتمييز اللوحات القابلة للطي فقط
        panel.classList.add('collapsible');

        const header = panel.querySelector('h3');
        if (!header) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'panel-content';

        while (header.nextSibling) {
            wrapper.appendChild(header.nextSibling);
        }
        panel.appendChild(wrapper);

        header.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
        });

        // طي اللوحات في الهواتف، أو اللوحات التي بعد الأولى في الكمبيوتر
        if (window.innerWidth <= 768 || index > 0) {
            panel.classList.add('collapsed');
        }
    });
});
document.addEventListener('DOMContentLoaded', () => {
    const oldIndicator = document.getElementById('autosaveIndicator');
    if (oldIndicator) oldIndicator.remove();

    const indicator = document.createElement('div');
    indicator.id = 'autosaveIndicator';
    document.body.appendChild(indicator);

    let saveStatusTimeout;
    function triggerSaveUI(status) {
        clearTimeout(saveStatusTimeout);
        if (status === 'saving') {
            indicator.innerHTML = '<span>⏳</span> <span>جاري التحديث آلياً...</span>';
            indicator.classList.add('show');
        } else if (status === 'saved') {
            indicator.innerHTML = '<span>✅</span> <span>تم الحفظ والمزامنة سحابياً</span>';
            indicator.classList.add('show');
            saveStatusTimeout = setTimeout(() => {
                indicator.classList.remove('show');
            }, 2000);
        }
    }

    const inputsToWatch = ['questionsInput', 'answersInput', 'generalTextInput'];
    inputsToWatch.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                triggerSaveUI('saving');
                clearTimeout(window.uiSaveDebounce);
                window.uiSaveDebounce = setTimeout(() => {
                    triggerSaveUI('saved');
                }, 1600);
            });
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            if (typeof syncCurrentToHistory === 'function') {
                syncCurrentToHistory();
            }
            triggerSaveUI('saving');
            setTimeout(() => triggerSaveUI('saved'), 500);
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            if (typeof executeExport === 'function') {
                executeExport(currentMode === 'text' ? 'text' : 'both');
            }
        }
    });

    const oldArchiveModal = document.getElementById('archiveBankModal');
    if (oldArchiveModal) oldArchiveModal.remove();

    const oldBtn = document.getElementById('archiveBtnTrigger');
    if (oldBtn) oldBtn.remove();

    const archiveModal = document.createElement('div');
    archiveModal.id = 'archiveBankModal';
    archiveModal.className = 'custom-modal';
    archiveModal.innerHTML = `
        <div class="modal-content" style="text-align: right; max-width: 700px;">
            <h3 style="color: var(--primary-color); margin-top: 0; border-bottom: 2px solid var(--primary-color); padding-bottom: 10px;">☁️ أرشيف المسودات السحابي</h3>
            <p style="font-size: 13px; color: #64748b; margin-bottom: 15px;">احفظ محتوى المحرر بالكامل كمسودة في حسابك السحابي لتسترجعها في أي وقت ومن أي جهاز.</p>
            <div style="display: flex; gap: 10px; margin-bottom: 15px; flex-wrap: wrap;">
                <button id="btnActionStoreBulk" style="background: var(--primary-color); color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-weight: bold; font-family: inherit;">☁️ حفظ المحرر الحالي في السحابة</button>
                <button id="btnActionClearArchive" style="background: #fee2e2; color: #b91c1c; border: 1px solid #f87171; padding: 10px 15px; border-radius: 8px; cursor: pointer; font-weight: bold; font-family: inherit;">🗑️ تفريغ الأرشيف السحابي</button>
            </div>
            <div id="archiveQuestionsListContainer" style="max-height: 300px; overflow-y: auto; background: var(--ui-input-bg); padding: 12px; border-radius: 8px; border: 1px solid var(--ui-border); display: flex; flex-direction: column; gap: 10px;">
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button id="btnCloseArchiveModal" style="background: #e2e8f0; border: none; padding: 10px 30px; border-radius: 8px; cursor: pointer; font-weight: bold; color: #1e293b; font-family: inherit;">إغلاق</button>
            </div>
        </div>
    `;
    document.body.appendChild(archiveModal);

    const targetToolBarGroup = document.querySelector('button[onclick="showAnalytics()"]')?.parentElement;
    if (targetToolBarGroup) {
        const archiveBtn = document.createElement('button');
        archiveBtn.id = 'archiveBtnTrigger';
        archiveBtn.className = 'btn-tool';
        archiveBtn.style.borderColor = '#8b5cf6';
        archiveBtn.style.color = '#8b5cf6';
        archiveBtn.innerHTML = '☁️ أرشيف المسودات';
        archiveBtn.onclick = () => {
            archiveModal.style.display = 'flex';
            renderArchiveQuestionsList();
        };
        targetToolBarGroup.insertBefore(archiveBtn, targetToolBarGroup.firstChild);
    }

    document.getElementById('btnCloseArchiveModal').onclick = () => {
        archiveModal.style.display = 'none';
    };

    document.getElementById('btnActionStoreBulk').onclick = async () => {
        const user = firebase.auth().currentUser;
        if (!user) {
            if (typeof showToast === 'function') showToast('يجب تسجيل الدخول لحفظ المسودات في السحابة', 'error');
            return;
        }

        const qHtml = document.getElementById('questionsInput') ? document.getElementById('questionsInput').innerHTML : '';
        const aHtml = document.getElementById('answersInput') ? document.getElementById('answersInput').innerHTML : '';
        const gHtml = document.getElementById('generalTextInput') ? document.getElementById('generalTextInput').innerHTML : '';

        if (!qHtml.trim() && !gHtml.trim() && !gHtml.includes('اكتب محتوى المستند')) {
            if (typeof showToast === 'function') showToast('المحرر فارغ، لا يوجد ما يمكن حفظه', 'error');
            return;
        }

        if (typeof showToast === 'function') showToast('جاري الاتصال بالسحابة...', 'info');

        try {
            const docRef = db.collection('users').doc(user.uid);
            const docSnap = await docRef.get();
            let drafts = [];
            if (docSnap.exists && docSnap.data().drafts) {
                drafts = docSnap.data().drafts;
            }

            let draftName = prompt('أدخل اسماً لهذه المسودة السحابية:', 'مسودة ' + new Date().toLocaleDateString('ar-EG'));
            if (!draftName) return;
            draftName = draftName.trim();

            while (drafts.some(d => d.title === draftName)) {
                draftName = prompt('⚠️ هذا الاسم مسجل مسبقاً لديك!\nالرجاء إدخال اسم مختلف لتمييز هذه المسودة:', draftName + ' 2');
                if (!draftName) return;
                draftName = draftName.trim();
            }

            const newDraft = {
                type: 'draft',
                title: draftName,
                date: new Date().toLocaleTimeString('ar-EG'),
                q: qHtml,
                a: aHtml,
                g: gHtml,
                mode: typeof currentMode !== 'undefined' ? currentMode : 'questions'
            };

            drafts.push(newDraft);
            await docRef.update({ drafts: drafts });
            if (typeof showToast === 'function') showToast('تم حفظ المسودة في حسابك السحابي بنجاح', 'success');
            renderArchiveQuestionsList();
        } catch (e) {
            if (typeof showToast === 'function') showToast('حدث خطأ أثناء الاتصال بالسحابة', 'error');
        }
    };

    document.getElementById('btnActionClearArchive').onclick = async () => {
        const user = firebase.auth().currentUser;
        if (!user) return;

        if (confirm('هل أنت متأكد من مسح جميع المسودات من حسابك السحابي نهائياً؟')) {
            try {
                await db.collection('users').doc(user.uid).update({ drafts: [] });
                if (typeof showToast === 'function') showToast('تم تفريغ الأرشيف السحابي', 'info');
                renderArchiveQuestionsList();
            } catch (e) { }
        }
    };

    async function renderArchiveQuestionsList() {
        const container = document.getElementById('archiveQuestionsListContainer');
        const user = firebase.auth().currentUser;

        if (!user) {
            container.innerHTML = '<p style="color: #ef4444; text-align: center; font-size: 13px; margin: 10px 0;">يرجى تسجيل الدخول أولاً للوصول إلى مسوداتك السحابية.</p>';
            return;
        }

        container.innerHTML = '<p style="color: #64748b; text-align: center; font-size: 13px; margin: 10px 0;">جاري جلب المسودات من السحابة... ⏳</p>';

        try {
            const docSnap = await db.collection('users').doc(user.uid).get();
            let archive = [];
            if (docSnap.exists && docSnap.data().drafts) {
                archive = docSnap.data().drafts;
            }

            if (archive.length === 0) {
                container.innerHTML = '<p style="color: #64748b; text-align: center; font-size: 13px; margin: 10px 0;">الأرشيف السحابي فارغ.</p>';
                return;
            }

            let html = '';
            archive.forEach((item, idx) => {
                let t = item.title || 'مسودة محفوظة';
                let d = item.date || '';
                html += `
                    <div style="background: var(--ui-container); padding: 12px; border-radius: 8px; border: 1px solid var(--ui-border); display: flex; justify-content: space-between; align-items: center; gap: 15px;">
                        <div style="text-align: right; flex: 1; overflow: hidden;">
                            <div style="font-weight: bold; color: var(--primary-color); font-size: 14px;">☁️ ${t}</div>
                            <div style="font-size: 11px; color: var(--ui-text-muted);">${d}</div>
                        </div>
                        <button data-idx="${idx}" class="btn-archive-inject" style="background: #10b981; color: white; border: none; padding: 6px 15px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: bold; font-family: inherit;">استعادة ♻️</button>
                        <button data-idx="${idx}" class="btn-archive-delete" style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: bold; font-family: inherit;">❌</button>
                    </div>
                `;
            });
            container.innerHTML = html;

            container.querySelectorAll('.btn-archive-inject').forEach(btn => {
                btn.onclick = (e) => {
                    const index = e.target.getAttribute('data-idx');
                    injectQuestionFromVault(index);
                };
            });

            container.querySelectorAll('.btn-archive-delete').forEach(btn => {
                btn.onclick = async (e) => {
                    const index = e.target.getAttribute('data-idx');
                    const docSnap = await db.collection('users').doc(user.uid).get();
                    if (docSnap.exists && docSnap.data().drafts) {
                        let arc = docSnap.data().drafts;
                        arc.splice(index, 1);
                        await db.collection('users').doc(user.uid).update({ drafts: arc });
                        renderArchiveQuestionsList();
                    }
                };
            });
        } catch (e) {
            container.innerHTML = '<p style="color: #ef4444; text-align: center;">حدث خطأ في جلب البيانات من السحابة.</p>';
        }
    }

    async function injectQuestionFromVault(idx) {
        const user = firebase.auth().currentUser;
        if (!user) return;

        try {
            const docSnap = await db.collection('users').doc(user.uid).get();
            if (docSnap.exists && docSnap.data().drafts) {
                const archive = docSnap.data().drafts;
                if (!archive[idx]) return;
                const item = archive[idx];

                if (item.type === 'draft') {
                    if (document.getElementById('questionsInput') && item.q !== undefined) document.getElementById('questionsInput').innerHTML = item.q;
                    if (document.getElementById('answersInput') && item.a !== undefined) document.getElementById('answersInput').innerHTML = item.a;
                    if (document.getElementById('generalTextInput') && item.g !== undefined) document.getElementById('generalTextInput').innerHTML = item.g;

                    if (typeof switchTab === 'function' && item.mode) {
                        const btnId = item.mode === 'questions' ? 'btnTabQuestions' : 'btnTabText';
                        const btn = document.getElementById(btnId);
                        if (btn) switchTab(item.mode, btn);
                    }

                    if (typeof syncTextToDatabase === 'function') syncTextToDatabase();
                    if (typeof autoSaveData === 'function') autoSaveData();

                    const archiveModal = document.getElementById('archiveBankModal');
                    if (archiveModal) archiveModal.style.display = 'none';
                    if (typeof showToast === 'function') showToast('تم استعادة المسودة بنجاح من السحابة', 'success');
                }
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast('فشل في استعادة المسودة', 'error');
        }
    }
});
function insertCustomTable() {
    const rows = parseInt(prompt('أدخل عدد الصفوف:', '3'));
    const cols = parseInt(prompt('أدخل عدد الأعمدة:', '3'));

    if (isNaN(rows) || isNaN(cols) || rows <= 0 || cols <= 0) return;

    let tableHTML = '<br><table class="editor-table"><tbody>';

    for (let i = 0; i < rows; i++) {
        tableHTML += '<tr>';
        for (let j = 0; j < cols; j++) {
            if (i === 0) {
                tableHTML += '<th>عنوان</th>';
            } else {
                tableHTML += '<td>...</td>';
            }
        }
        tableHTML += '</tr>';
    }

    tableHTML += '</tbody></table><br><p>&#8203;</p>';

    const editor = document.getElementById('questionsInput');
    editor.focus();
    document.execCommand('insertHTML', false, tableHTML);

    if (typeof syncTextToDatabase === 'function') syncTextToDatabase();
    if (typeof autoSaveData === 'function') autoSaveData();
    if (typeof triggerSaveUI === 'function') triggerSaveUI('saving');
    setTimeout(() => { if (typeof triggerSaveUI === 'function') triggerSaveUI('saved'); }, 500);
}