const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Statik dosyalar için 'public' klasörünü ana dizinle birleştirerek tanıtıyoruz
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. VERİTABANI BAĞLANTISI (AIVEN VE RENDER UYUMLU) ---
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
      // Tarih hatasını (0000-00-00) çözmek için eklenen ayarlar
      dateStrings: true,
      typeCast: true
    },
    logging: false
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

// Ana sayfa için index.html'i zorla gönderen garanti rota
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

// --- 4. VERİTABANI SENKRONİZASYONU VE BAŞLATMA ---
sequelize.sync({ alter: true }).then(async () => {
  // Veritabanı boşsa örnek veriler ekleyerek 'forEach' hatasını önlüyoruz
  const count = await Author.count();
  if (count === 0) {
    const yazar = await Author.create({ name: 'Orhan Pamuk' });
    await Book.create({ title: 'Kara Kitap', authorId: yazar.id });
    await Book.create({ title: 'Yeni Hayat', authorId: yazar.id });
    console.log("✅ Örnek veriler başarıyla yüklendi!");
  }
  
  app.listen(port, () => {
    console.log(`✅ Sunucu Aktif! Port: ${port}`);
  });
}).catch(err => {
  console.error('❌ Veritabanı bağlantı hatası:', err);
});
