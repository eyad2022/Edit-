(function () {
            var allowedDomains = ["eyad2022.github.io", "localhost", "127.0.0.1", "editorpro-blush.vercel.app"];
            var currentDomain = window.location.hostname;

            if (allowedDomains.indexOf(currentDomain) === -1) {
                document.documentElement.innerHTML = '<body style="background:#111;color:#ff3333;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;"><h1>⚠️ نسخة غير مصرح بها</h1></body>';
                window.stop();
                throw new Error('Unauthorized Access');
            }

            document.addEventListener('contextmenu', function (e) {
                e.preventDefault();
            });

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
        })();