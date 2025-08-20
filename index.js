const express = require('express');
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