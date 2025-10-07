const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

class WebServer {
    constructor() {
        this.MAX_CLIENTS = 10;
        this.clients = new Map(); // Map<id, {socket, lastHeartbeat}>
        this.app = express();
        this.server = null;
        this.wss = null;
        this.heartbeatTimer = null;
        
        this.allowedTypes = [
            'join',
            'offer',
            'answer',
            'candidate',
            'leave',
            'text-message'
        ];
        
        this.setupMiddleware();
    }
    
    setupMiddleware() {
        // إعداد CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });
        
        // معالجة الطلبات غير WebSocket
        this.app.get('/', (req, res) => {
            res.status(403).send('غير مسموح - طلبات WebSocket فقط');
        });
        
        this.app.use((req, res) => {
            res.status(404).send('غير موجود');
        });
    }
    
    start(port = 5000) {
        return new Promise((resolve, reject) => {
            if (this.server) {
                console.log(`الخادم يعمل بالفعل على المنفذ ${port}`);
                resolve(port);
                return;
            }
            
            try {
                this.server = http.createServer(this.app);
                
                // إعداد WebSocket Server
                this.wss = new WebSocket.Server({ 
                    server: this.server,
                    verifyClient: (info) => {
                        // التحقق من عدد العملاء
                        if (this.clients.size >= this.MAX_CLIENTS) {
                            console.log('تم رفض اتصال جديد - تم الوصول للحد الأقصى من العملاء');
                            return false;
                        }
                        return true;
                    }
                });
                
                this.wss.on('connection', (socket, req) => {
                    this.handleNewConnection(socket, req);
                });
                
                this.server.listen(port, '0.0.0.0', () => {
                    console.log(`تم بدء خادم الإشارات على المنفذ ${port}`);
                    this.startHeartbeatTimer();
                    resolve(port);
                });
                
                this.server.on('error', (err) => {
                    console.error('فشل في بدء الخادم:', err);
                    reject(err);
                });
                
            } catch (error) {
                console.error('فشل في بدء الخادم:', error);
                reject(error);
            }
        });
    }
    
    handleNewConnection(socket, req) {
        try {
            const id = uuidv4();
            const clientInfo = {
                socket: socket,
                lastHeartbeat: new Date(),
                ip: req.socket.remoteAddress
            };
            
            this.clients.set(id, clientInfo);
            
            console.log(`عميل جديد متصل: ${id} (إجمالي العملاء: ${this.clients.size})`);
            
            // إرسال الهوية المخصصة وقائمة الأقران الحاليين
            const peers = Array.from(this.clients.keys()).filter(k => k !== id);
            const welcomeMessage = {
                type: 'id',
                id: id,
                peers: peers,
                timestamp: Date.now()
            };
            
            this.sendToClient(socket, welcomeMessage);
            
            // إشعار الآخرين بوصول عميل جديد
            this.broadcastToOthers(id, {
                type: 'peer-joined',
                id: id,
                timestamp: Date.now()
            });
            
            // الاستماع للرسائل
            socket.on('message', (message) => {
                this.handleMessage(id, message);
            });
            
            socket.on('close', () => {
                this.handleDisconnection(id);
            });
            
            socket.on('error', (error) => {
                this.handleError(id, error);
            });
            
            // إرسال ping للتأكد من الاتصال
            socket.on('pong', () => {
                if (this.clients.has(id)) {
                    this.clients.get(id).lastHeartbeat = new Date();
                }
            });
            
        } catch (error) {
            console.error('فشل في إعداد اتصال WebSocket:', error);
        }
    }
    
    handleMessage(senderId, message) {
        try {
            if (!this.clients.has(senderId)) {
                return;
            }
            
            let msg;
            try {
                msg = JSON.parse(message.toString());
            } catch (e) {
                console.warn(`رسالة غير صالحة من ${senderId}: خطأ في JSON`);
                return;
            }
            
            // التحقق من صحة الرسالة
            if (!this.validateMessage(msg)) {
                console.warn(`رسالة غير صالحة من ${senderId}`);
                return;
            }
            
            // تحديث وقت آخر heartbeat
            this.clients.get(senderId).lastHeartbeat = new Date();
            
            // إضافة معلومات المرسل
            msg.from = senderId;
            msg.timestamp = Date.now();
            
            const to = msg.to;
            
            if (to && this.clients.has(to)) {
                // رسالة مباشرة لعميل محدد
                this.sendToClient(this.clients.get(to).socket, msg);
                console.log(`رسالة من ${senderId} إلى ${to}: ${msg.type}`);
            } else {
                // بث للجميع عدا المرسل
                this.broadcastToOthers(senderId, msg);
                console.log(`بث من ${senderId}: ${msg.type}`);
            }
            
        } catch (error) {
            console.error(`خطأ في معالجة رسالة من ${senderId}:`, error);
        }
    }
    
    validateMessage(msg) {
        // التحقق من وجود حقل type
        if (!msg.type || typeof msg.type !== 'string') {
            return false;
        }
        
        const type = msg.type;
        
        if (!this.allowedTypes.includes(type)) {
            return false;
        }
        
        // تحققات إضافية حسب نوع الرسالة
        if (type === 'offer' || type === 'answer') {
            return msg.hasOwnProperty('sdp') && msg.hasOwnProperty('sdpType');
        }
        
        if (type === 'candidate') {
            return msg.hasOwnProperty('candidate');
        }
        
        return true;
    }
    
    sendToClient(socket, message) {
        try {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(message));
            }
        } catch (error) {
            console.error('فشل في إرسال رسالة للعميل:', error);
        }
    }
    
    broadcastToOthers(senderId, message) {
        for (const [id, clientInfo] of this.clients.entries()) {
            if (id !== senderId) {
                this.sendToClient(clientInfo.socket, message);
            }
        }
    }
    
    handleDisconnection(id) {
        if (!this.clients.has(id)) {
            return;
        }
        
        this.clients.delete(id);
        
        console.log(`عميل منقطع: ${id} (العملاء المتبقون: ${this.clients.size})`);
        
        // إشعار الآخرين بالانقطاع
        this.broadcastToOthers(id, {
            type: 'peer-left',
            id: id,
            timestamp: Date.now()
        });
    }
    
    handleError(id, error) {
        console.error(`خطأ في اتصال العميل ${id}:`, error);
        this.handleDisconnection(id);
    }
    
    startHeartbeatTimer() {
        // فحص دوري كل 30 ثانية للتأكد من الاتصالات
        this.heartbeatTimer = setInterval(() => {
            const now = new Date();
            const timeout = 60000; // 60 ثانية timeout
            
            for (const [id, clientInfo] of this.clients.entries()) {
                if (now - clientInfo.lastHeartbeat > timeout) {
                    console.log(`انتهت مهلة العميل ${id}`);
                    clientInfo.socket.terminate();
                    this.handleDisconnection(id);
                } else {
                    // إرسال ping
                    if (clientInfo.socket.readyState === WebSocket.OPEN) {
                        clientInfo.socket.ping();
                    }
                }
            }
        }, 30000);
    }
    
    async stop() {
        try {
            console.log('إيقاف خادم الإشارات...');
            
            if (this.heartbeatTimer) {
                clearInterval(this.heartbeatTimer);
                this.heartbeatTimer = null;
            }
            
            // إشعار جميع العملاء بالإغلاق
            const shutdownMessage = {
                type: 'server-shutdown',
                message: 'الخادم يتم إغلاقه',
                timestamp: Date.now()
            };
            
            for (const [id, clientInfo] of this.clients.entries()) {
                this.sendToClient(clientInfo.socket, shutdownMessage);
                clientInfo.socket.close();
            }
            
            this.clients.clear();
            
            if (this.wss) {
                this.wss.close();
                this.wss = null;
            }
            
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(resolve);
                });
                this.server = null;
            }
            
            console.log('تم إيقاف خادم الإشارات بنجاح');
            
        } catch (error) {
            console.error('خطأ أثناء إيقاف الخادم:', error);
        }
    }
    
    // خصائص مساعدة
    get isRunning() {
        return this.server !== null;
    }
    
    get clientCount() {
        return this.clients.size;
    }
}

module.exports = WebServer;

// إذا تم تشغيل الملف مباشرة
if (require.main === module) {
    const server = new WebServer();
    
    const port = process.env.PORT || 5000;
    
    server.start(port)
        .then(() => {
            console.log(`السيرفر يعمل على المنفذ ${port}`);
        })
        .catch((error) => {
            console.error('فشل في بدء السيرفر:', error);
            process.exit(1);
        });
    
    // معالجة إيقاف السيرفر بشكل صحيح
    process.on('SIGINT', async () => {
        console.log('\nتم استلام إشارة الإيقاف...');
        await server.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
        console.log('\nتم استلام إشارة الإنهاء...');
        await server.stop();
        process.exit(0);
    });
}
