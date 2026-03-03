const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Statik dosyaları (HTML, JS) Render üzerinde doğru klasörden bulması için
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. VERİTABANI BAĞLANTISI (AIVEN & RENDER UYUMLU) ---
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
      dateStrings: true,
      typeCast: true
    },
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

// --- 4. BAŞLATMA VE AKILLI VERİ KONTROLÜ ---
// 'alter: true' kullanarak mevcut verileri silmeden yapıyı güncelliyoruz
sequelize.sync({ alter: true }).then(async () => {
  const count = await Author.count();
  
  // Eğer yazar sayısı 3'ten azsa (eksik veri varsa) ekleme yap
  if (count < 3) {
    console.log("📝 Eksik veriler tamamlanıyor...");
    
    // Mevcut yazarları kontrol et veya direkt ekle (basitlik için toplu ekleme)
    const [y1] = await Author.findOrCreate({ where: { name: 'Orhan Pamuk' } });
    await Book.findOrCreate({ where: { title: 'Kara Kitap', authorId: y1.id } });
    await Book.findOrCreate({ where: { title: 'Yeni Hayat', authorId: y1.id } });
    
    const [y2] = await Author.findOrCreate({ where: { name: 'Yaşar Kemal' } });
    await Book.findOrCreate({ where: { title: 'İnce Memed', authorId: y2.id } });

    const [y3] = await Author.findOrCreate({ where: { name: 'Sabahattin Ali' } });
    await Book.findOrCreate({ where: { title: 'Kürk Mantolu Madonna', authorId: y3.id } });
    
    console.log("✅ Tüm yazarlar ve kitaplar güncellendi!");
  }
  
  app.listen(port, () => {
    console.log(`✅ Sunucu Aktif! Port: ${port}`);
  });
}).catch(err => {
  console.error('❌ Bağlantı Başarısız:', err);
});
