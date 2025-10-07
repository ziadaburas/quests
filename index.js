const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// إعداد CORS
app.use(cors());
app.use(express.json());

// إنشاء WebSocket server
const wss = new WebSocket.Server({ server });

// متغيرات لتخزين الاتصالات والرسائل
const clients = new Set();
const messages = [];

// عند الاتصال بـ WebSocket
wss.on('connection', (ws, req) => {
    console.log('عميل جديد متصل');
    clients.add(ws);

    // إرسال رسالة ترحيب
    ws.send(JSON.stringify({
        type: 'welcome',
        message: 'أهلاً وسهلاً! تم الاتصال بنجاح',
        timestamp: new Date().toISOString(),
        clientsCount: clients.size
    }));

    // إرسال الرسائل السابقة للعميل الجديد
    if (messages.length > 0) {
        ws.send(JSON.stringify({
            type: 'history',
            messages: messages.slice(-10) // آخر 10 رسائل
        }));
    }

    // استقبال الرسائل من العميل
    ws.on('message', (data) => {
        try {
            const messageData = JSON.parse(data);
            console.log('رسالة مستلمة:', messageData);

            // إنشاء رسالة مع الوقت
            const message = {
                id: Date.now(),
                type: messageData.type || 'message',
                content: messageData.content,
                sender: messageData.sender || 'مجهول',
                timestamp: new Date().toISOString()
            };

            // حفظ الرسالة
            messages.push(message);
            
            // الاحتفاظ بآخر 100 رسالة فقط
            if (messages.length > 100) {
                messages.shift();
            }

            // إرسال الرسالة لجميع العملاء المتصلين
            const broadcastMessage = JSON.stringify({
                type: 'broadcast',
                message: message,
                clientsCount: clients.size
            });

            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(broadcastMessage);
                }
            });

        } catch (error) {
            console.error('خطأ في معالجة الرسالة:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'خطأ في معالجة الرسالة'
            }));
        }
    });

    // عند قطع الاتصال
    ws.on('close', () => {
        console.log('تم قطع الاتصال مع عميل');
        clients.delete(ws);
        
        // إخبار العملاء الآخرين بعدد الاتصالات الجديد
        const disconnectMessage = JSON.stringify({
            type: 'clientDisconnected',
            clientsCount: clients.size
        });

        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(disconnectMessage);
            }
        });
    });

    // معالجة الأخطاء
    ws.on('error', (error) => {
        console.error('خطأ في WebSocket:', error);
        clients.delete(ws);
    });
});

// Routes لـ REST API
app.get('/', (req, res) => {
    res.json({
        message: 'خادم WebSocket يعمل بنجاح!',
        connectedClients: clients.size,
        totalMessages: messages.length
    });
});

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        connectedClients: clients.size,
        totalMessages: messages.length,
        uptime: process.uptime()
    });
});

app.get('/api/messages', (req, res) => {
    res.json({
        messages: messages.slice(-20), // آخر 20 رسالة
        count: messages.length
    });
});

// بدء الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
    console.log(`WebSocket متاح على: ws://localhost:${PORT}`);
});

// معالجة إغلاق الخادم بسلاسة
process.on('SIGTERM', () => {
    console.log('إغلاق الخادم...');
    clients.forEach((client) => {
        client.close();
    });
    server.close(() => {
        console.log('تم إغلاق الخادم');
    });
});
