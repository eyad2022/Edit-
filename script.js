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

// =====================================================================
// 🛡️ نظام بصمة الجهاز المعقدة (لمنع التخفي والتلاعب) - نسخة مصححة
// =====================================================================
function generateDeviceFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 200; canvas.height = 50;
        ctx.textBaseline = "top"; ctx.font = "14px 'Arial'";
        ctx.fillStyle = "#f60"; ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069"; ctx.fillText("M&H Editor Pro", 2, 15);
        const canvasData = canvas.toDataURL();

        const screenData = window.screen.width + "x" + window.screen.height;
        const rawString = canvasData + screenData + navigator.userAgent;

        let hash = 0;
        for (let i = 0; i < rawString.length; i++) {
            hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
            hash = hash & hash;
        }
        return "WEB_FP_" + Math.abs(hash).toString(16);
    } catch (err) {
        return "DEV_RND_" + Math.random().toString(36).substring(2, 15);
    }
}

let localDeviceId = localStorage.getItem('elalfey_device_id');
// التحقق من عدم وجود الخطأ القديم (Promise) في المتصفح وتصحيحه فوراً
if (!localDeviceId || localDeviceId === "[object Promise]") {
    localDeviceId = generateDeviceFingerprint();
    localStorage.setItem('elalfey_device_id', localDeviceId);
}

let currentMode = 'questions';
let currentQuestionSystem = 'arabic';
let questionsDatabase = [];
// فصل الذاكرة لكل محرر على حدة
let questionsHistory = [];
let textHistory = [];
let questionsHistoryIndex = -1;
let textHistoryIndex = -1;
let historyTimeout;
let pendingAction = null;
let pendingActionParam = null;
let historySaveTimeout;

function setQuestionSystem(sys) {
    currentQuestionSystem = sys;

    // 1. تحديد الزر الرئيسي للقائمة المنسدلة لتحديث اسمه
    const mainBtnSpan = document.querySelector('.sys-btn span');
    let systemName = '';

    const qInp = document.getElementById('questionsInput');
    const aInp = document.getElementById('answersInput');
    const sciTb = document.getElementById('scientificToolbar');
    const mcqBtn = document.getElementById('btnInsertMCQ');
    const tfBtn = document.getElementById('btnInsertTF');
    const essayBtn = document.getElementById('btnInsertEssay');

    if (sys === 'arabic') {
        systemName = 'النظام العربي';
        if (qInp) { qInp.dir = "auto"; qInp.style.textAlign = "start"; qInp.style.fontFamily = "inherit"; }
        if (aInp) { aInp.dir = "auto"; aInp.style.textAlign = "start"; aInp.style.fontFamily = "inherit"; }
        if (sciTb) sciTb.style.display = "none";
        if (mcqBtn) mcqBtn.innerHTML = "🔘 سؤال اختياري";
        if (tfBtn) tfBtn.innerHTML = "✅ سؤال صح/خطأ";
        if (essayBtn) essayBtn.innerHTML = "📝 سؤال مقالي";
    } else if (sys === 'foreign') {
        systemName = 'نظام اللغات (LTR)';
        if (qInp) { qInp.dir = "ltr"; qInp.style.textAlign = "left"; qInp.style.fontFamily = "'Readex Pro', Arial, sans-serif"; }
        if (aInp) { aInp.dir = "ltr"; aInp.style.textAlign = "left"; aInp.style.fontFamily = "'Readex Pro', Arial, sans-serif"; }
        if (sciTb) sciTb.style.display = "none";
        if (mcqBtn) mcqBtn.innerHTML = "🔘 Add MCQ";
        if (tfBtn) tfBtn.innerHTML = "✅ Add T/F";
        if (essayBtn) essayBtn.innerHTML = "📝 Add Essay";
    } else if (sys === 'science') {
        systemName = 'النظام العلمي';
        if (qInp) { qInp.dir = "auto"; qInp.style.textAlign = "left"; qInp.style.fontFamily = "inherit"; }
        if (aInp) { aInp.dir = "auto"; aInp.style.textAlign = "left"; aInp.style.fontFamily = "inherit"; }
        if (sciTb) sciTb.style.display = "flex";
        if (mcqBtn) mcqBtn.innerHTML = "🔘 MCQ (Science)";
        if (tfBtn) tfBtn.innerHTML = "✅ T/F (Science)";
        if (essayBtn) essayBtn.innerHTML = "📝 Essay (Science)";
    }

    // 2. تحديث نص الزر في الواجهة الجديدة لتعرف النظام النشط حالياً
    if (mainBtnSpan) {
        mainBtnSpan.innerText = systemName;
    }

    showToast("تم تفعيل " + systemName, 'info');
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

function adjustImageSize(dimension, amount) {
    if (!activeImage) return;
    let currentSize = parseInt(window.getComputedStyle(activeImage)[dimension]);
    if (isNaN(currentSize)) currentSize = 100;
    let newSize = currentSize + amount;
    if (newSize < 20) newSize = 20;
    activeImage.style[dimension] = newSize + 'px';
    autoSaveData();
    syncTextToDatabase();
}

function getEditorText(id) {
    const el = document.getElementById(id);
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));

    // إزالة الـ div و p بأمان دون تدمير الـ HTML الداخلي كالجداول
    Array.from(clone.querySelectorAll('div, p')).forEach(block => {
        const frag = document.createDocumentFragment();
        frag.appendChild(document.createTextNode('\n'));
        while (block.firstChild) {
            frag.appendChild(block.firstChild);
        }
        frag.appendChild(document.createTextNode('\n'));
        block.replaceWith(frag);
    });

    let temp = document.createElement('div');
    temp.innerHTML = clone.innerHTML;
    let finalStr = '';

    function traverse(node) {
        if (node.nodeType === 3) {
            finalStr += node.nodeValue;
        }
        else if (node.nodeName === 'IMG') {
            finalStr += '\n' + node.outerHTML + '\n';
        }
        else if (node.nodeName === 'TABLE') {
            // المحافظة على الجدول ككتلة واحدة مترابطة
            finalStr += '\n' + node.outerHTML.replace(/\n/g, '').replace(/\r/g, '') + '\n';
        }
        else {
            node.childNodes.forEach(traverse);
        }
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

let sessionListener = null;

auth.onAuthStateChanged(async (user) => {
    if (user) {
        const docRef = db.collection('users').doc(user.uid);
        const docSnap = await docRef.get();

        // === 1. النظام السحابي: منح 7 أيام للحسابات الجديدة ===
        if (!docSnap.exists || !docSnap.data().trialStart) {
            const trialStart = Date.now();
            const trialDays = 7;
            const trialExpiryDate = trialStart + (trialDays * 24 * 60 * 60 * 1000);

            await docRef.set({
                email: user.email,
                trialStart: trialStart,
                vipExpiry: trialExpiryDate, // نعطيه 7 أيام كأنه VIP
                joinDate: Date.now()
            }, { merge: true });

            showToast('🎉 تم تفعيل الفترة التجريبية (7 أيام) لحسابك بنجاح!', 'success');
        }

        if (docSnap.exists) {
            let data = docSnap.data();
            let devices = data.devices || [];

            // === 2. التحقق من عدد الأجهزة (3 أجهزة كحد أقصى) ===
            if (!devices.includes(localDeviceId)) {
                if (devices.length >= 3) {
                    let resetConfirm = confirm("⚠️ عذراً، لقد وصلت للحد الأقصى (3 أجهزة).\n\n- اضغط [إلغاء/Cancel] للذهاب وتسجيل الخروج يدوياً من أحد أجهزتك.\n- اضغط [موافق/OK] لتصفير الأجهزة وطرد جميع الأجهزة الأخرى إجبارياً الآن.");
                    if (resetConfirm) {
                        devices = [localDeviceId];
                        await docRef.update({ devices: devices });
                    } else {
                        auth.signOut();
                        return;
                    }
                } else {
                    devices.push(localDeviceId);
                    await docRef.update({ devices: devices });
                }
            }

            // 🟢 التعديل الأول: إظهار الواجهة المستقبلية وحقن البيانات فيها 🟢
            const futuristicProfile = document.querySelector('.f-profile-wrapper');
            const guestNav = document.getElementById('guestNavButtons'); // أزرار (تسجيل / إنشاء حساب)

            if (futuristicProfile) futuristicProfile.style.display = 'block';
            if (guestNav) guestNav.style.display = 'none';

            if (document.getElementById('userNameDisplay')) {
                document.getElementById('userNameDisplay').innerText = data.name || "مستخدم";
            }
            if (document.getElementById('userEmailDisplay')) {
                document.getElementById('userEmailDisplay').innerText = user.email;
            }
            // ---------------------------------------------------------

            if (user.email === 'ayadmsd67@gmail.com') {
                document.getElementById('adminPanelBtn').style.display = 'inline-flex'; // تم التحديث ليتناسب مع الزر الجديد
            } else {
                document.getElementById('adminPanelBtn').style.display = 'none';
            }

            if (data.history) loadHistoryUI(data.history);

            // تحديث الصلاحية محلياً من السحابة
            if (data.vipExpiry) localStorage.setItem('elalfey_vip_expiry', data.vipExpiry);

            // === 4. الاستماع الحي للتغيرات (Live Snapshot) ===
            if (sessionListener) sessionListener();
            sessionListener = docRef.onSnapshot((snap) => {
                if (snap.exists) {
                    let liveData = snap.data();

                    if (liveData.deleted) {
                        showToast('🗑️ تم إغلاق وحذف حسابك من قبل الإدارة!', 'error');
                        handleLogoutCloud();
                        return;
                    }
                    if (liveData.banned) {
                        showToast('🚫 تم حظر حسابك من النظام بواسطة الإدارة!', 'error');
                        handleLogoutCloud();
                        return;
                    }

                    // المزامنة الأمنية لمنع التلاعب عبر المتصفح
                    let localVipExpiry = localStorage.getItem('elalfey_vip_expiry');
                    if (liveData.vipExpiry === 'expired') {
                        if (localVipExpiry) {
                            localStorage.removeItem('elalfey_vip_expiry');
                            showToast('⚠️ تم إنهاء اشتراك VIP الخاص بك من قبل الإدارة!', 'error');
                        }
                    } else if (liveData.vipExpiry) {
                        if (localVipExpiry !== String(liveData.vipExpiry)) {
                            localStorage.setItem('elalfey_vip_expiry', liveData.vipExpiry);
                        }
                    } else if (!liveData.vipExpiry && localVipExpiry) {
                        localStorage.removeItem('elalfey_vip_expiry');
                    }

                    // ربط تاريخ الانتهاء بالبطاقة الذكية الجديدة
                    const expireEl = document.getElementById('vipEndDateDisplay');
                    if (expireEl) {
                        if (liveData.vipExpiry === 'lifetime') {
                            expireEl.innerText = "نسخة مدى الحياة";
                            expireEl.style.color = "#10b981";
                        } else if (liveData.vipExpiry && liveData.vipExpiry !== 'expired') {
                            let dateObj = new Date(liveData.vipExpiry);
                            expireEl.innerText = dateObj.toLocaleDateString('ar-EG');
                            expireEl.style.color = "#0f172a";
                        } else {
                            expireEl.innerText = "منتهي";
                            expireEl.style.color = "#ef4444";
                        }
                    }

                    // ربط الأجهزة النشطة بالبطاقة الذكية الجديدة
                    let liveDevices = liveData.devices || [];
                    const countEl = document.getElementById('activeDevicesDisplay');
                    if (countEl) countEl.innerText = liveDevices.length + " / 3";

                    if (!liveDevices.includes(localDeviceId)) {
                        showToast('⚠️ تم تسجيل خروجك إجبارياً لتسجيل الدخول من جهاز آخر!', 'error');
                        handleLogoutCloud();
                    }
                }
            });
        }
    } else {
        // === 5. حالة تسجيل الخروج ===
        if (sessionListener) {
            sessionListener();
            sessionListener = null;
        }

        document.getElementById('adminPanelBtn').style.display = 'none';

        // 🔴 التعديل الثاني: إخفاء الواجهة المستقبلية وإظهار أزرار الضيوف 🔴
        const futuristicProfile = document.querySelector('.f-profile-wrapper');
        const guestNav = document.getElementById('guestNavButtons');

        if (futuristicProfile) futuristicProfile.style.display = 'none';
        if (guestNav) guestNav.style.display = 'flex';
        // ---------------------------------------------------------

        // مسح صلاحية الـ VIP من المتصفح عند الخروج
        localStorage.removeItem('elalfey_vip_expiry');
    }
});

// ==================================================
// التحكم في نوافذ تسجيل الدخول وإنشاء الحساب (للتصميم المبهر الجديد)
// ==================================================
function openLoginModal() {
    document.getElementById('authModal').style.display = 'flex';
    const container = document.getElementById('authMainContainer');
    if (container) container.classList.remove('active'); // إزالة الحركة للعودة لتسجيل الدخول
}

function openSignupModal() {
    document.getElementById('authModal').style.display = 'flex';
    const container = document.getElementById('authMainContainer');
    if (container) container.classList.add('active'); // تفعيل الحركة لإظهار إنشاء الحساب
}

// دالة إظهار وإخفاء الباسورد المخصصة لأيقونات التصميم الجديد
function toggleAuthPassword(inputId, iconElement) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        iconElement.classList.replace('bxs-hide', 'bxs-show');
        iconElement.style.color = '#ff007a';
    } else {
        input.type = 'password';
        iconElement.classList.replace('bxs-show', 'bxs-hide');
        iconElement.style.color = '#fff';
    }
}

// دالة استعادة كلمة المرور
async function handleResetPassword() {
    const email = document.getElementById('loginEmailInput').value.trim();
    if (!email) {
        return showToast('يرجى كتابة بريدك الإلكتروني في خانة الإيميل أولاً، ثم اضغط على هل نسيت كلمة المرور', 'error');
    }

    try {
        showToast('جاري إرسال رابط الاستعادة...', 'info');
        await auth.sendPasswordResetEmail(email);
        showToast('✅ تم إرسال رابط تغيير كلمة المرور إلى إيميلك بنجاح! راجع صندوق الوارد أو الـ Spam.', 'success');
    } catch (e) {
        showToast('❌ حدث خطأ، يرجى التأكد من أن البريد الإلكتروني مكتوب بشكل صحيح ومسجل لدينا.', 'error');
    }
}

// ==================================================
// دوال المصادقة السحابية المحدثة
// ==================================================
async function handleLoginCloud() {
    const email = document.getElementById('loginEmailInput').value.trim();
    const pass = document.getElementById('loginPasswordInput').value.trim();

    if (!email || !pass) return showToast('يرجى ملء الحقول المطلوبة', 'error');

    try {
        showToast('جاري تسجيل الدخول...', 'info');
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const cred = await auth.signInWithEmailAndPassword(email, pass);

        if (!cred.user.emailVerified) {
            await auth.signOut();
            return showToast('⚠️ حسابك غير مفعل! يرجى مراجعة بريدك الإلكتروني (Inbox أو Spam) والضغط على رابط التفعيل أولاً.', 'error');
        }

        showToast('تم تسجيل الدخول بنجاح!', 'success');
        document.getElementById('authModal').style.display = 'none';
        document.getElementById('loginPasswordInput').value = '';
    } catch (e) {
        showToast('بيانات الدخول غير صحيحة أو الحساب غير موجود', 'error');
    }
}

async function handleSignupCloud() {
    const name = document.getElementById('signupNameInput').value.trim();
    const email = document.getElementById('signupEmailInput').value.trim();
    const pass = document.getElementById('signupPasswordInput').value.trim();
    const passConfirm = document.getElementById('signupConfirmPasswordInput').value.trim();

    if (!name || !email || !pass || !passConfirm) return showToast('يرجى ملء جميع البيانات', 'error');
    if (pass !== passConfirm) return showToast('❌ كلمتا المرور غير متطابقتين!', 'error');

    try {
        showToast('جاري التحقق من صلاحية الجهاز...', 'info');

        const deviceRegRef = db.collection('device_registry').doc(localDeviceId);
        const deviceDoc = await deviceRegRef.get();
        if (deviceDoc.exists) {
            return showToast('عذراً، لقد قمت بإنشاء حساب من هذا الجهاز مسبقاً! كل جهاز مسموح له بحساب واحد فقط.', 'error');
        }

        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        const cred = await auth.createUserWithEmailAndPassword(email, pass);

        try {
            await cred.user.sendEmailVerification();
            showToast('📩 تم إصدار أمر إرسال رسالة التفعيل بنجاح!', 'success');
        } catch (emailError) {
            showToast('⚠️ خطأ في إرسال رسالة التفعيل: ' + emailError.message, 'error');
        }

        let existingTrial = localStorage.getItem('elalfey_trial_start');

        await db.collection('users').doc(cred.user.uid).set({
            name: name, // تم إضافة الاسم لقاعدة البيانات
            email: email,
            devices: [localDeviceId],
            history: [],
            trialStart: existingTrial ? existingTrial : null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await deviceRegRef.set({
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await auth.signOut();

        setTimeout(() => {
            showToast('✅ تم إنشاء الحساب! يرجى الذهاب لبريدك الإلكتروني والضغط على رابط التفعيل لتتمكن من الدخول.', 'success');
        }, 2000);

        // تفريغ الحقول وإغلاق النافذة
        document.getElementById('signupPasswordInput').value = '';
        document.getElementById('signupConfirmPasswordInput').value = '';
        document.getElementById('authModal').style.display = 'none';

    } catch (e) {
        if (e.code === 'auth/email-already-in-use') {
            showToast('هذا البريد الإلكتروني مسجل لدينا بالفعل! يرجى تسجيل الدخول.', 'error');
        } else {
            showToast('خطأ: ' + e.message, 'error');
        }
    }
}
// ==================================================
// دالة تسجيل الدخول / إنشاء الحساب باستخدام جوجل
// ==================================================
async function handleGoogleSignIn() {
    const provider = new firebase.auth.GoogleAuthProvider();

    try {
        showToast('جاري الاتصال بحساب جوجل...', 'info');
        const result = await auth.signInWithPopup(provider);
        const user = result.user;

        // التحقق مما إذا كان المستخدم جديداً في قاعدة البيانات
        const docRef = db.collection('users').doc(user.uid);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            // إنشاء ملف للمستخدم الجديد
            let existingTrial = localStorage.getItem('elalfey_trial_start');
            await docRef.set({
                name: user.displayName || "مستخدم جوجل",
                email: user.email,
                devices: [localDeviceId],
                history: [],
                trialStart: existingTrial ? existingTrial : null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // تسجيل الجهاز لمنع تعدد الحسابات العشوائي
            const deviceRegRef = db.collection('device_registry').doc(localDeviceId);
            await deviceRegRef.set({
                email: user.email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        showToast('تم تسجيل الدخول بنجاح!', 'success');
        document.getElementById('authModal').style.display = 'none';

    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user') {
            showToast('تم إلغاء تسجيل الدخول', 'info');
        } else {
            showToast('حدث خطأ أثناء الدخول بجوجل: ' + error.message, 'error');
        }
    }
}
// ==================================================
// تفعيل زر Enter لتسجيل الدخول وإنشاء الحساب
// ==================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. تفعيل زر Enter في خانات تسجيل الدخول
    const loginInputs = ['loginEmailInput', 'loginPasswordInput'];
    loginInputs.forEach(id => {
        const inputElement = document.getElementById(id);
        if (inputElement) {
            inputElement.addEventListener('keypress', function (event) {
                if (event.key === 'Enter') {
                    event.preventDefault(); // منع السلوك الافتراضي للمتصفح
                    handleLoginCloud(); // تشغيل دالة تسجيل الدخول
                }
            });
        }
    });

    // 2. تفعيل زر Enter في خانات إنشاء الحساب
    const signupInputs = ['signupNameInput', 'signupEmailInput', 'signupPasswordInput', 'signupConfirmPasswordInput'];
    signupInputs.forEach(id => {
        const inputElement = document.getElementById(id);
        if (inputElement) {
            inputElement.addEventListener('keypress', function (event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSignupCloud(); // تشغيل دالة إنشاء الحساب
                }
            });
        }
    });
});
// 🛑 دالة الخروج المدمرة (تمحو كل شيء) - النسخة المصححة
async function handleLogoutCloud() {
    try {
        // 1. إيقاف المراقب السحابي فوراً قبل أي شيء لمنع ظهور رسالة "الخروج الإجباري" الخاطئة
        if (typeof sessionListener === 'function') {
            sessionListener();
            sessionListener = null;
        }

        const user = auth.currentUser;
        if (user) {
            // إزالة بصمة الجهاز من السحابة بهدوء
            const docRef = db.collection('users').doc(user.uid);
            await docRef.update({
                devices: firebase.firestore.FieldValue.arrayRemove(localDeviceId)
            });
        }

        // 2. مسح جميع الصلاحيات من المتصفح
        localStorage.removeItem('elalfey_vip_expiry');
        localStorage.removeItem('elalfey_q_input');
        localStorage.removeItem('elalfey_a_input');
        localStorage.removeItem('elalfey_general_text');

        // 3. تفريغ المحرر بالكامل
        if (document.getElementById('questionsInput')) document.getElementById('questionsInput').innerHTML = '';
        if (document.getElementById('answersInput')) document.getElementById('answersInput').innerHTML = '';
        if (document.getElementById('generalTextInput')) document.getElementById('generalTextInput').innerHTML = 'اكتب محتوى المستند الخاص بك هنا...';

        // تصفير بنك الأسئلة
        questionsDatabase = [];

        // 4. تسجيل الخروج النهائي من فايربيز
        await auth.signOut();

        // إغلاق أي قوائم مفتوحة
        if (document.getElementById('profileDropdownMenu')) {
            document.getElementById('profileDropdownMenu').style.display = 'none';
        }

        showToast('تم تسجيل الخروج ومحو بياناتك من الجهاز بنجاح', 'info');
    } catch (error) {
        console.error("Logout Error:", error);
        showToast('حدث خطأ أثناء الخروج: ' + error.message, 'error');
    }
}

// 🛑 دالة حذف الحساب نهائياً (مع نظام حرق الجهاز)
async function deleteUserAccount() {
    const user = auth.currentUser;
    if (!user) return;

    // رسالة تنبيه صارمة تتناسب مع النظام الجديد
    const confirmation = confirm("⚠️ تحذير نهائي: هل أنت متأكد من رغبتك في حذف حسابك؟\nسيتم مسح بياناتك نهائياً، ولن تتمكن من إنشاء حساب جديد من هذا الجهاز للأبد!");

    if (confirmation) {
        try {
            showToast('جاري مسح بياناتك وإغلاق الحساب...', 'info');

            // 1. مسح بيانات المستخدم من قاعدة البيانات (users)
            await db.collection('users').doc(user.uid).delete();

            // 💡 التعديل الأمني: تم إزالة أمر حذف (device_registry) 
            // لكي تظل بصمة الجهاز مسجلة في النظام ويُمنع من التسجيل مجدداً.

            // 2. حذف الحساب من نظام المصادقة (Auth) ليصبح الإيميل حراً
            await user.delete();

            // 3. محو آثار المستخدم من المتصفح بالكامل
            handleLogoutCloud();

            showToast('✅ تم حذف الحساب بنجاح. هذا الجهاز محظور الآن من التسجيل مجدداً.', 'success');
        } catch (error) {
            if (error.code === 'auth/requires-recent-login') {
                showToast('لدواعي أمنية، يرجى تسجيل الخروج ثم الدخول مرة أخرى قبل محاولة الحذف.', 'error');
            } else {
                showToast('❌ حدث خطأ أثناء حذف الحساب: ' + error.message, 'error');
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

        if (hist.length > 3) hist.pop();
        await docRef.update({ history: hist });
        loadHistoryUI(hist);
    }, 1500);
}

function loadHistoryUI(hist) {
    const container = document.getElementById('cloudDocsList');
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
    // 1. التحقق من تسجيل الدخول أولاً (منع الزوار غير المسجلين)
    if (!auth.currentUser) {
        showToast('⚠️ يرجى إنشاء حساب مجاني أو تسجيل الدخول أولاً!', 'error');

        // --- التعديل هنا: استخدام دالة فتح نافذة تسجيل الدخول الجديدة ---
        if (typeof openLoginModal === 'function') {
            openLoginModal();
        } else {
            // كود احتياطي
            const authModal = document.getElementById('authModal');
            if (authModal) {
                authModal.style.display = 'flex';
                document.getElementById('loginSection').style.display = 'block';
                document.getElementById('signupSection').style.display = 'none';
            }
        }
        return;
    }

    // 2. التحقق من صلاحية الاشتراك أو الفترة التجريبية في السحابة
    let expiry = localStorage.getItem('elalfey_vip_expiry');
    let isVIP = false;

    if (expiry === 'lifetime') {
        isVIP = true;
    } else if (expiry && parseInt(expiry) > Date.now()) {
        isVIP = true;
    }

    // 3. السماح أو الرفض
    if (isVIP) {
        proceedWithAction(actionType, param);
        return;
    } else {
        pendingAction = actionType;
        pendingActionParam = param;
        document.getElementById('vipModalText').innerText = "لقد انتهت فترة الـ 7 أيام التجريبية المجانية لحسابك. يرجى إدخال كود التفعيل للاستمرار.";
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
    let prefix = days === 7 ? 'W' : days === 30 ? 'M' : days === 365 ? 'Y' : 'L';
    let generated = [];
    document.getElementById('generatedCodesOutput').value = 'جاري توليد الأكواد وحفظها سحابياً...';

    try {
        const batch = db.batch();
        for (let i = 0; i < count; i++) {
            let p1 = Math.random().toString(36).substring(2, 6).toUpperCase().padStart(4, '0');
            let p2 = Math.random().toString(36).substring(2, 6).toUpperCase().padStart(4, '0');
            let p3 = Math.random().toString(36).substring(2, 6).toUpperCase().padStart(4, '0');

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

// 🛑 نظام الإدارة الفائق (Super Admin Actions)
window.executeAdminAction = async function (action) {
    const targetEmail = document.getElementById('adminTargetEmail').value.trim();
    if (!targetEmail) return showToast('يرجى إدخال بريد المستخدم أولاً!', 'error');

    try {
        showToast('جاري تنفيذ الإجراء سحابياً...', 'info');
        const usersRef = db.collection('users');
        const qSnap = await usersRef.where('email', '==', targetEmail).get();

        if (qSnap.empty) return showToast('هذا البريد غير موجود في قاعدة بيانات المستخدمين!', 'error');

        const userDoc = qSnap.docs[0];
        const userData = userDoc.data();

        if (action === 'cancel_vip') {
            await userDoc.ref.update({ vipExpiry: 'expired' });
            showToast('تم إلغاء اشتراك الـ VIP للمستخدم بنجاح', 'success');
        } else if (action === 'ban_user') {
            await userDoc.ref.update({ banned: true, vipExpiry: 'expired' });
            showToast('تم حظر المستخدم وطرده من النظام نهائياً', 'success');
        } else if (action === 'delete_user') {
            const confirmDelete = confirm('⚠️ تحذير: هل أنت متأكد من مسح حساب هذا المستخدم نهائياً ليتمكن من التسجيل به كحساب جديد؟');
            if (!confirmDelete) return;

            // فك ارتباط الأجهزة المرتبطة بهذا الحساب
            if (userData.devices && Array.isArray(userData.devices)) {
                for (let dId of userData.devices) {
                    await db.collection('device_registry').doc(dId).delete();
                }
            }

            // مسح الحساب
            await userDoc.ref.delete();
            showToast('تم مسح الحساب وتحرير أجهزته بنجاح. (يمكنه التسجيل من جديد الآن)', 'success');
        }
    } catch (e) {
        showToast('حدث خطأ أثناء التنفيذ: ' + e.message, 'error');
    }
};

function proceedWithAction(actionType, param) {
    if (actionType === 'export') executeExport(param);
    else if (actionType === 'multi') generateMultiModels();
    else if (actionType === 'multi_bubble_dummy') generateMultiEmptyBubbles();
    else if (actionType === 'ai') openAiModal();
    else if (actionType === 'lesson_ai') generateFromLessonPrompt(); // 💡 تم إضافة هذا السطر
}

window.addEventListener('DOMContentLoaded', async () => {

    // حقن أدوات الإدارة بالتصميم الاحترافي
    const adminToolsContainer = document.getElementById('adminDynamicToolsContainer');
    if (adminToolsContainer) {
        adminToolsContainer.innerHTML = `
            <div class="admin-section highlight-section">
                <h4 class="section-title"><i data-lucide="users"></i> إدارة المستخدمين وصلاحياتهم</h4>
                <div class="form-group" style="margin-bottom: 20px;">
                    <label style="font-size: 13px; font-weight: bold; color: #64748b; margin-bottom: 8px; display: block;">البريد الإلكتروني للمستخدم المستهدف</label>
                    <input type="email" id="adminTargetEmail" class="premium-input" placeholder="أدخل الإيميل هنا...">
                </div>
                <div class="admin-actions-grid">
                    <button onclick="executeAdminAction('cancel_vip')" class="btn-admin-action btn-warning">
                        <i data-lucide="user-minus"></i> <span>إلغاء الـ VIP</span>
                    </button>
                    <button onclick="executeAdminAction('ban_user')" class="btn-admin-action btn-dark">
                        <i data-lucide="ban"></i> <span>حظر الحساب</span>
                    </button>
                    <button onclick="executeAdminAction('delete_user')" class="btn-admin-action btn-danger">
                        <i data-lucide="trash-2"></i> <span>تفريغ وحذف</span>
                    </button>
                </div>
            </div>
        `;
        // تفعيل أيقونات Lucide
        if (window.lucide) { lucide.createIcons(); }
    }

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

    questionsHistory = [{
        q: qInp ? qInp.innerHTML : '',
        a: aInp ? aInp.innerHTML : ''
    }];
    questionsHistoryIndex = 0;

    textHistory = [{
        g: gText ? gText.innerHTML : ''
    }];
    textHistoryIndex = 0;
});
function recordHistory() {
    clearTimeout(historyTimeout);
    historyTimeout = setTimeout(() => {
        if (currentMode === 'questions') {
            const qEl = document.getElementById('questionsInput');
            const aEl = document.getElementById('answersInput');
            const qVal = qEl ? qEl.innerHTML : '';
            const aVal = aEl ? aEl.innerHTML : '';

            if (questionsHistoryIndex >= 0 && questionsHistory[questionsHistoryIndex] &&
                questionsHistory[questionsHistoryIndex].q === qVal &&
                questionsHistory[questionsHistoryIndex].a === aVal) return;

            if (questionsHistoryIndex < questionsHistory.length - 1) {
                questionsHistory = questionsHistory.slice(0, questionsHistoryIndex + 1);
            }
            questionsHistory.push({ q: qVal, a: aVal });
            if (questionsHistory.length > 50) questionsHistory.shift();
            else questionsHistoryIndex++;

        } else if (currentMode === 'text') {
            const gEl = document.getElementById('generalTextInput');
            const gVal = gEl ? gEl.innerHTML : '';

            if (textHistoryIndex >= 0 && textHistory[textHistoryIndex] &&
                textHistory[textHistoryIndex].g === gVal) return;

            if (textHistoryIndex < textHistory.length - 1) {
                textHistory = textHistory.slice(0, textHistoryIndex + 1);
            }
            textHistory.push({ g: gVal });
            if (textHistory.length > 50) textHistory.shift();
            else textHistoryIndex++;
        }
    }, 300);
}

function execUndo() {
    if (currentMode === 'questions') {
        if (questionsHistoryIndex > 0) {
            questionsHistoryIndex--;
            const qEl = document.getElementById('questionsInput');
            const aEl = document.getElementById('answersInput');
            if (qEl) qEl.innerHTML = questionsHistory[questionsHistoryIndex].q;
            if (aEl) aEl.innerHTML = questionsHistory[questionsHistoryIndex].a;
            syncTextToDatabase();
            autoSaveData();
            showToast('تم التراجع (بنك الأسئلة)', 'info');
        } else { showToast('لا توجد خطوات سابقة', 'error'); }
    } else if (currentMode === 'text') {
        if (textHistoryIndex > 0) {
            textHistoryIndex--;
            const gEl = document.getElementById('generalTextInput');
            if (gEl) gEl.innerHTML = textHistory[textHistoryIndex].g;
            autoSaveData();
            showToast('تم التراجع (محرر النصوص)', 'info');
        } else { showToast('لا توجد خطوات سابقة', 'error'); }
    }
}

function execRedo() {
    if (currentMode === 'questions') {
        if (questionsHistoryIndex < questionsHistory.length - 1) {
            questionsHistoryIndex++;
            const qEl = document.getElementById('questionsInput');
            const aEl = document.getElementById('answersInput');
            if (qEl) qEl.innerHTML = questionsHistory[questionsHistoryIndex].q;
            if (aEl) aEl.innerHTML = questionsHistory[questionsHistoryIndex].a;
            syncTextToDatabase();
            autoSaveData();
            showToast('تم الإعادة (بنك الأسئلة)', 'info');
        } else { showToast('أنت في الخطوة الأحدث', 'error'); }
    } else if (currentMode === 'text') {
        if (textHistoryIndex < textHistory.length - 1) {
            textHistoryIndex++;
            const gEl = document.getElementById('generalTextInput');
            if (gEl) gEl.innerHTML = textHistory[textHistoryIndex].g;
            autoSaveData();
            showToast('تم الإعادة (محرر النصوص)', 'info');
        } else { showToast('أنت في الخطوة الأحدث', 'error'); }
    }
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
    t.style.zIndex = '9999999';
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
    else {
        let fallbackBtn = document.querySelector(`button[onclick*="switchTab('${mode}'"]`);
        if(fallbackBtn) fallbackBtn.classList.add('active');
    }

    let tabEl = document.getElementById(mode + 'Tab');
    if(tabEl) tabEl.classList.add('active');

    let qBtns = document.getElementById('questionActionButtons');
    if(qBtns) qBtns.style.display = (mode === 'questions') ? 'flex' : 'none';
    
    let tBtns = document.getElementById('textActionButtons');
    if(tBtns) tBtns.style.display = (mode === 'text') ? 'flex' : 'none';

    // إغلاق جميع اللوحات العائمة عند التبديل لضمان نظافة الشاشة
    ['examSettingsPanel', 'questionSettingsPanel', 'bubbleSettingsPanel', 'bubbleHeaderSettingsPanel', 'multiModelSettingsPanel', 'generalSettingsPanel', 'compactBubblePanel'].forEach(id => {
        let el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // 💡 التعديل السحري: إخفاء القائمة الجانبية بالقوة الجبرية للتغلب على الـ CSS
    const settingsDock = document.querySelector('.settings-dock');
    if (settingsDock) {
        if (mode === 'classrooms') {
            settingsDock.style.setProperty('display', 'none', 'important'); // إخفاء إجباري
        } else {
            settingsDock.style.removeProperty('display'); // إرجاعها للعمل الطبيعي
        }
    }

    // التحكم الذكي في العناصر داخل القائمة الجانبية (لقسم محرر النصوص)
    const dockItems = document.querySelectorAll('.settings-dock > *');
    dockItems.forEach(item => {
        let onclickAttr = item.getAttribute('onclick') || '';

        // استثناء زر "التنسيق العام" وزر "المسودة الجديدة" ليبقيا ظاهران دائماً
        if (onclickAttr.includes('generalSettingsPanel') || onclickAttr.includes('confirmModal')) {
            return;
        }

        if (mode === 'text') {
            item.classList.add('hide-in-text-mode');
        } else {
            item.classList.remove('hide-in-text-mode');
        }
    });
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
    if (currentMode === 'questions') {
        // مسح بنك الأسئلة فقط
        document.getElementById('questionsInput').innerHTML = '';
        document.getElementById('answersInput').innerHTML = '';
        questionsDatabase = [];
        questionsHistory = [{ q: '', a: '' }];
        questionsHistoryIndex = 0;
        try {
            await localforage.removeItem('elalfey_q_input');
            await localforage.removeItem('elalfey_a_input');
        } catch (e) { }
        showToast('تم تهيئة مسودة جديدة لبنك الأسئلة فقط', 'success');
    } else if (currentMode === 'text') {
        // مسح محرر النصوص فقط
        document.getElementById('generalTextInput').innerHTML = 'اكتب محتوى المستند الخاص بك هنا...';
        textHistory = [{ g: 'اكتب محتوى المستند الخاص بك هنا...' }];
        textHistoryIndex = 0;
        try {
            await localforage.removeItem('elalfey_general_text');
        } catch (e) { }
        showToast('تم تهيئة مسودة جديدة لمحرر النصوص فقط', 'success');
    }

    document.getElementById('confirmModal').style.display = 'none';
}

function syncTextToDatabase() {
    const qText = getEditorText('questionsInput');
    const aText = getEditorText('answersInput');
    if (!qText.trim()) { questionsDatabase = []; return; }

    const ansMap = { mcq: {}, tf_inline: {}, essay: {} };
    if (aText.trim()) {
        const aLines = aText.split('\n');
        let currentAnsSection = 'mcq';
        let currentAnsNum = null;

        aLines.forEach(line => {
            let cleanLine = line.replace(/<[^>]+>/g, '').trim();
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
    let pendingMedia = ''; // 💡 ذاكرة مؤقتة لحمل الصورة للسؤال التالي

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        let qMatch = line.match(/^\s*\**(\d+)\s*[\.\-\)]\s*\**([\s\S]*)/);
        if (qMatch) {
            hasSeenFirstQuestion = true;
            if (curQ) { parsed.push(curQ); }
            curQ = {
                num: qMatch[1],
                text: (pendingMedia + '\n' + qMatch[2].trim()).trim(), // 💡 دمج الصورة مع نص السؤال الجديد
                options: [],
                type: 'essay',
                ans: "",
                tags: qMatch[2].match(/#[\w\u0600-\u06FF]+/g) || []
            };
            curQ.text = curQ.text.replace(/#[\w\u0600-\u06FF]+/g, '').trim();
            isOptMode = false;
            isAnsMode = false;
            pendingMedia = ''; // 💡 تفريغ الذاكرة بعد وضع الصورة
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
                if (line.includes('<img')) {
                    pendingMedia += '\n' + line; // 💡 تخزين الصورة للسؤال التالي
                    continue; 
                }
                
                parsed.push(curQ);
                curQ = null;
                isOptMode = false;
                parsed.push({ type: 'heading', text: line });
            } else {
                curQ.text += '\n' + line;
            }
        } else {
            if (hasSeenFirstQuestion) {
                if (line.includes('<img')) {
                    pendingMedia += '\n' + line; // 💡 التقاط الصورة بين الأسئلة
                } else {
                    parsed.push({ type: 'heading', text: line });
                }
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

function smartFormatAndClean(skipSync = false) {
    if (!skipSync) {
        syncTextToDatabase();
    }

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

    if (!skipSync) {
        showToast('تم التنسيق الذكي وتوقع الإجابات بنجاح');
    }
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

// ========================================================
// 🧠 محرك الذكاء الاصطناعي مع الذاكرة السحابية الدائمة
// ========================================================
let aiChatsVault = []; // الخزنة التي ستحتوي على كل محادثاتك
let currentAiChatId = null; // رقم المحادثة المفتوحة حالياً
let aiChatContext = ""; // السياق المتراكم للمحادثة الحالية

// 1. دالة فتح النافذة وجلب المحادثات من السحابة
async function openAiModal() {
    document.getElementById('aiModal').style.display = 'flex';
    const user = auth.currentUser;
    
    if (user && aiChatsVault.length === 0) {
        try {
            const docSnap = await db.collection('users').doc(user.uid).get();
            if (docSnap.exists && docSnap.data().aiChats) {
                aiChatsVault = docSnap.data().aiChats;
            }
        } catch(e) { console.error("Cloud Error:", e); }
        renderAiHistoryList();
    }
    
    // إذا كانت الخزنة فارغة، ابدأ محادثة جديدة تلقائياً
    if (aiChatsVault.length === 0 && !currentAiChatId) {
        startNewAIChat();
    } else if (aiChatsVault.length > 0 && !currentAiChatId) {
        // افتح آخر محادثة كنت تتكلم فيها
        loadSpecificAiChat(aiChatsVault[0].id);
    }
}

// 2. دالة حفظ المحادثات في حسابك السحابي
async function syncAiChatsToCloud() {
    const user = auth.currentUser;
    if (user) {
        try {
            // نحتفظ بآخر 30 محادثة لكي لا يمتلئ الحساب
            if (aiChatsVault.length > 30) aiChatsVault = aiChatsVault.slice(0, 30);
            await db.collection('users').doc(user.uid).set({ aiChats: aiChatsVault }, { merge: true });
        } catch(e) { console.error('AI Sync failed', e); }
    }
}

// 3. عرض قائمة المحادثات في الشريط الجانبي
function renderAiHistoryList() {
    const listDiv = document.getElementById('aiHistoryList');
    if (aiChatsVault.length === 0) {
        listDiv.innerHTML = '<div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 20px;">لا توجد محادثات سابقة.</div>';
        return;
    }
    let html = '';
    aiChatsVault.forEach(chat => {
        let activeClass = (chat.id === currentAiChatId) ? 'active' : '';
        html += `<div class="f-history-item ${activeClass}" onclick="loadSpecificAiChat('${chat.id}')">💬 ${chat.title}</div>`;
    });
    listDiv.innerHTML = html;
}

// 4. دالة بدء محادثة جديدة كلياً
function startNewAIChat() {
    currentAiChatId = null;
    aiChatContext = "";
    document.getElementById('currentChatTitle').innerText = 'محادثة جديدة';
    document.getElementById('aiChatOutput').innerHTML = `
        <div class="chat-message ai-message">
            <div class="msg-avatar"><i class="bx bx-bot"></i></div>
            <div class="msg-bubble">مرحباً يا هندسة! تم مسح الذاكرة السابقة وبدء محادثة جديدة. كيف يمكنني مساعدتك الآن؟</div>
        </div>
    `;
    document.getElementById('aiTextInput').value = '';
    document.getElementById('aiFileInput').value = '';
    document.getElementById('aiFileName').innerText = 'إرفاق ملف للتحليل';
    renderAiHistoryList();
}

// 5. استدعاء محادثة قديمة من الأرشيف
function loadSpecificAiChat(id) {
    const chat = aiChatsVault.find(c => c.id === id);
    if (!chat) return;
    
    currentAiChatId = chat.id;
    aiChatContext = chat.context;
    document.getElementById('currentChatTitle').innerText = chat.title;
    document.getElementById('aiChatOutput').innerHTML = chat.html;
    
    renderAiHistoryList(); // لتحديث اللون النشط
    const outputDiv = document.getElementById('aiChatOutput');
    outputDiv.scrollTop = outputDiv.scrollHeight; // النزول لآخر رسالة
}

// 6. المحرك الأساسي للإرسال والاستقبال
async function generateAIQuestions(mode = 'quiz') {
    const txtInput = document.getElementById('aiTextInput');
    const txt = txtInput.value.trim();
    const filesInput = document.getElementById('aiFileInput');
    const files = filesInput.files;
    const outputDiv = document.getElementById('aiChatOutput');

    if (!txt && files.length === 0) return showToast('يرجى كتابة رسالتك أو إرفاق ملفات', 'error');

    // رسم رسالة المستخدم
    let userContentHTML = txt.replace(/\n/g, '<br>');
    if (files.length > 0) userContentHTML += `<br><small style="color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 5px;">📎 مرفق ${files.length} ملفات</small>`;
    
    outputDiv.innerHTML += `
        <div class="chat-message user-message">
            <div class="msg-avatar"><i class="bx bx-user"></i></div>
            <div class="msg-bubble">${userContentHTML}</div>
        </div>
    `;
    
    const loadingId = 'loading-' + Date.now();
    outputDiv.innerHTML += `
        <div id="${loadingId}" class="chat-message ai-message">
            <div class="msg-avatar"><i class="bx bx-bot"></i></div>
            <div class="msg-bubble"><div class="loading-dots"><span></span><span></span><span></span></div></div>
        </div>
    `;
    outputDiv.scrollTop = outputDiv.scrollHeight;

    txtInput.value = '';
    filesInput.value = '';
    document.getElementById('aiFileName').innerText = 'إرفاق ملف للتحليل';

    let systemInstruction = mode === 'quiz' ? 
        "أنت مساعد تعليمي. استخرج أسئلة من النص. المخرج النهائي يجب أن يكون كود JSON فقط (مصفوفة كائنات) بدون أي نصوص أخرى. هيكل الكائن المطلوب:\n[\n  { \"type\": \"mcq\", \"text\": \"نص السؤال؟\", \"options\": [{\"l\":\"أ\", \"t\":\"خيار 1\"}, {\"l\":\"ب\", \"t\":\"خيار 2\"}], \"ans\": \"أ\" }\n]" : 
        mode === 'classify' ? 
        "أنت خبير تربوي وموجه امتحانات. قم بتحليل وصياغة وتوزيع درجات بأسلوب احترافي. أجب باللغة العربية، ونسق إجابتك باستخدام HTML (مثل <strong>، <br>، و <ul>)." : 
        "أنت مساعد ذكي موسوعي ومبرمج. أجب باللغة العربية مع استخدام وسوم HTML البسيطة مثل <strong> و <br> لتنسيق الإجابة.";
    
    let promptText = `${systemInstruction}\n\nالسياق السابق للمحادثة لكي تتذكره:\n${aiChatContext}\n\nطلب المستخدم الحالي:\n${txt}`;

    try {
        let parts = [{ text: promptText }];

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
                                c.width = img.width * scale; c.height = img.height * scale;
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
                        const rd = new FileReader(); rd.onload = () => r(rd.result.split(',')[1]); rd.readAsDataURL(f);
                    });
                    parts.push({ inlineData: { data: b, mimeType: 'application/pdf' } });
                }
                else if (f.type === 'text/plain') {
                    const tx = await new Promise(r => {
                        const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsText(f);
                    });
                    parts[0].text += `\n\n--- محتوى ملف (${f.name}) ---\n${tx}`;
                }
            }
        }

        const res = await fetch('/api/generate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parts: parts })
        });

        if (!res.ok) throw new Error((await res.json()).error || 'حدث خطأ');
        const data = await res.json();
        if (!data.candidates || data.candidates.length === 0) throw new Error("لا توجد استجابة.");

        let aiResponse = data.candidates[0].content.parts[0].text.trim();

        // تحديث الذاكرة المتراكمة
        aiChatContext += `\nالمستخدم: ${txt}\nالذكاء الاصطناعي: ${aiResponse}\n`;

        let finalBubbleHtml = '';
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
            finalBubbleHtml = `<span style="color: #10b981;">✅ تم توليد ${gQs.length} سؤال وإدراجهم في المحرر! يمكنك تعديلهم هناك أو سؤالي هنا عن أي تعديل.</span>`;
        } else {
            finalBubbleHtml = aiResponse
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
        }

        document.getElementById(loadingId).remove();
        outputDiv.innerHTML += `
            <div class="chat-message ai-message">
                <div class="msg-avatar"><i class="bx bx-bot"></i></div>
                <div class="msg-bubble">${finalBubbleHtml}</div>
            </div>
        `;
        outputDiv.scrollTop = outputDiv.scrollHeight;

        // 💡 حفظ المحادثة بأكملها في الخزنة السحابية 💡
        const currentHtml = outputDiv.innerHTML;
        if (!currentAiChatId) {
            // محادثة جديدة، إنشاء ID وعنوان
            currentAiChatId = 'chat_' + Date.now();
            let chatTitle = txt.substring(0, 25) + (txt.length > 25 ? '...' : '');
            if (!txt && files.length > 0) chatTitle = 'تحليل ملفات 📎';
            
            aiChatsVault.unshift({ id: currentAiChatId, title: chatTitle, context: aiChatContext, html: currentHtml, date: Date.now() });
            document.getElementById('currentChatTitle').innerText = chatTitle;
        } else {
            // تحديث محادثة موجودة ورفعها لأول القائمة
            let existingChat = aiChatsVault.find(c => c.id === currentAiChatId);
            if (existingChat) {
                existingChat.context = aiChatContext;
                existingChat.html = currentHtml;
                existingChat.date = Date.now();
                aiChatsVault = aiChatsVault.filter(c => c.id !== currentAiChatId);
                aiChatsVault.unshift(existingChat);
            }
        }
        
        renderAiHistoryList();
        syncAiChatsToCloud(); // رفع الخزنة لحسابك في فايربيز

    } catch (e) {
        document.getElementById(loadingId).remove();
        outputDiv.innerHTML += `
            <div class="chat-message ai-message">
                <div class="msg-avatar" style="background: #ef4444;"><i class="bx bx-error"></i></div>
                <div class="msg-bubble" style="color: #ef4444;">❌ حدث خطأ تقني: ${e.message}</div>
            </div>
        `;
        outputDiv.scrollTop = outputDiv.scrollHeight;
    }
}

// ========================================================
// 🖼️ منظومة رفع الصور السحابية فائقة السرعة (ImgBB)
// ========================================================

const IMGBB_API_KEY = 'db4be77f5ac0fe30203605b676a20fc5';

// 1. دالة الرفع للسيرفر الخارجي
async function uploadImageToImgBB(base64Data) {
    const formData = new FormData();
    // نأخذ بيانات الصورة ونزيل منها البادئة لكي يقبلها سيرفر ImgBB
    const base64String = base64Data.split(',')[1];
    formData.append('image', base64String);

    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.success) {
            return data.data.url; // السيرفر يرد علينا برابط مباشر قصير للصورة
        } else {
            throw new Error('فشل الرفع');
        }
    } catch (error) {
        console.error(error);
        return null;
    }
}

// 2. المحرك الأساسي لالتقاط وضغط الصورة ثم إرسالها
function handleImageInsertion(e, targetId = null) {
    if (!e.target.files[0]) return;
    
    // إظهار رسالة للمستخدم أثناء الرفع
    showToast('جاري رفع الصورة للسحابة... ⏳', 'info');
    
    const rd = new FileReader();
    rd.onload = ev => {
        const i = new Image();
        i.onload = async () => {
            // ضغط وتصغير أبعاد الصورة قليلاً قبل الرفع لتسريع الإنترنت
            const c = document.createElement('canvas');
            let scale = 1;
            if (i.width > 800) scale = 800 / i.width;
            c.width = i.width * scale;
            c.height = i.height * scale;
            c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
            
            const compressedBase64 = c.toDataURL('image/jpeg', 0.8);
            
            // 🚀 إرسال الصورة المضغوطة لسيرفر ImgBB بدلاً من حفظها في فايربيز
            const imageUrl = await uploadImageToImgBB(compressedBase64);
            
            if (imageUrl) {
                const imgHTML = `<br><img src="${imageUrl}" style="width:50%; max-width:100%; display:inline-block; margin:15px; border-radius:6px; cursor:pointer;" class="resizable-img">&nbsp;`;
                
                if (targetId) {
                    document.getElementById(targetId).focus();
                }
                document.execCommand('insertHTML', false, imgHTML);
                
                if (typeof syncTextToDatabase === 'function') syncTextToDatabase();
                if (typeof autoSaveData === 'function') autoSaveData();
                showToast('✅ تم إدراج الصورة بنجاح!', 'success');
            } else {
                showToast('❌ فشل رفع الصورة، تحقق من اتصالك بالإنترنت.', 'error');
            }
        };
        i.src = ev.target.result;
    };
    rd.readAsDataURL(e.target.files[0]);
    e.target.value = '';
}

// 3. توجيه الأزرار في الواجهة لتعمل على المنظومة الجديدة
function insertImageToQuestion(e) {
    handleImageInsertion(e, 'questionsInput');
}

function insertImage(e) {
    handleImageInsertion(e);
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

        // --- التعديل الأول: فصل النقاط عن السؤال في نسخة الطالب ---
        let studentQText = q.text.replace(/\n/g, '<br>');
        studentQText = studentQText.replace(/(?:<br\s*\/?>)?\s*([\.\-_]{4,})/g, '<div style="display: block; width: 100%; word-break: break-all; margin-top: 8px; line-height: 1.2;">$1</div>');

        hN += `<div class="${cC}" dir="${qDir}" style="direction: ${qDir}; text-align: ${qDir === 'rtl' ? 'right' : 'left'}; clear: both;"><div class="q-text" dir="${qDir}" style="text-align: ${qDir === 'rtl' ? 'right' : 'left'};">${qNumStr}. ${studentQText}</div>`;
        if (q.type === 'mcq') {
            hN += `<ul class="${lC}" dir="${qDir}" style="direction: ${qDir}; width: auto; overflow: hidden; margin-top: 5px;">`;
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
            if (aT.match(/[\.\-_]{4,}/)) {
                let replaced = false;
                aT = aT.replace(/(?:<br\s*\/?>)?\s*[\.\-_]{4,}/g, (match) => {
                    if (!replaced) {
                        replaced = true;
                        // --- التعديل الثاني: فصل الإجابة النموذجية في نسخة المعلم ---
                        return '<div style="display: block; width: 100%; margin-top: 8px;">' + ansHtml + '</div>';
                    }
                    return '';
                });
            } else {
                aT += `<div style="display: block; width: 100%; margin-top: 8px;"><strong>الإجابة:</strong> ${ansHtml}</div>`;
            }
        } else {
            // --- التعديل الثالث: فصل النقاط في نسخة المعلم إذا لم يكتب إجابة بعد ---
            aT = aT.replace(/(?:<br\s*\/?>)?\s*([\.\-_]{4,})/g, '<div style="display: block; width: 100%; word-break: break-all; margin-top: 8px; line-height: 1.2;">$1</div>');
        }

        hA += `<div class="${cC}" dir="${qDir}" style="direction: ${qDir}; text-align: ${qDir === 'rtl' ? 'right' : 'left'}; clear: both; ${qM !== 'text' ? `border-right-color:${pColor};` : ''}"><div class="q-text" dir="${qDir}" style="text-align: ${qDir === 'rtl' ? 'right' : 'left'};">${qNumStr}. ${aT}</div>`;

        if (q.type === 'mcq') {
            hA += `<ul class="${lC}" dir="${qDir}" style="direction: ${qDir}; width: auto; overflow: hidden; margin-top: 5px;">`;
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

    // إرجاع الكود الأصلي بدون مربعات سوداء لورقة الأسئلة
    hA = `<style>#wordPrintPreviewArea .ans-key-heading { display: none !important; }</style>` + hA;

    return { noAns: hN, withAns: hA };
}


// ========================================================
// 📄 دالة البناء الأساسية للصفحات (مُصححة لمنع التداخل)
// ========================================================
function generatePageHTML(contentHTML, bgCSS, isAnswers = false, modelBadge = '', isBubbleSheet = false) {
    let hdr = '';
    let std = '';
    let cols = '';

    let isForeign = (currentQuestionSystem === 'foreign');
    let dir = isForeign ? 'ltr' : 'rtl';
    let align = isForeign ? 'left' : 'right';

    // الترويسة الأساسية تظهر فقط في ورقة الأسئلة والإجابات، ولا تظهر في البابل شيت أبداً
    if (currentMode === 'questions' && !isBubbleSheet) {
        hdr = document.getElementById('enableHdr').value === 'yes' ?
            `<div class="exam-header-print" style="direction:${dir}; text-align:${align}; margin-bottom: 15px;">
                 <div class="${isForeign ? 'left' : 'right'}">${document.getElementById('hdrRight').value}</div>
                 <div class="center">${document.getElementById('hdrCenter').value}</div>
                 <div class="${isForeign ? 'right' : 'left'}">${document.getElementById('hdrLeft').value}</div>
               </div>` : '';

        // صندوق الطالب الأساسي لورقة الأسئلة فقط
        if (!isAnswers) {
            let stdText = isForeign ?
                `<div>Student Name: ....................................................</div><div>Seat No: .........................</div>` :
                `<div>اسم الطالب: ....................................................</div><div>رقم الجلوس: .........................</div>`;
            std = document.getElementById('enableStudentBox').value === 'yes' ? `<div class="student-info-print" style="direction:${dir};">${stdText}</div>` : '';
        }

        cols = document.getElementById('columnsLayout').value === '2' ? 'two-columns-layout' : '';
    }

    let topMargin = isBubbleSheet ? '2mm' : '10mm';
    let bottomMargin = isBubbleSheet ? '2mm' : '10mm';

    return `
    <div class="pdf-page" style="background:${bgCSS}; direction:${dir}; text-align:${align}; position: relative;">
        <table style="width: 100%; border-collapse: collapse; border: none; direction:${dir}; position: relative; z-index: 10;">
            <thead style="display: table-header-group;">
                <tr><td style="height: ${topMargin}; border: none; padding: 0;"></td></tr>
            </thead>
            <tbody>
                <tr><td style="border: none; padding: 0;">
                    ${hdr}${modelBadge}${std}
                    <div class="${cols}" style="direction:${dir}; text-align:${align};">${contentHTML}</div>
                </td></tr>
            </tbody>
            <tfoot style="display: table-footer-group;">
                <tr><td style="height: ${bottomMargin}; border: none; padding: 0;"></td></tr>
            </tfoot>
        </table>
    </div>`;
}

// ========================================================
// 📄 دالة البابل شيت (محاذاة ليزرية + ضمان الصفحة الواحدة + ترتيب الترويسات)
// ========================================================
function getBubbleSheetContent(qDb, emptyCount = 0, modelBadgeHtml = '', modelIndex = 0) {
    const sh = document.getElementById('bubbleShape').value;
    const pos = document.getElementById('bubbleTextPosition').value;
    const oC = parseInt(document.getElementById('bubbleOptionsCount').value);
    const lT = document.getElementById('bubbleLettersType').value;
    const sC = document.getElementById('bubbleStrokeColor').value;
    const userColumnsCount = parseInt(document.getElementById('bubbleColumns').value);

    const totalQsInExam = qDb.filter(q => q.type !== 'heading').length || 110;
    let safeBubbleSize = parseInt(document.getElementById('bubbleSize').value);

    // 💡 تكبير حجم الدوائر والخطوط للرؤية الواضحة
    if (totalQsInExam > 80) {
        safeBubbleSize = (pos === 'above') ? 19 : 22; // تم التكبير من 15 إلى 19
    } else if (totalQsInExam > 60) {
        safeBubbleSize = (pos === 'above') ? 23 : 26;
    }

    const userBubbleSize = safeBubbleSize + 'px';
    const fontSize = (safeBubbleSize * 0.55) + 'px'; // تكبير نسبة الخط داخل الدائرة ليكون أوضح
    const labelSize = '11px';

    const lA = { 'arabic': ['أ', 'ب', 'ج', 'د', 'هـ', 'و'], 'english': ['A', 'B', 'C', 'D', 'E', 'F'], 'numbers': ['1', '2', '3', '4', '5', '6'] }[lT];

    let isForeign = (currentQuestionSystem === 'foreign');
    let dir = isForeign ? 'ltr' : 'rtl';
    let align = isForeign ? 'left' : 'right';

    let f1 = isForeign ? 'Student Name: ...........' : document.getElementById('bHdrField1').value;
    let f2 = isForeign ? 'Subject: ...........' : document.getElementById('bHdrField2').value;
    let f3 = isForeign ? 'Class: .......' : document.getElementById('bHdrField3').value;
    let idTitle = isForeign ? 'Seat Number' : document.getElementById('bHdrIdTitle').value;

    let mcqTitle = isForeign ? 'Multiple Choice Questions' : 'قسم أسئلة الاختيار من متعدد';
    let tfTitle = isForeign ? 'True/False Questions' : 'قسم أسئلة الصواب والخطأ';
    let tfLetters = isForeign ? ['T', 'F'] : ['ص', 'خ'];

    let bH = '';
    const hs = document.getElementById('bHdrStyle').value;
    const hC = document.getElementById('bHdrColor').value;
    const hb = document.getElementById('bHdrBorderColor').value;
    const hbg = document.getElementById('bHdrBgColor').value;
if (hs === 'advanced') {
        let ig = '';
        for (let c = 0; c < 6; c++) {
            // تصغير مربع الإدخال والدوائر درجة واحدة لامتصاص النص
            let cb = `<input type="text" style="border:1px solid ${hb};color:${hC}; height:16px; width:14px; font-size:11px; margin-bottom:1px; text-align:center; outline:none; padding:0; font-weight:bold;" maxlength="1">`;
            for (let r = 0; r <= 9; r++) { cb += `<div style="width:12px;height:12px;font-size:8px;border:1px solid ${hb};border-radius:50%;color:${hC};margin-bottom:1px;display:flex;align-items:center;justify-content:center;font-weight:bold;">${r}</div>`; }
            ig += `<div style="display:flex;flex-direction:column;gap:0px;align-items:center; margin-left:2px;">${cb}</div>`;
        }
        bH = `<div style="border:1px solid ${hb};background:${hbg};color:${hC}; padding:2px 6px; margin-bottom:2px; direction:${dir}; text-align:${align}; display:flex; justify-content:space-between; align-items:center; border-radius:6px; page-break-inside: avoid;">
            <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:2px; font-size:11px; line-height:1.3; font-weight:bold; padding-inline-end: 10px;">
                <div style="word-break: break-word;">${f1}</div>
                <div style="word-break: break-word;">${f2}</div>
                <div style="word-break: break-word;">${f3}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center; border-inline-start:1px dashed ${hb}; padding-inline-start:8px; flex-shrink: 0;">
                <div style="font-size:9px; margin-bottom:1px; font-weight:900;">${idTitle}</div>
                <div style="display:flex;gap:1px;background:#fff;padding:1px;border:1px solid ${hb}; border-radius:4px;">${ig}</div>
            </div>
        </div>`;
    } else if (hs === 'basic') {
        bH = `<div style="border:1px solid ${hb};background:${hbg};color:${hC};font-size:12px; font-weight:bold; padding:6px 10px; margin-bottom:6px; direction:${dir}; text-align:${align}; display:flex; justify-content:space-between; border-radius:6px; page-break-inside: avoid;"><div>${f1}</div><div>${f2}</div><div>${f3}</div></div>`;
    }

    const renderBubbleSection = (title, qList, qType, gridCols) => {
        if (qList.length === 0) return '';
        let secHtml = `<div style="border: 1px solid ${sC}; padding: 4px 6px; margin-bottom: 4px; border-radius: 6px; background: transparent; direction:${dir}; text-align:${align};">`;
        secHtml += `<div style="text-align: center; color: ${sC}; margin-bottom: 6px; border-bottom: 1px dashed ${sC}; padding-bottom: 2px; font-weight: 900; font-size: 11px;">${title}</div>`;

        // 💡 تقليل الفراغ الطولي قليلاً جداً لتعويض مساحة الدوائر الكبيرة وضمان بقائها في صفحة واحدة
        let rowGap = (pos === 'above') ? '2px' : '1px';
        secHtml += `<div style="display: grid; grid-template-columns: repeat(${gridCols}, 1fr); gap: ${rowGap} 6px; color:${sC}; direction:${dir};">`;

        qList.forEach((q) => {
            let i = q.num;
            secHtml += `<div style="display: flex; align-items: center; justify-content: flex-start; gap: 4px; width:100%; direction:${dir}; margin:0; padding:0; overflow:hidden;">`;
            secHtml += `<div style="width: 20px; font-size: 11px; font-weight:900; flex-shrink:0; text-align:${align}; margin:0; padding:0; line-height:1;">${i}.</div>`;
            secHtml += `<div style="display: flex; align-items: center; gap: 4px; flex:1; justify-content:flex-start; margin:0; padding:0;">`;

            const createBubbleHTML = (letter) => {
                let lbl = (pos === 'above' || pos === 'beside') ? `<span style="color:${sC}; font-size:${labelSize}; font-weight:900; line-height:1; display:block;">${letter}</span>` : '';
                let ins = (pos === 'inside') ? letter : '';
                let flexDir = pos === 'above' ? 'column' : 'row';
                let itemGap = pos === 'beside' ? '2px' : '1px';

                return `
                <div style="display:flex; flex-direction:${flexDir}; align-items:center; justify-content:center; gap:${itemGap}; margin:0; padding:0; line-height:1;">
                    ${pos === 'beside' ? lbl : ''}
                    ${pos === 'above' ? lbl : ''}
                    <div class="shape-${sh}" style="display:flex; align-items:center; justify-content:center; width:${userBubbleSize}; height:${sh === 'oval' ? 'auto' : userBubbleSize}; ${sh === 'oval' ? 'aspect-ratio: 1.4/1;' : ''} border:1px solid ${sC}; color:${sC}; font-size:${fontSize}; font-weight:bold; line-height:1; padding:0; margin:0; box-sizing:border-box; flex-shrink:0;">
                        ${ins}
                    </div>
                </div>`;
            };

            if (qType === 'mcq') {
                for (let o = 0; o < oC; o++) { let l = lA[o] || ''; secHtml += pos !== 'hidden' ? createBubbleHTML(l) : createBubbleHTML(''); }
            } else if (qType === 'tf_inline') {
                for (let o = 0; o < 2; o++) { let l = tfLetters[o]; secHtml += pos !== 'hidden' ? createBubbleHTML(l) : createBubbleHTML(''); }
            }
            secHtml += `</div></div>`;
        });
        secHtml += `</div></div>`;
        return secHtml;
    };

    let bHt = '';

    if (qDb.filter(q => q.type !== 'heading').length === 0) {
        let dummyMCQ = Array.from({ length: 60 }, (_, i) => ({ num: i + 1 }));
        let dummyTF = Array.from({ length: 50 }, (_, i) => ({ num: i + 1 }));
        bHt += renderBubbleSection(isForeign ? mcqTitle + ' (60)' : mcqTitle + ' (60)', dummyMCQ, 'mcq', userColumnsCount);
        bHt += renderBubbleSection(isForeign ? tfTitle + ' (50)' : tfTitle + ' (50)', dummyTF, 'tf_inline', userColumnsCount);
    } else {
        let mcqQs = qDb.filter(q => q.type === 'mcq');
        let tfQs = qDb.filter(q => q.type === 'tf_inline');
        bHt += renderBubbleSection(mcqTitle, mcqQs, 'mcq', userColumnsCount);
        bHt += renderBubbleSection(tfTitle, tfQs, 'tf_inline', userColumnsCount);
    }

    let bTopRight = document.getElementById('bHdrTopRight') ? document.getElementById('bHdrTopRight').value : '';
    let bTopCenter = document.getElementById('bHdrTopCenter') ? document.getElementById('bHdrTopCenter').value : '';
    let bTopLeft = document.getElementById('bHdrTopLeft') ? document.getElementById('bHdrTopLeft').value : '';

 let bubbleTopHeader = '';
    if (bTopRight || bTopCenter || bTopLeft) {
        bubbleTopHeader = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 4px; font-size: 11px; line-height: 1.2; font-weight: 900; color: ${hC}; direction:${dir}; text-align:${align}; border-bottom: 2px solid ${hb}; padding-bottom: 4px;">
            <div style="flex: 1; text-align: ${isForeign ? 'left' : 'right'}; word-wrap: break-word;">${bTopRight}</div>
            <div style="flex: 1; text-align: center; word-wrap: break-word;">${bTopCenter}</div>
            <div style="flex: 1; text-align: ${isForeign ? 'right' : 'left'}; word-wrap: break-word;">${bTopLeft}</div>
        </div>`;
    }

// 💡 تصميم الـ Anchor Marks الاحترافي الخالي من البراويز مع الباركود الهجين
   // 💡 إخراج الترويسة لتكون فوق إطار الباركود
    let omrWrapper = `
    ${bubbleTopHeader}
    ${modelBadgeHtml} 
    ${bH} 
    
    <div style="position: relative; padding: 45px 25px; border: 2px solid ${hb}; border-radius: 12px; background: #fff; box-sizing: border-box; width: 100%; max-width: 100%; margin-top: 10px; page-break-inside: avoid;">
        
        <!-- نظام الباركود الهجين يحاوط الأسئلة فقط -->
        <div class="omr-mark" style="position: absolute; top: 10px; left: 10px; width: 50px; height: 50px; background: #000; border-radius: 6px; display: flex; align-items: center; justify-content: center; z-index: 10;">
            <div class="omr-qr" id="qr-TL-${Date.now()}" data-qr="TL" style="width: 34px; height: 34px; background: #fff; padding: 2px;"></div>
        </div>
        <div class="omr-mark" style="position: absolute; top: 10px; right: 10px; width: 50px; height: 50px; background: #000; border-radius: 6px; display: flex; align-items: center; justify-content: center; z-index: 10;">
            <div class="omr-qr" id="qr-TR-${Date.now()}" data-qr="TR" style="width: 34px; height: 34px; background: #fff; padding: 2px;"></div>
        </div>
        <div class="omr-mark" style="position: absolute; bottom: 10px; left: 10px; width: 50px; height: 50px; background: #000; border-radius: 6px; display: flex; align-items: center; justify-content: center; z-index: 10;">
            <div class="omr-qr" id="qr-BL-${Date.now()}" data-qr="BL" style="width: 34px; height: 34px; background: #fff; padding: 2px;"></div>
        </div>
        <div class="omr-mark" style="position: absolute; bottom: 10px; right: 10px; width: 50px; height: 50px; background: #000; border-radius: 6px; display: flex; align-items: center; justify-content: center; z-index: 10;">
            <div class="omr-qr" id="qr-BR-${Date.now()}" data-qr="BR" style="width: 34px; height: 34px; background: #fff; padding: 2px;"></div>
        </div>
        
        ${bHt}
    </div>`;

    return omrWrapper;
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
            pA.innerHTML = generatePageHTML(getBubbleSheetContent(questionsDatabase, emptyBCount, ''), getBackgroundCSS(), true, '', true);
        } else {
            let qP = getRawPreamble('questionsInput');
            if (qP) qP = `<div dir="auto" style="width: 100%; margin-bottom: 30px; clear: both; unicode-bidi: plaintext; text-align: start;">${qP}</div>`;
            let aP = getRawPreamble('answersInput');
            if (aP) aP = `<div dir="auto" style="width: 100%; margin-bottom: 30px; clear: both; unicode-bidi: plaintext; text-align: start;">${aP}</div>`;

            let primaryCol = document.getElementById('userPrimaryColor') ? document.getElementById('userPrimaryColor').value : '#4A00E0';
            const hs = buildQAndA_HTML(questionsDatabase, primaryCol);
            let fH = '';
            
            if (printType === 'student' || printType === 'both') {
                fH += generatePageHTML(qP + hs.noAns, getBackgroundCSS(), false);
                
                // 💡 التعديل السحري: ميزة الحفظ التلقائي للخزنة (للامتحان الموحد) 
                let examTitle = document.getElementById('hdrCenter') ? document.getElementById('hdrCenter').value : 'امتحان دوري';
                let timeString = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                let dateString = new Date().toLocaleDateString('ar-EG');
                
                let gradingRecord = {
                    id: 'EXAM_SINGLE_' + Date.now(),
                    title: examTitle + ' (نسخة موحدة - ' + timeString + ')',
                    modelsKeys: { "0": [] } 
                };
                
                let ansList = [];
                questionsDatabase.forEach(q => {
                    if (q.type !== 'heading') {
                        ansList.push(q.ans || '');
                    }
                });
                gradingRecord.modelsKeys["0"] = ansList;

                localforage.getItem('elalfey_grading_vault').then(async (vault) => {
                    let currentVault = vault || [];
                    // تجنب الحفظ المتكرر لنفس النسخة في الخزنة
                    if (currentVault.length === 0 || currentVault[0].modelsKeys["0"].join() !== ansList.join()) {
                        currentVault.unshift(gradingRecord);
                        if (currentVault.length > 50) currentVault.pop();
                        await localforage.setItem('elalfey_grading_vault', currentVault);
                        
                        const user = auth.currentUser;
                        if (user) {
                            try {
                                await db.collection('users').doc(user.uid).set({ omrVault: currentVault }, { merge: true });
                            } catch(e) { console.error("Cloud sync failed", e); }
                        }
                    }
                });
            }
            if (printType === 'teacher' || printType === 'both') fH += generatePageHTML(aP + hs.withAns, getBackgroundCSS(), true);
            
            pA.innerHTML = fH;
            if (typeof renderOMRBarcodes === 'function') setTimeout(renderOMRBarcodes, 100);
        }
    }
    if (window.MathJax) await MathJax.typesetPromise([pA]);
    let borderEl = document.getElementById('enableBorder');
    document.getElementById('printBorderOverlay').style.display = (borderEl && borderEl.value === 'yes') ? 'block' : 'none';
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

        // 💡 التمرير للمكان الصحيح أسفل الترويسة
        fH += generatePageHTML(getBubbleSheetContent(dummyDb, 0, modelBadgeHtml), bgCSS, true, '', true);
    }

    pA.innerHTML = fH;
    setTimeout(renderOMRBarcodes, 100);
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
    if (qP) qP = `<div dir="auto" style="width: 100%; margin-bottom: 20px; clear: both; unicode-bidi: plaintext; text-align: start;">${qP}</div>`;
    let aP = getRawPreamble('answersInput');
    if (aP) aP = `<div dir="auto" style="width: 100%; margin-bottom: 20px; clear: both; unicode-bidi: plaintext; text-align: start;">${aP}</div>`;

    const numType = document.getElementById('modelNumberType').value;
    const posType = document.getElementById('modelLabelPos').value;

    let mods = ['A', 'B', 'C', 'D'];
    if (numType === 'arabic') mods = ['أ', 'ب', 'ج', 'د'];
    else if (numType === 'number') mods = ['1', '2', '3', '4'];

    // 💡 الجديد هنا: إنشاء سجل الامتحان لحفظه في "خزنة التصحيح" للكاميرا
    let examTitle = document.getElementById('hdrCenter') ? document.getElementById('hdrCenter').value : 'امتحان دوري';
    if (!examTitle) examTitle = 'امتحان دوري';
    
    // 💡 إضافة الوقت والدقيقة لتمييز الامتحانات عن بعضها بوضوح
    let timeString = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    let dateString = new Date().toLocaleDateString('ar-EG');
    
    let gradingRecord = {
        id: 'EXAM_' + Date.now(),
        title: examTitle + ' (' + timeString + ' - ' + dateString + ')',
        modelsKeys: {} 
    };

    for (let i = 0; i < mods.length; i++) {
        let m = mods[i];

        let mcqs = questionsDatabase.filter(q => q.type === 'mcq').sort(() => Math.random() - 0.5);
        let tfs = questionsDatabase.filter(q => q.type === 'tf_inline').sort(() => Math.random() - 0.5);
        let essays = questionsDatabase.filter(q => q.type === 'essay').sort(() => Math.random() - 0.5);

        let mcqIdx = 0, tfIdx = 0, essayIdx = 0;
        
        let sDb = questionsDatabase.map(q => {
            if (q.type === 'heading') return q;
            if (q.type === 'mcq') return mcqs[mcqIdx++];
            if (q.type === 'tf_inline') return tfs[tfIdx++];
            if (q.type === 'essay') return essays[essayIdx++];
        });

        let typeCounters = { mcq: 1, tf_inline: 1, essay: 1 };
        
        // 💡 الجديد هنا: حفظ مفتاح الإجابة الخاص بهذا النموذج تحديداً في الخزنة
        let currentModelAnswers = [];
        sDb.forEach(q => {
            if (q.type !== 'heading') {
                q.num = typeCounters[q.type]++;
                currentModelAnswers.push(q.ans || ''); // استخراج الإجابة
            }
        });
        gradingRecord.modelsKeys[i] = currentModelAnswers; // حفظ إجابات النموذج (0=A, 1=B...)

        let hs = buildQAndA_HTML(sDb, document.getElementById('userPrimaryColor').value);
        let bgCSS = getBackgroundCSS();
        let modelBadgeHtml = '';

        let machineCodeHtml = `<div style="display:flex; justify-content:center; gap:6px; margin-top:8px;">`;
        for (let d = 0; d < 4; d++) {
            let isDark = (d === i) ? '#000' : '#fff';
            machineCodeHtml += `<div style="width:12px; height:12px; border:2px solid #000; background:${isDark};"></div>`;
        }
        machineCodeHtml += `</div>`;

        if (posType === 'watermark') {
            bgCSS = getBackgroundCSS(m);
        } else {
            let align = posType.replace('header_', '');
            modelBadgeHtml = `<div style="text-align: ${align}; width: 100%; margin-bottom: 3px;">
                <span style="display:inline-block; font-weight: 900; font-size: 18px; color: var(--primary-color); border: 3px dashed var(--primary-color); padding: 4px 20px; border-radius: 8px; background: rgba(255,255,255,0.9);">
                    نموذج الاختبار (${m})
                    ${machineCodeHtml}
                </span>
            </div>`;
        }

        fH += generatePageHTML(qP + hs.noAns, bgCSS, false, modelBadgeHtml, false);
        fH += generatePageHTML(aP + hs.withAns, bgCSS, true, modelBadgeHtml, false);
        
        // 💡 التعديل الجديد: قراءة اختيار المستخدم (هل نطبع بابل شيت أم لا؟)
        const answerMode = document.getElementById('multiAnswerMode') ? document.getElementById('multiAnswerMode').value : 'with_bubble';
        if (answerMode === 'with_bubble') {
            fH += generatePageHTML(getBubbleSheetContent(sDb, 0, modelBadgeHtml, i), bgCSS, true, '', true);
        }
    }

    // 💡 الحفظ المزدوج: في المتصفح + السحابة (ليعمل على أي جهاز)
    localforage.getItem('elalfey_grading_vault').then(async (vault) => {
        let currentVault = vault || [];
        currentVault.unshift(gradingRecord); 
        if (currentVault.length > 50) currentVault.pop(); // الاحتفاظ بآخر 50 امتحان فقط
        
        await localforage.setItem('elalfey_grading_vault', currentVault);

        const user = auth.currentUser;
        if (user) {
            try {
                await db.collection('users').doc(user.uid).set({
                    omrVault: currentVault
                }, { merge: true });
            } catch(e) { console.error("Cloud sync failed", e); }
        }
    });

    pA.innerHTML = fH;
    setTimeout(renderOMRBarcodes, 100);
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
    const userLang = navigator.language || navigator.userLanguage;
    const isArabic = userLang.toLowerCase().startsWith('ar');

    // إجبار الموقع على البقاء بالاتجاه العربي (RTL) دائماً لتجنب تدمير التصميم
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
    document.documentElement.style.setProperty('--text-align', 'right');

    if (!isArabic) return;

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

    function translateDOM(node) {
        if (node.nodeType === 3) {
            let text = node.nodeValue;
            let textTrimmed = text.trim();
            if (textTrimmed && translations[textTrimmed]) {
                node.nodeValue = text.replace(textTrimmed, translations[textTrimmed]);
            } else {
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

    const qInput = document.getElementById('questionsInput');
    if (qInput) {
        qInput.setAttribute('placeholder', 'اكتب العنوان الرئيسي هنا، ثم انزل سطراً واكتب:\n1. اكتب سؤالك الأول هنا...\nأ) الخيار الأول\nب) الخيار الثاني [✓]\nج) الخيار الثالث\nد) الخيار الرابع');
    }

    const aInput = document.getElementById('answersInput');
    if (aInput) {
        aInput.setAttribute('placeholder', 'عنوان صفحة الإجابات هنا...\nإذا لم تضع الإجابة بجوار الخيار، اكتبها هنا:\n1- ب\n2- صح');
    }
}

window.addEventListener('DOMContentLoaded', applySystemLanguageSettings);

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
        if (panel.id === 'accountHistoryPanel') return;
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

    window.renderArchiveQuestionsList = async function() {
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
}

/* ========================================================
   نظام الجولة التفاعلية الحقيقية (Ultimate FIFA-Style Tour) 🎮🚀
   ======================================================== */
window.runSmartOnboardingTour = function(isForced) {
    const forced = (isForced === true);

    if (!forced && localStorage.getItem('mh_pro_tour_done_v1') === 'yes') {
        return; 
    }

    localStorage.setItem('mh_pro_tour_done_v1', 'yes');

    if (!document.getElementById('tourDynamicStyles')) {
        const style = document.createElement('style');
        style.id = 'tourDynamicStyles';
        style.innerHTML = `
            .tour-pulse-ring {
                position: fixed;
                border: 3px solid #10b981;
                border-radius: 12px;
                pointer-events: none;
                z-index: 9999995;
                animation: tourPulse 1.5s infinite;
            }
            @keyframes tourPulse {
                0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { box-shadow: 0 0 0 15px rgba(16, 185, 129, 0); }
                100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }
            .tour-tooltip {
                position: fixed;
                background: #ffffff;
                padding: 20px;
                border-radius: 16px;
                box-shadow: 0 25px 50px rgba(0,0,0,0.6);
                z-index: 9999996;
                direction: rtl;
                border-top: 6px solid #10b981;
                width: 320px;
                max-width: 90vw;
            }
            .tour-overlay-block {
                position: fixed;
                background: rgba(15, 23, 42, 0.85);
                z-index: 9999990;
            }
        `;
        document.head.appendChild(style);
    }

    const oTop = document.createElement('div'); oTop.className = 'tour-overlay-block';
    const oBottom = document.createElement('div'); oBottom.className = 'tour-overlay-block';
    const oLeft = document.createElement('div'); oLeft.className = 'tour-overlay-block';
    const oRight = document.createElement('div'); oRight.className = 'tour-overlay-block';
    
    const pulseRing = document.createElement('div'); pulseRing.className = 'tour-pulse-ring';
    const tooltip = document.createElement('div'); tooltip.className = 'tour-tooltip';

    tooltip.addEventListener('click', (e) => e.stopPropagation());
    tooltip.addEventListener('mousedown', (e) => e.stopPropagation());

    const tourElements = [oTop, oBottom, oLeft, oRight, pulseRing, tooltip];
    tourElements.forEach(el => document.body.appendChild(el));

    function preventScroll(e) { e.preventDefault(); }
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });

    const steps = [
        // --- 1. الإعدادات العامة والشريط العلوي ---
        { selector: '.nav-center h2', title: 'مرحباً في M&H Pro 🚀', text: 'سنأخذك في جولة تفصيلية لتعلم كل تفصيلة في المنصة خطوة بخطوة. (اضغط متابعة)', action: 'next' },
        { selector: '.theme-toggle', title: 'الوضع الليلي/النهاري 🌙', text: 'جرب بنفسك! <b>اضغط فعلياً على الأيقونة</b> لتحويل الموقع للوضع الداكن.', action: 'click' },
        { selector: '.nav-right', title: 'حفظ أعمالك سحابياً 🔐', text: 'من هنا تسجل دخولك لربط حسابك بالسحابة، ومزامنة مسوداتك وإدارة حسابك.', action: 'next' },
        { selector: '.btn-ai', title: 'الذكاء الاصطناعي ✨', text: 'مساعدك الذكي! يحلل الـ PDF ويجاوب على أي استفسارات تخص المادة.', action: 'next' },
        { selector: '.btn-vip', title: 'ترقية الحساب 👑', text: 'لإدخال كود التفعيل وفتح كافة الخصائص الاحترافية اللامحدودة.', action: 'next' },
        
        // --- 2. القسم الأول (بنك الأسئلة) ---
        { selector: '#btnTabQuestions', title: 'القسم الأول: بنك الأسئلة 📝', text: 'أولاً سنشرح قسم الامتحانات. <b>اضغط على هذا التبويب</b> للبدء.', action: 'click' },
        { selector: '.f-undo-redo-group', title: 'التراجع والإعادة ↩️', text: 'إذا مسحت شيئاً بالخطأ في المحرر، هذه الأزرار تعيده فوراً.', action: 'next' },
        
        // 💡 التعديل هنا: إزالة الإجبار على الفتح حتى يدوس المستخدم بنفسه
        { selector: '.sys-btn', title: 'أنظمة التنسيق ⚙️', text: '<b>اضغط على الزر</b> لفتح قائمة لغات الكتابة المتاحة.', action: 'click' }, 
        { selector: '#systemMenu button:nth-child(2)', title: 'نظام اللغات 🇬🇧', text: 'يقلب المحرر لليسار (LTR) للمواد الأجنبية.', action: 'next', forceOpen: 'systemMenu' },
        { selector: '#systemMenu button:nth-child(3)', title: 'النظام العلمي ⚛️', text: 'يفتح أدوات لكتابة المعادلات والرموز الرياضية.', action: 'next', forceOpen: 'systemMenu' },
        { selector: '#systemMenu button:nth-child(1)', title: 'النظام العربي 🇸🇦', text: 'الآن <b>اضغط هنا</b> لتفعيل النظام العربي.', action: 'click', forceOpen: 'systemMenu' },
        
        { selector: '.tools-btn', title: 'العمليات الذكية 🪄', text: '<b>اضغط هنا</b> لفتح قائمة الأدوات السحرية.', action: 'click' },
        { selector: '#smartToolsMenu button:nth-child(1)', title: 'تحليل البنك 📊', text: 'يعرض إحصائية لعدد أنواع الأسئلة التي كتبتها.', action: 'next', forceOpen: 'smartToolsMenu' },
        { selector: '#smartToolsMenu button:nth-child(2)', title: 'خلط شامل 🔀', text: 'يخلط ترتيب الأسئلة والخيارات لمنع الغش بضغطة زر.', action: 'next', forceOpen: 'smartToolsMenu' },
        { selector: '#smartToolsMenu button:nth-child(4)', title: 'الأرشيف السحابي ☁️', text: 'لحفظ واسترجاع مسوداتك في السحابة بأمان.', action: 'next', forceOpen: 'smartToolsMenu' },
        { selector: '#smartToolsMenu button:nth-child(3)', title: 'التنسيق الذكي ✨', text: 'الآن <b>اضغط هنا!</b> لينظف أسئلتك ويستخرج الإجابات آلياً.', action: 'click', forceOpen: 'smartToolsMenu' },
        
        { selector: '.insert-btn', title: 'أدوات الإدراج ➕', text: '<b>اضغط هنا</b> لفتح قائمة القوالب الجاهزة.', action: 'click' },
        { selector: '#insertMenu button:nth-child(2)', title: 'سؤال صح/خطأ ✅', text: 'يرمي لك قالب جاهز لسؤال الصواب والخطأ.', action: 'next', forceOpen: 'insertMenu' },
        { selector: '#insertMenu button:nth-child(3)', title: 'سؤال مقالي 📝', text: 'يرمي لك قالب للأسئلة المقالية.', action: 'next', forceOpen: 'insertMenu' },
        { selector: '#insertMenu button:nth-child(4)', title: 'استخراج نص (OCR) 📄', text: 'ارفع صورة وسيحولها النظام لنص مكتوب فوراً.', action: 'next', forceOpen: 'insertMenu' },
        { selector: '#insertMenu button:nth-child(6)', title: 'إدراج صورة 🖼️', text: 'لإرفاق صورة توضيحية داخل السؤال.', action: 'next', forceOpen: 'insertMenu' },
        { selector: '#insertMenu button:nth-child(1)', title: 'سؤال اختياري 🔘', text: 'الآن <b>اضغط هنا</b> لإدراج قالب سؤال اختياري وجرب.', action: 'click', forceOpen: 'insertMenu' },
        
        { selector: '.grid-layout > .form-group:nth-child(1) .editor-toolbar', title: 'شريط أدوات الأسئلة 🛠️', text: 'يحتوي على الإملاء الصوتي، التنسيق، والألوان.', action: 'next' },
        { selector: '#questionsInput', title: 'مساحة العمل الأساسية 📝', text: 'هنا تكتب أسئلتك. ضع الخيارات تحت بعضها، وتضع [✓] بجوار الخيار الصحيح.', action: 'next' },
        { selector: '.grid-layout > .form-group:nth-child(2) .editor-toolbar', title: 'شريط مفتاح الإجابات 🛠️', text: 'لتنسيق صفحة نموذج الإجابة بشكل مستقل.', action: 'next' },
        { selector: '#answersInput', title: 'مفتاح الإجابات 🔑', text: 'يتولد تلقائياً هنا بعد ضغط (التنسيق الذكي)، أو يُكتب يدوياً.', action: 'next' },

        // 💡 التعديل هنا: إزالة الإجبار ليضطر المستخدم للضغط أولاً
        { selector: '.dock-item[onclick*="generalSettingsPanel"]', title: 'التنسيق العام 🎨', text: 'هذا الشريط الجانبي يهندس الورقة. <b>اضغط هنا</b> لفتح التنسيق العام.', action: 'click' },
        { selector: '#generalSettingsPanel .close-panel-btn', title: 'إغلاق اللوحة ✖️', text: 'من هنا تغير الألوان والعلامة المائية. <b>اضغط X</b> للإغلاق.', action: 'click', forceOpenPanel: 'generalSettingsPanel' },
        { selector: '.dock-item[onclick*="examSettingsPanel"]', title: 'الترويسة العلوية 🏛️', text: 'لضبط ديباجة الامتحان (الوزارة، المادة، الزمن).', action: 'next' },
        { selector: '.dock-item[onclick*="questionSettingsPanel"]', title: 'بنيوية الأسئلة 📝', text: 'للتحكم في مقاسات وألوان الأسئلة وطريقة عرضها (أفقي/عمودي).', action: 'next' },
        { selector: '.dock-item[onclick*="compactBubblePanel"]', title: 'البابل شيت المضغوط 📄', text: 'لدمج بابل شيت متطور أعلى ورقة الأسئلة مباشرة.', action: 'next' },
        { selector: '.dock-item[onclick*="multiModelSettingsPanel"]', title: 'النماذج المتعددة 🔀', text: 'لإعداد أشكال ترقيم النماذج (A, B, C) وأماكنها.', action: 'next' },
        { selector: '.dock-item[onclick*="bubbleSettingsPanel"]', title: 'تنسيقات البابل شيت ⭕', text: 'لتحديد شكل وحجم الدوائر والأعمدة للورقة المستقلة.', action: 'next' },
        { selector: '.dock-item[onclick*="bubbleHeaderSettingsPanel"]', title: 'ترويسة البابل شيت 📋', text: 'لتخصيص بيانات الطالب والباركود للورقة المستقلة.', action: 'next' },
        
        { selector: '.btn-dock-danger', title: 'مسح الكل 🗑️', text: '<b>اضغط هنا</b> لفتح نافذة مسح المشروع والبدء من جديد.', action: 'click' },
        { selector: '#confirmModal .modal-content', title: 'احترس! ✖️', text: '⚠️ <b>تنبيه هام جداً:</b> الرجاء الضغط فعلياً على زر <b>"إلغاء"</b> بالأسفل لكي لا تفقد عملك وتقف الجولة!', action: 'next', forceOpenModal: 'confirmModal' },
        { selector: '#confirmModal button:last-child', title: 'إلغاء الإجراء', text: '<b>اضغط على "إلغاء" هنا</b> للمتابعة بأمان.', action: 'click', forceOpenModal: 'confirmModal' },

        { selector: '#questionActionButtons', title: 'منصة التصدير 🖨️', text: 'من هنا تطبع عملك بالصيغ المتاحة (طالب، معلم، نماذج متعددة).', action: 'next' },

        // --- 3. القسم الثاني (فصولي وطلابي) ---
        { selector: '#btnTabClassrooms', title: 'القسم الثاني: فصولي الافتراضية 👨‍🏫', text: 'انتهينا من الأسئلة! <b>اضغط هنا</b> لفتح لوحة إدارة الطلاب.', action: 'click' },
        { selector: 'button[onclick="generateFromLessonPrompt()"]', title: 'توليد ذكي للأسئلة 🧠', text: 'أداة سحرية! اكتب اسم الدرس، وسيقوم الـ AI بتوليد أسئلته ونقلك للمحرر فوراً.', action: 'next' },
        { selector: 'button[onclick="createNewClassroom()"]', title: 'إنشاء فصل جديد ➕', text: 'لفتح مجموعات أو فصول دراسية للطلاب.', action: 'next' },
        { selector: '#lmsTotalStudents', title: 'عداد الطلاب 🎓', text: 'يعرض إجمالي طلابك. الباقة المجانية تسمح بـ 30 طالباً כحد أقصى.', action: 'next' },
        { selector: '#classroomsGrid', title: 'شبكة الفصول 🏫', text: 'هنا تظهر فصولك. يمكنك الدخول إليها لإضافة الطلاب وحذفهم أو إضافة درجاتهم يدوياً.', action: 'next' },

        // --- 4. القسم الثالث (محرر النصوص) ---
        { selector: '#btnTabText', title: 'القسم الثالث: محرر الملازم 📄', text: 'القسم الأخير! <b>اضغط هنا</b> لفتح محرر المستندات الحر.', action: 'click' },
        { selector: '#textTab .btn-icon', title: 'تراجع وإعادة ↩️', text: 'أزرار مخصصة للتحكم في أخطاء الكتابة داخل المحرر الحر.', action: 'next' },
        { selector: '#textTab .editor-toolbar', title: 'أدوات التنسيق الشاملة 🛠️', text: 'لإدراج الجداول، الصور، والمعادلات وتنسيق المذكرات بحرية تامة.', action: 'next' },
        { selector: '#generalTextInput', title: 'ورقة العمل الحرة 📝', text: 'مساحتك الحرة لكتابة وتأليف أي ملازم أو أوراق عمل لا تعتمد على نظام البابل شيت.', action: 'next' },
        { selector: '#textActionButtons', title: 'الطباعة 🖨️', text: 'لطباعة الملازم والمستندات الحرة فور الانتهاء منها.', action: 'next' }
    ];

    let currentStepIndex = 0;
    let currentTarget = null;
    let clickListener = null;
    let animationFrameId = null;

    window.forceCloseTour = function() {
        cancelAnimationFrame(animationFrameId);
        tourElements.forEach(el => el.remove());
        if (document.getElementById('tourDynamicStyles')) document.getElementById('tourDynamicStyles').remove();
        window.removeEventListener('wheel', preventScroll);
        window.removeEventListener('touchmove', preventScroll);
        if (clickListener) document.body.removeEventListener('click', clickListener, true);
        localStorage.setItem('mh_pro_tour_done_v1', 'yes'); // تسجيل الإغلاق
    };

    function endTour() {
        window.forceCloseTour();
        if (typeof showToast === 'function') showToast('انتهت الجولة بنجاح! أنت الآن محترف 🚀', 'success');
    }

    function trackTarget() {
        if (!currentTarget) return;

        const rect = currentTarget.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            animationFrameId = requestAnimationFrame(trackTarget);
            return;
        }

        const padding = 6; 

        oTop.style.top = '0'; oTop.style.left = '0'; oTop.style.width = '100vw'; oTop.style.height = Math.max(0, rect.top - padding) + 'px';
        oBottom.style.top = (rect.bottom + padding) + 'px'; oBottom.style.left = '0'; oBottom.style.width = '100vw'; oBottom.style.height = Math.max(0, window.innerHeight - (rect.bottom + padding)) + 'px';
        oLeft.style.top = Math.max(0, rect.top - padding) + 'px'; oLeft.style.left = '0'; oLeft.style.width = Math.max(0, rect.left - padding) + 'px'; oLeft.style.height = (rect.height + padding*2) + 'px';
        oRight.style.top = Math.max(0, rect.top - padding) + 'px'; oRight.style.left = (rect.right + padding) + 'px'; oRight.style.width = Math.max(0, window.innerWidth - (rect.right + padding)) + 'px'; oRight.style.height = (rect.height + padding*2) + 'px';

        pulseRing.style.top = (rect.top - padding) + 'px';
        pulseRing.style.left = (rect.left - padding) + 'px';
        pulseRing.style.width = (rect.width + padding*2) + 'px';
        pulseRing.style.height = (rect.height + padding*2) + 'px';

        let tooltipTop = rect.bottom + padding + 15;
        let tooltipLeft = rect.left + (rect.width / 2) - 160;

        // التجاوب الذكي مع الأطراف
        if (rect.right > window.innerWidth - 120) {
            tooltipLeft = rect.left - 340; 
        }

        if (tooltipTop + 200 > window.innerHeight) {
            tooltipTop = rect.top - padding - 220; 
            if(tooltipTop < 0) tooltipTop = window.innerHeight / 2 - 100;
        }
        if (tooltipLeft < 10) tooltipLeft = 10;
        if (tooltipLeft + 320 > window.innerWidth) tooltipLeft = window.innerWidth - 330;

        tooltip.style.top = tooltipTop + 'px';
        tooltip.style.left = tooltipLeft + 'px';

        animationFrameId = requestAnimationFrame(trackTarget);
    }

    function processStep() {
        if (currentStepIndex >= steps.length) {
            endTour();
            return;
        }

        const step = steps[currentStepIndex];
        
        if (step.forceOpen) {
            let menuEl = document.getElementById(step.forceOpen);
            if (menuEl) menuEl.style.display = 'flex';
        }
        if (step.forceOpenPanel) {
            let panelEl = document.getElementById(step.forceOpenPanel);
            if (panelEl) panelEl.style.display = 'block';
        }
        if (step.forceOpenModal) {
            let modalEl = document.getElementById(step.forceOpenModal);
            if (modalEl) modalEl.style.display = 'flex';
        }

        let retryCount = 0;
        
        function findTarget() {
            currentTarget = document.querySelector(step.selector);
            
            // تجاوز ذكي للعناصر المخفية
            if (currentTarget && window.getComputedStyle(currentTarget).display === 'none') {
                currentTarget = null;
            }

            if ((!currentTarget || currentTarget.offsetParent === null) && retryCount < 15) {
                retryCount++;
                setTimeout(findTarget, 100); 
                return;
            }
            
            // لو ملقاش العنصر بعد كل المحاولات يتخطى للخطوة اللي بعدها
            if (!currentTarget) {
                currentStepIndex++; 
                processStep();
                return;
            }

            currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cancelAnimationFrame(animationFrameId);
            trackTarget();

            let actionHtml = '';
            if (step.action === 'click') {
                actionHtml = `<div style="background:#fef3c7; color:#b45309; padding:8px; border-radius:8px; text-align:center; font-size:13px; font-weight:bold; margin-top:15px; border:1px dashed #f59e0b; animation: pulseBrightGold 1.5s infinite;">👉 انقر فعلياً على العنصر المضيء للمتابعة</div>`;
            } else {
                actionHtml = `
                <div style="display:flex; justify-content:flex-end; margin-top:15px;">
                    <button id="tourNextBtn" style="background:#10b981; color:#fff; border:none; padding:8px 20px; border-radius:8px; cursor:pointer; font-weight:900; font-family:inherit;">متابعة ⬅️</button>
                </div>`;
            }

            tooltip.innerHTML = `
                <button onclick="window.forceCloseTour()" style="position:absolute; top:10px; left:10px; background:transparent; border:none; color:#94a3b8; font-size:18px; cursor:pointer;" title="إغلاق الجولة">✖</button>
                <h3 style="margin:0 0 10px 0; color:#10b981; font-size:18px; font-weight:900;">${step.title}</h3>
                <p style="margin:0; color:#334155; font-size:14px; line-height:1.6; font-weight:bold;">${step.text}</p>
                ${actionHtml}
            `;

            if (clickListener) document.body.removeEventListener('click', clickListener, true);

            if (step.action === 'click') {
                clickListener = function(e) {
                    if (currentTarget.contains(e.target) || currentTarget === e.target) {
                        document.body.removeEventListener('click', clickListener, true);
                        currentStepIndex++;
                        setTimeout(processStep, 600); 
                    }
                };
                document.body.addEventListener('click', clickListener, true);
            } else {
                document.getElementById('tourNextBtn').onclick = (e) => {
                    e.stopPropagation(); // منع الإغلاق العشوائي للقوائم
                    currentStepIndex++;
                    processStep();
                };
            }
        }
        findTarget();
    }

    setTimeout(processStep, 500);
};

function initTourSetup() {
    setTimeout(() => {
        if (typeof window.runSmartOnboardingTour === 'function') {
            window.runSmartOnboardingTour(false);
        }
    }, 1500);
}

if (document.readyState === 'complete') {
    initTourSetup();
} else {
    window.addEventListener('load', initTourSetup);
}

// 💡 المراقبة الذكية لضمان عمل الجولة مرة واحدة فقط للمستخدم الجديد
function initTourSetup() {
    setTimeout(() => {
        if (typeof window.runSmartOnboardingTour === 'function') {
            window.runSmartOnboardingTour(false);
        }
    }, 1500);
}

if (document.readyState === 'complete') {
    initTourSetup();
} else {
    window.addEventListener('load', initTourSetup);
}
// جعل الدالة متاحة عالمياً إذا أردت استدعاءها من زر في واجهة المستخدم مستقبلاً
window.runSmartOnboardingTour = runSmartOnboardingTour;

// مراقب التحميل لتشغيل الجولة للمستخدمين الجدد
window.addEventListener('load', () => {
    runSmartOnboardingTour(false);
});

window.addEventListener('load', runSmartOnboardingTour);

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
        let ig = '';
        for (let c = 0; c < 6; c++) {
            let cb = `<div style="border:1px solid ${sColor}; height:14px; margin-bottom:1px; background:#fff;"></div>`;
            for (let r = 0; r <= 9; r++) {
                cb += `<div style="width:12px;height:12px;font-size:8px;border:1px solid ${sColor};border-radius:50%;display:flex;align-items:center;justify-content:center;margin:1px auto;font-weight:bold;">${r}</div>`;
            }
            ig += `<div style="display:flex;flex-direction:column;width:14px;gap:0px; margin-left:2px;">${cb}</div>`;
        }
        headerInfoHtml = `
            <div style="border: 2px solid ${sColor}; padding: 2px 8px; margin-bottom: 2px; border-radius: 6px; direction:${dir}; text-align:${align}; font-size: 11px; line-height: 1.3; font-weight: bold; color: ${sColor}; display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.7);">
                <div style="flex:1; display:flex; flex-direction:column; gap:2px; padding-inline-end: 10px;">
                    <div style="word-break: break-word;">${f1} .....................................................</div>
                    <div style="word-break: break-word;">${f2} ......................................</div>
                    <div style="word-break: break-word;">${f3} ......................................</div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:center; border-inline-start: 2px dashed ${sColor}; padding-inline-start: 10px; flex-shrink: 0;">
                    <div style="font-size:10px; margin-bottom:1px;">${seatTitle}</div>
                    <div style="display:flex; gap: 1px;">${ig}</div>
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
function exportQuestionsToJSON() {
    if (questionsDatabase.length === 0) {
        showToast('لا توجد أسئلة للتصدير', 'error');
        return;
    }

    // إحضار الجداول والترويسات الموجودة أعلى الامتحان
    const currentPreamble = getRawPreamble('questionsInput');

    // تجهيز الكائن الشامل الذي يضم الأسئلة والجداول العلوية
    const exportData = {
        preamble: currentPreamble,
        questions: questionsDatabase
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');

    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "MH_Bank_" + Date.now() + ".json");

    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();

    showToast('تم تصدير بنك الأسئلة (مع الترويسة والجداول) بنجاح', 'success');
}
function importQuestionsFromJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importedData = JSON.parse(e.target.result);

            // التوافق مع الملفات القديمة (التي تحتوي أسئلة فقط)
            if (Array.isArray(importedData)) {
                questionsDatabase = importedData;
                smartFormatAndClean(true);
                autoSaveData();
                showToast('تم استيراد وعرض بنك الأسئلة بنجاح', 'success');
            }
            // التوافق مع الملفات الجديدة (التي تحتوي على أسئلة + جداول وترويسة)
            else if (importedData && importedData.questions) {
                questionsDatabase = importedData.questions;

                // استعادة الجداول والترويسات ووضعها في بداية المحرر
                if (importedData.preamble) {
                    document.getElementById('questionsInput').innerHTML = importedData.preamble;
                } else {
                    document.getElementById('questionsInput').innerHTML = '';
                }

                smartFormatAndClean(true);
                autoSaveData();
                showToast('تم استيراد بنك الأسئلة (مع الجداول) بنجاح', 'success');
            } else {
                showToast('تنسيق الملف غير صحيح', 'error');
            }
        } catch (error) {
            showToast('خطأ في قراءة الملف', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}
// تسجيل الـ Service Worker لتفعيل PWA والعمل بدون إنترنت
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('✅ تم تفعيل PWA بنجاح!', reg.scope))
            .catch(err => console.error('❌ فشل تفعيل PWA:', err));
    });
}
let chartsInitialized = false;

// دالة فتح لوحة الإدارة مع جلب البيانات الحقيقية
async function openAdminPanel() {
    document.getElementById('adminPanelModal').style.display = 'flex';

    if (chartsInitialized) return;

    try {
        // جلب البيانات من Firebase (كمثال: جلب عدد المستخدمين وعدد الأسئلة)
        // افترض أن لديك كوليكشن باسم 'users' و 'questions'
        /* const usersSnap = await db.collection('users').get();
        const usersCount = usersSnap.size;
        
        const codesSnap = await db.collection('codes').get();
        const codesCount = codesSnap.size;
        */

        // نظراً لأنني لا أعرف أسماء الكوليكشنز الدقيقة لديك، سأضع الأكواد جاهزة للربط:
        let activeUsers = 120; // استبدل بـ usersCount
        let generatedQuestions = questionsDatabase ? questionsDatabase.length : 0;

        chartsInitialized = true;

        // 1. رسم بياني لنشاط المستخدمين
        new Chart(document.getElementById('usersActivityChart'), {
            type: 'line',
            data: {
                labels: ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
                datasets: [{
                    label: 'نشاط النظام',
                    data: [50, 75, activeUsers, 90, 110, 130, 150], // يمكن ربطها بتواريخ الدخول
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    tension: 0.4,
                    fill: true
                }]
            }
        });

        // 2. رسم بياني للذكاء الاصطناعي وبنك الأسئلة
        new Chart(document.getElementById('aiUsageChart'), {
            type: 'doughnut',
            data: {
                labels: ['أسئلة في البنك الحالي', 'أسئلة تم تصديرها', 'عمليات تنسيق'],
                datasets: [{
                    data: [generatedQuestions, 45, 12],
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b']
                }]
            }
        });

        // 3. رسم بياني للأكواد
        new Chart(document.getElementById('codesUsageChart'), {
            type: 'bar',
            data: {
                labels: ['أكواد مستخدمة', 'أكواد متاحة'],
                datasets: [{
                    label: 'إحصائيات التفعيل',
                    data: [35, 100], // يمكن ربطها بكوليكشن الأكواد
                    backgroundColor: ['#ef4444', '#10b981']
                }]
            }
        });

    } catch (error) {
        console.error("خطأ في جلب بيانات لوحة الإدارة: ", error);
        showToast("حدث خطأ أثناء تحميل الإحصائيات", "error");
    }
}
async function extractTextFromImage(e) {
    const file = e.target.files[0];
    if (!file) return;

    showToast('جاري قراءة الصورة واستخراج النص.. قد يستغرق هذا بضع ثوانٍ ⏳', 'info');

    try {
        // استخدام Tesseract لدعم اللغتين العربية والإنجليزية معاً
        const result = await Tesseract.recognize(
            file,
            'ara+eng',
            { logger: m => console.log(m) } // يمكنك إزالة هذا السطر لاحقاً، هو فقط لمتابعة التقدم في الـ Console
        );

        const extractedText = result.data.text;

        // إدراج النص المستخرج في محرر الأسئلة
        document.getElementById('questionsInput').focus();

        // تحويل الأسطر إلى فواصل <br> ليتم إدراجها بشكل صحيح كـ HTML
        const formattedText = extractedText.replace(/\n/g, '<br>');
        document.execCommand('insertHTML', false, formattedText + '<br>');

        showToast('✅ تم استخراج النص بنجاح! يمكنك تعديله الآن.', 'success');

        syncTextToDatabase();
        autoSaveData();
    } catch (error) {
        console.error(error);
        showToast('❌ حدث خطأ أثناء تحليل الصورة، تأكد من وضوحها.', 'error');
    }

    e.target.value = ''; // تفريغ الحقل
}
// ==================================================
// نظام تغيير كلمة المرور من داخل المنصة
// ==================================================
function openChangePasswordModal() {
    document.getElementById('changePasswordModal').style.display = 'flex';
    document.getElementById('oldPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmNewPasswordInput').value = '';
}

async function handleChangePassword() {
    const oldPass = document.getElementById('oldPasswordInput').value.trim();
    const newPass = document.getElementById('newPasswordInput').value.trim();
    const confirmPass = document.getElementById('confirmNewPasswordInput').value.trim();

    if (!oldPass || !newPass || !confirmPass) {
        return showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
    }

    if (newPass !== confirmPass) {
        return showToast('❌ كلمتا المرور الجديدتان غير متطابقتين', 'error');
    }

    if (newPass.length < 6) {
        return showToast('⚠️ يجب أن يتكون الباسورد من 6 أحرف أو أرقام على الأقل', 'error');
    }

    const user = auth.currentUser;
    if (!user) return;

    try {
        showToast('جاري التحقق من الباسورد القديم وتغييره...', 'info');

        // 1. إعادة المصادقة باستخدام الباسورد القديم (للتأكد من هوية صاحب الحساب)
        const credential = firebase.auth.EmailAuthProvider.credential(user.email, oldPass);
        await user.reauthenticateWithCredential(credential);

        // 2. تحديث الباسورد بالجديد
        await user.updatePassword(newPass);

        showToast('✅ تم تغيير كلمة المرور بنجاح!', 'success');
        document.getElementById('changePasswordModal').style.display = 'none';

    } catch (error) {
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            showToast('❌ الباسورد القديم الذي أدخلته غير صحيح!', 'error');
        } else if (error.code === 'auth/requires-recent-login') {
            showToast('⚠️ يرجى تسجيل الخروج والدخول مجدداً أولاً لتغيير الباسورد', 'error');
        } else {
            showToast('❌ حدث خطأ: ' + error.message, 'error');
        }
    }
}
let speechRecog = null;

function toggleSpeechRecognition(targetId, btnEl) {
    // 1. التحقق من دعم المتصفح
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('متصفحك لا يدعم الإملاء الصوتي. يرجى استخدام Google Chrome.', 'error');
        return;
    }

    // 2. إيقاف التسجيل إذا كان الزر مضغوطاً مسبقاً (يعمل كزر تشغيل/إيقاف)
    if (speechRecog && btnEl.classList.contains('listening')) {
        speechRecog.stop();
        btnEl.classList.remove('listening');
        btnEl.innerHTML = '🎙️ إملاء';
        btnEl.style.color = '#8b5cf6';
        return;
    }

    // 3. تهيئة الميكروفون
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecog = new SpeechRecognition();

    // تحديد اللغة بناءً على نظامك (عربي أو إنجليزي)
    let isForeign = (typeof currentQuestionSystem !== 'undefined' && currentQuestionSystem === 'foreign');
    speechRecog.lang = isForeign ? 'en-US' : 'ar-SA';
    speechRecog.continuous = true;
    speechRecog.interimResults = true;

    // 4. عند بدء التحدث
    speechRecog.onstart = function () {
        btnEl.classList.add('listening');
        btnEl.innerHTML = '🔴 تحدث...';
        btnEl.style.color = '#ef4444';
        showToast('جاري الاستماع... تحدث الآن.', 'info');
    };

    // 5. عند التقاط الكلمات
    speechRecog.onresult = function (event) {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            }
        }

        // إدراج النص المكتوب في المحرر مكان وقوف المؤشر
        if (finalTranscript) {
            const editor = document.getElementById(targetId);
            if (editor) {
                editor.focus();
                document.execCommand('insertText', false, finalTranscript + ' ');

                // حفظ البيانات آلياً (استدعاء دوالك الأصلية)
                if (typeof syncTextToDatabase === 'function') syncTextToDatabase();
                if (typeof autoSaveData === 'function') autoSaveData();
            }
        }
    };

    // 6. التعامل مع الأخطاء (هنا ستعرف سبب المشكلة بالضبط)
    speechRecog.onerror = function (event) {
        let errorMsg = 'حدث خطأ غير معروف في الميكروفون.';

        if (event.error === 'not-allowed') {
            errorMsg = '❌ المتصفح يمنع الميكروفون! اضغط على (علامة القفل 🔒) أعلى المتصفح بجوار الرابط واسمح للميكروفون.';
        } else if (event.error === 'no-speech') {
            errorMsg = '⚠️ لم أسمع شيئاً! الرجاء التحدث بصوت أعلى.';
        } else if (event.error === 'network') {
            errorMsg = '❌ الإملاء الصوتي يحتاج إلى اتصال بالإنترنت.';
        }

        showToast(errorMsg, 'error');
        btnEl.classList.remove('listening');
        btnEl.innerHTML = '🎙️ إملاء';
        btnEl.style.color = '#8b5cf6';
    };

    // 7. عند الانتهاء أو التوقف
    speechRecog.onend = function () {
        btnEl.classList.remove('listening');
        btnEl.innerHTML = '🎙️ إملاء';
        btnEl.style.color = '#8b5cf6';
    };

    // تشغيل المايك
    speechRecog.start();
}
// إصلاح ذكي لإخفاء/إظهار زر الحساب المستقبلي بناءً على حالة تسجيل الدخول
firebase.auth().onAuthStateChanged((user) => {
    const profileBtnWrapper = document.querySelector('.f-profile-wrapper');
    if (profileBtnWrapper) {
        // إذا كان هناك مستخدم، أظهر الزر، وإلا قم بإخفائه
        profileBtnWrapper.style.display = user ? 'block' : 'none';
    }
});
// --- دوال التحكم في حساب المستخدم للواجهة الجديدة ---

function logoutUser() {
    firebase.auth().signOut().then(() => {
        window.location.reload();
    });
}

function changePassword() {
    const user = firebase.auth().currentUser;
    if (user && user.email) {
        firebase.auth().sendPasswordResetEmail(user.email)
            .then(() => alert('تم إرسال رابط تغيير كلمة المرور إلى إيميلك بنجاح!'))
            .catch(error => alert('حدث خطأ: ' + error.message));
    }
}

function deleteAccount() {
    if (confirm('تحذير خطير: هل أنت متأكد من حذف حسابك نهائياً؟ سيتم مسح كل بياناتك ولن تتمكن من التراجع.')) {
        firebase.auth().currentUser.delete()
            .then(() => window.location.reload())
            .catch(error => alert('لأسباب أمنية، يجب تسجيل الخروج ثم الدخول مجدداً قبل حذف الحساب.'));
    }
}

function showStatsModal() {
    const modal = document.getElementById('adminPanelModal');
    if (modal) {
        modal.style.display = 'flex';
        closeCustomDropdown('profileDropdownMenu'); // لإغلاق القائمة المنسدلة عند الفتح
    }
}
// ========================================================
// 📷 المحرك المؤسسي للتصحيح الإلكتروني (Enterprise OMR Engine)
// ========================================================
let scannerStream = null;
let gradingVault = []; 

async function openScannerModal() {
    const selectEl = document.getElementById('scannerExamSelect');
    selectEl.innerHTML = '<option value="">جاري المزامنة مع السحابة... ☁️</option>';
    document.getElementById('scannerModal').style.display = 'flex';
    document.getElementById('scannerResult').innerHTML = `
        <div style="padding: 30px; color: #64748b; font-weight: bold; display: flex; flex-direction: column; align-items: center; gap: 10px;">
            <i class='bx bx-qr-scan' style="font-size: 40px; opacity: 0.5;"></i>
            اختر الامتحان من الأعلى، وجه الكاميرا، واضغط مسح.
        </div>`;

    const user = auth.currentUser;
    let cloudVault = [];
    
    // 1. جلب الامتحانات من حسابك السحابي أولاً (إذا فتحت من جهاز آخر)
    if (user) {
        try {
            const docSnap = await db.collection('users').doc(user.uid).get();
            if (docSnap.exists && docSnap.data().omrVault) {
                cloudVault = docSnap.data().omrVault;
                await localforage.setItem('elalfey_grading_vault', cloudVault); // تحديث الجهاز المحلي
            }
        } catch(e) { console.error('Cloud fetch failed', e); }
    }

    // 2. الاعتماد على النسخة السحابية إن وجدت، أو المحلية
    gradingVault = await localforage.getItem('elalfey_grading_vault') || [];
    if (cloudVault.length > 0) gradingVault = cloudVault;

    if (gradingVault.length === 0) {
        selectEl.innerHTML = '<option value="">الخزنة فارغة! قم بتوليد نماذج أولاً.</option>';
    } else {
        selectEl.innerHTML = '';
        gradingVault.forEach(exam => {
            let opt = document.createElement('option');
            opt.value = exam.id;
            opt.innerText = exam.title;
            selectEl.appendChild(opt);
        });
    }

    // تشغيل الكاميرا
    navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } 
    })
    .then(function(stream) {
        scannerStream = stream;
        const video = document.getElementById('scannerVideo');
        video.srcObject = stream;
        video.play();
    })
    .catch(function(err) {
        showToast('❌ لا يمكن الوصول للكاميرا. يرجى إعطاء الصلاحية للمتصفح.', 'error');
    });
}

function closeScannerModal() {
    document.getElementById('scannerModal').style.display = 'none';
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
}
async function deleteExamFromVault() {
    const selectEl = document.getElementById('scannerExamSelect');
    const selectedId = selectEl.value;

    if (!selectedId) return showToast('يرجى اختيار امتحان لحذفه', 'error');
    if (!confirm('هل أنت متأكد من حذف مفاتيح إجابة هذا الامتحان؟')) return;

    // الحذف من الذاكرة المحلية
    gradingVault = gradingVault.filter(exam => exam.id !== selectedId);
    await localforage.setItem('elalfey_grading_vault', gradingVault);

    // الحذف من السحابة بقوة (باستخدام set لتجنب أخطاء update)
    const user = auth.currentUser;
    if (user) {
        try {
            await db.collection('users').doc(user.uid).set({ omrVault: gradingVault }, { merge: true });
        } catch(e) { console.error('Cloud delete failed', e); }
    }

    showToast('تم حذف الامتحان المحدد بنجاح 🗑️', 'success');
    
    // تحديث القائمة
    selectEl.innerHTML = '';
    if (gradingVault.length === 0) {
        selectEl.innerHTML = '<option value="">الخزنة فارغة حالياً</option>';
    } else {
        gradingVault.forEach(exam => {
            let opt = document.createElement('option');
            opt.value = exam.id;
            opt.innerText = exam.title;
            selectEl.appendChild(opt);
        });
    }
}

// دالة تفريغ الخزنة بالكامل
async function clearEntireVault() {
    if (!confirm('⚠️ تحذير: هل أنت متأكد من مسح جميع الامتحانات من الخزنة نهائياً؟')) return;

    gradingVault = [];
    await localforage.setItem('elalfey_grading_vault', []);

    const user = auth.currentUser;
    if (user) {
        try {
            await db.collection('users').doc(user.uid).set({ omrVault: [] }, { merge: true });
        } catch(e) {}
    }

    showToast('تم تفريغ الخزنة بالكامل بنجاح 🗑️', 'success');
    
    const selectEl = document.getElementById('scannerExamSelect');
    selectEl.innerHTML = '<option value="">الخزنة فارغة حالياً</option>';
}

async function captureAndGradeEnterprise() {
    const video = document.getElementById('scannerVideo');
    const canvas = document.getElementById('scannerCanvas');
    const resultDiv = document.getElementById('scannerResult');
    const selectedExamId = document.getElementById('scannerExamSelect').value;
    
    if (!video.videoWidth) return;
    if (!selectedExamId) {
        showToast('يرجى اختيار امتحان من القائمة أولاً', 'error');
        return;
    }

    const targetExam = gradingVault.find(e => e.id === selectedExamId);
    if(!targetExam) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/jpeg', 0.9);

    // 💡 إصلاح CSS الحاوية الرئيسية: جعلها مرنة، تسمح بالتمدد، وتجبر العناصر الداخلية على استخدام كامل العرض
    resultDiv.style.cssText = 'width: 100%; display: flex; flex-direction: column; align-items: stretch; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 16px; box-sizing: border-box;';
    
    // شاشة التحميل (Loading)
    resultDiv.innerHTML = `
        <div style="padding: 40px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px; background: rgba(16, 185, 129, 0.05); border-radius: 12px;">
            <i class="bx bx-loader-alt bx-spin" style="font-size: 45px; color: #10b981;"></i>
            <span style="font-weight: 900; color: #10b981; font-size: 16px;">جاري إرسال الورقة للمعالجة...⏳</span>
            <span style="font-size: 12px; color: #f59e0b; text-align: center;">💡 تنويه: إذا كانت هذه أول ورقة، قد يستغرق السيرفر 30 ثانية للاستيقاظ. يرجى الانتظار!</span>
        </div>`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); 

       const manualModel = document.getElementById('manualModelSelect').value; 

        const response = await fetch('https://eyad26.pythonanywhere.com/api/grade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: imageData,
                modelsKeys: targetExam.modelsKeys,
                manualModel: manualModel 
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId); 
        const result = await response.json();

        if (!result.success) throw new Error(result.error || "فشل السيرفر في تحليل الصورة.");

        const percentage = result.percentage;
        let gradeColor = percentage >= 85 ? '#10b981' : percentage >= 65 ? '#3b82f6' : percentage >= 50 ? '#f59e0b' : '#ef4444';
        let gradeText = percentage >= 85 ? 'ممتاز' : percentage >= 65 ? 'جيد جداً' : percentage >= 50 ? 'مقبول' : 'راسب';

        // ترويسة النتيجة الرئيسية
        let mainResultHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.05); border-radius: 12px 12px 0 0;">
                <div style="text-align: right;">
                    <span style="color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">الحالة</span><br>
                    <strong style="color: #fff; font-size: 14px;">${result.studentId}</strong>
                </div>
                <div style="text-align: center;">
                    <span style="color: #94a3b8; font-size: 11px;">النموذج (رؤية حاسوبية)</span><br>
                    <strong style="color: #c084fc; font-size: 14px;"><i class='bx bx-barcode-reader'></i> ${result.detectedModel}Strong>
                </div>
                <div style="text-align: left; background: ${gradeColor}20; padding: 5px 15px; border-radius: 20px; border: 1px solid ${gradeColor}50;">
                    <span style="color: ${gradeColor}; font-weight: 900; font-size: 14px;">التقييم: ${gradeText}</span>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: rgba(255,255,255,0.05); border-radius: 0 0 12px 12px; overflow: hidden; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div style="padding: 10px; background: #0f172a; text-align: center;"><span style="color: #64748b; font-size: 10px;">الأسئلة</span><br><strong style="color: #fff; font-size: 16px;">${result.totalQuestions}</strong></div>
                <div style="padding: 10px; background: #0f172a; text-align: center;"><span style="color: #64748b; font-size: 10px;">صحيحة</span><br><strong style="color: #10b981; font-size: 16px;">${result.correctAnswers}</strong></div>
                <div style="padding: 10px; background: #0f172a; text-align: center;"><span style="color: #64748b; font-size: 10px;">خاطئة</span><br><strong style="color: #ef4444; font-size: 16px;">${result.wrongAnswers}</strong></div>
                <div style="padding: 10px; background: #0f172a; text-align: center;"><span style="color: #64748b; font-size: 10px;">النسبة</span><br><strong style="color: ${gradeColor}; font-size: 16px;">${result.percentage}%</strong></div>
            </div>`;

        // 💡 إصلاح شبكة الأسئلة (CSS Grid): جعل الحاوية قابلة للتمرير بارتفاع أكبر، خلفية داكنة، وتهيئة مرنة للأعمدة (110px).
        let detailsHtml = '<div style="margin-top: 15px; max-height: 400px; overflow-y: auto; background: #0f172a; border-radius: 12px; padding: 15px; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; box-sizing: border-box;">';
        
        if(result.details) {
            result.details.forEach(d => {
                let color = d.ok ? '#10b981' : '#ef4444';
                let icon = d.ok ? '✅' : '❌';
                detailsHtml += `
                    <div style="background: rgba(255,255,255,0.05); border: 1px solid ${color}50; padding: 8px; border-radius: 8px; text-align: center;">
                        <div style="color: #94a3b8; font-size: 11px;">سؤال ${d.q}</div>
                        <div style="color: #fff; font-size: 13px; font-weight: bold; margin: 4px 0;">الطالب: <span style="color: ${color};">${d.stu}</span></div>
                        <div style="color: #64748b; font-size: 11px;">الإجابة: ${d.cor} ${icon}</div>
                    </div>`;
            });
        }
        detailsHtml += '</div>';

        // دمج النتائج
        resultDiv.innerHTML = mainResultHtml + detailsHtml;
        showToast('تم التصحيح بنجاح!', 'success');

    } catch (err) {
        // إدارة الأخطاء (تظل كما هي لضمان عدم تعطل النظام)
        if (err.name === 'AbortError') {
            resultDiv.innerHTML = `
            <div style="width: 100%; padding: 30px 20px; text-align: center; background: rgba(245, 158, 11, 0.1); border-radius: 12px;">
                <i class='bx bx-time-five' style="font-size: 40px; color: #f59e0b; margin-bottom: 10px;"></i><br>
                <strong style="color: #f59e0b; font-size: 15px;">انتهى وقت الاتصال بالسيرفر!</strong><br>
                <span style="color: #fcd34d; font-size: 13px;">لقد استيقظ السيرفر الآن بالفعل. من فضلك اضغط على (مسح وتصحيح) مرة أخرى وستعمل فوراً.</span>
            </div>`;
        } else {
            resultDiv.innerHTML = `
            <div style="width: 100%; padding: 30px 20px; text-align: center; background: rgba(239, 68, 68, 0.1); border-radius: 12px;">
                <i class='bx bx-error-circle' style="font-size: 40px; color: #ef4444; margin-bottom: 10px;"></i><br>
                <strong style="color: #ef4444; font-size: 15px;">خطأ في التصحيح</strong><br>
                <span style="color: #fca5a5; font-size: 13px;">يرجى التأكد من جودة الصورة وتجربة الرفع مرة أخرى. التفاصيل: ${err.message}</span>
            </div>`;
        }
    }
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const resultDiv = document.getElementById('scannerResult');
    const selectedExamId = document.getElementById('scannerExamSelect').value;
    
    if (!selectedExamId) {
        showToast('يرجى اختيار امتحان من القائمة أولاً', 'error');
        event.target.value = ''; 
        return;
    }

    const targetExam = gradingVault.find(e => e.id === selectedExamId);
    if(!targetExam) return;

    resultDiv.style.cssText = 'width: 100%; display: flex; flex-direction: column; align-items: stretch; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 16px; box-sizing: border-box;';
    resultDiv.innerHTML = `
        <div style="padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 15px;">
            <i class="bx bx-loader-alt bx-spin" style="font-size: 45px; color: #8b5cf6;"></i>
            <span style="font-weight: 900; color: #8b5cf6; font-size: 16px;">جاري ضغط ومعالجة الصورة...</span>
        </div>`;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = async function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200; 
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000); 
                const manualModelValue = document.getElementById('manualModelSelect') ? document.getElementById('manualModelSelect').value : 'auto';

                const response = await fetch('https://eyad26.pythonanywhere.com/api/grade', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: compressedBase64, modelsKeys: targetExam.modelsKeys, manualModel: manualModelValue }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                const result = await response.json();

                if (!result.success) throw new Error(result.error || "فشل السيرفر في تحليل الصورة.");

                const percentage = result.percentage;
                let gradeColor = percentage >= 85 ? '#10b981' : percentage >= 65 ? '#3b82f6' : percentage >= 50 ? '#f59e0b' : '#ef4444';
                let gradeText = percentage >= 85 ? 'ممتاز' : percentage >= 65 ? 'جيد' : percentage >= 50 ? 'مقبول' : 'راسب';

                let html = `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.05); border-radius: 12px 12px 0 0;">
                        <div style="text-align: right;">
                            <span style="color: #94a3b8; font-size: 11px;">الحالة</span><br>
                            <strong style="color: #fff; font-size: 14px;">${result.studentId}</strong>
                        </div>
                        <div style="text-align: center;">
                            <span style="color: #94a3b8; font-size: 11px;">النموذج</span><br>
                            <strong style="color: #c084fc; font-size: 14px;">${result.detectedModel}</strong>
                        </div>
                        <div style="text-align: left; background: ${gradeColor}20; padding: 5px 10px; border-radius: 12px; border: 1px solid ${gradeColor}50;">
                            <span style="color: ${gradeColor}; font-weight: bold; font-size: 13px;">${gradeText}</span>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; background: rgba(255,255,255,0.05); border-radius: 0 0 12px 12px; overflow: hidden;">
                        <div style="padding: 10px; background: #0f172a; text-align: center;"><span style="color: #64748b; font-size: 10px;">الأسئلة</span><br><strong style="color: #fff; font-size: 16px;">${result.totalQuestions}</strong></div>
                        <div style="padding: 10px; background: #0f172a; text-align: center;"><span style="color: #64748b; font-size: 10px;">صحيحة</span><br><strong style="color: #10b981; font-size: 16px;">${result.correctAnswers}</strong></div>
                        <div style="padding: 10px; background: #0f172a; text-align: center;"><span style="color: #64748b; font-size: 10px;">خاطئة</span><br><strong style="color: #ef4444; font-size: 16px;">${result.wrongAnswers}</strong></div>
                        <div style="padding: 10px; background: #0f172a; text-align: center;"><span style="color: #64748b; font-size: 10px;">النسبة</span><br><strong style="color: ${gradeColor}; font-size: 16px;">${result.percentage}%</strong></div>
                    </div>`;

                let detailsHtml = '<div style="margin-top: 15px; max-height: 250px; overflow-y: auto; background: #0f172a; border-radius: 12px; padding: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 8px;">';
                if(result.details) {
                    result.details.forEach(d => {
                        let color = d.ok ? '#10b981' : '#ef4444';
                        let icon = d.ok ? '✅' : '❌';
                        detailsHtml += `
                            <div style="background: rgba(255,255,255,0.05); border: 1px solid ${color}50; padding: 6px; border-radius: 8px; text-align: center;">
                                <div style="color: #94a3b8; font-size: 10px; font-weight: bold; border-bottom: 1px solid #334155; padding-bottom: 3px; margin-bottom: 3px;">سؤال ${d.q}</div>
                                <div style="color: #fff; font-size: 11px;">الطالب: <span style="color: ${color}; font-weight: bold;">${d.stu}</span></div>
                                <div style="color: #64748b; font-size: 10px; margin-top: 2px;">الصحيح: ${d.cor} ${icon}</div>
                            </div>`;
                    });
                }
                detailsHtml += '</div>';
                
                resultDiv.innerHTML = html + detailsHtml;
                showToast('تم التصحيح بنجاح!', 'success');

            } catch (err) {
                resultDiv.innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444;">خطأ: ${err.message}</div>`;
            }
            event.target.value = ''; 
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
function renderOMRBarcodes() {
    if (typeof QRCode === 'undefined') return;
    document.querySelectorAll('.omr-qr').forEach(el => {
        if (el.innerHTML !== '') return; // لتجنب التكرار
        new QRCode(el, {
            text: "MH_PRO_ID_" + el.getAttribute('data-qr'),
            width: 30,
            height: 30,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.L
        });
    });
}
/* ========================================================
   🏫 محرك منصة المعلم (LMS) وتوليد الأسئلة بالذكاء الاصطناعي
   ======================================================== */

// ========================================================
// 1. نافذة توليد الأسئلة الذكي من اسم الدرس (مربوطة بالتسجيل والباقة)
// ========================================================
function generateFromLessonPrompt() {
    // 💡 حماية 1: التحقق من تسجيل الدخول
    const user = auth.currentUser;
    if (!user) {
        showToast('⚠️ يرجى إنشاء حساب مجاني أو تسجيل الدخول أولاً!', 'error');
        if (typeof openLoginModal === 'function') openLoginModal();
        return;
    }

    // 💡 حماية 2: فحص الباقة (يجب أن يكون في الـ 7 أيام التجريبية أو VIP)
    let expiry = localStorage.getItem('elalfey_vip_expiry');
    let isVIP = (expiry === 'lifetime' || (expiry && parseInt(expiry) > Date.now()));

    if (!isVIP) {
        // تسجيل الإجراء عشان يكمل التوليد تلقائياً أول ما يدخل الكود
        window.pendingAction = 'lesson_ai';
        document.getElementById('vipModalText').innerText = "لقد انتهت الفترة التجريبية لحسابك. يرجى تفعيل الـ VIP لمواصلة استخدام الذكاء الاصطناعي.";
        document.getElementById('vipModal').style.display = 'flex';
        return;
    }

    // إنشاء النافذة المنبثقة برمجياً إذا لم تكن موجودة
    if (!document.getElementById('aiGenerateModal')) {
        const modalHtml = `
        <div id="aiGenerateModal" class="custom-modal" style="z-index: 999999;">
            <div class="modal-content" style="max-width: 500px; text-align: right; background: var(--ui-container); border: 1px solid var(--ui-border);">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #8b5cf6; padding-bottom: 15px; margin-bottom: 20px;">
                    <h2 style="margin: 0; color: #8b5cf6; display: flex; align-items: center; gap: 8px;"><i class='bx bx-brain'></i> توليد ذكي للأسئلة</h2>
                    <button onclick="document.getElementById('aiGenerateModal').style.display='none'" style="background: #fee2e2; color: #ef4444; border: none; width: 35px; height: 35px; border-radius: 8px; font-size: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center;">✖</button>
                </div>
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="font-weight: bold; color: var(--ui-text); display: block; margin-bottom: 8px; font-size: 14px;">اسم الدرس أو الموضوع:</label>
                    <input type="text" id="aiLessonName" placeholder="مثال: الحملة الفرنسية، قوانين نيوتن..." style="width: 100%; padding: 12px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-input-bg); color: var(--ui-text); font-family: inherit; font-size: 14px; outline: none; box-sizing: border-box;">
                </div>
                
                <div style="display: flex; gap: 15px; margin-bottom: 25px;">
                    <div class="form-group" style="flex: 1;">
                        <label style="font-weight: bold; color: var(--ui-text); display: block; margin-bottom: 8px; font-size: 13px;">أسئلة اختياري (MCQ):</label>
                        <input type="number" id="aiMcqCount" value="5" min="0" max="50" style="width: 100%; padding: 12px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-input-bg); color: var(--ui-text); font-family: inherit; font-size: 14px; outline: none; box-sizing: border-box;">
                    </div>
                    <div class="form-group" style="flex: 1;">
                        <label style="font-weight: bold; color: var(--ui-text); display: block; margin-bottom: 8px; font-size: 13px;">أسئلة صح/خطأ (T/F):</label>
                        <input type="number" id="aiTfCount" value="2" min="0" max="50" style="width: 100%; padding: 12px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-input-bg); color: var(--ui-text); font-family: inherit; font-size: 14px; outline: none; box-sizing: border-box;">
                    </div>
                </div>
                
                <button onclick="executeAIGeneration()" style="width: 100%; background: linear-gradient(135deg, #8b5cf6, #6d28d9); color: white; border: none; padding: 15px; border-radius: 10px; font-size: 16px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3); transition: 0.3s; font-family: inherit;">
                    ✨ ابدأ التوليد الآن
                </button>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    document.getElementById('aiLessonName').value = '';
    document.getElementById('aiGenerateModal').style.display = 'flex';
}
// الدالة التي تنفذ التوليد الفعلي بعد تحديد العدد
async function executeAIGeneration() {
    const lessonName = document.getElementById('aiLessonName').value.trim();
    const mcqCount = parseInt(document.getElementById('aiMcqCount').value) || 0;
    const tfCount = parseInt(document.getElementById('aiTfCount').value) || 0;

    if (!lessonName) {
        showToast('يرجى إدخال اسم الدرس أولاً', 'error');
        return;
    }
    if (mcqCount === 0 && tfCount === 0) {
        showToast('يرجى تحديد عدد الأسئلة المطلوب', 'error');
        return;
    }

    // إغلاق النافذة المنبثقة
    document.getElementById('aiGenerateModal').style.display = 'none';

    // النقل الآلي لتبويب بنك الأسئلة
    const btnTabQ = document.getElementById('btnTabQuestions');
    if(btnTabQ) switchTab('questions', btnTabQ);

    showToast('جاري توليد الأسئلة من الدرس عبر الذكاء الاصطناعي... ⏳', 'info');

    // =========================================================
    // 💡 بداية شاشة التحميل الأنيقة داخل المحرر
    // =========================================================
    let qInput = document.getElementById('questionsInput');
    let originalHTML = qInput.innerHTML; 
    
    // تفريغ المحرر إذا كان مجرد نص افتراضي
    if (originalHTML.includes('اكتب العنوان الرئيسي هنا') || originalHTML.trim() === '' || originalHTML === '<br>') {
        originalHTML = '';
    }

    // حقن شاشة التحميل في أعلى المحرر
    qInput.innerHTML = `
        <div id="aiLoadingUI" contenteditable="false" style="text-align: center; padding: 40px 20px; background: rgba(139, 92, 246, 0.05); border: 2px dashed #8b5cf6; border-radius: 12px; margin: 15px 0; user-select: none;">
            <h2 style="color: #8b5cf6; margin: 0 0 10px 0;">⏳ الذكاء الاصطناعي يعمل الآن...</h2>
            <p style="color: #64748b; font-weight: bold; margin: 0;">جاري صياغة الأسئلة عن درس "${lessonName}"، يرجى الانتظار بضع ثوانٍ...</p>
        </div>
    ` + originalHTML;
    // =========================================================

    // دمج المتغيرات الجديدة في أمر الذكاء الاصطناعي
    const systemInstruction = `أنت خبير وضع امتحانات. قم بإنشاء ${mcqCount} أسئلة اختيار من متعدد (MCQ) و ${tfCount} أسئلة صواب وخطأ (T/F) عن درس: "${lessonName}".
المخرج يجب أن يكون مصفوفة JSON فقط بهذا التنسيق وبدون أي نصوص أخرى:
[
  { "type": "mcq", "text": "نص السؤال هنا؟", "options": [{"l":"أ", "t":"الخيار الأول"}, {"l":"ب", "t":"الخيار الثاني"}], "ans": "أ" },
  { "type": "tf_inline", "text": "نص عبارة الصح والخطأ هنا", "ans": "صح" }
]`;

    try {
        const response = await fetch('/api/generate', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parts: [{ text: systemInstruction }] })
        });

        if (!response.ok) throw new Error("فشل الاتصال بمولد الذكاء الاصطناعي");
        
        const data = await response.json();
        if (!data.candidates || data.candidates.length === 0) throw new Error("لا توجد استجابة.");
        
        let aiResponse = data.candidates[0].content.parts[0].text.trim();
        
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("التنسيق المُرجع غير صالح، جرب تقليل العدد قليلاً");
        
        const generatedQuestions = JSON.parse(jsonMatch[0]);
        
        // =========================================================
        // 💡 إزالة شاشة التحميل بعد انتهاء الذكاء الاصطناعي بنجاح
        // =========================================================
        let loadingUI = document.getElementById('aiLoadingUI');
        if (loadingUI) loadingUI.remove();
        // =========================================================
        
        let generatedHTML = "<br>";

        generatedQuestions.forEach(q => {
            generatedHTML += `<div>1. ${q.text} #توليد_ذكي</div>`;
            if (q.type === 'mcq' && q.options) {
                q.options.forEach(o => {
                    let check = (o.l == q.ans || o.t == q.ans) ? " [✓]" : "";
                    generatedHTML += `<div>${o.l}) ${o.t}${check}</div>`;
                });
            } else if (q.type === 'tf_inline') {
                generatedHTML += `<div>( ${q.ans} )</div>`;
            }
            generatedHTML += "<br>";
        });

        qInput.innerHTML += generatedHTML;
        
        if (typeof smartFormatAndClean === 'function') {
            smartFormatAndClean(); 
        }
        
        showToast('✅ تم توليد الأسئلة وإدراجها وتنسيقها بنجاح!', 'success');

    } catch (error) {
        // =========================================================
        // 💡 في حالة الخطأ: إزالة شاشة التحميل واسترجاع المحتوى الأصلي
        // =========================================================
        qInput.innerHTML = originalHTML;
        showToast('❌ حدث خطأ أثناء التوليد: ' + error.message, 'error');
    }
}
// ========================================================
// 2. إدارة الفصول والطلاب (Cloud Firestore)
// ========================================================

// جلب وعرض الفصول من السحابة
// جلب وعرض الفصول من السحابة (محدثة بزر حذف الفصل)
async function loadClassroomsFromCloud() {
    const user = auth.currentUser;
    if (!user) return;

    const grid = document.getElementById('classroomsGrid');
    
    try {
        const docSnap = await db.collection('users').doc(user.uid).get();
        let classrooms = [];
        if (docSnap.exists && docSnap.data().classrooms) {
            classrooms = docSnap.data().classrooms;
        }

        let totalStudents = 0;
        let html = '';

        if (classrooms.length === 0) {
            html = `
            <div style="padding: 40px; text-align: center; background: rgba(255,255,255,0.5); border: 2px dashed #cbd5e1; border-radius: 16px; grid-column: 1 / -1;">
                <i class='bx bx-folder-plus' style="font-size: 48px; color: #94a3b8; margin-bottom: 15px;"></i>
                <h4 style="color: #475569; margin: 0 0 10px 0;">لا توجد فصول حالياً</h4>
                <p style="color: #64748b; font-size: 13px;">قم بإنشاء فصلك الأول لإضافة الطلاب ومتابعة تقاريرهم.</p>
            </div>`;
        } else {
            classrooms.forEach(cls => {
                let studentsCount = cls.students ? cls.students.length : 0;
                totalStudents += studentsCount;
                
                html += `
                <div style="background: var(--ui-container); border: 1px solid var(--ui-border); border-radius: 16px; padding: 20px; box-shadow: 0 5px 15px rgba(0,0,0,0.03); display: flex; flex-direction: column; justify-content: space-between;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px dashed var(--ui-border); padding-bottom: 15px; margin-bottom: 15px;">
                        <div>
                            <h4 style="margin: 0 0 5px 0; color: var(--primary-color); font-size: 18px;">${cls.name}</h4>
                            <span style="font-size: 11px; color: #64748b;">تاريخ الإنشاء: ${cls.createdAt || 'غير محدد'}</span>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <div style="background: #eff6ff; color: #3b82f6; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px;">
                                ${studentsCount}
                            </div>
                            <!-- زر حذف الفصل -->
                            <button onclick="deleteClassroom('${cls.id}')" title="حذف الفصل" style="background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; width: 35px; height: 35px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer; transition: 0.2s;">
                                <i class='bx bx-trash'></i>
                            </button>
                        </div>
                    </div>
                    <button onclick="viewClassDetails('${cls.id}')" style="width: 100%; background: #f8fafc; color: #1e293b; border: 1px solid #cbd5e1; padding: 12px; border-radius: 10px; cursor: pointer; font-weight: bold; font-family: inherit; transition: 0.2s;">
                        <i class='bx bx-list-ul'></i> عرض الطلاب والدرجات
                    </button>
                </div>`;
            });
        }

        grid.innerHTML = html;

        // تحديث الإحصائيات وفحص الباقة
        document.getElementById('lmsTotalClasses').innerText = classrooms.length;
        
        let expiry = localStorage.getItem('elalfey_vip_expiry');
        let isVIP = (expiry === 'lifetime' || (expiry && parseInt(expiry) > Date.now()));
        
        const countDisplay = document.getElementById('lmsTotalStudents');
        const noticeDisplay = document.getElementById('lmsPlanNotice');

        if (isVIP) {
            countDisplay.innerText = `${totalStudents} / ∞`;
            countDisplay.style.color = "#10b981";
            noticeDisplay.innerText = "باقة VIP (غير محدودة)";
            noticeDisplay.style.background = "#d1fae5";
            noticeDisplay.style.color = "#047857";
        } else {
            countDisplay.innerText = `${totalStudents} / 30`;
            if (totalStudents >= 30) {
                countDisplay.style.color = "#ef4444";
                noticeDisplay.innerText = "وصلت للحد الأقصى للمجاني!";
                noticeDisplay.style.background = "#fee2e2";
                noticeDisplay.style.color = "#b91c1c";
            } else {
                countDisplay.style.color = "#0f172a";
                noticeDisplay.innerText = "الباقة المجانية";
                noticeDisplay.style.background = "#fef3c7";
                noticeDisplay.style.color = "#b45309";
            }
        }

    } catch(e) {}
}

// إنشاء فصل جديد
async function createNewClassroom() {
    const user = auth.currentUser;
    if (!user) return showToast('يرجى تسجيل الدخول لإنشاء فصول', 'error');

    let className = prompt("أدخل اسم الفصل (مثال: الصف الأول الثانوي - مجموعة أ):");
    if (!className || className.trim() === "") return;

    try {
        showToast('جاري إنشاء الفصل...', 'info');
        const docRef = db.collection('users').doc(user.uid);
        const docSnap = await docRef.get();
        
        let classrooms = [];
        if (docSnap.exists && docSnap.data().classrooms) {
            classrooms = docSnap.data().classrooms;
        }

        const newClass = {
            id: 'CLASS_' + Date.now(),
            name: className.trim(),
            students: [],
            createdAt: new Date().toLocaleDateString('ar-EG')
        };

        classrooms.push(newClass);
        await docRef.update({ classrooms: classrooms });
        
        showToast('✅ تم إنشاء الفصل بنجاح!', 'success');
        loadClassroomsFromCloud();

    } catch (e) {
        showToast('❌ حدث خطأ أثناء إنشاء الفصل', 'error');
    }
}

// عرض نافذة الفصل وإضافة طالب (محدثة بزر الحذف والمزامنة الآلية وزر التحديث السريع)
let currentViewedClassId = null;

async function viewClassDetails(classId) {
    const user = auth.currentUser;
    if (!user) return;

    currentViewedClassId = classId;
    
    try {
        const docSnap = await db.collection('users').doc(user.uid).get();
        if (!docSnap.exists) return;
        
        let classrooms = docSnap.data().classrooms || [];
        let targetClass = classrooms.find(c => c.id === classId);
        
        if (!targetClass) return;

        // 💡 إضافة زر التحديث السريع بجوار اسم الفصل (الإضافة الأولى)
        document.getElementById('modalClassName').innerHTML = `${targetClass.name} <button id="btnRefreshScores" onclick="syncOnlineScores('${classId}', window.tempClassroomsData, window.tempTargetClass)" style="margin-right: 15px; background: #e0e7ff; color: #3b82f6; border: 1px solid #bfdbfe; padding: 4px 10px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: bold; font-family: inherit;"><i class='bx bx-refresh'></i> تحديث الدرجات</button>`;
        
        // حفظ المتغيرات مؤقتاً عشان زر التحديث يشتغل
        window.tempClassroomsData = classrooms;
        window.tempTargetClass = targetClass;
        
        // 💡 استدعاء دالة رسم الجدول المحدثة
        renderStudentsTable(targetClass.students, classId);

        document.getElementById('btnAddStudentModal').onclick = () => addStudentToClass(classId);
        document.getElementById('classDetailsModal').style.display = 'flex';

        // 🚀 السحر هنا: استدعاء محرك المزامنة الخلفي لجلب الدرجات من السحابة وتحديثها آلياً
        syncOnlineScores(classId, classrooms, targetClass);

    } catch(e) {}
}

// دالة رسم الجدول (النسخة المستقرة والنظيفة + رادار الأخطاء)
function renderStudentsTable(students, classId, unlinkedResults = []) {
    let tbody = document.getElementById('modalStudentsList');
    tbody.innerHTML = '';

    if (!students || students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding: 20px; color: #64748b; text-align: center;">لا يوجد طلاب في هذا الفصل بعد.</td></tr>';
    } else {
        students.forEach((std, idx) => {
            let scoresHtml = '';
            
            // رص الامتحانات المتعددة للطالب
            if (std.examRecords && Object.keys(std.examRecords).length > 0) {
                Object.values(std.examRecords).forEach(record => {
                    let parts = record.split('|'); 
                    scoresHtml += `<div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 8px; margin-bottom: 6px; font-size: 12px; text-align: right; display: flex; justify-content: space-between; align-items: center;"><span style="color: var(--primary-color); font-weight: bold; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${parts[0]}</span> <span style="color: #10b981; font-weight: 900; direction: ltr; background: #d1fae5; padding: 2px 8px; border-radius: 6px;">${parts[1]}</span></div>`;
                });
            } else if (std.lastScore) { 
                scoresHtml = `<div style="color: #10b981; font-weight: 900; direction: ltr; display: inline-block; background: #d1fae5; padding: 4px 10px; border-radius: 6px;">${std.lastScore}</div>`;
            } else {
                scoresHtml = `<div style="color: #94a3b8; font-size: 12px; padding: 10px 0;">لم يمتحن بعد 📭</div>`;
            }

            tbody.innerHTML += `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 15px; color: #64748b;">${idx + 1}</td>
                <td style="padding: 15px; font-weight: bold; color: #1e293b;">${std.name}</td>
                <td style="padding: 15px; font-family: monospace; color: #64748b; font-size: 13px;">${std.id}</td>
                <td style="padding: 15px; min-width: 200px; vertical-align: top;">${scoresHtml}</td>
                <td style="padding: 15px; vertical-align: top;">
                    <button onclick="removeStudentFromClass('${classId}', '${std.id}')" title="حذف الطالب" style="background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; width: 35px; height: 35px; border-radius: 8px; cursor: pointer; font-size: 18px;"><i class='bx bx-trash'></i></button>
                </td>
            </tr>`;
        });
    }

    // 💡 عرض الأكواد التي امتحنت ولم يتم التعرف عليها (الإضافة الثانية - الرادار)
    if (unlinkedResults && unlinkedResults.length > 0) {
        tbody.innerHTML += `<tr><td colspan="5" style="background: #fffbeb; padding: 12px; text-align: center; font-weight: bold; color: #d97706; border-top: 3px dashed #fcd34d;">⚠️ درجات بكود خاطئ (طلاب أدخلوا كوداً غير موجود بالكشف)</td></tr>`;
        unlinkedResults.forEach(res => {
            let parts = res.record.split('|'); 
            tbody.innerHTML += `
            <tr style="background: #fef3c7; border-bottom: 1px solid #fde68a;">
                <td style="padding: 15px; color: #b45309;">❓</td>
                <td style="padding: 15px; font-weight: bold; color: #b45309;">طالب مجهول</td>
                <td style="padding: 15px; font-family: monospace; color: #ef4444; font-size: 13px; font-weight: bold;">${res.code}</td>
                <td style="padding: 15px; min-width: 200px; vertical-align: top;">
                    <div style="background: white; border: 1px solid #fcd34d; padding: 6px 10px; border-radius: 8px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #d97706; font-weight: bold;">${parts[0]}</span> 
                        <span style="color: #10b981; font-weight: 900; direction: ltr; background: #d1fae5; padding: 2px 8px; border-radius: 6px;">${parts[1]}</span>
                    </div>
                </td>
                <td style="padding: 15px;"></td>
            </tr>`;
        });
    }
}

// دالة مساعدة لتوحيد الحروف العربية وتجاهل الهمزات والتاء المربوطة (لمنع أخطاء إدخال الطلاب)
function normalizeArabicName(text) {
    if (!text) return "";
    return String(text)
        .replace(/[أإآا]/g, 'ا') // توحيد الألف
        .replace(/[يى]/g, 'ي')   // توحيد الياء
        .replace(/[ةه]/g, 'ه')   // توحيد التاء المربوطة والهاء
        .replace(/\s+/g, ' ')    // توحيد المسافات الزائدة
        .trim()
        .toLowerCase();
}

// 🚀 محرك المزامنة الآلي (بالمتوازيات + كاشف الأخطاء + فلتر الزمن السحري)
async function syncOnlineScores(classId, classrooms, targetClass) {
    const user = auth.currentUser;
    if(!user) return;
    
    try {
        let refreshBtn = document.getElementById('btnRefreshScores');
        if(refreshBtn) refreshBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> جاري السحب...";

        const examsSnap = await db.collection('online_exams')
            .where('teacherId', '==', user.uid)
            .get();
            
        let updated = false;
        let targetIndex = classrooms.findIndex(c => c.id === classId);
        let currentStudents = classrooms[targetIndex].students;
        let unlinkedResults = []; 
        
        const fetchPromises = examsSnap.docs.map(async (examDoc) => {
            let examData = examDoc.data();
            if (examData.classId !== classId && examData.classId !== 'all') return;

            const examTitle = examData.title || "امتحان بدون عنوان";
            const resultsSnap = await examDoc.ref.collection('results').get();
            
            resultsSnap.forEach(resDoc => {
                let resData = resDoc.data();
                let rawIdentifier = resData.studentIdentifier || resData.studentName || "غير معروف";
                let identifier = normalizeArabicName(rawIdentifier); 
                
                let studentIndex = currentStudents.findIndex(s => 
                    normalizeArabicName(s.id) === identifier || 
                    normalizeArabicName(s.name) === identifier
                );
                
                let formattedScore = resData.score + ' / ' + resData.total;
                let newRecord = `${examTitle}|${formattedScore}`;

                if(studentIndex > -1) {
                    let student = currentStudents[studentIndex];

                    // 💡 الحماية الذكية: لو الطالب امتحن قبل ما يتضاف للفصل ده، نتجاهل الدرجة!
                    let submittedTime = 0;
                    if (resData.submittedAt) {
                        submittedTime = typeof resData.submittedAt.toMillis === 'function' 
                                        ? resData.submittedAt.toMillis() 
                                        : Date.parse(resData.submittedAt);
                    }

                    // لو عنده تاريخ إضافة، والامتحان ده اتسلم قبل تاريخ إضافته، متسجلوش!
                    if (student.enrolledAt && submittedTime > 0 && submittedTime < student.enrolledAt) {
                        return; // 🛑 تخطي هذه النتيجة القديمة تماماً لتبدأ ببيانات جديدة
                    }
                    
                    if (!student.examRecords) student.examRecords = {};
                    
                    if(student.examRecords[examDoc.id] !== newRecord) {
                        student.examRecords[examDoc.id] = newRecord;
                        updated = true;
                    }
                } else {
                    unlinkedResults.push({ code: rawIdentifier, record: newRecord });
                }
            });
        });

        await Promise.all(fetchPromises);
        
        if(updated) {
            await db.collection('users').doc(user.uid).update({ classrooms: classrooms });
            window.tempClassroomsData = classrooms;
        }
        
        renderStudentsTable(currentStudents, classId, unlinkedResults);
        
        if(refreshBtn) refreshBtn.innerHTML = "<i class='bx bx-refresh'></i> تحديث الدرجات";
        
    } catch(e) {
        console.error("خطأ في المزامنة:", e);
        let refreshBtn = document.getElementById('btnRefreshScores');
        if(refreshBtn) refreshBtn.innerHTML = "<i class='bx bx-refresh'></i> تحديث الدرجات";
    }
}
// إضافة طالب (بمراقبة الباقة + تسجيل لحظة الانضمام)
async function addStudentToClass(classId) {
    const user = auth.currentUser;
    if (!user) return;

    let expiry = localStorage.getItem('elalfey_vip_expiry');
    let isVIP = (expiry === 'lifetime' || (expiry && parseInt(expiry) > Date.now()));

    const docRef = db.collection('users').doc(user.uid);
    const docSnap = await docRef.get();
    let classrooms = docSnap.data().classrooms || [];
    
    let totalStudents = classrooms.reduce((sum, cls) => sum + (cls.students ? cls.students.length : 0), 0);

    if (!isVIP && totalStudents >= 30) {
        showToast('⚠️ وصلت للحد الأقصى للطلاب (30) في الباقة المجانية!', 'error');
        if (typeof openVIPModalManual === 'function') openVIPModalManual();
        return;
    }

    let studentName = prompt("أدخل اسم الطالب ثلاثياً:");
    if (!studentName || studentName.trim() === "") return;

    let studentId = "ST_" + Math.random().toString(10).substring(2, 6);

    try {
        let targetIndex = classrooms.findIndex(c => c.id === classId);
        if (targetIndex > -1) {
            if (!classrooms[targetIndex].students) classrooms[targetIndex].students = [];
            
            classrooms[targetIndex].students.push({
                id: studentId,
                name: studentName.trim(),
                lastScore: null,
                enrolledAt: Date.now() // 💡 سر الحماية الجديد: تسجيل لحظة الانضمام بالمللي ثانية
            });
            
            await docRef.update({ classrooms: classrooms });
            showToast(`✅ تمت إضافة (${studentName}) بنجاح! كوده: ${studentId}`, 'success');
            
            loadClassroomsFromCloud(); 
            viewClassDetails(classId); 
        }
    } catch(e) {
        showToast('❌ خطأ أثناء الإضافة', 'error');
    }
}

// إضافة درجة يدوية مؤقتة للطلاب
async function addManualScore(studentId) {
    const user = auth.currentUser;
    if (!user || !currentViewedClassId) return;

    let score = prompt("أدخل درجة الطالب (مثال: 18/20):");
    if (!score) return;

    try {
        const docRef = db.collection('users').doc(user.uid);
        const docSnap = await docRef.get();
        let classrooms = docSnap.data().classrooms || [];
        
        let targetIndex = classrooms.findIndex(c => c.id === currentViewedClassId);
        if (targetIndex > -1) {
            let studentIndex = classrooms[targetIndex].students.findIndex(s => s.id === studentId);
            if (studentIndex > -1) {
                classrooms[targetIndex].students[studentIndex].lastScore = score;
                await docRef.update({ classrooms: classrooms });
                showToast('✅ تم تحديث درجة الطالب', 'success');
                viewClassDetails(currentViewedClassId); // تحديث النافذة
            }
        }
    } catch(e) {}
}

// مراقب لتشغيل جلب الفصول عند الدخول
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        setTimeout(loadClassroomsFromCloud, 1000);
    }
});
// دالة حذف فصل بالكامل (مع التنظيف العميق لنتائج جميع طلابه)
async function deleteClassroom(classId) {
    const user = auth.currentUser;
    if (!user) return;

    if (!confirm("⚠️ تحذير خطير: هل أنت متأكد من حذف هذا الفصل بجميع طلابه؟\nسيتم مسح الفصل بالكامل وحرق جميع درجات طلابه من قاعدة البيانات نهائياً!")) {
        return;
    }

    try {
        showToast('جاري الحذف العميق للفصل وطلابه... ⏳', 'info');

        const docRef = db.collection('users').doc(user.uid);
        const docSnap = await docRef.get();
        let classrooms = docSnap.data().classrooms || [];

        // 1. استخراج بيانات الفصل قبل حذفه لمعرفة أكواد الطلاب اللي جواه
        const targetClass = classrooms.find(c => c.id === classId);
        if (!targetClass) return;
        
        // تجميع كل أكواد طلاب هذا الفصل في مصفوفة
        const studentsIds = targetClass.students ? targetClass.students.map(s => s.id) : [];

        // 2. مسح الفصل من حساب المدرس
        classrooms = classrooms.filter(c => c.id !== classId);
        await docRef.update({ classrooms: classrooms });

        // 3. 🧹 التنظيف العميق: حرق درجات جميع طلاب هذا الفصل من كل الامتحانات
        if (studentsIds.length > 0) {
            const examsSnap = await db.collection('online_exams')
                .where('teacherId', '==', user.uid)
                .get();

            const deletePromises = [];
            
            // اللف على كل الامتحانات، وجواها نلف على كل طالب في الفصل ونمسح نتيجته
            examsSnap.docs.forEach(examDoc => {
                studentsIds.forEach(studentId => {
                    let p = examDoc.ref.collection('results').doc(studentId).delete().catch(e => {});
                    deletePromises.push(p);
                });
            });

            // انتظار انتهاء مسح كل الدرجات من سيرفرات Firebase
            await Promise.all(deletePromises);
        }
        
        showToast('🗑️ تم حذف الفصل ومسح جميع بيانات طلابه بنجاح', 'success');
        loadClassroomsFromCloud(); // تحديث واجهة الفصول

    } catch (e) {
        showToast('❌ حدث خطأ أثناء الحذف', 'error');
        console.error(e);
    }
}
// دالة حذف طالب محدد من فصل (مع التنظيف العميق من قاعدة البيانات)
async function removeStudentFromClass(classId, studentId) {
    const user = auth.currentUser;
    if (!user) return;

    if (!confirm("⚠️ هل أنت متأكد من حذف هذا الطالب؟ \nسيتم مسح اسمه من الكشف وحرق جميع درجاته السابقة من قاعدة البيانات نهائياً!")) {
        return;
    }

    try {
        let refreshBtn = document.getElementById('btnRefreshScores');
        if(refreshBtn) refreshBtn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> جاري الحذف العميق...";

        // 1. مسح الطالب من كشف الفصل في حساب المدرس
        const docRef = db.collection('users').doc(user.uid);
        const docSnap = await docRef.get();
        let classrooms = docSnap.data().classrooms || [];
        
        let targetIndex = classrooms.findIndex(c => c.id === classId);
        if (targetIndex > -1) {
            classrooms[targetIndex].students = classrooms[targetIndex].students.filter(s => s.id !== studentId);
            await docRef.update({ classrooms: classrooms });
        }

        // 2. 🧹 التنظيف العميق (Deep Clean): لفة على كل امتحانات المدرس ومسح أوراق الطالب
        const examsSnap = await db.collection('online_exams')
            .where('teacherId', '==', user.uid)
            .get();

        const deletePromises = examsSnap.docs.map(examDoc => {
            // محاولة حذف النتيجة، وبنستخدم catch عشان لو الطالب ممتحنش الامتحان ده السيستم يتجاهل بدون أخطاء
            return examDoc.ref.collection('results').doc(studentId).delete().catch(e => {});
        });

        // انتظار انتهاء مسح كل الدرجات من سيرفرات Firebase
        await Promise.all(deletePromises);
        
        showToast('🗑️ تم حذف الطالب ومسح تاريخه بالكامل بنجاح', 'success');
        
        // تحديث الواجهة والنافذة المفتوحة
        loadClassroomsFromCloud(); 
        viewClassDetails(classId); 
        
    } catch (e) {
        showToast('❌ حدث خطأ أثناء الحذف', 'error');
        console.error(e);
    }
}
/* ========================================================
   🌐 نظام الامتحانات الإلكترونية (CBT - Publisher Engine)
   ======================================================== */

// فتح نافذة النشر وتجهيز البيانات
async function openPublishOnlineModal() {
    const user = auth.currentUser;
    if (!user) return showToast('يرجى تسجيل الدخول أولاً لنشر الامتحانات', 'error');
    
    // التأكد من وجود أسئلة في المحرر
    syncTextToDatabase();
    const realQs = questionsDatabase.filter(q => q.type !== 'heading');
    if (realQs.length === 0) return showToast('لا توجد أسئلة لنشرها! يرجى كتابة وتنسيق الامتحان أولاً.', 'error');

    // تهيئة النافذة
    document.getElementById('publishOnlineModal').style.display = 'flex';
    document.getElementById('publishSuccessBox').style.display = 'none';
    
    const btnConfirm = document.getElementById('btnConfirmPublish');
    btnConfirm.style.display = 'flex';
    btnConfirm.innerText = '🚀 تأكيد ونشر الامتحان';
    btnConfirm.disabled = false;
    
    // التقاط اسم الامتحان من الترويسة (إن وجد)
    let defaultTitle = document.getElementById('hdrCenter') ? document.getElementById('hdrCenter').value : 'امتحان إلكتروني جديد';
    document.getElementById('onlineExamTitle').value = defaultTitle;

    // جلب الفصول من السحابة لوضعها في القائمة المنسدلة
    const selectEl = document.getElementById('onlineExamClassSelect');
    selectEl.innerHTML = '<option value="all">جميع الفصول (عام / مفتوح للكل)</option>';
    
    try {
        const docSnap = await db.collection('users').doc(user.uid).get();
        if (docSnap.exists && docSnap.data().classrooms) {
            let classrooms = docSnap.data().classrooms;
            classrooms.forEach(cls => {
                let opt = document.createElement('option');
                opt.value = cls.id;
                opt.innerText = cls.name;
                selectEl.appendChild(opt);
            });
        }
    } catch(e) {
        console.error("خطأ في جلب الفصول", e);
    }
}

// دالة رفع الامتحان للسحابة (محدثة بنظام قائمة المسموح لهم - Guest List)
async function publishExamToCloud() {
    const user = auth.currentUser;
    if (!user) return;

    const title = document.getElementById('onlineExamTitle').value.trim() || 'امتحان بدون عنوان';
    const classId = document.getElementById('onlineExamClassSelect').value;
    const showResults = document.getElementById('onlineExamShowResults').value === 'yes';
    
    // ⏰ قراءة وقت انتهاء الامتحان
    const endTimeRaw = document.getElementById('onlineExamEndTime').value;
    if (!endTimeRaw) return showToast('يرجى تحديد موعد إغلاق الامتحان ⏰', 'error');
    const endTimestamp = new Date(endTimeRaw).getTime(); 

    const examCode = Math.random().toString(36).substring(2, 7).toUpperCase();

    let cleanQuestions = questionsDatabase.map(q => {
        if (q.type === 'heading') return { type: 'heading', text: q.text || "" };
        return {
            num: q.num || 0,
            type: q.type || "mcq",
            text: q.text || "",
            options: q.options ? q.options.map(o => ({ l: o.l || "", t: o.t || "" })) : [],
            ans: q.ans || "" 
        };
    });

    try {
        const btnConfirm = document.getElementById('btnConfirmPublish');
        btnConfirm.innerText = 'جاري النشر وتجهيز الرابط... ⏳';
        btnConfirm.disabled = true;

        // 💡 السحر هنا: تجهيز "قائمة المدعوين" لو الامتحان مخصص لفصل معين
        let allowedStudentsList = [];
        if (classId !== 'all') {
            const docSnap = await db.collection('users').doc(user.uid).get();
            if (docSnap.exists) {
                let classrooms = docSnap.data().classrooms || [];
                let targetClass = classrooms.find(c => c.id === classId);
                if (targetClass && targetClass.students) {
                    targetClass.students.forEach(s => {
                        // بنحط كود الطالب واسمه (متنظف لغوياً) في القائمة المسموح بيها
                        allowedStudentsList.push(String(s.id).trim().toLowerCase()); 
                        allowedStudentsList.push(normalizeArabicName(s.name)); 
                    });
                }
            }
        }

        await db.collection('online_exams').doc(examCode).set({
            examCode: examCode,
            teacherId: user.uid,
            classId: classId,
            title: title,
            questions: cleanQuestions,
            showResults: showResults,
            endTime: endTimestamp, 
            active: true,
            allowedStudents: allowedStudentsList, // 💡 حفظ قائمة المسموح لهم في السحابة
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        btnConfirm.style.display = 'none';
        document.getElementById('publishSuccessBox').style.display = 'block';
        document.getElementById('generatedExamCode').innerText = examCode;
        showToast('✅ تم رفع الامتحان وتأمين الدخول بنجاح!', 'success');
    } catch (e) {
        showToast('❌ حدث خطأ: ' + e.message, 'error');
        const btnConfirm = document.getElementById('btnConfirmPublish');
        btnConfirm.innerText = '🚀 تأكيد ونشر الامتحان';
        btnConfirm.disabled = false;
    }
}

// دالة نسخ الكود للمدرس
function copyExamCode() {
    const code = document.getElementById('generatedExamCode').innerText;
    navigator.clipboard.writeText(code).then(() => {
        showToast('تم نسخ الكود بنجاح 📋', 'success');
    });
}