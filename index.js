const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Statik dosyaları (HTML/JS) Render üzerinde doğru klasörden bulması için
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. VERİTABANI BAĞLANTISI (AIVEN & RENDER ÖZEL AYARLARI) ---
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
      },
      // KRİTİK HATA ÇÖZÜMÜ: MySQL'in tarih konusundaki katı modunu esnetir
      dateStrings: true,
      typeCast: true
    },
    // Sequelize'ın varsayılan tarih atamalarını MySQL formatıyla tam uyumlu yapar
    define: {
      timestamps: true,
      freezeTableName: true
    },
    logging: false
  }
);

// --- 2. MODELLER ---
const Author = sequelize.define('Author', {
  name: { type: DataTypes.STRING, allowNull: false }
});

const Book = sequelize.define('Book', {
  title: { type: DataTypes.STRING, allowNull: false }
});

Author.hasMany(Book, { as: 'books', foreignKey: 'authorId' });
Book.belongsTo(Author, { as: 'author', foreignKey: 'authorId' });

// --- 3. YOLLAR (ROUTES) ---

// Ana sayfa yönlendirmesi
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ❌ N+1 Sorunu Olan İstek
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

// ✅ Performanslı (Eager Loading) İstek
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

// --- 4. BAŞLATMA VE OTOMATİK VERİ EKLEME ---
sequelize.sync({ alter: true }).then(async () => {
  // Veritabanı boşsa "forEach" hatasını önlemek için örnek veri ekler
  const count = await Author.count();
  if (count === 0) {
    const yazar = await Author.create({ name: 'Orhan Pamuk' });
    await Book.create({ title: 'Kara Kitap', authorId: yazar.id });
    await Book.create({ title: 'Yeni Hayat', authorId: yazar.id });
    console.log("✅ Örnek veriler veritabanına başarıyla eklendi!");
  }
  
  app.listen(port, () => {
    console.log(`✅ Sunucu Aktif! Port: ${port}`);
  });
}).catch(err => {
  console.error('❌ Bağlantı Başarısız:', err);
});
