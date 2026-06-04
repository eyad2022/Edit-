export default async function handler(req, res) {
    // 1. نمنع أي طلبات غير مصرح بها
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'الطريقة غير مسموحة' });
    }

    // 2. نستقبل تفاصيل السؤال من موقعك (الواجهة)
    const { parts } = req.body;
    
    // 3. نسحب المفتاح السري بأمان من خزنة Vercel
    const apiKey = process.env.GEMINI_API_KEY; 

    if (!apiKey) {
        return res.status(500).json({ error: 'المفتاح السري غير موجود في إعدادات الخادم' });
    }

    try {
        // 4. نكلم جوجل من داخل السيرفر (في الخفاء التام)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ parts: parts }],
                generationConfig: { temperature: 0.7 } // للتحكم في دقة الذكاء الاصطناعي
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'فشل الاتصال بجوجل');
        }

        // 5. نرسل الإجابة الجاهزة لموقعك
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
