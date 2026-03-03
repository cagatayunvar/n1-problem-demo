const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const app = express();
// Render'ın atadığı portu kullan, yoksa 3000'den aç
const port = process.env.PORT || 3000;

// Statik dosyaları (HTML, CSS, JS) 'public' klasöründen oku
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. VERİTABANI BAĞLANTISI (BULUT/AIVEN UYUMLU) ---
const sequelize = new Sequelize(
  process.env.DB_NAME, 
  process.env.DB_USER, 
  process.env.DB_PASS, 
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false // Konsolun çok kalabalık olmaması için
  }
);

// --- 2. MODELLERİN TANIMLANMASI ---
const Author = sequelize.define('Author', {
  name: { type: DataTypes.STRING, allowNull: false }
});

const Book = sequelize.define('Book', {
  title: { type: DataTypes.STRING, allowNull: false }
});

Author.hasMany(Book, { as: 'books', foreignKey: 'authorId' });
Book.belongsTo(Author, { as: 'author', foreignKey: 'authorId' });

// --- 3. API UÇ NOKTALARI (ROUTES) ---

// Ana sayfa için index.html'i zorla gönder
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ❌ Hatalı (N+1) Çekim
app.get('/hatali', async (req, res) => {
  try {
    const sqlLogs = [];
    const logger = (sql) => sqlLogs.push(sql);

    const authors = await Author.findAll({ logging: logger });
    const result = [];
    
    for (const author of authors) {
      const books = await Book.findAll({ 
        where: { authorId: author.id },
        logging: logger 
      });
      result.push({ yazarAdi: author.name, kitaplar: books });
    }
    res.json({ veri: result, loglar: sqlLogs });
  } catch (error) {
    res.status(500).json({ hata: error.message });
  }
});

// ✅ Doğru (Eager Loading) Çekim
app.get('/dogru', async (req, res) => {
  try {
    const sqlLogs = [];
    const logger = (sql) => sqlLogs.push(sql);

    const authors = await Author.findAll({
      include: [{ model: Book, as: 'books' }],
      logging: logger
    });
    
    const result = authors.map(a => ({ yazarAdi: a.name, kitaplar: a.books }));
    res.json({ veri: result, loglar: sqlLogs });
  } catch (error) {
    res.status(500).json({ hata: error.message });
  }
});

// Veritabanını eşitle ve sunucuyu başlat
sequelize.sync().then(() => {
  app.listen(port, () => {
    console.log(`✅ Sunucu Aktif! Port: ${port}`);
  });
});
