import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();

// HTTP Server (بدون HTTPS)
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// استقبال الاتصالات
wss.on("connection", (ws) => {
  console.log("🔥 عميل جديد متصل");

  ws.on("message", (msg) => {
    console.log("📩 Received:", msg.toString());

    // أرسل الرسالة إلى جميع العملاء الآخرين
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === ws.OPEN) {
        client.send(msg.toString());
      }
    });
  });

  ws.on("close", () => {
    console.log("❌ تم إغلاق الاتصال");
  });
});

// تشغيل السيرفر على المنفذ 5000
const PORT = process.env.PORT || 5000;
app.get('/', (req, res) => {
  console.log(PORT)
  res.send(PORT)
});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 WebSocket Server يعمل على ws://0.0.0.0:${PORT}`);
});


/*const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/form1', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form1.html'));
});

app.get('/form2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form2.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
*/
