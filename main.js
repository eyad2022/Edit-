(function () {
    // التحقق: هل الجهاز يدعم اللمس؟ (إذا نعم، نخرج من الكود ولا نفعل القائمة)
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        return;
    }

    // 1. حماية النطاقات (Domains)
    var allowedDomains = ["eyad2022.github.io", "localhost", "127.0.0.1", "editorpro-blush.vercel.app"];
    var currentDomain = window.location.hostname;

    if (allowedDomains.indexOf(currentDomain) === -1) {
        document.documentElement.innerHTML = '<body style="background:#111;color:#ff3333;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;"><h1>⚠️ نسخة غير مصرح بها</h1></body>';
        window.stop();
        throw new Error('Unauthorized Access');
    }

    // 2. منع اختصارات لوحة المفاتيح
    document.addEventListener('keydown', function (e) {
        if (e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
            (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) ||
            (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) ||
            (e.ctrlKey && (e.key === 'U' || e.key === 'u'))) {
            e.preventDefault();
            return false;
        }
    });

    // 3. تصميم القائمة (نفس التصميم السابق)
    var style = document.createElement('style');
    style.innerHTML = `
        #custom-context-menu {
            display: none;
            position: fixed;
            background: #ffffff;
            border: 1px solid #cccccc;
            box-shadow: 2px 2px 8px rgba(0,0,0,0.2);
            border-radius: 6px;
            padding: 6px 0;
            z-index: 999999;
            min-width: 220px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            direction: rtl;
            user-select: none;
        }
        .context-menu-item {
            padding: 8px 15px;
            cursor: pointer;
            color: #333;
            font-size: 14px;
            display: flex;
            align-items: center;
        }
        .context-menu-item:hover {
            background: #f0f0f0;
        }
        .context-menu-icon {
            width: 25px;
            text-align: right;
            margin-left: 10px;
        }
        .context-menu-shortcut {
            margin-right: auto;
            color: #999;
            font-size: 12px;
            direction: ltr;
        }
        .context-menu-separator {
            height: 1px;
            background: #e0e0e0;
            margin: 6px 0;
        }
    `;
    document.head.appendChild(style);

    var menu = document.createElement('div');
    menu.id = 'custom-context-menu';
    menu.innerHTML = `
        <div class="context-menu-item" id="mh-reload"><span class="context-menu-icon">🔄</span> إعادة تحميل <span class="context-menu-shortcut">Ctrl+R</span></div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" id="mh-cut"><span class="context-menu-icon">✂️</span> قص <span class="context-menu-shortcut">Ctrl+X</span></div>
        <div class="context-menu-item" id="mh-copy"><span class="context-menu-icon">📋</span> نسخ <span class="context-menu-shortcut">Ctrl+C</span></div>
        <div class="context-menu-item" id="mh-paste"><span class="context-menu-icon">📝</span> لصق <span class="context-menu-shortcut">Ctrl+V</span></div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" id="mh-select-all"><span class="context-menu-icon">✅</span> تحديد الكل <span class="context-menu-shortcut">Ctrl+A</span></div>
    `;
    document.body.appendChild(menu);

    // 4. التحكم في ظهور القائمة (للكمبيوتر فقط)
    document.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        menu.style.display = 'block';
        var mouseX = e.clientX;
        var mouseY = e.clientY;
        if (mouseX + menu.offsetWidth > window.innerWidth) mouseX = window.innerWidth - menu.offsetWidth - 5;
        if (mouseY + menu.offsetHeight > window.innerHeight) mouseY = window.innerHeight - menu.offsetHeight - 5;
        menu.style.left = mouseX + 'px';
        menu.style.top = mouseY + 'px';
    });

    document.addEventListener('click', function (e) {
        if (e.target.offsetParent !== menu) menu.style.display = 'none';
    });

    // 5. تفعيل الأزرار
    document.getElementById('mh-reload').addEventListener('click', function() { window.location.reload(); });
    document.getElementById('mh-cut').addEventListener('click', function() { document.execCommand('cut'); menu.style.display = 'none'; });
    document.getElementById('mh-copy').addEventListener('click', function() { document.execCommand('copy'); menu.style.display = 'none'; });
    document.getElementById('mh-paste').addEventListener('click', async function() { 
        try {
            const text = await navigator.clipboard.readText();
            document.execCommand('insertText', false, text);
        } catch (err) { alert('يرجى استخدام Ctrl+V'); }
        menu.style.display = 'none'; 
    });
    document.getElementById('mh-select-all').addEventListener('click', function() { document.execCommand('selectAll'); menu.style.display = 'none'; });

})();